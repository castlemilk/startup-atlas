import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


land = load('atlas_land_crawl_outputs', 'scripts/land_crawl_outputs.py')


def queue_entry(entry_id, status='pending', decided_by=None, run='44', note=None):
    entry = {'id': entry_id, 'kind': 'fact', 'status': status, 'run': run,
             'decided_by': decided_by}
    if note is not None:
        entry['decision_note'] = note
    return entry


class ReviewQueueMergeTests(unittest.TestCase):
    def test_decided_committed_entry_is_never_clobbered(self):
        latest = {'version': 1, 'entries': [
            queue_entry('fact:a', status='approved', decided_by='ben', note='verified')]}
        built = {'version': 1, 'entries': [
            queue_entry('fact:a', status='pending', run='48')]}
        merged, stats = land.merge_review_queue(built, latest)
        self.assertEqual(merged['entries'][0]['status'], 'approved')
        self.assertEqual(merged['entries'][0]['decided_by'], 'ben')
        self.assertEqual(stats['kept_decisions'], 1)

    def test_undecided_entry_takes_the_runs_fresher_copy(self):
        latest = {'version': 1, 'entries': [queue_entry('fact:a', run='44')]}
        built = {'version': 1, 'entries': [queue_entry('fact:a', run='48')]}
        merged, stats = land.merge_review_queue(built, latest)
        self.assertEqual(merged['entries'][0]['run'], '48')
        self.assertEqual(stats['refreshed'], 1)

    def test_new_built_entries_append_and_committed_only_entries_stay(self):
        latest = {'version': 1, 'entries': [
            queue_entry('fact:old', status='rejected', decided_by='agent-review')]}
        built = {'version': 1, 'entries': [queue_entry('fact:new', run='48')]}
        merged, stats = land.merge_review_queue(built, latest)
        self.assertEqual([e['id'] for e in merged['entries']],
                         ['fact:old', 'fact:new'])
        self.assertEqual(stats['added'], 1)
        self.assertEqual(stats['kept_committed_only'], 1)


class CrawlRunsMergeTests(unittest.TestCase):
    def test_union_by_run_id_without_duplicates(self):
        latest = {'version': 1, 'runs': [{'run_id': 'crawl-20261123-partners-12'}]}
        built = {'version': 1, 'runs': [
            {'run_id': 'crawl-20261123-partners-12'},
            {'run_id': 'crawl-20261126-partners-48'},
            {'run_id': 'crawl-20261126-news-48'}]}
        merged, stats = land.merge_crawl_runs(built, latest)
        self.assertEqual([r['run_id'] for r in merged['runs']], [
            'crawl-20261123-partners-12',
            'crawl-20261126-partners-48',
            'crawl-20261126-news-48'])
        self.assertEqual(stats['added'], 2)


def state_record(fetch, runs=1, failures=0):
    return {'source_id': 'https://example.com', 'last_fetch_at': fetch,
            'last_success_at': fetch, 'last_failure_at': None,
            'last_status': 200, 'last_failure_status': None,
            'consecutive_failures': failures, 'new_changed_rows_last_run': 0,
            'low_confidence_edges': 0, 'total_runs': runs}


class SourceStateMergeTests(unittest.TestCase):
    def test_newer_built_record_wins_and_backoff_survives(self):
        latest = {'version': 1, 'sources': {
            'https://example.com': state_record('2026-11-23T00:00:00+00:00', runs=3)}}
        built = {'version': 1, 'sources': {
            'https://example.com': state_record('2026-11-26T00:00:00+00:00', runs=4, failures=2)}}
        merged, stats = land.merge_source_state(built, latest)
        record = merged['sources']['https://example.com']
        self.assertEqual(record['consecutive_failures'], 2)
        self.assertEqual(record['total_runs'], 4)
        self.assertEqual(stats['from_built'], 1)

    def test_newer_committed_record_is_not_rewound_by_an_older_run(self):
        latest = {'version': 1, 'sources': {
            'https://example.com': state_record('2026-11-26T00:00:00+00:00', runs=5)}}
        built = {'version': 1, 'sources': {
            'https://example.com': state_record('2026-11-25T00:00:00+00:00', runs=4)}}
        merged, stats = land.merge_source_state(built, latest)
        self.assertEqual(merged['sources']['https://example.com']['total_runs'], 5)
        self.assertEqual(stats['from_latest'], 1)

    def test_sources_present_on_one_side_only_are_kept(self):
        latest = {'version': 1, 'sources': {
            'https://a.example': state_record('2026-11-23T00:00:00+00:00')}}
        built = {'version': 1, 'sources': {
            'https://b.example': state_record('2026-11-26T00:00:00+00:00')}}
        merged, _ = land.merge_source_state(built, latest)
        self.assertEqual(sorted(merged['sources']),
                         ['https://a.example', 'https://b.example'])


class LandEndToEndTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.artifact = root / 'artifact'
        self.data = root / 'data'
        self.artifact.mkdir()
        self.data.mkdir()

    def write(self, directory, name, document):
        (directory / name).write_text(json.dumps(document, indent=2) + '\n')

    def test_land_writes_merged_files_and_skips_missing_built_files(self):
        self.write(self.data, 'review-queue.json',
                   {'version': 1, 'entries': [queue_entry('fact:a', 'approved', 'ben')]})
        self.write(self.artifact, 'review-queue.json',
                   {'version': 1, 'entries': [queue_entry('fact:a'),
                                               queue_entry('fact:b', run='48')]})
        results = dict((name, action) for name, action, _ in
                       land.land(self.artifact, self.data))
        self.assertEqual(results['review-queue.json'], 'landed')
        self.assertEqual(results['crawl-runs.json'], 'skipped')
        self.assertEqual(results['crawl-source-state.json'], 'skipped')
        queue = json.loads((self.data / 'review-queue.json').read_text())
        self.assertEqual([e['id'] for e in queue['entries']], ['fact:a', 'fact:b'])
        self.assertEqual(queue['entries'][0]['status'], 'approved')
        # Nothing but the queue was written into the data directory.
        self.assertEqual([p.name for p in self.data.iterdir()], ['review-queue.json'])

    def test_land_is_idempotent(self):
        document = {'version': 1, 'runs': [{'run_id': 'r1'}]}
        self.write(self.data, 'crawl-runs.json', document)
        self.write(self.artifact, 'crawl-runs.json', document)
        results = dict((name, action) for name, action, _ in
                       land.land(self.artifact, self.data))
        self.assertEqual(results['crawl-runs.json'], 'unchanged')


class WorkflowWiringTests(unittest.TestCase):
    def test_crawl_workflow_lands_outputs_via_the_merge_script(self):
        workflow = (ROOT / '.github' / 'workflows'
                    / 'partner-research.yml').read_text()
        self.assertIn('scripts/land_crawl_outputs.py', workflow)
        self.assertIn('contents: write', workflow)
        # The landing step may only ever add the three crawl-state files.
        self.assertIn('add data/review-queue.json data/crawl-runs.json '
                      'data/crawl-source-state.json', workflow)


if __name__ == '__main__':
    unittest.main()
