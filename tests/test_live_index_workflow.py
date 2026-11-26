"""Contract tests for the live-index trigger chain (.github/workflows).

F1 reliability (26 Nov 2026): the "Build live index" workflow relied on its
*/15 schedule as the only trigger for git-merged data, because "Publish
reviewed corpus" never dispatched it. GitHub dropped the schedule's ticks
for hours (last scheduled run 02:33Z, ~7 ticks missed), leaving the live
index stale until a human dispatched it by hand — three times in one day.
The fix chains the indexer off the corpus publish with workflow_run. These
tests pin that contract so the chain cannot silently regress to poll-only.
Skips cleanly without PyYAML, like the pyarrow-dependent suites.
"""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YAML = importlib.util.find_spec('yaml') is not None

if YAML:
    import yaml


def load_workflow(path):
    doc = yaml.safe_load((ROOT / path).read_text())
    # PyYAML (YAML 1.1) parses the bare key `on` as boolean True.
    triggers = doc.get('on', doc.get(True))
    return doc, triggers


@unittest.skipUnless(YAML, 'PyYAML not available')
class LiveIndexWorkflowTriggerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index_doc, cls.index_on = load_workflow(
            '.github/workflows/live-index.yml')
        cls.publish_doc, _ = load_workflow(
            '.github/workflows/publish-reviewed-corpus.yml')

    def test_chained_off_publish_reviewed_corpus(self):
        chain = self.index_on['workflow_run']
        # The chained workflow name must be the publisher's real name.
        self.assertEqual(chain['workflows'], [self.publish_doc['name']])
        self.assertEqual(chain['workflows'], ['Publish reviewed corpus'])
        self.assertEqual(chain['types'], ['completed'])
        self.assertEqual(chain['branches'], ['main'])

    def test_backstop_triggers_retained(self):
        crons = [entry['cron'] for entry in self.index_on['schedule']]
        self.assertEqual(crons, ['*/15 * * * *'])
        self.assertEqual(
            self.index_on['repository_dispatch']['types'], ['corpus-updated'])
        self.assertIn('workflow_dispatch', self.index_on)

    def test_chained_runs_require_publish_success(self):
        job_if = self.index_doc['jobs']['index']['if']
        self.assertIn("github.event_name != 'workflow_run'", job_if)
        self.assertIn("workflow_run.conclusion == 'success'", job_if)

    def test_publishes_never_interleave(self):
        concurrency = self.index_doc['concurrency']
        self.assertEqual(concurrency['group'], 'live-index')
        self.assertFalse(concurrency['cancel-in-progress'])


if __name__ == '__main__':
    unittest.main()
