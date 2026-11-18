import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { recordRevision } from '../../backend/hosted/src/startup-edit.mjs';
import {
  VERSION,
  validateContract,
  projectParticipations,
  resolveFact,
  migrateLegacyRecord,
  restoreLegacyRecord,
} from './reference-model.mjs';

// Independent regressions for defects reproduced during source review. All
// identities, sources, timestamps and assertions below are fictional. These
// tests perform no network, browser, proposal, dataset generation or file write.
const sourceRevision = 'd7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f';

function evidence(packet, name, subjectId, predicate) {
  const id = `evidence:${name}`;
  packet.evidence.push({
    id,
    source_id: 'source:one',
    subject_id: subjectId,
    predicate,
    basis: 'explicit',
    statement: 'Fictional explicit assertion for this independent regression fixture.',
  });
  return id;
}

function addInvestor(packet, suffix, canonicalEntityId) {
  const id = `investor:${suffix}`;
  packet.investors.push({
    id,
    display_name: `Fixture Investor ${suffix}`,
    kind: 'manager',
    identity_status: canonicalEntityId === null ? 'unresolved' : 'resolved',
    canonical_entity_id: canonicalEntityId,
    identity_evidence_ids: [evidence(packet, `identity-${suffix}`, id, 'identity')],
  });
}

function addRound(packet, suffix) {
  const id = `round:${suffix}`;
  packet.rounds.push({
    id,
    startup_id: 'startup:fixture',
    legacy_id: null,
    review_status: 'reviewed',
    identity_evidence_ids: [evidence(packet, `round-${suffix}`, id, 'identity')],
  });
}

function addClaim(packet, name, subjectId, predicate, value) {
  packet.claims.push({
    id: `claim:${name}`,
    subject_id: subjectId,
    predicate,
    value: structuredClone(value),
    evidence_ids: [evidence(packet, `claim-${name}`, subjectId, predicate)],
    review_status: 'reviewed',
    supersedes: [],
    correction_reason: null,
  });
}

function addParticipation(packet, suffix, roundSuffix, investorSuffix = 'a') {
  const id = `participation:${suffix}`;
  const roundId = `round:${roundSuffix}`;
  const investorId = `investor:${investorSuffix}`;
  packet.participations.push({
    id,
    round_id: roundId,
    investor_id: investorId,
    stated_name: `Fixture Investor ${investorSuffix}`,
  });
  addClaim(packet, suffix, id, 'participation', {
    round_id: roundId,
    investor_id: investorId,
    assertion: 'participates',
  });
}

function sameIdentity(packet, name, fromId, toId) {
  const id = `decision:${name}`;
  packet.identity_decisions.push({
    id,
    from_id: fromId,
    to_id: toId,
    verdict: 'same',
    review_status: 'reviewed',
    evidence_ids: [evidence(packet, `decision-${name}`, id, 'same_identity')],
    reason: 'Fictional explicit duplicate-identity review.',
  });
}

function fixture() {
  const packet = {
    schema_version: VERSION,
    synthetic: true,
    source_revision: sourceRevision,
    entity_refs: [
      { id: 'startup:fixture', kind: 'startup' },
      { id: 'partner:alpha', kind: 'partner' },
    ],
    sources: [{
      id: 'source:one',
      url: 'https://example.com/synthetic-source',
      publisher: 'Fictional source publisher',
      kind: 'primary_company',
      retrieved_at: '2025-06-01T00:00:00Z',
      published_on: { status: 'unknown', precision: null, value: null },
      duplicate_of: null,
    }],
    evidence: [],
    investors: [],
    rounds: [],
    participations: [],
    claims: [],
    identity_decisions: [],
    legacy: null,
  };
  addInvestor(packet, 'a', 'partner:alpha');
  addRound(packet, 'a');
  addParticipation(packet, 'a', 'a');
  return packet;
}

test('review regression: unresolved intermediary cannot merge conflicting canonical investor references', () => {
  const packet = fixture();
  packet.entity_refs.push({ id: 'partner:beta', kind: 'partner' });
  addInvestor(packet, 'b', null);
  addInvestor(packet, 'c', 'partner:beta');
  sameIdentity(packet, 'ab', 'investor:a', 'investor:b');
  sameIdentity(packet, 'bc', 'investor:b', 'investor:c');
  const before = structuredClone(packet);
  assert.throws(() => validateContract(packet), /Transitive investor identities disagree/);
  assert.throws(() => projectParticipations(packet), /Transitive investor identities disagree/);
  assert.deepEqual(packet, before);
});

for (const [name, kind, retrievedAt] of [
  ['discovery source with a timestamp', 'discovery', '2025-06-01T00:00:00Z'],
  ['legacy-unclassified source with a timestamp', 'legacy_unclassified', '2025-06-01T00:00:00Z'],
  ['primary source without an access timestamp', 'primary_company', null],
]) {
  test(`review regression: explicit basis does not promote a ${name}`, () => {
    const packet = fixture();
    packet.sources[0].kind = kind;
    packet.sources[0].retrieved_at = retrievedAt;
    assert.equal(packet.evidence.every(item => item.basis === 'explicit'), true);
    assert.throws(() => validateContract(packet), /Reviewed evidence requires an accessed attributable source/);
    assert.throws(() => projectParticipations(packet), /Reviewed evidence requires an accessed attributable source/);
  });
}

test('review regression: explicit grant participation retains a neutral predicate and grant kind', () => {
  const packet = fixture();
  addClaim(packet, 'grant-kind', 'round:a', 'transaction_kind', 'grant');
  const before = structuredClone(packet);
  assert.equal(validateContract(packet), true);
  const result = projectParticipations(packet);
  assert.equal(result.relations.length, 1);
  assert.equal(result.relations[0].predicate, 'participated_in_funding_event');
  assert.equal(result.relations[0].transaction_kind, 'grant');
  assert.equal(result.relations[0].role, 'unknown');
  assert.deepEqual(result.relations[0].membership_claim_ids, ['claim:a']);
  assert.deepEqual(result.held, []);
  assert.equal(result.authorization, 'none');
  assert.equal(result.runtime_supported, false);
  assert.equal(result.published, false);
  assert.deepEqual(packet, before);
});

test('review regression: conflicting transaction kinds hold the relationship', () => {
  const packet = fixture();
  addClaim(packet, 'grant-kind', 'round:a', 'transaction_kind', 'grant');
  addClaim(packet, 'equity-kind', 'round:a', 'transaction_kind', 'equity');
  assert.equal(validateContract(packet), true);
  const result = projectParticipations(packet);
  assert.deepEqual(result.relations, []);
  assert.deepEqual(result.held, [{ participation_id: 'participation:a', reason: 'transaction_kind_conflict' }]);
});

test('review regression: approved round and participation aliases agree without rewriting raw assertions', () => {
  const packet = fixture();
  addRound(packet, 'b');
  addParticipation(packet, 'b', 'b');
  sameIdentity(packet, 'round', 'round:b', 'round:a');
  sameIdentity(packet, 'participation', 'participation:b', 'participation:a');
  const before = structuredClone(packet);
  assert.equal(validateContract(packet), true);
  const result = resolveFact(packet, 'participation:a', 'participation');
  assert.equal(result.status, 'known');
  assert.deepEqual(result.value, { round_id: 'round:a', investor_id: 'investor:a', assertion: 'participates' });
  assert.deepEqual(result.claim_ids, ['claim:a', 'claim:b']);
  assert.deepEqual(result.source_groups, ['source:one']);
  const projection = projectParticipations(packet);
  assert.equal(projection.relations.length, 1);
  assert.equal(projection.relations[0].round_id, 'round:a');
  assert.equal(projection.relations[0].participation_id, 'participation:a');
  assert.deepEqual(projection.relations[0].membership_claim_ids, ['claim:a', 'claim:b']);
  assert.deepEqual(projection.held, []);
  assert.equal(packet.claims.find(claim => claim.id === 'claim:b').value.round_id, 'round:b');
  assert.deepEqual(packet, before);
});

test('review regression: approved investor aliases also compare canonical participation endpoints', () => {
  const packet = fixture();
  addInvestor(packet, 'b', null);
  addParticipation(packet, 'b', 'a', 'b');
  sameIdentity(packet, 'investor', 'investor:b', 'investor:a');
  sameIdentity(packet, 'participation', 'participation:b', 'participation:a');
  const before = structuredClone(packet);
  assert.equal(validateContract(packet), true);
  const fact = resolveFact(packet, 'participation:b', 'participation');
  assert.equal(fact.status, 'known');
  assert.deepEqual(fact.value, { round_id: 'round:a', investor_id: 'investor:a', assertion: 'participates' });
  assert.deepEqual(fact.claim_ids, ['claim:a', 'claim:b']);
  const projection = projectParticipations(packet);
  assert.equal(projection.relations.length, 1);
  assert.equal(projection.relations[0].canonical_entity_id, 'partner:alpha');
  assert.deepEqual(projection.held, []);
  assert.equal(packet.claims.find(claim => claim.id === 'claim:b').value.investor_id, 'investor:b');
  assert.deepEqual(packet, before);
});

for (const url of [
  'https://127.0.0.1/internal-evidence',
  'https://[::1]/internal-evidence',
  'https://localhost/internal-evidence',
  'https://source.internal/evidence',
  'https://source.invalid/evidence',
  'https://user:password@example.com/evidence',
  'https://example.com:8443/evidence',
  'http://example.com/evidence',
]) {
  test(`review regression: source URL restriction rejects ${new URL(url).hostname}`, () => {
    const packet = fixture();
    packet.sources[0].url = url;
    assert.throws(() => validateContract(packet), /public HTTPS/);
  });
}

const originalLegacyJson = await readFile(new URL('./fixtures/legacy-record.json', import.meta.url), 'utf8');
const unicodeLegacyRecord = {
  ...JSON.parse(originalLegacyJson),
  description: 'A fictional naïve café 🚀 description for Unicode byte preservation.',
};

for (const [name, json] of [
  ['original LF', originalLegacyJson],
  ['exact CRLF', originalLegacyJson.replaceAll('\n', '\r\n')],
  ['non-ASCII text', JSON.stringify(unicodeLegacyRecord, null, 4) + '\n'],
]) {
  test(`review regression: ${name} migration preserves bytes and actual async record revision`, async () => {
    const parsed = JSON.parse(json);
    const packet = await migrateLegacyRecord('startup:fixture-orbit', json, sourceRevision);
    assert.equal(validateContract(packet), true);
    assert.equal(Buffer.from(restoreLegacyRecord(packet), 'utf8').equals(Buffer.from(json, 'utf8')), true);
    assert.equal(packet.legacy.record_sha256, createHash('sha256').update(json, 'utf8').digest('hex'));
    assert.equal(packet.legacy.record_revision, await recordRevision('startup:fixture-orbit', parsed));
    assert.deepEqual(packet.rounds.map(round => round.legacy_id), parsed.funding_rounds.map(round => round.id));
    assert.equal(packet.claims.every(claim => claim.review_status === 'candidate'), true);
    assert.deepEqual(projectParticipations(packet).relations, []);
    const tampered = structuredClone(packet);
    tampered.legacy.record_json += ' ';
    assert.throws(() => validateContract(tampered), /Legacy revision\/hash mismatch/);
    assert.equal(restoreLegacyRecord(packet), json);
  });
}

test('review regression: legacy bytes cannot bind to another startup identity', async () => {
  await assert.rejects(
    migrateLegacyRecord('startup:wrong', originalLegacyJson, sourceRevision),
    /Legacy startup identity mismatch/,
  );
});
