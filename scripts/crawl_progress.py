#!/usr/bin/env python3
"""Live crawl-progress reporting for the Startup Atlas partner-research crawl.

While a crawl runs, each crawl.py step flushes a small progress record to
the public index bucket (key ``crawl-progress.json``, bucket root):

    https://storage.googleapis.com/<index-bucket>/crawl-progress.json

The Atlas KPIs dashboard, the hosted MCP tool ``atlas_crawl_status`` and
``scripts/loop_health_check.py`` all read that one object, so the chat
answer and the on-screen bars can never disagree. Design:
``crawl-progress-design-2026-11-24.md`` (goals/global-startup-tracking).

Reporting is strictly best-effort, mirroring publish_crawl_corpus.py: a
storage failure logs to stderr and can never raise into the crawl, change
its exit code, or touch its snapshots. Reporting only happens when the
``ATLAS_CRAWL_PROGRESS=1`` environment flag is set (the workflow sets it);
unset, crawl.py behaves exactly as before.

CLI (used by the workflow's final step and for manual runs):

    python3 scripts/crawl_progress.py finalize --status completed|failed
    python3 scripts/crawl_progress.py show
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas_corpus import (  # noqa: E402
    CORPUS_PREFIX,  # noqa: F401  (re-exported for callers)
    CorpusConfig,
    CorpusError,
    crawl_progress_archive_key,
    crawl_progress_key,
)
from atlas_gcp import GCSConfig, client_for  # noqa: E402

# The seven partner-research workflow modes, in workflow order. Consumers
# render in this order; records pre-seed all seven as pending.
WORKFLOW_MODES = [
    'partners', 'programs', 'news', 'logos', 'profiles', 'portraits',
    'partner-candidates',
]

# A running record whose heartbeat is older than this is treated as
# abandoned (a later run may take over) and rendered "stale" by consumers.
STALE_HEARTBEAT_S = 120

FLUSH_INTERVAL_S = 5.0
FLUSH_EVERY_SOURCES = 10


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime(
        '%Y-%m-%dT%H:%M:%SZ')


def _blank_mode():
    return {
        'status': 'pending', 'started_at': None, 'finished_at': None,
        'sources_total': None, 'sources_done': 0, 'sources_failed': 0,
        'pages_attempted': 0, 'pages_succeeded': 0,
        'candidates': 0, 'errors': 0,
        'current_source': None, 'last_error': None,
    }


def fresh_record(run_block):
    return {
        'version': 1,
        'kind': 'crawl-progress',
        'run': run_block,
        'modes': {mode: _blank_mode() for mode in WORKFLOW_MODES},
        'totals': {'sources_total': 0, 'sources_done': 0,
                   'candidates': 0, 'errors': 0},
        'last_completed': None,
    }


def counts_from_data(data):
    """Final per-mode counts from a crawl mode's returned snapshot dict.

    Reads only what the modes already compute: ``candidates`` and the
    coverage dicts (page_fetch_coverage / directory_coverage shapes).
    """
    counts = {}
    if not isinstance(data, dict):
        return counts
    if isinstance(data.get('candidates'), list):
        counts['candidates'] = len(data['candidates'])
    coverage = data.get('coverage') or {}
    sources = coverage.get('sources') or []
    if sources:
        counts['sources_total'] = len(sources)
        counts['sources_done'] = len(sources)
        counts['sources_failed'] = sum(
            1 for row in sources if row.get('status') == 'failed')
    for key in ('pages_attempted', 'pages_succeeded'):
        if isinstance(coverage.get(key), int):
            counts[key] = coverage[key]
    return counts


class ProgressReporter:
    """Load/merge/flush the crawl-progress record for one crawl run.

    ``live_client`` writes the index bucket (put_json / get_json /
    set_cache_control); ``archive_client`` (optional) writes the corpus
    bucket for the terminal archive copy. Both are injectable for tests.
    All storage failures are swallowed to stderr — see module docstring.
    """

    def __init__(self, live_client, archive_client=None, run_id='local',
                 run_attempt=1, run_url=None, trigger='local',
                 source_revision='', clock=None):
        self._live = live_client
        self._archive = archive_client
        self._clock = clock or time.time
        self.run_id = str(run_id)
        self.run_attempt = run_attempt
        self.run_url = run_url
        self.trigger = trigger
        self.source_revision = source_revision
        self.record = None
        self.conflict = False
        self._last_flush = 0.0
        self._sources_since_flush = 0

    # -- lifecycle ---------------------------------------------------------

    def _run_block(self, started_ts):
        return {
            'run_id': self.run_id,
            'run_attempt': self.run_attempt,
            'run_url': self.run_url,
            'source_revision': self.source_revision,
            'trigger': self.trigger,
            'status': 'running',
            'started_at': _iso(started_ts),
            'updated_at': _iso(started_ts),
            'finished_at': None,
            'heartbeat_seq': 0,
            'current_mode': None,
        }

    def begin_run(self):
        """Adopt or start the record for this run. Never raises."""
        try:
            now = self._clock()
            existing = None
            try:
                existing = self._live.get_json(crawl_progress_key())
            except Exception:
                existing = None
            if isinstance(existing, dict) and existing.get('run'):
                old = existing['run']
                if old.get('run_id') == self.run_id:
                    # Another step of the same run: adopt its record.
                    self.record = existing
                    return
                heartbeat_age = now - _ts(old.get('updated_at'), now)
                if old.get('status') == 'running' and heartbeat_age < STALE_HEARTBEAT_S:
                    # A different live run owns the record; stay silent.
                    self.conflict = True
                    print(
                        f'crawl-progress: run {old.get("run_id")} is live '
                        f'(heartbeat {heartbeat_age:.0f}s old); not writing.',
                        file=sys.stderr)
                    return
                record = fresh_record(self._run_block(now))
                if old.get('status') in ('completed', 'failed', 'aborted'):
                    record['last_completed'] = _completed_summary(existing)
                self.record = record
            else:
                self.record = fresh_record(self._run_block(now))
            self.flush(force=True)
        except Exception as exc:  # failure isolation: never break a crawl
            print(f'crawl-progress: begin_run failed: {exc}', file=sys.stderr)

    # -- mode + source hooks ------------------------------------------------

    def mode_started(self, mode, sources_total=None):
        if not self._active():
            return
        try:
            entry = self.record['modes'].setdefault(mode, _blank_mode())
            entry['status'] = 'running'
            entry['started_at'] = _iso(self._clock())
            if sources_total is not None:
                entry['sources_total'] = sources_total
            self.record['run']['current_mode'] = mode
            self.flush(force=True)
        except Exception as exc:
            print(f'crawl-progress: mode_started failed: {exc}',
                  file=sys.stderr)

    def set_total(self, mode, sources_total):
        if not self._active():
            return
        entry = self.record['modes'].setdefault(mode, _blank_mode())
        entry['sources_total'] = sources_total

    def source_started(self, mode, name):
        if not self._active():
            return
        entry = self.record['modes'].setdefault(mode, _blank_mode())
        entry['current_source'] = name

    def source_done(self, mode, name, failed=False, candidates=None,
                    error=None):
        if not self._active():
            return
        try:
            entry = self.record['modes'].setdefault(mode, _blank_mode())
            entry['sources_done'] += 1
            if failed:
                entry['sources_failed'] += 1
                entry['errors'] += 1
                if error:
                    entry['last_error'] = str(error)[:200]
            if candidates is not None:
                entry['candidates'] = candidates
            entry['current_source'] = name
            self._sources_since_flush += 1
            self.flush()
        except Exception as exc:
            print(f'crawl-progress: source_done failed: {exc}',
                  file=sys.stderr)

    def mode_finished(self, mode, data=None, status='completed'):
        if not self._active():
            return
        try:
            entry = self.record['modes'].setdefault(mode, _blank_mode())
            entry['status'] = status
            entry['finished_at'] = _iso(self._clock())
            entry['current_source'] = None
            for key, value in counts_from_data(data).items():
                entry[key] = value
            entry['errors'] = entry['sources_failed']
            if self.record['run'].get('current_mode') == mode:
                self.record['run']['current_mode'] = None
            self.flush(force=True)
        except Exception as exc:
            print(f'crawl-progress: mode_finished failed: {exc}',
                  file=sys.stderr)

    def stamp_terminal(self, status):
        """Mark the whole run finished and archive the final record."""
        if self.record is None:
            self.begin_run()
        if not self._active():
            return
        try:
            run = self.record['run']
            run['status'] = status
            run['finished_at'] = _iso(self._clock())
            run['current_mode'] = None
            for entry in self.record['modes'].values():
                if entry['status'] == 'running':
                    entry['status'] = 'skipped'
                    entry['current_source'] = None
            self.flush(force=True)
            if self._archive is not None:
                try:
                    self._archive.put_json(
                        crawl_progress_archive_key(self.run_id), self.record)
                except Exception as exc:
                    print(f'crawl-progress: archive write failed: {exc}',
                          file=sys.stderr)
        except Exception as exc:
            print(f'crawl-progress: stamp_terminal failed: {exc}',
                  file=sys.stderr)

    # -- internals -----------------------------------------------------------

    def _active(self):
        return self.record is not None and not self.conflict

    def _totals(self):
        totals = {'sources_total': 0, 'sources_done': 0,
                  'candidates': 0, 'errors': 0}
        for entry in self.record['modes'].values():
            if entry.get('sources_total'):
                totals['sources_total'] += entry['sources_total']
            totals['sources_done'] += entry.get('sources_done', 0)
            totals['candidates'] += entry.get('candidates', 0)
            totals['errors'] += entry.get('errors', 0)
        return totals

    def flush(self, force=False):
        """Write the record to the index bucket. Never raises."""
        if not self._active():
            return
        try:
            now = self._clock()
            if not force:
                if (now - self._last_flush < FLUSH_INTERVAL_S
                        and self._sources_since_flush < FLUSH_EVERY_SOURCES):
                    return
            run = self.record['run']
            run['updated_at'] = _iso(now)
            run['heartbeat_seq'] = run.get('heartbeat_seq', 0) + 1
            self.record['totals'] = self._totals()
            self._live.put_json(crawl_progress_key(), self.record)
            try:
                self._live.set_cache_control(
                    crawl_progress_key(), 'no-cache')
            except Exception:
                pass  # cache stamp is best-effort; the PUT already landed
            self._last_flush = now
            self._sources_since_flush = 0
        except Exception as exc:
            print(f'crawl-progress: flush failed: {exc}', file=sys.stderr)


def _ts(iso_value, fallback):
    if not iso_value:
        return fallback
    try:
        return datetime.strptime(
            iso_value, '%Y-%m-%dT%H:%M:%SZ').replace(
                tzinfo=timezone.utc).timestamp()
    except (ValueError, TypeError):
        return fallback


def _completed_summary(record):
    run = record.get('run') or {}
    modes = {}
    for name, entry in (record.get('modes') or {}).items():
        modes[name] = {
            'candidates': entry.get('candidates', 0),
            'sources_done': entry.get('sources_done', 0),
            'sources_total': entry.get('sources_total'),
            'status': entry.get('status'),
        }
    return {
        'run_id': run.get('run_id'), 'run_url': run.get('run_url'),
        'status': run.get('status'),
        'started_at': run.get('started_at'),
        'finished_at': run.get('finished_at'),
        'modes': modes,
        'totals': record.get('totals') or {},
    }


def reporter_from_env(environ=None):
    """Build a reporter from the environment, or None when not enabled.

    Enabled only with ATLAS_CRAWL_PROGRESS=1 and a configured GCS backend
    with an index bucket. Any configuration problem returns None (with a
    stderr note) so the crawl proceeds exactly as today.
    """
    env = environ if environ is not None else os.environ
    if env.get('ATLAS_CRAWL_PROGRESS') != '1':
        return None
    try:
        gcp = GCSConfig.from_env(env)
        if gcp.backend != 'gcs' or not gcp.index_bucket:
            print('crawl-progress: GCS index bucket not configured; '
                  'progress reporting disabled.', file=sys.stderr)
            return None
        config = CorpusConfig.from_env(env)
        live_client = client_for(config, gcp, bucket=gcp.index_bucket)
        archive_client = client_for(config, gcp)
        run_id = env.get('GITHUB_RUN_ID') or 'local'
        repo = env.get('GITHUB_REPOSITORY') or 'castlemilk/startup-atlas'
        run_url = (f'https://github.com/{repo}/actions/runs/{run_id}'
                   if env.get('GITHUB_RUN_ID') else None)
        trigger = ('workflow_dispatch' if env.get('GITHUB_EVENT_NAME')
                   == 'workflow_dispatch' else
                   'schedule' if env.get('GITHUB_EVENT_NAME') == 'schedule'
                   else 'local')
        return ProgressReporter(
            live_client, archive_client, run_id=run_id,
            run_attempt=int(env.get('GITHUB_RUN_ATTEMPT') or 1),
            run_url=run_url, trigger=trigger,
            source_revision=env.get('GITHUB_SHA') or '')
    except Exception as exc:
        print(f'crawl-progress: reporter setup failed: {exc}',
              file=sys.stderr)
        return None


def fetch_public_record(index_bucket, opener=None):
    """Read the live record over its public URL (no credentials)."""
    url = f'https://storage.googleapis.com/{index_bucket}/' \
          f'{crawl_progress_key()}'
    opener = opener or urllib.request.build_opener()
    with opener.open(url, timeout=15) as response:
        return json.loads(response.read().decode('utf-8'))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    fin = sub.add_parser('finalize', help='Stamp the run terminal + archive')
    fin.add_argument('--status', choices=['completed', 'failed', 'aborted'],
                     required=True)
    sub.add_parser('show', help='Print the live record from the public URL')
    args = parser.parse_args(argv)
    if args.command == 'show':
        gcp = GCSConfig.from_env()
        if not gcp.index_bucket:
            print('ATLAS_CORPUS_INDEX_BUCKET is not set.', file=sys.stderr)
            return 2
        print(json.dumps(fetch_public_record(gcp.index_bucket), indent=2))
        return 0
    # finalize runs inside the crawl environment: force-enable reporting.
    os.environ['ATLAS_CRAWL_PROGRESS'] = '1'
    reporter = reporter_from_env()
    if reporter is None:
        print('crawl-progress: not configured; nothing to finalize.',
              file=sys.stderr)
        return 0
    reporter.begin_run()
    reporter.stamp_terminal(args.status)
    print(f'crawl-progress: run {reporter.run_id} stamped {args.status}.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except CorpusError as exc:
        print(f'Error: {exc}', file=sys.stderr)
        sys.exit(2)
