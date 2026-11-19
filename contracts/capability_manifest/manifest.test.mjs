import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  assessManifest, compareCatalogues, digestCatalogue, digestJson,
  parseStrictJson, validateManifest,
} from './validator.mjs';
import {
  FIXTURE_NOW, FACET_NAMES, clearFacet, fixtureBinding, fixtureTools,
  makeSyntheticManifest, observedSimulation,
} from './fixtures.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const assess = manifest => assessManifest(manifest, { now: FIXTURE_NOW });
const valid = manifest => assert.deepEqual(validateManifest(manifest), []);
const rejected = (manifest, code) => {
  const errors = validateManifest(manifest);
  assert.ok(errors.length, 'The malformed assertion must not validate.');
  if (code) assert.ok(errors.some(e => e.code === code), JSON.stringify(errors));
};
const rebindRuntime = manifest => {
  const cap = manifest.capabilities[0];
  for (const name of ['deployed', 'discovered', 'authorized', 'verified_read', 'verified_write']) {
    for (const evidence of cap.facets[name].evidence) evidence.binding = fixtureBinding(cap, name);
  }
  return manifest;
};

test('synthetic read and write fixtures are structurally valid but never live confirmations', () => {
  for (const operation of ['read', 'write']) {
    const manifest = makeSyntheticManifest(operation);
    valid(manifest);
    const result = assess(manifest);
    assert.equal(result.valid, true);
    assert.equal(result.evidenceMode, 'synthetic');
    for (const facet of Object.values(result.capabilities[0].facets)) {
      assert.notEqual(facet.effective, 'confirmed');
    }
  }
});

test('fully bound hypothetical receipts can exercise the observed evaluation branch', () => {
  // These objects exist only in memory; no hypothetical evidence is saved as live.
  for (const operation of ['read', 'write']) {
    const manifest = observedSimulation(operation);
    valid(manifest);
    assert.equal(assess(manifest).capabilities[0].facets[`verified_${operation}`].effective, 'confirmed');
  }
});

test('source and merge do not imply deployment, discovery, authorization or execution', () => {
  const manifest = observedSimulation();
  const cap = manifest.capabilities[0];
  cap.runtime = { id: null, revision: null, sourceRevision: null, toolDigest: null, schemaDigest: null };
  cap.principal = null;
  for (const facet of ['deployed', 'discovered', 'authorized', 'verified_read']) clearFacet(manifest, facet, 'held');
  valid(manifest);
  const result = assess(manifest).capabilities[0];
  assert.equal(result.parity.status, 'unknown');
  assert.equal(result.facets.implemented_in_source.effective, 'confirmed');
  assert.equal(result.facets.merged.effective, 'confirmed');
  for (const facet of ['deployed', 'discovered', 'authorized', 'verified_read']) {
    assert.equal(result.facets[facet].effective, 'unknown');
    assert.equal(result.facets[facet].reason, 'held');
  }
});

test('a current graph data revision cannot fill an unknown MCP runtime revision', () => {
  const manifest = observedSimulation();
  const cap = manifest.capabilities[0];
  cap.dataRevision = { kind: 'git_sha', value: cap.source.revision };
  cap.runtime.revision = null;
  rebindRuntime(manifest);
  const result = assess(manifest).capabilities[0];
  assert.equal(result.parity.status, 'unknown');
  assert.notEqual(result.facets.verified_read.effective, 'confirmed');
});

test('matching tool/schema digests cannot mask an older runtime source commit', () => {
  const manifest = observedSimulation();
  manifest.capabilities[0].runtime.sourceRevision = 'b'.repeat(40);
  rebindRuntime(manifest);
  valid(manifest);
  const result = assess(manifest).capabilities[0];
  assert.equal(result.parity.status, 'mismatch');
  assert.ok(result.parity.codes.includes('SOURCE_RUNTIME_REVISION_MISMATCH'));
  assert.notEqual(result.facets.verified_read.effective, 'confirmed');
});

test('an exact runtime schema mismatch cannot retain effective execution verification', () => {
  const manifest = observedSimulation();
  manifest.capabilities[0].runtime.schemaDigest = `sha256:${'e'.repeat(64)}`;
  rebindRuntime(manifest);
  valid(manifest);
  const result = assess(manifest).capabilities[0];
  assert.ok(result.parity.codes.includes('SCHEMA_DIGEST_MISMATCH'));
  assert.notEqual(result.facets.verified_read.effective, 'confirmed');
});

test('client-registry discovery with no build/schema identity remains useful but limited', () => {
  const manifest = observedSimulation();
  const cap = manifest.capabilities[0];
  cap.runtime = { id: null, revision: null, sourceRevision: null, toolDigest: null, schemaDigest: null };
  cap.principal = null;
  for (const facet of ['deployed', 'authorized', 'verified_read']) clearFacet(manifest, facet);
  const evidence = cap.facets.discovered.evidence[0];
  evidence.kind = 'connector_registry';
  for (const key of Object.keys(evidence.binding)) {
    if (!['repository', 'transport', 'tool'].includes(key)) evidence.binding[key] = null;
  }
  valid(manifest);
  const result = assess(manifest).capabilities[0];
  assert.equal(result.facets.discovered.effective, 'confirmed');
  assert.equal(result.facets.authorized.effective, 'unknown');
  assert.equal(result.parity.status, 'unknown');
});

test('a registry name observation cannot borrow a source commit or schema digest', () => {
  const manifest = observedSimulation();
  manifest.capabilities[0].facets.discovered.evidence[0].kind = 'connector_registry';
  rejected(manifest, 'EVIDENCE_BINDING_MISMATCH');
});

for (const [key, other] of [
  ['runtimeId', 'synthetic:another-runtime'], ['runtimeRevision', 'synthetic:another-build'],
  ['principal', 'synthetic:another-principal'], ['transport', 'local_stdio'],
  ['repository', 'someone/another-repository'], ['tool', 'atlas_wrong_tool'],
  ['schemaDigest', `sha256:${'e'.repeat(64)}`], ['operation', 'write'],
]) {
  test(`receipt for a different ${key} cannot verify this read`, () => {
    const manifest = observedSimulation();
    manifest.capabilities[0].facets.verified_read.evidence[0].binding[key] = other;
    rejected(manifest);
    assert.notEqual(assess(manifest).capabilities[0].facets.verified_read.effective, 'confirmed');
  });
}

test('authorization expires exactly at its deadline without expiring discovery', () => {
  for (const operation of ['read', 'write']) {
    const manifest = observedSimulation(operation);
    manifest.capabilities[0].facets.authorized.evidence[0].expiresAt = FIXTURE_NOW;
    valid(manifest);
    const result = assess(manifest).capabilities[0];
    assert.equal(result.facets.discovered.effective, 'confirmed');
    assert.equal(result.facets.authorized.effective, 'stale');
    assert.notEqual(result.facets[`verified_${operation}`].effective, 'confirmed');
  }
});

test('regenerating the envelope never refreshes old source or merge evidence', () => {
  const manifest = observedSimulation();
  for (const facet of ['implemented_in_source', 'merged']) {
    manifest.capabilities[0].facets[facet].evidence[0].expiresAt = FIXTURE_NOW;
  }
  manifest.generatedAt = FIXTURE_NOW;
  const result = assess(manifest).capabilities[0];
  assert.equal(result.facets.implemented_in_source.effective, 'stale');
  assert.equal(result.facets.merged.effective, 'stale');
});

test('expired negative runtime evidence becomes stale and retains its original reason', () => {
  const manifest = observedSimulation();
  const facet = manifest.capabilities[0].facets.discovered;
  facet.status = 'unavailable';
  facet.reason = 'observed_discovery_failure';
  facet.evidence[0].kind = 'diagnostic_failure';
  facet.evidence[0].expiresAt = FIXTURE_NOW;
  manifest.generatedAt = FIXTURE_NOW;
  valid(manifest);
  const result = assess(manifest).capabilities[0].facets.discovered;
  assert.equal(result.declared, 'unavailable');
  assert.equal(result.effective, 'stale');
  assert.equal(result.reason, 'observed_discovery_failure');
  assert.ok(result.reasonCodes.includes('EVIDENCE_EXPIRED'));
});

test('failure evidence from another runtime cannot establish this runtime is unavailable', () => {
  const manifest = observedSimulation();
  const facet = manifest.capabilities[0].facets.discovered;
  facet.status = 'unavailable';
  facet.reason = 'observed_discovery_failure';
  facet.evidence[0].kind = 'diagnostic_failure';
  facet.evidence[0].binding.runtimeId = 'synthetic:somewhere-else';
  rejected(manifest, 'EVIDENCE_BINDING_MISMATCH');
});

test('source tests and cached registry names cannot prove a measured runtime failure', () => {
  for (const kind of ['source_test', 'synthetic', 'connector_registry']) {
    const manifest = observedSimulation();
    const facet = manifest.capabilities[0].facets.discovered;
    facet.status = 'unavailable'; facet.reason = 'denied';
    facet.evidence[0].kind = kind;
    rejected(manifest, 'EVIDENCE_KIND_MISMATCH');
  }
});

test('synthetic negative observations cannot masquerade as observed runtime failures', () => {
  const manifest = makeSyntheticManifest();
  const facet = manifest.capabilities[0].facets.discovered;
  facet.status = 'unavailable'; facet.reason = 'synthetic_failure';
  facet.evidence[0].kind = 'diagnostic_failure';
  valid(manifest);
  const result = assess(manifest).capabilities[0].facets.discovered;
  assert.equal(result.declared, 'unavailable');
  assert.equal(result.effective, 'synthetic');
  assert.equal(result.freshness, 'fresh');
});

test('an evidence-free hold stays explicitly unobserved rather than measured failure', () => {
  const manifest = observedSimulation();
  manifest.capabilities[0].facets.deployed = { status: 'unavailable', reason: 'user_deployment_hold', evidence: [] };
  valid(manifest);
  const result = assess(manifest).capabilities[0].facets.deployed;
  assert.equal(result.reason, 'user_deployment_hold');
  assert.equal(result.freshness, 'unobserved');
});

test('future generation or observations fail closed', () => {
  const generated = observedSimulation();
  generated.generatedAt = '2026-11-18T08:00:01Z';
  assert.equal(assess(generated).valid, false);
  const observed = observedSimulation();
  observed.capabilities[0].facets.discovered.evidence[0].observedAt = '2026-11-18T10:00:00Z';
  rejected(observed);
});

for (const stamp of ['2026-02-30T07:00:00Z', '2026-11-18T07:00:00+00:00', '', null]) {
  test(`invalid or ambiguous evidence time ${JSON.stringify(stamp)} is rejected`, () => {
    const manifest = observedSimulation();
    manifest.capabilities[0].facets.discovered.evidence[0].observedAt = stamp;
    rejected(manifest, 'INVALID_TIMESTAMP');
  });
}

test('an empty or reversed freshness window is rejected', () => {
  for (const expiry of ['2026-11-18T07:00:00Z', '2026-11-18T06:59:59Z']) {
    const manifest = observedSimulation();
    manifest.capabilities[0].facets.discovered.evidence[0].expiresAt = expiry;
    rejected(manifest, 'INVALID_FRESHNESS_WINDOW');
  }
});

test('verification requires an exact response digest and write also requires a revision', () => {
  for (const operation of ['read', 'write']) {
    const manifest = observedSimulation(operation);
    manifest.capabilities[0].facets[`verified_${operation}`].evidence[0].readback = null;
    rejected(manifest, 'READBACK_REQUIRED');
  }
  const manifest = observedSimulation('write');
  manifest.capabilities[0].facets.verified_write.evidence[0].readback.revision = null;
  rejected(manifest);
});

test('a proposal-head readback remains distinct from the graph data revision', () => {
  const manifest = observedSimulation('write');
  const cap = manifest.capabilities[0];
  assert.notDeepEqual(cap.dataRevision, cap.facets.verified_write.evidence[0].readback.revision);
  valid(manifest);
  assert.equal(assess(manifest).capabilities[0].facets.verified_write.effective, 'confirmed');
});

test('a write cannot be retrospectively authorized after its receipt time', () => {
  const manifest = observedSimulation('write');
  manifest.generatedAt = FIXTURE_NOW;
  manifest.capabilities[0].facets.authorized.evidence[0].observedAt = '2026-11-18T07:00:01Z';
  rejected(manifest, 'PRIOR_AUTHORIZATION_REQUIRED');
});

test('an unknown authorization blocks current read verification without inventing permission', () => {
  const manifest = clearFacet(observedSimulation(), 'authorized', 'credential_hold');
  const result = assess(manifest).capabilities[0];
  assert.notEqual(result.facets.verified_read.effective, 'confirmed');
  assert.equal(result.facets.authorized.reason, 'credential_hold');
});

test('source test, connection state and synthetic evidence cannot confirm authorization', () => {
  for (const kind of ['source_test', 'synthetic', 'connection_status']) {
    const manifest = observedSimulation();
    manifest.capabilities[0].facets.authorized.evidence[0].kind = kind;
    rejected(manifest);
  }
});

test('opposite operation verification cannot be marked confirmed', () => {
  const manifest = observedSimulation();
  const write = observedSimulation('write').capabilities[0].facets.verified_write;
  manifest.capabilities[0].facets.verified_write = write;
  rejected(manifest);
});

test('missing, null and empty source revisions are not interchangeable', () => {
  for (const value of [undefined, null, '', 'f'.repeat(64)]) {
    const manifest = observedSimulation();
    if (value === undefined) delete manifest.capabilities[0].source.revision;
    else manifest.capabilities[0].source.revision = value;
    rejected(manifest);
  }
});

test('confirmed without evidence and unknown without a reason both reject', () => {
  const noEvidence = observedSimulation();
  noEvidence.capabilities[0].facets.discovered.evidence = [];
  rejected(noEvidence, 'EVIDENCE_REQUIRED');
  const noReason = clearFacet(observedSimulation(), 'deployed', '');
  rejected(noReason);
});

test('unknown manifest versions, digest versions and fields fail closed', () => {
  for (const change of [
    m => { m.schemaVersion = 'atlas-capability-manifest/v2'; },
    m => { m.digestAlgorithm = 'something-else'; },
    m => { m.access_token = 'synthetic-not-a-secret'; },
    m => { m.capabilities[0].runtime.connected = true; },
  ]) {
    const manifest = observedSimulation(); change(manifest); rejected(manifest);
  }
});

test('duplicate capability identity is rejected rather than last-wins merged', () => {
  const manifest = observedSimulation();
  manifest.capabilities.push(structuredClone(manifest.capabilities[0]));
  rejected(manifest, 'DUPLICATE_CAPABILITY');
});

test('tool count equality does not hide replacement of a tool name', () => {
  const before = fixtureTools(), after = fixtureTools();
  after[0].name = 'atlas_other_fixture';
  const result = compareCatalogues(before, after);
  assert.equal(result.matching, false);
  assert.deepEqual(result.removed, ['atlas_fixture_read']);
  assert.deepEqual(result.added, ['atlas_other_fixture']);
});

test('nested schema changes alter both the schema and full-tool fingerprints', () => {
  const before = fixtureTools(), after = fixtureTools();
  after[0].inputSchema.properties.id.minLength = 2;
  const result = compareCatalogues(before, after);
  assert.ok(result.changed[0].codes.includes('SCHEMA_DIGEST_MISMATCH'));
  assert.ok(result.changed[0].codes.includes('TOOL_DIGEST_MISMATCH'));
});

test('annotation or description changes alter only the full-tool fingerprint', () => {
  for (const change of [
    tool => { tool.annotations.readOnlyHint = false; },
    tool => { tool.description = 'Different synthetic meaning'; },
  ]) {
    const before = fixtureTools(), after = fixtureTools(); change(after[0]);
    const result = compareCatalogues(before, after);
    assert.deepEqual(result.changed[0].codes, ['TOOL_DIGEST_MISMATCH']);
  }
});

test('object keys and tool-list order normalize; semantic array order stays exact', () => {
  const a = fixtureTools().concat(fixtureTools('write'));
  const b = a.toReversed().map(t => Object.fromEntries(Object.entries(t).reverse()));
  assert.deepEqual(digestCatalogue(a), digestCatalogue(b));
  assert.notEqual(digestJson({ required: ['a', 'b'] }), digestJson({ required: ['b', 'a'] }));
  assert.notEqual(digestJson({}), digestJson({ missing: null }));
});

test('duplicate names and incomplete catalogue names reject', () => {
  assert.throws(() => digestCatalogue([...fixtureTools(), ...fixtureTools()]), e => e.code === 'DUPLICATE_TOOL');
  assert.throws(() => digestCatalogue([{ name: 'atlas_fixture_read' }]), e => e.code === 'INVALID_TOOL');
});

test('canonical hashing rejects ambiguous non-JSON values and sparse arrays', () => {
  for (const value of [NaN, Infinity, -0, 9007199254740992, undefined, new Date(), [,]]) {
    assert.throws(() => digestJson(value));
  }
  const sparseWithExtra = new Array(1); sparseWithExtra.extra = 'would disappear';
  assert.throws(() => digestJson(sparseWithExtra));
  const withSymbol = ['x']; withSymbol[Symbol('hidden')] = 'would disappear';
  assert.throws(() => digestJson(withSymbol));
  const withGetter = []; Object.defineProperty(withGetter, '0', { get() { throw new Error('getter executed'); }, enumerable: true });
  assert.throws(() => digestJson(withGetter), e => e.message !== 'getter executed');
});

test('raw JSON rejects duplicate and escaped-equivalent keys before last-wins parsing', () => {
  for (const input of ['{"status":"unknown","status":"confirmed"}', '{"status":1,"sta\\u0074us":2}']) {
    assert.throws(() => parseStrictJson(input), e => e.code === 'DUPLICATE_JSON_KEY');
  }
});

test('raw JSON rejects overflow, negative zero, trailing bytes and excessive nesting', () => {
  for (const input of ['1e999', '-0', '{}{}', '{"a":1,}', '['.repeat(66) + '0' + ']'.repeat(66)]) {
    assert.throws(() => parseStrictJson(input));
  }
});

test('read-only CLI never follows evidence references and refuses remote inputs', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'atlas-capability-test-'));
  try {
    const fixture = makeSyntheticManifest();
    fixture.capabilities[0].facets.discovered.evidence[0].reference = 'https://evidence.invalid/not-fetched';
    const filename = path.join(folder, 'fixture.json');
    writeFileSync(filename, JSON.stringify(fixture));
    const run = (...args) => spawnSync(process.execPath, [path.join(root, 'cli.mjs'), ...args], { encoding: 'utf8', timeout: 5000 });
    const local = run('assess', filename, '--now', FIXTURE_NOW);
    assert.equal(local.status, 0, local.stderr + local.stdout);
    assert.equal(JSON.parse(local.stdout).valid, true);
    const remote = run('validate', 'https://evidence.invalid/manifest.json');
    assert.equal(remote.status, 2);
    assert.equal(JSON.parse(remote.stdout).errors[0].code, 'LOCAL_FILE_REQUIRED');
    const linked = path.join(folder, 'linked.json'); symlinkSync(filename, linked);
    assert.equal(run('validate', linked).status, 2);
    assert.equal(run('validate', filename, '--write').status, 2);
    const duplicate = path.join(folder, 'duplicate.json'); writeFileSync(duplicate, '{"x":1,"x":2}');
    assert.equal(JSON.parse(run('validate', duplicate).stdout).errors[0].code, 'DUPLICATE_JSON_KEY');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('all shipped actual-source baseline rows remain unverified at runtime', () => {
  const baseline = parseStrictJson(readFileSync(path.join(root, 'source-baseline.json'), 'utf8'));
  valid(baseline);
  assert.equal(baseline.evidenceMode, 'observed');
  assert.equal(baseline.capabilities.length, 17);
  for (const cap of baseline.capabilities) {
    assert.equal(cap.source.revision, 'd7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f');
    assert.equal(cap.runtime.revision, null);
    assert.equal(cap.runtime.sourceRevision, null);
    assert.equal(cap.facets.implemented_in_source.status, 'confirmed');
    assert.equal(cap.facets.merged.status, 'confirmed');
    for (const facet of ['deployed', 'authorized', 'verified_read', 'verified_write']) {
      assert.notEqual(cap.facets[facet].status, 'confirmed');
    }
  }
  assert.equal(baseline.capabilities.filter(c => c.facets.discovered.status === 'confirmed').length, 13);
  assert.equal(baseline.capabilities.filter(c => c.facets.discovered.status === 'unknown').length, 4);
  for (const facet of FACET_NAMES) assert.ok(Object.hasOwn(baseline.capabilities[0].facets, facet));
});
