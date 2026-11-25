import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    'verify_atlas_pages', ROOT / 'scripts/verify-published-graph.py')
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


class FetcherTests(unittest.TestCase):
    def transport(self, files):
        calls = []

        def fetch(path, limit):
            calls.append(path)
            if path not in files:
                raise pages.FetchError(f'{path}: 404')
            data = files[path]
            if len(data) > limit:
                raise ValueError(f'{path} exceeds the expected verification size')
            return data

        return fetch, calls

    def test_repeated_fetch_of_one_path_hits_transport_once(self):
        fetch, calls = self.transport({'a.txt': b'alpha'})
        fetcher = pages.Fetcher(transport=fetch)
        self.assertEqual(fetcher.fetch('a.txt', 100), b'alpha')
        self.assertEqual(fetcher.fetch('a.txt', 100), b'alpha')
        self.assertEqual(calls, ['a.txt'])
        self.assertEqual(fetcher.fetch_counts, {'a.txt': 1})

    def test_prefetch_deduplicates_and_bounds_requests(self):
        fetch, calls = self.transport({'a.txt': b'a', 'b.txt': b'b', 'c.txt': b'c'})
        fetcher = pages.Fetcher(transport=fetch, max_workers=2)
        fetcher.prefetch([('a.txt', 10), ('b.txt', 10), ('a.txt', 50), ('c.txt', 10), ('b.txt', 10)])
        self.assertEqual(sorted(calls), ['a.txt', 'b.txt', 'c.txt'])
        self.assertEqual(fetcher.fetch('a.txt', 50), b'a')
        self.assertEqual(sorted(calls), ['a.txt', 'b.txt', 'c.txt'])

    def test_cached_bytes_still_enforce_the_call_site_limit(self):
        fetch, _ = self.transport({'big.bin': b'x' * 64})
        fetcher = pages.Fetcher(transport=fetch)
        self.assertEqual(fetcher.fetch('big.bin', 100), b'x' * 64)
        with self.assertRaisesRegex(ValueError, 'exceeds the expected verification size'):
            fetcher.fetch('big.bin', 10)

    def test_missing_path_raises_fetch_error(self):
        fetch, _ = self.transport({})
        with self.assertRaises(pages.FetchError):
            pages.Fetcher(transport=fetch).fetch('gone.txt', 10)


class RetryPolicyTests(unittest.TestCase):
    def run_policy(self, outcomes):
        calls = []

        def verify_once():
            calls.append(1)
            outcome = outcomes[len(calls) - 1]
            if outcome is not None:
                raise outcome

        sleeps = []
        try:
            pages.run_verification(verify_once=verify_once, attempts=3, delay=7, sleep=sleeps.append)
            error = None
        except Exception as caught:  # noqa: BLE001 - the test asserts on the type below
            error = caught
        return calls, sleeps, error

    def test_success_needs_one_attempt(self):
        calls, sleeps, error = self.run_policy([None])
        self.assertEqual((len(calls), sleeps, error), (1, [], None))

    def test_propagation_failures_retry_then_pass(self):
        calls, sleeps, error = self.run_policy([pages.FetchError('404'), ValueError('stale'), None])
        self.assertEqual((len(calls), sleeps, error), (3, [7, 7], None))

    def test_propagation_failures_exhaust_the_budget(self):
        calls, sleeps, error = self.run_policy([ValueError('stale')] * 3)
        self.assertEqual((len(calls), sleeps), (3, [7, 7]))
        self.assertIsInstance(error, ValueError)

    def test_deterministic_errors_fail_on_the_first_attempt(self):
        for outcome in (TypeError('bug'), KeyError('missing'), RuntimeError('boom')):
            with self.subTest(outcome=outcome):
                calls, sleeps, error = self.run_policy([outcome, None, None])
                self.assertEqual((len(calls), sleeps), (1, []))
                self.assertIs(error, outcome)


FIXTURE_REVISION = 'fixture-revision-148'


def design_catalogue():
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {assets} from './web/design-handbook.js';import {atlasIcons,exportIcon} from './web/atlas-icons.js';import {featureSymbols,exportFeatureSymbol} from './web/atlas-feature-symbols.js';console.log(JSON.stringify({assets,iconRegistry:atlasIcons,icons:Object.fromEntries(atlasIcons.map(icon=>[icon.id,exportIcon(icon.id)])),featureSymbols,featureExports:Object.fromEntries(featureSymbols.map(symbol=>[symbol.id,exportFeatureSymbol(symbol.id)]))}));"],
        text=True, cwd=ROOT))


def fixture_sqlite(graph, catalogue, documents):
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / 'atlas.sqlite'
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE metadata (key TEXT, value TEXT)")
            db.execute("INSERT INTO metadata VALUES ('source_revision', ?)", (FIXTURE_REVISION,))
            db.execute("CREATE TABLE source_documents (path TEXT, content TEXT)")
            for name, content in documents.items():
                db.execute("INSERT INTO source_documents VALUES (?, ?)", (name, content.decode('utf-8')))
            for table in ('entities', 'edges', 'funding_rounds', 'articles'):
                db.execute(f"CREATE TABLE {table} (id INTEGER)")
                for _ in graph[table]:
                    db.execute(f"INSERT INTO {table} VALUES (1)")
            db.execute("CREATE TABLE opportunities (id TEXT, data TEXT)")
            for item in sorted(catalogue['opportunities'], key=lambda entry: entry['id']):
                db.execute("INSERT INTO opportunities VALUES (?, ?)", (item['id'], json.dumps(item)))
            for table in ('partner_records', 'locations', 'logo_mappings', 'provider_relationships'):
                db.execute(f"CREATE TABLE {table} (id INTEGER)")
                db.execute(f"INSERT INTO {table} VALUES (1)")
            db.execute("CREATE VIRTUAL TABLE entity_search USING fts5(name)")
            db.execute("INSERT INTO entity_search VALUES ('Canva')")
        return path.read_bytes()


def fixture_files():
    """A complete published-site fixture, derived from this revision's sources."""
    catalogue = design_catalogue()
    dependencies = json.loads((ROOT / 'package.json').read_text())['dependencies']
    files = {}
    sdk_bundle = b'fixture ui sdk bundle'
    files['graph.html'] = ('sql-wasm.js graph.js id="graph-company-loom" id="graph-company-group" '
                           'id="graph-company-directory" atlas-sdk.js?v=1 atlas-sdk.css?v=1 data-atlas-masthead').encode()
    files['design-lab.html'] = b'concept-dialog design-lab.js concept-collection design-aesthetic.html'
    files['design-direction.html'] = b'view-playbooks design-direction.js design-aesthetic.html'
    files['design-assets.html'] = b'icon-preview asset-dialog design-aesthetic.html'
    files['design-aesthetic.html'] = (b'signal-menu-toggle signal-preview signal-graphics signal-symbols '
                                      b'design-aesthetic.js signal-controls-workbench signal-controls.css')
    files['design-system.html'] = ('id="wireframes" component-workbench token-reference layout-recipes '
                                   'design-workbench.css design-token-reference.css design-recipes.css '
                                   + 'class="ds-wireframe" ' * 5
                                   + 'design-lab.html?collection=proposed#gallery').encode()
    files['index.html'] = ('landing.js?v=1 landing.css?v=1 href="./list.html" href="./graph.html" '
                           'href="./treemap.html" data-atlas-masthead '
                           'assets/landing/atlas-list-wide.webp assets/landing/atlas-list-compact.webp').encode()
    for route in ('list.html', 'treemap.html', 'entity.html', 'partner.html'):
        files[route] = b'atlas-sdk.js?v=1 atlas-sdk.css?v=1 data-atlas-masthead'
    for filename in pages.STYLESHEETS:
        files[filename] = (ROOT / 'web' / filename).read_bytes()
    for filename in ('design-aesthetic.js', 'design-aesthetic-data.js', 'atlas-feature-symbols.js', 'signal-controls.js'):
        files[filename] = (ROOT / 'web' / filename).read_bytes()
    for name in ('atlas-list-wide.webp', 'atlas-list-compact.webp'):
        files[f'assets/landing/{name}'] = (ROOT / 'web' / 'assets' / 'landing' / name).read_bytes()
    files['vendor/ui-sdk-manifest.json'] = json.dumps({
        'sourceRevision': FIXTURE_REVISION,
        'sha256': hashlib.sha256(sdk_bundle).hexdigest(),
        'coreVersion': dependencies['@ui-sdk/core'],
        'webVersion': dependencies['@ui-sdk/web'],
    }).encode()
    files['atlas-sdk.js'] = sdk_bundle
    files['vendor/UI-SDK-LICENSE.txt'] = (ROOT / 'docs' / 'UI-SDK-LICENSE.txt').read_bytes()
    for asset in catalogue['assets']:
        for key in ('image', 'thumb'):
            path = asset[key].removeprefix('./')
            files[path] = (ROOT / 'web' / path).read_bytes()
    files['assets/design-lab/asset-manifest.json'] = json.dumps(
        {'sourceRevision': FIXTURE_REVISION, 'assets': catalogue['assets']}).encode()
    files['assets/design-icons/icon-manifest.json'] = json.dumps({'icons': catalogue['iconRegistry']}).encode()
    for name, svg in catalogue['icons'].items():
        files[f'assets/design-icons/{name}.svg'] = svg.encode()
    for name, svg in catalogue['featureExports'].items():
        files[f'assets/feature-symbols/{name}.svg'] = svg.encode()
    files['assets/feature-symbols/symbol-manifest.json'] = json.dumps(
        {'symbols': catalogue['featureSymbols']}).encode()
    for path in (ROOT / 'web' / 'assets' / 'fonts').rglob('*'):
        if path.is_file():
            files[path.relative_to(ROOT / 'web').as_posix()] = path.read_bytes()
    for path in (ROOT / 'docs' / 'reference-extraction').rglob('*'):
        if path.is_file():
            files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    files['docs/reference-extraction-audit.json'] = (ROOT / 'docs' / 'reference-extraction-audit.json').read_bytes()
    for name in pages.KIT_DOCS:
        # The verifier only compares the published doc to the kit copy; no local source.
        files['docs/' + name] = f'fixture guidance: {name}'.encode()
    graph = {'source_revision': FIXTURE_REVISION, 'entities': [{'id': 'canva'}],
             'edges': [], 'funding_rounds': [], 'articles': []}
    catalogue_data = {'opportunities': []}
    files['data/graph.json'] = json.dumps(graph).encode()
    files['data/catalogue.json'] = json.dumps(catalogue_data).encode()
    treemap = (ROOT / 'data' / 'treemap-evidence.json').read_bytes()
    files['data/treemap-evidence.json'] = treemap
    documents = {'treemap-evidence.json': treemap}
    for name in ('partners-reviewed.json', 'partner-profiles.json', 'map-locations.json', 'land.geojson'):
        files['data/' + name] = b'{}'
        documents[name] = b'{}'
    documents['catalogue.json'] = files['data/catalogue.json']
    documents['graph.json'] = files['data/graph.json']
    files['data/atlas.sqlite'] = fixture_sqlite(graph, catalogue_data, documents)
    files['vendor/sql.js/sql-wasm.wasm'] = b'\x00asm\x01\x00\x00\x00'
    buffer = io.BytesIO()
    with ZipFile(buffer, 'w') as kit:
        for path, content in files.items():
            kit.writestr(path, content)
    files['assets/design-lab/atlas-design-kit.zip'] = buffer.getvalue()
    return files


class PublishedFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = fixture_files()

    def setUp(self):
        self.previous_cwd = os.getcwd()
        os.chdir(ROOT)
        self.previous_revision = pages.REVISION
        pages.REVISION = FIXTURE_REVISION
        self.calls = []

        def transport(path, limit):
            self.calls.append(path)
            if path not in self.files:
                raise pages.FetchError(f'{path}: 404')
            data = self.files[path]
            if len(data) > limit:
                raise ValueError(f'{path} exceeds the expected verification size')
            return data

        self.transport = transport

    def tearDown(self):
        pages.REVISION = self.previous_revision
        os.chdir(self.previous_cwd)

    def verify_with(self, files):
        self.files = files
        return pages.verify(pages.Fetcher(transport=self.transport))

    def test_full_fixture_passes_and_fetches_each_path_once(self):
        fetcher = pages.Fetcher(transport=self.transport)
        pages.verify(fetcher)
        self.assertEqual(sorted(self.calls), sorted(set(self.calls)))
        self.assertTrue(all(count == 1 for count in fetcher.fetch_counts.values()))
        self.assertIn('data/graph.json', fetcher.fetch_counts)

    def test_stale_graph_revision_fails(self):
        files = dict(self.files)
        graph = json.loads(files['data/graph.json'])
        graph['source_revision'] = 'an-older-revision'
        files['data/graph.json'] = json.dumps(graph).encode()
        with self.assertRaisesRegex(ValueError, 'graph revision has not caught up'):
            self.verify_with(files)

    def test_missing_asset_fails_as_a_fetch_error(self):
        files = dict(self.files)
        del files['assets/design-icons/icon-manifest.json']
        with self.assertRaises(pages.FetchError):
            self.verify_with(files)

    def test_corrupt_design_kit_fails(self):
        files = dict(self.files)
        files['assets/design-lab/atlas-design-kit.zip'] = b'this is not a zip archive'
        with self.assertRaises(Exception) as caught:
            self.verify_with(files)
        self.assertEqual(type(caught.exception).__name__, 'BadZipFile')

    def test_corrupt_database_fails(self):
        files = dict(self.files)
        files['data/atlas.sqlite'] = b'this is not a sqlite database'
        with self.assertRaisesRegex(ValueError, 'is not SQLite'):
            self.verify_with(files)

    def test_http_failure_on_a_page_fails_as_a_fetch_error(self):
        files = dict(self.files)
        del files['graph.html']
        with self.assertRaises(pages.FetchError):
            self.verify_with(files)
