import test from 'node:test';
import assert from 'node:assert/strict';
import { recordRevision } from '../backend/hosted/src/startup-edit.mjs';
import { attachmentIntentDigest, evaluateAttachmentContract } from '../contracts/mcp_record_attachments/reference-model.mjs';
import { attachmentFixture } from '../contracts/mcp_record_attachments/fixtures.mjs';

const evaluate = fixture => evaluateAttachmentContract(fixture.intent, fixture.context, fixture.dependencies);
async function rejects(fixture, code, path) {
  await assert.rejects(evaluate(fixture), error => {
    assert.equal(error.code, code);
    assert.equal(error.details.path, path);
    assert.ok(error.details.action.length > 15);
    return true;
  });
}
async function refreshRecordRevision(fixture) {
  fixture.intent.target.expectedRecordRevision = await recordRevision(
    fixture.intent.target.recordId, fixture.context.research.startups[0]);
}

test('portrait fixture binds a person to an exact nested founder and never permits a write', async () => {
  const fixture = await attachmentFixture();
  const result = await evaluate(fixture);
  assert.deepEqual(result.resolvedTarget, {recordId:'startup:example', subjectId:'person:alex-chen',
    role:'portrait', founderName:'Alex Chen', recordPointer:'/founders/0/photo_url'});
  assert.equal(result.recordRevision, fixture.intent.target.expectedRecordRevision);
  assert.equal(result.conditionStatus, 'fixture_satisfied');
  assert.equal(result.sourceOnly, true);
  for (const field of ['runtimeSupported', 'writePermitted', 'published']) assert.equal(result[field], false);
  assert.deepEqual(fixture.calls.map(call => call.kind), ['resolveAsset', 'verifyApproval']);
  assert.equal(fixture.calls[1].request.intentDigest, result.intentDigest);
  for (const secret of ['principal', 'policyRevision', 'decisionId', 'permission', 'manifestContent']) {
    assert.equal(Object.hasOwn(result, secret), false);
  }
});

test('startup logo fixture binds the company itself without founder inference', async () => {
  const fixture = await attachmentFixture('logo');
  const result = await evaluate(fixture);
  assert.deepEqual(result.resolvedTarget, {recordId:'startup:example', subjectId:'startup:example', role:'logo', recordPointer:'/logo'});
  assert.equal(result.writePermitted, false);
});

test('local snapshot remains distinct from the exact Git asset commit', async () => {
  const fixture = await attachmentFixture('portrait', 'local');
  const result = await evaluate(fixture);
  assert.equal(result.snapshotRevision.length, 64);
  assert.equal(result.asset.commit.length, 40);
  assert.notEqual(result.snapshotRevision, result.asset.commit);
});

test('intent identity ignores object-key order and current repository head but binds every semantic component', async () => {
  const fixture = await attachmentFixture();
  const original = attachmentIntentDigest(fixture.intent);
  const reordered = {asset:{...fixture.intent.asset}, target:{...fixture.intent.target}, contractVersion:fixture.intent.contractVersion};
  assert.equal(attachmentIntentDigest(reordered), original);
  fixture.context.head = fixture.context.expectedRevision = 'f'.repeat(40);
  assert.equal((await evaluate(fixture)).intentDigest, original);
  for (const change of [
    intent => { intent.target.expectedRecordRevision = '1'.repeat(64); },
    intent => { intent.target.recordId = 'startup:other'; },
    intent => { intent.target.subjectId = 'person:other'; },
    intent => { intent.target.locator.name = 'Other Person'; },
    intent => { intent.asset.commit = '2'.repeat(40); },
    intent => { intent.asset.assetId = `asset:sha256:${'3'.repeat(64)}`; },
    intent => { intent.asset.manifestRevision = `sha256:${'4'.repeat(64)}`; },
    intent => { intent.target.role = 'logo'; intent.target.locator = {kind:'startup'}; intent.target.subjectId = intent.target.recordId; },
  ]) {
    const candidate = structuredClone(fixture.intent);
    change(candidate);
    assert.notEqual(attachmentIntentDigest(candidate), original);
  }
});

test('whole-record digest is insensitive to source object-key order only', async () => {
  const fixture = await attachmentFixture();
  fixture.context.research.startups[0] = Object.fromEntries(Object.entries(fixture.context.research.startups[0]).reverse());
  assert.equal((await evaluate(fixture)).recordRevision, fixture.intent.target.expectedRecordRevision);
});

for (const [label, mutate, path] of [
  ['caller approval', intent => { intent.approved = true; }, '/approved'],
  ['nested caller approval', intent => { intent.target.approved = true; }, '/target/approved'],
  ['array index', intent => { intent.target.locator.index = 0; }, '/target/locator/index'],
  ['arbitrary asset URL', intent => { intent.asset.url = 'https://example.invalid/logo.png'; }, '/asset/url'],
  ['arbitrary asset path', intent => { intent.asset.path = 'web/assets/new.png'; }, '/asset/path'],
]) {
  test(`strict conceptual envelope rejects ${label}`, async () => {
    const fixture = await attachmentFixture(); mutate(fixture.intent);
    await rejects(fixture, 'VALIDATION_ERROR', path);
    assert.equal(fixture.calls.length, 0);
  });
}

for (const [label, mutate] of [
  ['description outside portrait', record => { record.description = 'Concurrent edit'; }],
  ['different founder', record => { record.founders[1].source = 'https://example.invalid/new-source'; }],
  ['founder order', record => { record.founders.reverse(); }],
  ['exact source URL', record => { record.source += '/'; }],
]) {
  test(`whole-record precondition detects changed ${label}`, async () => {
    const fixture = await attachmentFixture(); mutate(fixture.context.research.startups[0]);
    await rejects(fixture, 'RECORD_CONFLICT', '/target/expectedRecordRevision');
    assert.equal(fixture.calls.length, 0);
  });
}

test('re-reading a reordered founder list derives its new pointer and requires a new intent', async () => {
  const fixture = await attachmentFixture();
  const previous = attachmentIntentDigest(fixture.intent);
  fixture.context.research.startups[0].founders.reverse();
  await refreshRecordRevision(fixture);
  const result = await evaluate(fixture);
  assert.equal(result.resolvedTarget.recordPointer, '/founders/1/photo_url');
  assert.notEqual(result.intentDigest, previous);
});

test('unchanged target does not bypass a stale repository snapshot', async () => {
  const fixture = await attachmentFixture(); fixture.context.head = 'f'.repeat(40);
  await rejects(fixture, 'STALE_REVISION', '/context/expectedRevision');
  assert.equal(fixture.calls.length, 0);
});

for (const [label, mutate, path] of [
  ['moving asset ref', fixture => { fixture.intent.asset.commit = 'main'; }, '/asset/commit'],
  ['local digest as asset commit', fixture => { fixture.intent.asset.commit = 'c'.repeat(64); }, '/asset/commit'],
  ['hosted source with local digest', fixture => { fixture.context.head = 'a'.repeat(64); }, '/context/head'],
  ['local source with Git commit', fixture => { fixture.context.mode = 'local'; }, '/context/head'],
  ['bare manifest digest', fixture => { fixture.intent.asset.manifestRevision = 'e'.repeat(64); }, '/asset/manifestRevision'],
  ['different repository', fixture => { fixture.intent.asset.repository = 'other/startup-atlas'; }, '/asset/repository'],
]) {
  test(`revision and repository domains reject ${label}`, async () => {
    const fixture = await attachmentFixture(); mutate(fixture);
    await rejects(fixture, 'VALIDATION_ERROR', path);
  });
}

test('graph-only startup is not an authoritative editable record', async () => {
  const fixture = await attachmentFixture(); fixture.context.research.startups = [];
  await rejects(fixture, 'NOT_FOUND', '/id');
});

test('source startup collisions cannot be selected by a matching name', async () => {
  const fixture = await attachmentFixture();
  fixture.context.research.startups.push({...structuredClone(fixture.context.research.startups[0]), name:'Éxample'});
  await rejects(fixture, 'AMBIGUOUS_ID', '/id');
});

for (const [label, mutate, path] of [
  ['graph entity', fixture => { fixture.context.graph.entities.push(null); }, '/context/graph'],
  ['graph edge', fixture => { fixture.context.graph.edges.push({from:'person:alex-chen'}); }, '/context/graph'],
  ['evaluation time', fixture => { fixture.context.now = '2026-02-31T00:00:00.000Z'; }, '/context/now'],
]) {
  test(`malformed ${label} fails actionably before any dependency runs`, async () => {
    const fixture = await attachmentFixture(); mutate(fixture);
    await rejects(fixture, 'INVALID_DATA', path);
    assert.equal(fixture.calls.length, 0);
  });
}

for (const [label, mutate, path] of [
  ['new association', fixture => { fixture.intent.target.locator.name = 'New Person'; }, '/target/locator/name'],
  ['spelling normalization', fixture => { fixture.intent.target.locator.name = 'Álex Chen'; }, '/target/locator/name'],
  ['different person', fixture => { fixture.intent.target.subjectId = 'person:sam-rao'; }, '/target/subjectId'],
  ['person graph name', fixture => { fixture.context.graph.entities[1].name = 'Álex Chen'; }, '/target/subjectId'],
  ['person graph kind', fixture => { fixture.context.graph.entities[1].kind = 'partner'; }, '/target/subjectId'],
  ['duplicate person graph node', fixture => { fixture.context.graph.entities.push({...fixture.context.graph.entities[1]}); }, '/target/subjectId'],
  ['startup graph name', fixture => { fixture.context.graph.entities[0].name = 'Other'; }, '/target/recordId'],
  ['portrait locator kind', fixture => { fixture.intent.target.locator.kind = 'startup'; }, '/target/locator/kind'],
]) {
  test(`canonical nested identity rejects ${label}`, async () => {
    const fixture = await attachmentFixture(); mutate(fixture);
    await rejects(fixture, 'IDENTITY_CONFLICT', path);
    assert.equal(fixture.calls.length, 0);
  });
}

test('firm-scoped person IDs do not alias global founder IDs', async () => {
  const fixture = await attachmentFixture(); fixture.intent.target.subjectId = 'person:alex-chen--example-ventures';
  await rejects(fixture, 'VALIDATION_ERROR', '/target/subjectId');
});

test('a logo cannot be attached to a person subject', async () => {
  const fixture = await attachmentFixture('logo'); fixture.intent.target.subjectId = 'person:alex-chen';
  await rejects(fixture, 'IDENTITY_CONFLICT', '/target/subjectId');
});

for (const name of ['Alex Chen', 'Álex Chen']) {
  test(`duplicate source founder identity rejects ${name}`, async () => {
    const fixture = await attachmentFixture();
    fixture.context.research.startups[0].founders.push({name, source:'https://example.invalid/duplicate'});
    await refreshRecordRevision(fixture);
    await rejects(fixture, 'IDENTITY_CONFLICT', '/target/locator/name');
  });
}

for (const name of ['Alex Chen', 'Álex Chen']) {
  test(`shared or colliding source person ${name} requires a separate migration`, async () => {
    const fixture = await attachmentFixture();
    fixture.context.research.startups.push({name:'Second', source:'https://second.invalid/', reviewed_at:'2026-01-01',
      founders:[{name, source:'https://second.invalid/team'}]});
    await rejects(fixture, 'IDENTITY_CONFLICT', '/target/subjectId');
  });
}

test('a graph-only founder association also blocks shared person metadata', async () => {
  const fixture = await attachmentFixture();
  fixture.context.graph.edges.push({from:'person:alex-chen', to:'startup:graph-only', kind:'founded'});
  await rejects(fixture, 'IDENTITY_CONFLICT', '/target/subjectId');
});

for (const [key, value] of [
  ['repository', 'other/startup-atlas'], ['commit', 'f'.repeat(40)],
  ['assetId', `asset:sha256:${'f'.repeat(64)}`], ['manifestRevision', `sha256:${'f'.repeat(64)}`],
  ['subjectId', 'person:sam-rao'], ['role', 'logo'],
]) {
  test(`asset resolution binds exact ${key}`, async () => {
    const fixture = await attachmentFixture();
    fixture.dependencies.resolveAsset = async binding => ({verified:true, ...binding, [key]:value});
    await rejects(fixture, 'ASSET_CONFLICT', `/assetEvidence/${key}`);
    assert.equal(fixture.calls.some(call => call.kind === 'verifyApproval'), false);
  });
}

for (const [label, resolver] of [
  ['missing', undefined], ['unavailable', async () => { throw new Error('Synthetic lost read'); }],
  ['unknown', async () => null], ['unverified', async binding => ({verified:false, ...binding})],
]) {
  test(`${label} asset resolution cannot reach approval`, async () => {
    const fixture = await attachmentFixture(); fixture.dependencies.resolveAsset = resolver;
    await rejects(fixture, 'ASSET_RESOLUTION_REQUIRED', '/asset');
    assert.equal(fixture.calls.some(call => call.kind === 'verifyApproval'), false);
  });
}

for (const [label, mutate, code] of [
  ['helper attestation', approval => { approval.authorization = 'caller-attestation-only'; }, 'APPROVAL_REQUIRED'],
  ['unknown authority', approval => { delete approval.policyRevision; }, 'APPROVAL_REQUIRED'],
  ['missing principal', approval => { delete approval.principal; }, 'APPROVAL_REQUIRED'],
  ['pending review', approval => { approval.status = 'pending'; }, 'APPROVAL_REQUIRED'],
  ['unverified decision', approval => { approval.verified = false; }, 'APPROVAL_REQUIRED'],
  ['different exact intent', approval => { approval.intentDigest = 'f'.repeat(64); }, 'APPROVAL_CONFLICT'],
  ['website-only use', approval => { approval.uses = ['public_website']; }, 'APPROVAL_CONFLICT'],
  ['duplicated use', approval => { approval.uses = ['public_repository', 'public_repository']; }, 'APPROVAL_CONFLICT'],
  ['revoked decision', approval => { approval.revoked = true; }, 'APPROVAL_INACTIVE'],
  ['unknown revocation state', approval => { delete approval.revoked; }, 'APPROVAL_INACTIVE'],
  ['expired decision', approval => { approval.expiresAt = '2026-01-10T00:00:00.000Z'; }, 'APPROVAL_INACTIVE'],
  ['future decision', approval => { approval.notBefore = '2026-01-11T00:00:00.000Z'; }, 'APPROVAL_INACTIVE'],
  ['invalid expiry', approval => { approval.expiresAt = '2026-02-31T00:00:00.000Z'; }, 'APPROVAL_INACTIVE'],
]) {
  test(`authenticated approval prerequisite rejects ${label}`, async () => {
    const fixture = await attachmentFixture(); const verify = fixture.dependencies.verifyApproval;
    fixture.dependencies.verifyApproval = async request => { const approval = await verify(request); mutate(approval); return approval; };
    await rejects(fixture, code, '/approval');
  });
}

for (const [label, verifier] of [
  ['absent', undefined], ['unknown', async () => null], ['unavailable', async () => { throw new Error('Synthetic verification unavailable'); }],
]) {
  test(`${label} approval verifier holds the source contract`, async () => {
    const fixture = await attachmentFixture(); fixture.dependencies.verifyApproval = verifier;
    await rejects(fixture, 'APPROVAL_REQUIRED', '/approval');
  });
}

for (const [label, dependencies] of [['null', null], ['array', []], ['string', 'untrusted'], ['boolean', false]]) {
  test(`malformed ${label} dependency context fails actionably`, async () => {
    const fixture = await attachmentFixture(); fixture.dependencies = dependencies;
    await rejects(fixture, 'INVALID_DATA', '/dependencies');
    assert.equal(fixture.calls.length, 0);
  });
}

for (const [dependency, code, path] of [
  ['resolveAsset', 'ASSET_RESOLUTION_REQUIRED', '/asset'],
  ['verifyApproval', 'APPROVAL_REQUIRED', '/approval'],
]) {
  test(`nested ${dependency} claims cannot replace a callable trusted resolver`, async () => {
    const fixture = await attachmentFixture(); fixture.dependencies[dependency] = {verified:true};
    await rejects(fixture, code, path);
  });
  for (const [label, rejection] of [['null', null], ['undefined', undefined], ['string', 'Synthetic rejection']]) {
    test(`${dependency} rejection with ${label} retains its actionable diagnostic`, async () => {
      const fixture = await attachmentFixture();
      fixture.dependencies[dependency] = async () => { throw rejection; };
      await rejects(fixture, code, path);
    });
  }
}

test('same bytes with another manifest need a new approval binding', async () => {
  const fixture = await attachmentFixture();
  const priorDigest = attachmentIntentDigest(fixture.intent);
  const verify = fixture.dependencies.verifyApproval;
  fixture.dependencies.verifyApproval = async request => ({...await verify(request), intentDigest:priorDigest});
  fixture.intent.asset.manifestRevision = `sha256:${'f'.repeat(64)}`;
  await rejects(fixture, 'APPROVAL_CONFLICT', '/approval');
});

test('evaluation snapshots source and intent before asynchronous verification', async () => {
  const fixture = await attachmentFixture();
  const expectedIntent = attachmentIntentDigest(fixture.intent);
  const expectedRevision = fixture.intent.target.expectedRecordRevision;
  const evaluating = evaluate(fixture);
  fixture.intent.target.locator.name = 'Changed After Start';
  fixture.intent.asset.commit = 'f'.repeat(40);
  fixture.context.research.startups[0].founders.reverse();
  fixture.context.head = 'f'.repeat(40);
  const result = await evaluating;
  assert.equal(result.intentDigest, expectedIntent);
  assert.equal(result.recordRevision, expectedRevision);
  assert.equal(result.resolvedTarget.founderName, 'Alex Chen');
  assert.equal(result.resolvedTarget.recordPointer, '/founders/0/photo_url');
});

test('inputs stay unchanged and resolver queries are frozen before external code sees them', async () => {
  const fixture = await attachmentFixture();
  const before = structuredClone({intent:fixture.intent, context:fixture.context});
  const resolve = fixture.dependencies.resolveAsset, verify = fixture.dependencies.verifyApproval;
  fixture.dependencies.resolveAsset = async binding => {
    assert.throws(() => { binding.commit = 'f'.repeat(40); }, TypeError);
    return resolve(binding);
  };
  fixture.dependencies.verifyApproval = async request => {
    assert.throws(() => { request.target.locator.name = 'Other'; }, TypeError);
    assert.throws(() => request.uses.push('other'), TypeError);
    return verify(request);
  };
  await evaluate(fixture);
  assert.deepEqual({intent:fixture.intent, context:fixture.context}, before);
});

test('resolver evidence is snapshotted before the approval dependency can alter it', async () => {
  const fixture = await attachmentFixture();
  let returnedEvidence;
  fixture.dependencies.resolveAsset = async binding => (returnedEvidence = {verified:true, ...binding});
  const verify = fixture.dependencies.verifyApproval;
  fixture.dependencies.verifyApproval = async request => {
    returnedEvidence.manifestRevision = `sha256:${'f'.repeat(64)}`;
    return verify(request);
  };
  const result = await evaluate(fixture);
  assert.equal(result.asset.manifestRevision, fixture.intent.asset.manifestRevision);
  assert.equal(result.writePermitted, false);
});
