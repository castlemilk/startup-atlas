import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'verify_atlas_pages', Path(__file__).resolve().parents[1] / 'scripts/verify-published-graph.py')
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class IconVerificationTests(unittest.TestCase):
    def setUp(self):
        self.registry = [{'id': f'icon-{n}'} for n in range(32)] + [{'id': 'bookmark'}]
        self.exports = {r['id']: '<svg/>' for r in self.registry}
        self.archive = [f'assets/design-icons/{name}.svg' for name in self.exports]

    def test_registry_expansion_passes_with_exact_published_assets(self):
        pages.verify_icon_exports(self.registry, self.exports, {'icons': self.registry}, self.archive)

    def test_missing_stale_and_duplicate_artifacts_fail(self):
        for manifest, paths in (
            ({'icons': self.registry[:-1]}, self.archive),
            ({'icons': self.registry}, self.archive[:-1]),
            ({'icons': self.registry}, self.archive + [self.archive[-1]]),
            ({'icons': self.registry}, self.archive + ['assets/design-icons/stale.svg']),
        ):
            with self.subTest(manifest=manifest, paths=paths), self.assertRaises(ValueError):
                pages.verify_icon_exports(self.registry, self.exports, manifest, paths)

    def test_duplicate_source_ids_fail(self):
        with self.assertRaisesRegex(ValueError, 'source icon registry'):
            pages.verify_icon_exports(
                self.registry + [{'id': 'bookmark'}], self.exports, {'icons': self.registry})
