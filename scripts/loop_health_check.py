#!/usr/bin/env python3
"""Loop health check for the Startup Atlas live-index loop (issues #375, #385).

Checks, in one stdlib-only run:

  a. crawl    — latest "Partner research crawl" workflow run conclusion,
                via the public GitHub API (repo is public; unauthenticated,
                rate-limit / network failures degrade to WARN, never RED).
  b. index    — the live index pointer (latest.json): version, table count
                (9 expected), total rows, and version age. The indexer only
                republishes on change, so age is WARN past 24h and RED past
                72h; a missing/unparseable pointer is RED immediately.
  c. lag      — corpus-vs-main lag by CONTENT HASH, not by revision: the
                corpus bucket is private, but the public index manifest
                embeds the corpus manifest's per-file sha256 values
                (``corpus.files``) and its content sha. We hash the local
                checkout's reviewed files (reusing
                ``atlas_corpus.reviewed_manifest``) and compare. Comparing
                ``source_revision`` to git HEAD would be wrong: HEAD moves
                with every merge, the manifest sha only moves when a
                reviewed file's bytes actually change. Differing files are
                WARN (the publish workflow + 15-min indexer should close
                the gap; a persistent lag shows up here day after day).
  d. console  — query-console smoke test at HTTP level: fetch query.html
                from the index base, compare the bucket console files
                against their canonical source in web/ (drift is WARN —
                issue #439; republish with
                scripts/publish_query_console.py), assert the apache-arrow
                import map is
                present (the 23 Nov 2026 bug: without it DuckDB-WASM cannot
                resolve 'apache-arrow' and no query runs), assert
                latest.json + the version manifest + at least one Parquet
                file are fetchable and the Parquet has PAR1 magic. When
                pyarrow is importable we also open one Parquet and verify
                its row count against the manifest (the local equivalent of
                the console's sample query); when it is not, the report
                says so instead of pretending the query ran.
  e. checked  — F4 (#385): per reviewed file, the stalest in-file evidence
                date. The reviewed files already carry per-record dates —
                catalogue opportunities use ``checked``, partner profiles
                use ``checked``, partners-reviewed and startup-research
                records use ``reviewed_at`` — so the stalest evidence is
                the minimum of those dates anywhere in the file. A file
                with no such field falls back to its last git commit date
                and is labelled as a fallback. Age >7 days is RED (the day
                it passes 7 days is the flag day, per #385); 5–7 days is
                WARN as an early warning. No top-level ``checked`` stamp
                was added to the data files: two of the four reviewed
                files are bare name-keyed objects with no metadata home,
                and a stamp key would be read as a partner/startup record
                by consumers; the per-record dates already exist, so the
                health-check-side computation is the honest deliverable.
  f. queue    — committed review-queue pending count (#426). WARNs
                above 150 or for unreadable queue data. Newest-entry age
                is descriptive only. A crawl writes a separate artifact,
                and a successful no-op rebuild preserves entry timestamps,
                so rebuild/publish freshness requires separate evidence.

Exit code is non-zero when any check is RED. WARN never fails the run.
All network access goes through an injectable ``fetch`` callable and all
clock/git access through injectable callables, so tests need no network.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, date, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas_corpus import REVIEWED_FILES, reviewed_manifest  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPO = 'castlemilk/startup-atlas'
CRAWL_WORKFLOW = 'partner-research.yml'
INDEX_BASE = 'https://storage.googleapis.com/single-station-515408-g9-atlas-index/'
EXPECTED_TABLES = 9
INDEX_WARN_AGE_H = 24
INDEX_RED_AGE_H = 72
STALE_WARN_DAYS = 5
STALE_RED_DAYS = 7
QUEUE_PENDING_WARN = 150
DATE_KEYS = ('checked', 'reviewed_at')

OK, WARN, RED = 'ok', 'warn', 'red'
_ICON = {OK: 'OK  ', WARN: 'WARN', RED: 'RED '}


class FetchError(Exception):
    pass


def http_fetch(url):
    """Default fetcher: returns (status, body bytes); raises FetchError."""
    request = urllib.request.Request(
        url, headers={'User-Agent': 'atlas-loop-health-check'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, exc.read()
        except Exception:
            return exc.code, b''
    except urllib.error.URLError as exc:
        raise FetchError(f'{url}: {exc.reason}') from exc


def _parse_ts(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


class Report:
    def __init__(self):
        self.lines = []  # (level, name, detail)

    def add(self, level, name, detail):
        self.lines.append((level, name, detail))

    @property
    def worst(self):
        if any(level == RED for level, _, _ in self.lines):
            return RED
        if any(level == WARN for level, _, _ in self.lines):
            return WARN
        return OK

    def render(self):
        out = ['Startup Atlas loop health check', '=' * 34]
        for level, name, detail in self.lines:
            out.append(f'[{_ICON[level]}] {name}: {detail}')
        out.append(f'Overall: {self.worst.upper()}')
        return '\n'.join(out)


# --- individual checks -----------------------------------------------------

def check_crawl(fetch, report):
    url = (f'https://api.github.com/repos/{REPO}/actions/workflows/'
           f'{CRAWL_WORKFLOW}/runs?per_page=1')
    try:
        status, body = fetch(url)
    except FetchError as exc:
        report.add(WARN, 'crawl', f'could not query GitHub API ({exc}); unverified')
        return
    if status in (403, 429):
        report.add(WARN, 'crawl',
                   f'GitHub API rate-limited (HTTP {status}); unverified')
        return
    if status != 200:
        report.add(WARN, 'crawl', f'GitHub API returned HTTP {status}; unverified')
        return
    runs = json.loads(body).get('workflow_runs') or []
    if not runs:
        report.add(WARN, 'crawl', 'no crawl workflow runs found')
        return
    run = runs[0]
    conclusion = run.get('conclusion')
    state = run.get('status')
    when = run.get('created_at', '?')
    if state != 'completed':
        report.add(WARN, 'crawl',
                   f'latest run still {state} (started {when}) {run.get("html_url", "")}')
        return
    if conclusion == 'success':
        report.add(OK, 'crawl', f'latest run succeeded ({when})')
    else:
        report.add(RED, 'crawl',
                   f'latest run conclusion={conclusion} ({when}) {run.get("html_url", "")}')


def check_crawl_progress(fetch, report, now):
    """In-run view from the shipped crawl-progress record (design 24 Nov).

    Complements check_crawl's end-of-run verdict: OK on a fresh heartbeat
    or an idle record, WARN (never RED) on a stale heartbeat during a
    running crawl, and a silent WARN 'unverified' while the record does
    not exist yet — progress reporting must never false-RED the loop.
    """
    try:
        status, body = fetch(INDEX_BASE + 'crawl-progress.json')
    except FetchError as exc:
        report.add(WARN, 'crawl-progress',
                   f'could not read progress record ({exc}); unverified')
        return
    if status == 404:
        report.add(WARN, 'crawl-progress',
                   'no progress record published yet; unverified')
        return
    if status != 200:
        report.add(WARN, 'crawl-progress',
                   f'progress record returned HTTP {status}; unverified')
        return
    try:
        record = json.loads(body)
        run = record['run']
        updated = _parse_ts(run['updated_at'])
    except (ValueError, KeyError, TypeError) as exc:
        report.add(WARN, 'crawl-progress',
                   f'progress record unreadable ({exc}); unverified')
        return
    age = (now - updated).total_seconds()
    if run.get('status') == 'running':
        if age > 120:
            report.add(WARN, 'crawl-progress',
                       f'run {run.get("run_id")} heartbeat stale '
                       f'({age:.0f}s old, mode {run.get("current_mode")}); '
                       'the crawl may have stalled')
        else:
            report.add(OK, 'crawl-progress',
                       f'run {run.get("run_id")} in progress '
                       f'(mode {run.get("current_mode")}, heartbeat '
                       f'{age:.0f}s old)')
    else:
        report.add(OK, 'crawl-progress',
                   f'idle; last run {run.get("run_id")} '
                   f'{run.get("status")} (updated {run.get("updated_at")})')


def check_index(fetch, report, now):
    """Returns (latest dict, manifest dict) or (None, None)."""
    try:
        status, body = fetch(INDEX_BASE + 'latest.json')
    except FetchError as exc:
        report.add(RED, 'index', f'latest.json fetch failed ({exc})')
        return None, None
    if status != 200:
        report.add(RED, 'index', f'latest.json returned HTTP {status}')
        return None, None
    latest = json.loads(body)
    tables = latest.get('tables') or {}
    total = sum(tables.values())
    age_h = None
    try:
        age_h = (now - _parse_ts(latest['generated_at'])).total_seconds() / 3600
    except Exception:
        pass
    detail = (f"version {latest.get('version')}, {len(tables)} tables, "
              f"{total} rows, age {age_h:.1f}h" if age_h is not None else
              f"version {latest.get('version')}, {len(tables)} tables, {total} rows")
    if len(tables) != EXPECTED_TABLES:
        report.add(RED, 'index', detail + f' — expected {EXPECTED_TABLES} tables')
    elif age_h is not None and age_h > INDEX_RED_AGE_H:
        report.add(RED, 'index', detail + f' — older than {INDEX_RED_AGE_H}h')
    elif age_h is not None and age_h > INDEX_WARN_AGE_H:
        report.add(WARN, 'index', detail + f' — older than {INDEX_WARN_AGE_H}h')
    else:
        report.add(OK, 'index', detail)
    manifest = None
    manifest_path = latest.get('manifest')
    if manifest_path:
        try:
            mstatus, mbody = fetch(INDEX_BASE + manifest_path)
            if mstatus == 200:
                manifest = json.loads(mbody)
        except FetchError:
            manifest = None
    return latest, manifest


def check_corpus_lag(report, manifest, data_dir):
    if not manifest or 'corpus' not in manifest:
        report.add(WARN, 'corpus-lag',
                   'index manifest carries no corpus section; lag unverified')
        return
    published = (manifest['corpus'].get('files') or {})
    local_files = {}
    missing = []
    for name in REVIEWED_FILES:
        path = Path(data_dir) / name
        if path.exists():
            local_files[name] = path.read_bytes()
        else:
            missing.append(name)
    if missing:
        report.add(WARN, 'corpus-lag', f'local reviewed files missing: {missing}')
        return
    local_manifest = reviewed_manifest(local_files)
    differing = [
        name for name in REVIEWED_FILES
        if published.get(name, {}).get('sha256')
        != hashlib.sha256(local_files[name]).hexdigest()
    ]
    if not differing and local_manifest['sha256'] == manifest['corpus'].get(
            'reviewed_manifest_sha256'):
        report.add(OK, 'corpus-lag',
                   'local reviewed files match the published corpus '
                   f"(manifest sha {local_manifest['sha256'][:8]})")
    else:
        report.add(WARN, 'corpus-lag',
                   'published corpus differs from local checkout for: '
                   + ', '.join(differing or ['(manifest sha only)'])
                   + ' — corpus is behind this checkout until the publish '
                     'workflow + indexer run')


def check_console_drift(fetch, report, web_dir, html_body):
    """The bucket console must match its canonical source in web/ (#439).

    The bucket copy still runs when it is stale, so drift is a WARN, not a
    RED. Regenerate it with scripts/publish_query_console.py.
    """
    differing = []
    for name in ('query.html', 'query.js', 'query.css'):
        local_path = web_dir / name
        if not local_path.is_file():
            continue
        if name == 'query.html':
            remote = html_body
        else:
            try:
                status, remote = fetch(INDEX_BASE + name)
            except FetchError as exc:
                report.add(WARN, 'console-drift',
                           f'could not fetch bucket {name} to compare '
                           f'against web/{name} ({exc})')
                return
            if status != 200:
                report.add(WARN, 'console-drift',
                           f'bucket {name} returned HTTP {status}; cannot '
                           'verify it matches the canonical web/ source')
                return
        if remote != local_path.read_bytes():
            differing.append(name)
    if differing:
        report.add(WARN, 'console-drift',
                   'bucket query console differs from the canonical web/ '
                   'source for: ' + ', '.join(differing)
                   + ' — republish with scripts/publish_query_console.py')
    else:
        report.add(OK, 'console-drift',
                   'bucket query console matches the web/ source')


def check_console(fetch, report, latest, manifest, web_dir=None):
    try:
        status, body = fetch(INDEX_BASE + 'query.html')
    except FetchError as exc:
        report.add(RED, 'console', f'query.html fetch failed ({exc})')
        return
    if status != 200:
        report.add(RED, 'console', f'query.html returned HTTP {status}')
        return
    html = body.decode('utf-8', 'replace')
    if 'type="importmap"' not in html or '"apache-arrow"' not in html:
        report.add(RED, 'console',
                   'query.html is missing the apache-arrow import map '
                   '(DuckDB-WASM cannot resolve apache-arrow; no query runs)')
        return
    if web_dir is not None:
        check_console_drift(fetch, report, web_dir, body)
    if not latest or not manifest:
        report.add(RED, 'console',
                   'import map present, but latest.json/manifest unavailable '
                   'for the Parquet smoke test')
        return
    tables = manifest.get('tables') or {}
    if not tables:
        report.add(RED, 'console', 'index manifest lists no tables')
        return
    name, info = sorted(tables.items())[0]
    url = f"{INDEX_BASE}v1/{latest['version']}/{info['file']}"
    try:
        status, body = fetch(url)
    except FetchError as exc:
        report.add(RED, 'console', f'{info["file"]} fetch failed ({exc})')
        return
    if status != 200 or not body.startswith(b'PAR1'):
        report.add(RED, 'console',
                   f'{info["file"]} not a fetchable Parquet (HTTP {status})')
        return
    detail = (f'import map ok; latest.json + manifest + {info["file"]} '
              f'fetchable ({len(body)} bytes, PAR1 magic ok)')
    # Local equivalent of the console's sample query, when pyarrow exists.
    try:
        import pyarrow.parquet as pq  # noqa: F401
    except ImportError:
        report.add(OK, 'console',
                   detail + '; pyarrow not available — local query skipped '
                            '(HTTP-level checks only)')
        return
    import io
    table = pq.read_table(io.BytesIO(body))
    if table.num_rows != info.get('rows'):
        report.add(RED, 'console',
                   detail + f'; pyarrow read {table.num_rows} rows, manifest '
                            f"says {info.get('rows')}")
    else:
        report.add(OK, 'console',
                   detail + f'; pyarrow opened {name} and verified '
                            f'{table.num_rows} rows against the manifest')


def _iter_dates(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key in DATE_KEYS and isinstance(value, str):
                try:
                    yield date.fromisoformat(value[:10])
                except ValueError:
                    pass
            else:
                yield from _iter_dates(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_dates(item)


def file_staleness(path, git_date):
    """Return (stalest date, source label) for one reviewed file."""
    try:
        data = json.loads(Path(path).read_text())
        dates = list(_iter_dates(data))
    except Exception:
        dates = []
    if dates:
        return min(dates), 'in-file checked/reviewed_at dates'
    fallback = git_date(path)
    if fallback is not None:
        return fallback, 'git last-commit date (fallback: no in-file dates)'
    return None, 'unknown'


def _git_date(path):
    try:
        out = subprocess.run(
            ['git', 'log', '-1', '--format=%cs', '--', str(path)],
            capture_output=True, text=True, timeout=15,
            cwd=str(Path(path).resolve().parent))
        value = out.stdout.strip()
        return date.fromisoformat(value) if value else None
    except Exception:
        return None


def check_checked_dates(report, data_dir, today, git_date=_git_date):
    results = []
    for name in REVIEWED_FILES:
        path = Path(data_dir) / name
        if not path.exists():
            report.add(WARN, 'checked', f'{name}: missing from checkout')
            continue
        stalest, source = file_staleness(path, git_date)
        if stalest is None:
            report.add(WARN, 'checked', f'{name}: no date evidence found')
            continue
        age = (today - stalest).days
        results.append((age, name, stalest, source))
        level = RED if age > STALE_RED_DAYS else (
            WARN if age >= STALE_WARN_DAYS else OK)
        report.add(level, 'checked',
                   f'{name}: stalest evidence {stalest} ({source}), '
                   f'age {age}d')
    if results:
        age, name, stalest, _ = max(results)
        level = RED if age > STALE_RED_DAYS else (
            WARN if age >= STALE_WARN_DAYS else OK)
        report.add(level, 'checked-stalest',
                   f'stalest reviewed file is {name} at {age}d '
                   f'(stalest evidence {stalest}); flag threshold '
                   f'{STALE_RED_DAYS}d')


def check_review_queue(report, data_dir, now):
    """Report what the committed queue proves, not whether its builder ran."""
    path = Path(data_dir) / 'review-queue.json'
    try:
        queue = json.loads(path.read_text())
        entries = queue['entries']
        if not isinstance(entries, list):
            raise ValueError('entries is not a list')
    except (OSError, KeyError, TypeError, ValueError) as exc:
        report.add(WARN, 'review-queue',
                   f'could not read {path.name} ({exc}); unverified')
        return
    pending = sum(1 for e in entries
                  if isinstance(e, dict) and e.get('status') == 'pending')
    stamps = []
    for entry in entries:
        stamp = entry.get('created_at') if isinstance(entry, dict) else None
        if isinstance(stamp, str) and stamp:
            try:
                stamps.append(_parse_ts(stamp))
            except ValueError:
                pass

    detail = f'{pending} pending of {len(entries)} entries'
    problems = []
    if stamps:
        newest = max(stamps)
        age_h = (now - newest).total_seconds() / 3600
        detail += f'; newest entry {newest.date()} (age {age_h:.0f}h)'
    elif entries:
        problems.append('no parseable entry timestamps')
    if pending > QUEUE_PENDING_WARN:
        problems.append(f'pending count {pending} above threshold {QUEUE_PENDING_WARN}')
    detail += '; rebuild freshness unverified by committed entry timestamps'
    report.add(WARN if problems else OK, 'review-queue',
               '; '.join([detail, *problems]))


def run_checks(fetch=http_fetch, now=None, data_dir=None, git_date=_git_date,
               web_dir=None):
    now = now or datetime.now(timezone.utc)
    data_dir = Path(data_dir) if data_dir else ROOT / 'data'
    report = Report()
    check_crawl(fetch, report)
    check_crawl_progress(fetch, report, now)
    latest, manifest = check_index(fetch, report, now)
    check_corpus_lag(report, manifest, data_dir)
    check_console(fetch, report, latest, manifest, web_dir=web_dir)
    check_checked_dates(report, data_dir, now.date(), git_date)
    check_review_queue(report, data_dir, now)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data',
                        help='Directory holding the reviewed JSON files')
    args = parser.parse_args(argv)
    report = run_checks(data_dir=args.data_dir, web_dir=ROOT / 'web')
    print(report.render())
    return 1 if report.worst == RED else 0


if __name__ == '__main__':
    raise SystemExit(main())
