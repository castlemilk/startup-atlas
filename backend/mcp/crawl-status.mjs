/**
 * atlas_crawl_status — live crawl progress from the shipped metric.
 *
 * Reads the one public record the crawl itself writes while it runs
 * (crawl-progress.json at the root of the public index bucket — see
 * scripts/crawl_progress.py and the crawl-progress design, 24 Nov 2026).
 * The KPIs dashboard renders the same object, so this tool's answer and
 * the on-screen bars can never disagree. No GCS credentials are needed:
 * the bucket is public-read and the fetch is a plain HTTPS GET, cached
 * in memory for 15 s so a burst of questions costs one fetch.
 *
 * The tool reports facts, never verdicts: a running run whose heartbeat
 * is older than 120 s is flagged `heartbeat_stale`, not reclassified as
 * failed (a killed step and a slow page look identical from outside).
 * When the record is missing or unreachable it returns state "unknown"
 * with the fetch error — callers can fall back to atlas_list_crawl_runs.
 */

export const WORKFLOW_MODES = [
  'partners', 'programs', 'news', 'logos', 'profiles', 'portraits',
  'partner-candidates',
];

export const DEFAULT_INDEX_BUCKET = 'single-station-515408-g9-atlas-index';
const STALE_HEARTBEAT_S = 120;
const CACHE_TTL_MS = 15_000;

export function progressUrl(bucket) {
  return `https://storage.googleapis.com/${bucket}/crawl-progress.json`;
}

function secondsBetween(fromIso, toMs) {
  const from = Date.parse(fromIso ?? '');
  if (Number.isNaN(from)) return null;
  return Math.max(0, Math.round((toMs - from) / 1000));
}

function modeRow(name, entry, { full = true } = {}) {
  const row = {
    mode: name,
    status: entry?.status ?? 'pending',
    sources_done: entry?.sources_done ?? 0,
    sources_total: entry?.sources_total ?? null,
    candidates: entry?.candidates ?? 0,
    errors: entry?.errors ?? entry?.sources_failed ?? 0,
  };
  if (full) {
    row.pages_attempted = entry?.pages_attempted ?? 0;
    row.pages_succeeded = entry?.pages_succeeded ?? 0;
    row.current_source = entry?.current_source ?? null;
    row.last_error = entry?.last_error ?? null;
  }
  return row;
}

function percentComplete(modes) {
  let done = 0;
  let total = 0;
  for (const row of modes) {
    if (typeof row.sources_total === 'number' && row.sources_total > 0) {
      done += row.sources_done;
      total += row.sources_total;
    }
  }
  if (!total) return null;
  return Math.round((done / total) * 100);
}

export function shapeStatus(record, nowMs, { includeModes = true } = {}) {
  const run = record?.run ?? {};
  const modes = WORKFLOW_MODES.map(name =>
    modeRow(name, record?.modes?.[name]));
  const heartbeatAge = secondsBetween(run.updated_at, nowMs);
  if (run.status === 'running') {
    return {
      state: 'running',
      run_id: run.run_id ?? null,
      run_url: run.run_url ?? null,
      trigger: run.trigger ?? null,
      started_at: run.started_at ?? null,
      elapsed_s: secondsBetween(run.started_at, nowMs),
      heartbeat_age_s: heartbeatAge,
      heartbeat_stale: heartbeatAge !== null && heartbeatAge > STALE_HEARTBEAT_S,
      current_mode: run.current_mode ?? null,
      ...(includeModes ? { modes } : {}),
      totals: record.totals ?? null,
      percent_complete: percentComplete(modes),
    };
  }
  // Idle: prefer the record's own terminal run; fall back to the
  // last_completed summary a later (unfinished) run carried forward.
  const last = run.status && run.status !== 'running'
    ? {
        run_id: run.run_id ?? null,
        run_url: run.run_url ?? null,
        status: run.status,
        started_at: run.started_at ?? null,
        finished_at: run.finished_at ?? null,
        modes: modes.map(row => modeRow(row.mode, record.modes?.[row.mode], { full: false })),
        totals: record.totals ?? null,
      }
    : (record?.last_completed ?? null);
  return {
    state: 'idle',
    heartbeat_age_s: heartbeatAge,
    last_completed: last,
  };
}

export class CrawlStatus {
  constructor({ bucket = '', fetchImpl = fetch, now = () => Date.now() } = {}) {
    this.url = progressUrl(bucket || process.env.ATLAS_CORPUS_INDEX_BUCKET || DEFAULT_INDEX_BUCKET);
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cache = null; // { at, record }
  }

  async record() {
    if (this.cache && this.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.record;
    }
    const response = await this.fetchImpl(this.url, { redirect: 'manual' });
    if (!response.ok) {
      throw new Error(`crawl-progress fetch failed (HTTP ${response.status})`);
    }
    const record = await response.json();
    this.cache = { at: this.now(), record };
    return record;
  }

  async status(args = {}) {
    try {
      const record = await this.record();
      return shapeStatus(record, this.now(), {
        includeModes: args.include_modes !== false,
      });
    } catch (error) {
      return { state: 'unknown', error: String(error?.message ?? error) };
    }
  }
}
