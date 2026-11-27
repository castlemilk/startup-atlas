// Source coverage, denominators and last-successful-scan report for
// #89 (OPS-01).
//
// The loop-health check watches aggregate stalls and the field report
// (#89) watches reviewed-record completeness; this report is the
// source-level table the remaining #89 scope names: for every source in
// data/crawl-source-state.json, when it was last fetched, when it last
// succeeded, and whether it has ever succeeded — plus, per crawl mode
// in data/crawl-runs.json, the run denominators (sources attempted /
// succeeded / failed) of the latest completed run and when that mode
// last completed a full scan.
//
// Denominators are the sources actually recorded in the state file and
// the runs actually recorded in crawl-runs.json — observed totals,
// never estimates of how many sources exist on the web. A source counts
// as succeeded only when last_success_at is set; consecutive_failures
// > 0 marks it currently failing regardless of past success.
//
// Output is committed as docs/SOURCE-COVERAGE.md (regenerate with
// `npm run report:source-coverage`) so the numbers are visible without
// running anything.
import { readFile, writeFile } from 'node:fs/promises';

const DAY_MS = 24 * 60 * 60 * 1000;

export function sourceHost(sourceId) {
  try {
    return new URL(sourceId).hostname;
  } catch {
    return '(unparsed)';
  }
}

export function successBucket(source, today) {
  if (!source?.last_success_at) return 'never';
  const date = Date.parse(source.last_success_at);
  if (Number.isNaN(date)) return 'never';
  const ageDays = Math.floor((today - date) / DAY_MS);
  if (ageDays <= 7) return 'fresh';
  if (ageDays <= 30) return 'recent';
  return 'stale';
}

function dateOnly(stamp) {
  return stamp ? String(stamp).slice(0, 10) : '—';
}

export function buildSourceCoverage({ state, runs, today }) {
  const sourceRows = Object.values(state?.sources || {})
    .map((s) => ({
      source_id: s.source_id,
      host: sourceHost(s.source_id),
      last_fetch_at: s.last_fetch_at || null,
      last_success_at: s.last_success_at || null,
      last_status: s.last_status ?? null,
      consecutive_failures: s.consecutive_failures || 0,
      total_runs: s.total_runs || 0,
      new_changed_rows_last_run: s.new_changed_rows_last_run || 0,
      bucket: successBucket(s, today),
      failing: (s.consecutive_failures || 0) > 0,
    }))
    .sort((a, b) => a.source_id.localeCompare(b.source_id));

  const summary = {
    total: sourceRows.length,
    succeeded: sourceRows.filter((s) => s.last_success_at).length,
    never: sourceRows.filter((s) => !s.last_success_at).length,
    failing: sourceRows.filter((s) => s.failing).length,
    totalRuns: sourceRows.reduce((n, s) => n + s.total_runs, 0),
    buckets: { fresh: 0, recent: 0, stale: 0, never: 0 },
    stateUpdatedAt: state?.updated_at || null,
    lastFetchAt: sourceRows.reduce(
      (max, s) => (s.last_fetch_at && (!max || s.last_fetch_at > max) ? s.last_fetch_at : max), null),
    lastSuccessAt: sourceRows.reduce(
      (max, s) => (s.last_success_at && (!max || s.last_success_at > max) ? s.last_success_at : max), null),
  };
  for (const s of sourceRows) summary.buckets[s.bucket] += 1;

  const hosts = new Map();
  for (const s of sourceRows) {
    const h = hosts.get(s.host) || {
      host: s.host, total: 0, succeeded: 0, never: 0, failing: 0, lastSuccessAt: null,
    };
    h.total += 1;
    if (s.last_success_at) {
      h.succeeded += 1;
      if (!h.lastSuccessAt || s.last_success_at > h.lastSuccessAt) h.lastSuccessAt = s.last_success_at;
    } else {
      h.never += 1;
    }
    if (s.failing) h.failing += 1;
    hosts.set(s.host, h);
  }
  const hostRows = [...hosts.values()].sort((a, b) => b.total - a.total || a.host.localeCompare(b.host));

  const runList = Array.isArray(runs?.runs) ? runs.runs : [];
  const modes = new Map();
  for (const r of runList) {
    const m = modes.get(r.mode) || {
      mode: r.mode, runs: 0, completed: 0, failed: 0, superseded: 0,
      lastFinishedAt: null, lastCompleted: null,
    };
    m.runs += 1;
    if (r.status === 'completed') m.completed += 1;
    if (r.status === 'failed') m.failed += 1;
    if (r.status === 'superseded') m.superseded += 1;
    if (r.finished_at && (!m.lastFinishedAt || r.finished_at > m.lastFinishedAt)) {
      m.lastFinishedAt = r.finished_at;
    }
    if (r.status === 'completed' && r.finished_at
        && (!m.lastCompleted || r.finished_at > m.lastCompleted.finished_at)) {
      m.lastCompleted = {
        run_id: r.run_id,
        finished_at: r.finished_at,
        sources_attempted: r.outcome?.sources_attempted ?? null,
        sources_succeeded: r.outcome?.sources_succeeded ?? null,
        sources_failed: r.outcome?.sources_failed ?? null,
        scope_sources: Array.isArray(r.scope?.source_ids) ? r.scope.source_ids.length : null,
      };
    }
    modes.set(r.mode, m);
  }
  const modeRows = [...modes.values()].sort((a, b) => a.mode.localeCompare(b.mode));

  return { summary, hosts: hostRows, modes: modeRows, sources: sourceRows };
}

export function renderSourceCoverageMarkdown(report, { generatedAt, revision }) {
  const { summary } = report;
  const lines = [
    '# Source coverage and last successful scan',
    '',
    `Generated ${generatedAt}${revision ? ` from revision ${revision}` : ''} by \`npm run report:source-coverage\` (scripts/source-coverage-report.mjs). Do not edit by hand.`,
    '',
    'Source-level coverage for #89 (OPS-01): every source recorded in `data/crawl-source-state.json` with its last fetch, last success and current failure state, counted against the recorded sources (observed denominators), plus per-mode run denominators from `data/crawl-runs.json`. Success freshness at the report date: fresh ≤ 7 days, recent 8–30 days, stale > 30 days, never = no recorded success.',
    '',
    '## Summary',
    '',
    `Sources recorded: ${summary.total}. Succeeded at least once: ${summary.succeeded}. Never succeeded: ${summary.never}. Currently failing (consecutive failures > 0): ${summary.failing}. Recorded source runs: ${summary.totalRuns}.`,
    '',
    `Last success freshness: ${summary.buckets.fresh} fresh, ${summary.buckets.recent} recent, ${summary.buckets.stale} stale, ${summary.buckets.never} never.`,
    '',
    `State file updated: ${dateOnly(summary.stateUpdatedAt)}. Latest fetch (any source): ${dateOnly(summary.lastFetchAt)}. Latest success (any source): ${dateOnly(summary.lastSuccessAt)}.`,
    '',
    '## Crawl modes (recorded runs)',
    '',
    '| Mode | Runs | Completed | Failed | Superseded | Last finished | Latest completed: attempted | succeeded | failed | scope sources |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |',
  ];
  for (const m of report.modes) {
    const lc = m.lastCompleted;
    lines.push(`| ${m.mode} | ${m.runs} | ${m.completed} | ${m.failed} | ${m.superseded} | ${dateOnly(m.lastFinishedAt)} | ${lc?.sources_attempted ?? '—'} | ${lc?.sources_succeeded ?? '—'} | ${lc?.sources_failed ?? '—'} | ${lc?.scope_sources ?? '—'} |`);
  }
  lines.push(
    '',
    '## Hosts',
    '',
    '| Host | Sources | Succeeded | Never | Failing | Last success |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  );
  for (const h of report.hosts) {
    lines.push(`| ${h.host} | ${h.total} | ${h.succeeded} | ${h.never} | ${h.failing} | ${dateOnly(h.lastSuccessAt)} |`);
  }
  lines.push(
    '',
    '## Sources never succeeded',
    '',
  );
  const never = report.sources.filter((s) => !s.last_success_at);
  if (never.length === 0) {
    lines.push('None — every recorded source has succeeded at least once.', '');
  } else {
    lines.push('| Source | Last fetch | Consecutive failures |', '| --- | --- | ---: |');
    for (const s of never) {
      lines.push(`| ${s.source_id} | ${dateOnly(s.last_fetch_at)} | ${s.consecutive_failures} |`);
    }
    lines.push('');
  }
  lines.push(
    '## All sources',
    '',
    '| Source | Host | Last fetch | Last success | Status | Consecutive failures | Runs | Changed rows (last run) |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |',
  );
  for (const s of report.sources) {
    lines.push(`| ${s.source_id} | ${s.host} | ${dateOnly(s.last_fetch_at)} | ${dateOnly(s.last_success_at)} | ${s.last_status ?? '—'} | ${s.consecutive_failures} | ${s.total_runs} | ${s.new_changed_rows_last_run} |`);
  }
  lines.push('');
  return lines.join('\n');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = new URL('../', import.meta.url);
  const read = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [state, runs] = await Promise.all([
    read('data/crawl-source-state.json'), read('data/crawl-runs.json'),
  ]);
  const generatedAt = new Date().toISOString().slice(0, 10);
  const today = Date.parse(generatedAt + 'T00:00:00Z');
  const report = buildSourceCoverage({ state, runs, today });
  let revision = null;
  try {
    const { execFileSync } = await import('node:child_process');
    revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root.pathname }).toString().trim();
  } catch { /* keep null */ }
  const markdown = renderSourceCoverageMarkdown(report, { generatedAt, revision });
  await writeFile(new URL('docs/SOURCE-COVERAGE.md', root), markdown.replace(/\n+$/, '') + '\n');
  console.log(JSON.stringify({
    generatedAt,
    sources: report.summary.total,
    succeeded: report.summary.succeeded,
    never: report.summary.never,
    failing: report.summary.failing,
    modes: report.modes.length,
  }, null, 2));
}
