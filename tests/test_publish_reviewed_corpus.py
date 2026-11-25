"""publish_reviewed_corpus CLI: config gating and publish delegation (#376, #150)."""
import importlib.util
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


publisher = load("publish_reviewed_corpus_under_test",
                 "scripts/publish_reviewed_corpus.py")


class PublishReviewedCorpusCliTests(unittest.TestCase):
    def test_unconfigured_backend_exits_2_without_publishing(self):
        config = publisher.CorpusConfig()
        with mock.patch.object(publisher.CorpusConfig, "from_env",
                               return_value=config), \
             mock.patch.object(publisher,
                               "publish_reviewed_corpus_if_changed") as publish:
            self.assertEqual(publisher.main([]), 2)
        publish.assert_not_called()

    def test_configured_backend_publishes_and_reports_the_manifest(self):
        config = publisher.CorpusConfig(bucket="bucket")
        manifest = {"sha256": "a" * 64, "files": {"catalogue.json": {}}}
        receipt = {"status": "published", "sha256": "a" * 64}
        with mock.patch.object(publisher.CorpusConfig, "from_env",
                               return_value=config), \
             mock.patch.object(publisher, "is_configured", return_value=True), \
             mock.patch.object(publisher, "publish_reviewed_corpus_if_changed",
                               return_value=(manifest, receipt)) as publish:
            self.assertEqual(
                publisher.main(["--source-revision", "deadbeef"]), 0)
        publish.assert_called_once()
        args = publish.call_args.args
        self.assertEqual(args[1], config)
        self.assertEqual(args[2], "deadbeef")

    def test_unchanged_backend_prints_noop_receipt_and_exits_0(self):
        config = publisher.CorpusConfig(bucket="bucket")
        manifest = {"sha256": "b" * 64, "files": {"catalogue.json": {}}}
        receipt = {"status": "unchanged", "sha256": "b" * 64,
                   "reason": "content manifest matches"}
        with mock.patch.object(publisher.CorpusConfig, "from_env",
                               return_value=config), \
             mock.patch.object(publisher, "is_configured", return_value=True), \
             mock.patch.object(publisher, "publish_reviewed_corpus_if_changed",
                               return_value=(manifest, receipt)):
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(publisher.main([]), 0)
        self.assertIn("No-op publication receipt:", out.getvalue())
        self.assertIn('"status": "unchanged"', out.getvalue())

    def test_corpus_error_exits_1(self):
        config = publisher.CorpusConfig(bucket="bucket")
        with mock.patch.object(publisher.CorpusConfig, "from_env",
                               return_value=config), \
             mock.patch.object(publisher, "is_configured", return_value=True), \
             mock.patch.object(
                 publisher, "publish_reviewed_corpus_if_changed",
                 side_effect=publisher.CorpusError("upload failed")):
            self.assertEqual(publisher.main([]), 1)


if __name__ == "__main__":
    unittest.main()
