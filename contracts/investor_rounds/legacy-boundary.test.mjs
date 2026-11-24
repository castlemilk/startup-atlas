import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStartupRecord } from '../../backend/hosted/src/startup-record.mjs';
import {
  applyStartupEdit,
  prepareStartupEdit,
  recordRevision,
} from '../../backend/hosted/src/startup-edit.mjs';

// Synthetic, in-memory compatibility evidence only. These tests import the
// actual legacy validators; they neither propose records nor establish hosted
// availability, source truth, authenticated review or browser acceptance.
const startupId = 'startup:fixture-orbit';
const reviewedAt = '2025-06-01';

function legacyRecord() {
  return {
    name: 'Fixture Orbit',
    description: 'A synthetic startup used only to exercise the contract.',
    website: 'https://orbit.example.com/',
    source: 'https://orbit.example.com/about',
    reviewed_at: reviewedAt,
    funding_rounds: [
      {
        id: 'fixture-orbit-seed',
        stage: 'Seed',
        announced_on: '2025-01-15',
        amount: 1200000,
        currency: 'AUD',
        source: 'https://orbit.example.com/seed',
        note: 'Synthetic source-qualified event.',
      },
      {
        id: 'fixture-orbit-symbol',
        stage: 'Unspecified funding',
        amount_text: '$3 million (currency unspecified)',
        source: 'https://orbit.example.com/ambiguous-currency',
      },
      {
        id: 'fixture-orbit-undisclosed',
        stage: 'Seed extension',
        amount_text: 'Undisclosed',
        source: 'https://orbit.example.com/undisclosed',
      },
    ],
  };
}

function snapshot(record = legacyRecord(), head = 'a'.repeat(40)) {
  return {
    head,
    research: { reviewed: reviewedAt, startups: [record] },
    graph: { entities: [{ id: startupId, kind: 'startup', name: record.name }], edges: [] },
    leads: [],
    catalogue: { opportunities: [] },
  };
}

async function editFor(current, patch = {}) {
  return {
    id: startupId,
    expectedRecordRevision: await recordRevision(startupId, current.research.startups[0]),
    patch: { reviewed_at: reviewedAt, ...patch },
  };
}

function errorAt(code, path) {
  return error => {
    assert.equal(error.code, code);
    if (path !== undefined) assert.equal(error.details?.path, path);
    return true;
  };
}

test('legacy known, ambiguous-currency and undisclosed events remain valid without enrichment', async () => {
  const current = snapshot();
  const before = structuredClone(current);
  assert.deepEqual(validateStartupRecord(current.research.startups[0]), before.research.startups[0]);
  const preview = await prepareStartupEdit(current, await editFor(current));
  assert.deepEqual(preview.merged, before.research.startups[0]);
  assert.equal(preview.persisted, false);
  assert.equal(preview.published, false);
  assert.deepEqual(current, before);
});

for (const [field, value] of [
  ['investors', [{ id: 'investor:fixture-one', name: 'Fixture Investor' }]],
  ['participations', [{ round_id: 'fixture-orbit-seed', investor_id: 'investor:fixture-one' }]],
]) {
  test(`legacy record rejects proposed top-level ${field}`, async () => {
    const current = snapshot();
    const before = structuredClone(current);
    assert.throws(() => validateStartupRecord({ ...current.research.startups[0], [field]: value }), errorAt('VALIDATION_ERROR'));
    await assert.rejects(prepareStartupEdit(current, await editFor(current, { [field]: value })), errorAt('VALIDATION_ERROR', `/patch/${field}`));
    assert.deepEqual(current, before);
  });
}

for (const [field, value, expectedPath] of [
  ['investors', [{ id: 'investor:fixture-one' }]],
  // `participants` has since become an accepted legacy field in its own right
  // (a round's plain investor names, consumed by the graph builder as
  // participated_in edges), so the proposed structured entry below is now
  // rejected at the item path instead of the field path. The guarantee this
  // case pins is unchanged: the structured {investor_id, role} shape is
  // rejected by the legacy validator and the event is not dropped.
  ['participants', [{ investor_id: 'investor:fixture-one', role: 'lead' }], '/patch/funding_rounds/0/participants/0'],
  ['participations', ['participation:fixture-one']],
  ['amount_precision', 'approximate'],
  ['date_precision', 'month'],
  ['transaction_kind', 'equity'],
  ['disclosure', 'undisclosed'],
  ['role', 'lead'],
  ['supersedes', 'fixture-orbit-prior'],
]) {
  test(`legacy funding event rejects proposed ${field} without dropping it`, async () => {
    const current = snapshot();
    const before = structuredClone(current);
    const round = { ...current.research.startups[0].funding_rounds[0], [field]: value };
    assert.throws(() => validateStartupRecord({ ...current.research.startups[0], funding_rounds: [round] }), errorAt('VALIDATION_ERROR'));
    await assert.rejects(prepareStartupEdit(current, await editFor(current, { funding_rounds: [round] })), errorAt('VALIDATION_ERROR', expectedPath ?? `/patch/funding_rounds/0/${field}`));
    assert.deepEqual(current, before);
  });
}

for (const [label, value] of [
  ['a structured amount', { status: 'known', value: '1200000', precision: 'exact' }],
  ['a decimal string', '1200000.50'],
  ['a fractional number', 1200000.5],
  ['an unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ['an undisclosed null', null],
]) {
  test(`legacy funding rejects ${label} instead of coercing it`, async () => {
    const current = snapshot();
    const round = { ...current.research.startups[0].funding_rounds[0], amount: value };
    assert.throws(() => validateStartupRecord({ ...current.research.startups[0], funding_rounds: [round] }), errorAt('VALIDATION_ERROR'));
    await assert.rejects(prepareStartupEdit(current, await editFor(current, { funding_rounds: [round] })), errorAt('VALIDATION_ERROR', '/patch/funding_rounds/0/amount'));
  });
}

for (const [label, value] of [
  ['a structured date', { value: '2025-01', precision: 'month' }],
  ['a month-only date', '2025-01'],
  ['a year-only date', '2025'],
  ['an invalid calendar day', '2025-02-29'],
]) {
  test(`legacy funding rejects ${label} without inventing a day`, async () => {
    const current = snapshot();
    const round = { ...current.research.startups[0].funding_rounds[0], announced_on: value };
    assert.throws(() => validateStartupRecord({ ...current.research.startups[0], funding_rounds: [round] }), errorAt('VALIDATION_ERROR'));
    await assert.rejects(prepareStartupEdit(current, await editFor(current, { funding_rounds: [round] })), errorAt('VALIDATION_ERROR', '/patch/funding_rounds/0/announced_on'));
  });
}

test('legacy amount omission stays absent while explicitly supplied zero remains zero', async () => {
  const current = snapshot();
  const preview = await prepareStartupEdit(current, await editFor(current));
  const [, ambiguous, undisclosed] = preview.merged.funding_rounds;
  for (const round of [ambiguous, undisclosed]) {
    assert.equal(Object.hasOwn(round, 'amount'), false);
    assert.equal(Object.hasOwn(round, 'currency'), false);
  }
  const zero = { ...legacyRecord(), funding_rounds: [{ ...legacyRecord().funding_rounds[0], amount: 0 }] };
  assert.equal(validateStartupRecord(zero).funding_rounds[0].amount, 0);
});

test('legacy currency still requires an amount pair and cannot accept an unresolved symbol', async () => {
  const current = snapshot();
  const original = current.research.startups[0].funding_rounds[0];
  const withoutCurrency = { ...original };
  delete withoutCurrency.currency;
  for (const round of [withoutCurrency, { ...original, currency: '$' }]) {
    assert.throws(() => validateStartupRecord({ ...legacyRecord(), funding_rounds: [round] }), errorAt('VALIDATION_ERROR'));
    await assert.rejects(prepareStartupEdit(current, await editFor(current, { funding_rounds: [round] })), errorAt('VALIDATION_ERROR'));
  }
});

test('no-op and empty-funding previews retain exact record, array order and record revision', async () => {
  const current = snapshot();
  const before = structuredClone(current);
  const revision = await recordRevision(startupId, current.research.startups[0]);
  for (const patch of [{}, { funding_rounds: [] }]) {
    const result = await prepareStartupEdit(current, await editFor(current, patch));
    assert.deepEqual(result.merged, before.research.startups[0]);
    assert.deepEqual(result.changedPaths, []);
    assert.equal(result.recordRevision, revision);
    assert.equal(result.nextRecordRevision, revision);
  }
  assert.deepEqual(current, before);
});

test('funding source replacement cannot inherit old amount, currency, date or note attribution', async () => {
  const current = snapshot();
  const before = structuredClone(current);
  const original = current.research.startups[0].funding_rounds[0];
  const edit = await editFor(current, {
    funding_rounds: [{ id: original.id, stage: original.stage, source: 'https://orbit.example.com/correction' }],
  });
  await assert.rejects(prepareStartupEdit(current, edit), error => {
    errorAt('SOURCE_INHERITANCE', '/patch/funding_rounds/0/source')(error);
    assert.deepEqual(error.details.inheritedPaths.sort(), [
      '/patch/funding_rounds/0/amount',
      '/patch/funding_rounds/0/announced_on',
      '/patch/funding_rounds/0/currency',
      '/patch/funding_rounds/0/note',
    ].sort());
    return true;
  });
  assert.deepEqual(current, before);
});

test('explicitly resubmitted source correction keeps the event ID and produces a review warning', async () => {
  const current = snapshot();
  const original = current.research.startups[0].funding_rounds[0];
  const correction = { ...original, source: 'https://orbit.example.com/correction', amount: 1300000 };
  const result = await prepareStartupEdit(current, await editFor(current, { funding_rounds: [correction] }));
  assert.equal(result.merged.funding_rounds.length, 3);
  assert.deepEqual(result.merged.funding_rounds[0], correction);
  assert.ok(result.warnings.some(warning => warning.code === 'SOURCE_CHANGED'));
  assert.equal(result.persisted, false);
  assert.equal(result.published, false);
  // Existing legacy correction semantics do not retain a claim history.
  assert.equal(Object.hasOwn(result.merged.funding_rounds[0], 'history'), false);
});

test('a concurrent change anywhere in the whole record invalidates a funding edit', async () => {
  const current = snapshot();
  const edit = await editFor(current, { funding_rounds: [{ ...current.research.startups[0].funding_rounds[0], amount: 1300000 }] });
  current.research.startups[0].description = 'A concurrent synthetic description correction.';
  const afterConcurrentEdit = structuredClone(current);
  await assert.rejects(prepareStartupEdit(current, edit), errorAt('RECORD_CONFLICT', '/expectedRecordRevision'));
  assert.deepEqual(current, afterConcurrentEdit);
});

test('preview token is bound to the source snapshot independently of the whole-record revision', async () => {
  const current = snapshot();
  const edit = await editFor(current);
  const first = await prepareStartupEdit(current, edit);
  const second = await prepareStartupEdit({ ...current, head: 'b'.repeat(40) }, edit);
  assert.equal(first.recordRevision, second.recordRevision);
  assert.equal(first.nextRecordRevision, second.nextRecordRevision);
  assert.equal(first.intentDigest, second.intentDigest);
  assert.equal(first.branch, second.branch);
  assert.notEqual(first.validationToken, second.validationToken);
  assert.notEqual(first.revision, second.revision);
  for (const result of [first, second]) {
    assert.equal(result.persisted, false);
    assert.equal(result.published, false);
  }
  // Submission's stale-source rejection belongs to transport tests. Preparing
  // these two pure previews does not simulate a write or claim exactly-once IO.
});

test('cross-startup funding event ID collisions reject without merging identities', async () => {
  const current = snapshot();
  current.research.startups.push({
    name: 'Fixture Other',
    source: 'https://other.example.com/about',
    reviewed_at: reviewedAt,
    funding_rounds: [{ id: 'fixture-orbit-seed', stage: 'Seed', source: 'https://other.example.com/seed' }],
  });
  const before = structuredClone(current);
  await assert.rejects(prepareStartupEdit(current, await editFor(current)), errorAt('IDENTITY_CONFLICT', '/merged/funding_rounds/0/id'));
  assert.deepEqual(current, before);
});

test('duplicate funding IDs in one patch reject instead of selecting an arbitrary assertion', async () => {
  const current = snapshot();
  const round = current.research.startups[0].funding_rounds[0];
  const edit = await editFor(current, { funding_rounds: [round, { ...round, amount: 1300000 }] });
  await assert.rejects(applyStartupEdit(current.research, edit), errorAt('VALIDATION_ERROR', '/patch/funding_rounds/1'));
});
