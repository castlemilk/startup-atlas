import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';
import { GitHubCatalogue } from '../../backend/hosted/src/github.mjs';
import { startupSlug } from '../../backend/hosted/src/startup-record.mjs';
import { entityDetails, slug, teamPersonId } from '../../web/graph-model.js';
import { getGraph, getOpportunity, getPublicDocument, getStartup } from '../../web/graph-sql.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const fixturePath = fileURLToPath(new URL('./build_fixture.py', import.meta.url));
const graphKeys = ['entities', 'edges', 'funding_rounds', 'articles'];
const originalFetch = globalThis.fetch;
let temporary, graph, collection, sqliteBytes, SQL, db;

before(async () => {
  globalThis.fetch = async () => { throw new Error('Live network is forbidden in canonical parity fixtures'); };
  temporary = mkdtempSync(join(tmpdir(), 'atlas-canonical-storage-'));
  execFileSync('python3', [fixturePath, '--out', join(temporary, 'fixture')], { cwd: root });
  graph = JSON.parse(readFileSync(join(temporary, 'fixture/graph.json'), 'utf8'));
  collection = JSON.parse(readFileSync(join(temporary, 'fixture/collection.json'), 'utf8'));
  sqliteBytes = readFileSync(join(temporary, 'fixture/atlas.sqlite'));
  const modulePath = join(temporary, 'sql-wasm.cjs');
  copyFileSync(join(root, 'web/vendor/sql.js/sql-wasm.js'), modulePath);
  SQL = await createRequire(import.meta.url)(modulePath)({
    locateFile: () => join(root, 'web/vendor/sql.js/sql-wasm.wasm'),
  });
  db = new SQL.Database(sqliteBytes);
});

after(() => {
  db?.close();
  if (temporary) rmSync(temporary, { recursive: true, force: true });
  globalThis.fetch = originalFetch;
});

function rows(database, sql) {
  const statement = database.prepare(sql);
  try {
    const result = [];
    while (statement.step()) result.push(statement.getAsObject());
    return result;
  } finally { statement.free(); }
}

function compileGraph(value, name) {
  const source = join(temporary, `${name}.json`), target = join(temporary, `${name}.sqlite`);
  writeFileSync(source, JSON.stringify(value));
  // Actual builder, explicitly no public-data input or mapping export.
  execFileSync('python3', ['-B', '-c', [
    'import importlib.util, pathlib, sys',
    'spec = importlib.util.spec_from_file_location("parity_db", sys.argv[1])',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'module.build(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))',
  ].join('\n'), join(root, 'scripts/build-graph-db.py'), source, target], {
    cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new SQL.Database(readFileSync(target));
}

test('collection preserves source identity, exact final URL and observation time without claiming review', () => {
  assert.equal(collection.candidates.length, 1);
  assert.deepEqual(collection.candidates[0], {
    label: 'Synthetic Founder Program', program_url: fixture.expected.program_url, context: '',
    source_id: fixture.expected.source_id, source_name: 'Synthetic Directory',
    source_url: fixture.expected.source_url, source_scope: 'Directory-only scope',
    checked_at: fixture.checked_at, review_required: true,
  });
  assert.equal(Object.hasOwn(collection.candidates[0], 'reviewed_at'), false);
  assert.equal(Object.hasOwn(collection.candidates[0], 'approved'), false);
  assert.equal(graph.entities.some(entity => entity.id === fixture.expected.source_id), false);
  assert.equal(graph.entities.find(entity => entity.kind === 'programme').id, 'programme:synthetic-programme');
});

test('Python graph, UI IDs and record IDs agree while same-name founder and team member stay distinct', () => {
  assert.deepEqual(graph.entities.map(entity => entity.id), fixture.expected.entity_ids);
  assert.equal(`startup:${startupSlug('Café Synthetic')}`, fixture.expected.startup_id);
  assert.equal(`startup:${slug('Café Synthetic')}`, fixture.expected.startup_id);
  assert.equal(teamPersonId('Ada Example', 'Synthetic Firm'), fixture.expected.team_member_id);
  assert.notEqual(fixture.expected.founder_id, fixture.expected.team_member_id);
  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.to, edge.kind]), [
    ['person:ada-example', 'startup:cafe-synthetic', 'founded'],
    ['person:ada-example--synthetic-firm', 'partner:synthetic-firm', 'team_member'],
    ['provider:synthetic-operator', 'programme:synthetic-programme', 'offers'],
  ]);
});

test('generated JSON, SQLite and UI preserve every nested payload and exact source URL', () => {
  const result = getGraph(db);
  for (const key of graphKeys) assert.deepEqual(result[key], graph[key], key);
  const source = fixture.inputs.research.startups[0];
  const startup = result.entities.find(entity => entity.id === fixture.expected.startup_id);
  assert.equal(startup.source, source.source);
  assert.deepEqual(startup.profile_facts, source.profile_facts);
  assert.equal(startup.profile_facts[0].source, fixture.expected.profile_fact_source);
  assert.equal(result.articles[0].url, fixture.expected.article_url);
  for (const edge of rows(db, 'SELECT source_id, target_id, data FROM edges')) {
    const value = JSON.parse(edge.data);
    assert.equal(edge.source_id, value.from, 'SQL source_id is an entity ID, not an evidence source ID');
    assert.equal(edge.target_id, value.to);
    assert.notEqual(edge.source_id, value.source);
  }
});

test('REGRESSION SQLite UI graph retains the same source revision as generated JSON', () => {
  assert.equal(graph.source_revision, fixture.source_revision);
  assert.equal(rows(db, "SELECT value FROM metadata WHERE key='source_revision'")[0].value, fixture.source_revision);
  assert.equal(getGraph(db).source_revision, graph.source_revision);
});

test('graph projection defaults stay separate from authoritative record facts and review dates', () => {
  const source = fixture.inputs.research.startups[0];
  const startup = getStartup(db, fixture.expected.startup_id).startup;
  assert.equal(Object.hasOwn(source, 'founded_year'), false);
  assert.equal(startup.founded_year, 0, 'existing graph placeholder, not evidence of a year');
  assert.equal(Object.hasOwn(startup, 'reviewed_at'), false);
  assert.equal(source.reviewed_at, '2026-11-18');
  assert.equal(startup.profile_facts[0].reviewed_at, '2026-11-18');
  assert.equal(Object.hasOwn(source.articles[0], 'published_on'), false);
  assert.equal(graph.articles[0].published_on, '');
  assert.deepEqual(startup.socials, []);
});

test('allowlisted source documents preserve exact bytes and independent document digest', () => {
  const documents = rows(db, 'SELECT path, sha256, content FROM source_documents');
  assert.equal(documents.length, 13);
  for (const document of documents) {
    const bytes = readFileSync(join(temporary, 'fixture/public-inputs', document.path));
    assert.equal(document.content, bytes.toString('utf8'), document.path);
    assert.equal(document.sha256, createHash('sha256').update(bytes).digest('hex'), document.path);
  }
  assert.deepEqual(getPublicDocument(db, 'startup-research.json'), fixture.inputs.research);
  assert.deepEqual(getPublicDocument(db, 'graph.json'), graph);
  assert.deepEqual(getOpportunity(db, 'synthetic-programme'), fixture.inputs.catalogue.opportunities[0]);
  assert.throws(() => getPublicDocument(db, 'collection.json'), /unavailable/);
});

test('SQLite payload roundtrip distinguishes omitted, null, empty text, empty array and zero', () => {
  const variants = [
    { id: 'startup:missing', kind: 'startup', name: 'Missing' },
    { id: 'startup:null', kind: 'startup', name: 'Null', website: null, socials: null },
    { id: 'startup:empty', kind: 'startup', name: 'Empty', website: '', socials: [] },
    { id: 'startup:zero', kind: 'startup', name: 'Zero', founded_year: 0 },
  ];
  // These are raw storage cases, not accepted record-write payloads.
  const variantGraph = { version: 1, entities: variants, edges: [], funding_rounds: [], articles: [] };
  const database = compileGraph(variantGraph, 'raw-states');
  try {
    assert.deepEqual(getGraph(database).entities, variants);
    assert.equal(Object.hasOwn(getGraph(database).entities[0], 'website'), false);
  } finally { database.close(); }
});

test('unstamped, empty and missing-row revisions stay unknown; graph and database versions remain distinct', () => {
  const unstamped = { ...graph };
  delete unstamped.source_revision;
  for (const [name, input] of [['unstamped', unstamped], ['empty-stamp', { ...unstamped, source_revision: '' }]]) {
    const database = compileGraph(input, name);
    try {
      assert.equal(rows(database, "SELECT value FROM metadata WHERE key='source_revision'")[0].value, '');
      assert.equal(Object.hasOwn(getGraph(database), 'source_revision'), false);
      database.run("DELETE FROM metadata WHERE key='source_revision'");
      assert.equal(Object.hasOwn(getGraph(database), 'source_revision'), false);
      assert.equal(rows(database, "SELECT value FROM metadata WHERE key='schema_version'")[0].value, '2');
      assert.equal(input.version, 1);
      assert.equal(Object.hasOwn(getGraph(database), 'version'), false);
    } finally { database.close(); }
  }
});

test('explicit null snapshot revision is rejected by current SQLite storage and leaves no partial snapshot', () => {
  assert.throws(() => compileGraph({ ...graph, source_revision: null }, 'null-stamp'), error => {
    assert.match(error.stderr.toString(), /NOT NULL constraint failed: metadata.value/);
    return true;
  });
  assert.equal(readdirSync(temporary).includes('null-stamp.sqlite'), false);
  assert.equal(readdirSync(temporary).some(name => name.startsWith('.atlas-')), false);
});

test('UI SQLite and JSON detail projections agree with the hosted published-graph source adapter', async () => {
  const hosted = Object.create(GitHubCatalogue.prototype);
  hosted.api = async (suffix, options = {}) => {
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(suffix, '/git/ref/heads/main');
    return { object: { sha: fixture.main_revision } };
  };
  hosted.fetcher = async (url, options) => {
    assert.equal(url, 'https://castlemilk.github.io/startup-atlas/data/graph.json');
    assert.equal(options.redirect, 'manual');
    return new Response(JSON.stringify(graph));
  };
  const result = await hosted.getStartup(fixture.expected.startup_id);
  const sql = getStartup(db, fixture.expected.startup_id);
  const json = entityDetails(graph, fixture.expected.startup_id);
  assert.deepEqual(result.startup, sql.startup);
  assert.deepEqual(result.startup, json.entity);
  assert.deepEqual(result.relationships, sql.edges);
  assert.deepEqual(result.relationships, json.edges);
  assert.deepEqual(result.related_entities, sql.related);
  assert.deepEqual(result.related_entities, json.related);
  assert.deepEqual(result.funding_rounds, sql.rounds);
  assert.deepEqual(result.articles, sql.articles);
  assert.equal(result.revision, fixture.source_revision);
  assert.equal(result.mainRevision, fixture.main_revision);
  assert.equal(result.indexStatus, 'pending_publication');
});

test('REGRESSION actual openGraph database and fallback paths expose equal revision and public documents', async () => {
  const savedFetch = globalThis.fetch, savedInit = globalThis.initSqlJs;
  const opened = [];
  try {
    const observations = [];
    globalThis.initSqlJs = async () => ({ Database: class extends SQL.Database {
      constructor(bytes) { super(bytes); opened.push(this); }
    } });
    globalThis.fetch = async path => {
      assert.equal(path, './data/atlas.sqlite');
      observations.push(path);
      return new Response(sqliteBytes);
    };
    const databaseModule = await import('../../web/graph-store.js?canonical-parity=database');
    const database = await databaseModule.openGraph();
    assert.equal(database.mode, 'database');
    assert.deepEqual(observations, ['./data/atlas.sqlite']);
    globalThis.initSqlJs = undefined;
    globalThis.fetch = async path => {
      const name = path.replace(/^\.\/data\//, '');
      assert.ok(['graph.json', 'startup-research.json'].includes(name), path);
      return new Response(readFileSync(join(temporary, 'fixture/public-inputs', name)));
    };
    const fallbackModule = await import('../../web/graph-store.js?canonical-parity=fallback');
    const fallback = await fallbackModule.openGraph();
    assert.equal(fallback.mode, 'fallback');
    assert.equal(database.graph.source_revision, fallback.graph.source_revision);
    for (const key of graphKeys) assert.deepEqual(database.graph[key], fallback.graph[key]);
    assert.deepEqual(await database.document('startup-research.json'), await fallback.document('startup-research.json'));
  } finally {
    for (const database of opened) database.close();
    globalThis.fetch = savedFetch;
    if (savedInit === undefined) delete globalThis.initSqlJs;
    else globalThis.initSqlJs = savedInit;
  }
});
