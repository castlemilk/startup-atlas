/** Entirely fictional evidence. These fixtures never authorize a record write. */
import { VERSION } from './reference-model.mjs';

export const SOURCE_REVISION = 'd7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f';

export function money(overrides = {}) {
  return {
    measure: 'round_total',
    status: 'disclosed',
    precision: 'exact',
    amount: '2500000.25',
    minimum: null,
    maximum: null,
    bound_inclusive: null,
    currency: { status: 'known', code: 'AUD', raw: 'AUD' },
    raw: 'AUD 2,500,000.25',
    ...structuredClone(overrides),
  };
}

/** Mutate only the supplied synthetic packet and return the appended claim. */
export function addClaim(packet, {
  id,
  subject_id,
  predicate,
  value,
  review_status = 'reviewed',
  source_id = 'source:announcement',
  basis = 'explicit',
  supersedes = [],
  correction_reason = null,
}) {
  const evidenceId = `evidence:${id.replace(/^claim:/, '')}`;
  packet.evidence.push({
    id: evidenceId,
    source_id,
    subject_id,
    predicate,
    basis,
    statement: `Synthetic ${basis === 'explicit' ? 'assertion' : 'discovery candidate'} for ${predicate}: ${JSON.stringify(value)}. This is fictional test evidence.`,
  });
  const claim = {
    id,
    subject_id,
    predicate,
    value: structuredClone(value),
    evidence_ids: [evidenceId],
    review_status,
    supersedes: [...supersedes],
    correction_reason,
  };
  packet.claims.push(claim);
  return claim;
}

const date = (precision, value) => ({ status: 'known', precision, value });

export function fixture() {
  const packet = {
    schema_version: VERSION,
    synthetic: true,
    source_revision: SOURCE_REVISION,
    entity_refs: [
      { id: 'startup:fixture-orbit', kind: 'startup' },
      { id: 'partner:fixture-manager', kind: 'partner' },
      { id: 'person:fixture-avery', kind: 'person' },
    ],
    sources: [
      {
        id: 'source:announcement',
        url: 'https://issuer.example/announcements/fixture-orbit',
        publisher: 'Synthetic Fixture Orbit newsroom',
        kind: 'primary_company',
        retrieved_at: '2025-04-06T10:00:00Z',
        published_on: date('day', '2025-04-02'),
        duplicate_of: null,
      },
      {
        id: 'source:investor-register',
        url: 'https://investor.example/fixture-identities',
        publisher: 'Synthetic investor identity register',
        kind: 'primary_investor',
        retrieved_at: '2025-04-06T10:05:00Z',
        published_on: date('year', '2024'),
        duplicate_of: null,
      },
      {
        id: 'source:syndicated-copy',
        url: 'https://media.example/synthetic-reprint/fixture-orbit',
        publisher: 'Synthetic Example Syndication',
        kind: 'secondary',
        retrieved_at: '2025-04-07T08:00:00+10:00',
        published_on: date('day', '2025-04-03'),
        duplicate_of: 'source:announcement',
      },
    ],
    evidence: [],
    investors: [],
    rounds: [],
    participations: [],
    claims: [],
    identity_decisions: [],
    legacy: null,
  };

  const identity = (subjectId, sourceId, statement, basis = 'explicit') => {
    const evidenceId = `evidence:identity-${subjectId.replace(':', '-')}`;
    packet.evidence.push({
      id: evidenceId,
      source_id: sourceId,
      subject_id: subjectId,
      predicate: 'identity',
      basis,
      statement,
    });
    return [evidenceId];
  };

  packet.investors.push({
    id: 'investor:fixture-manager',
    display_name: 'Fixture Meridian Management',
    kind: 'manager',
    identity_status: 'resolved',
    canonical_entity_id: 'partner:fixture-manager',
    identity_evidence_ids: identity(
      'investor:fixture-manager', 'source:investor-register',
      'Synthetic identity evidence explicitly binds Fixture Meridian Management to partner:fixture-manager. It does not bind the separately named fund.',
    ),
  }, {
    id: 'investor:fixture-fund-unresolved',
    display_name: 'Fixture Meridian Fund I',
    kind: 'fund',
    identity_status: 'unresolved',
    canonical_entity_id: null,
    identity_evidence_ids: identity(
      'investor:fixture-fund-unresolved', 'source:announcement',
      'Synthetic announcement names Fixture Meridian Fund I. Its exact canonical identity is unresolved; the shared name does not identify it as the manager.',
      'discovery',
    ),
  }, {
    id: 'investor:fixture-person',
    display_name: 'Fixture Avery',
    kind: 'person',
    identity_status: 'resolved',
    canonical_entity_id: 'person:fixture-avery',
    identity_evidence_ids: identity(
      'investor:fixture-person', 'source:investor-register',
      'Synthetic identity evidence explicitly binds Fixture Avery to person:fixture-avery, independently of either fund or manager.',
    ),
  });

  for (const [id, statement] of [
    ['round:fixture-seed', 'Synthetic announcement explicitly identifies Fixture Orbit seed event as one financing event.'],
    ['round:fixture-extension', 'Synthetic announcement explicitly identifies a separate Fixture Orbit extension event; the shared startup does not merge the events.'],
  ]) {
    packet.rounds.push({
      id,
      startup_id: 'startup:fixture-orbit',
      legacy_id: null,
      review_status: 'reviewed',
      identity_evidence_ids: identity(id, 'source:announcement', statement),
    });
  }

  for (const [id, roundId, investorId, name, role] of [
    ['participation:fixture-manager-seed', 'round:fixture-seed', 'investor:fixture-manager', 'Fixture Meridian Management', 'lead'],
    ['participation:fixture-fund-seed', 'round:fixture-seed', 'investor:fixture-fund-unresolved', 'Fixture Meridian Fund I', 'participant'],
    ['participation:fixture-person-extension', 'round:fixture-extension', 'investor:fixture-person', 'Fixture Avery', 'unknown'],
  ]) {
    packet.participations.push({ id, round_id: roundId, investor_id: investorId, stated_name: name });
    const key = id.slice('participation:'.length);
    addClaim(packet, {
      id: `claim:${key}-membership`, subject_id: id, predicate: 'participation',
      value: { round_id: roundId, investor_id: investorId, assertion: 'participates' },
    });
    addClaim(packet, { id: `claim:${key}-role`, subject_id: id, predicate: 'role', value: role });
  }

  addClaim(packet, { id: 'claim:seed-stage', subject_id: 'round:fixture-seed', predicate: 'stage', value: 'Seed' });
  addClaim(packet, { id: 'claim:seed-kind', subject_id: 'round:fixture-seed', predicate: 'transaction_kind', value: 'equity' });
  addClaim(packet, { id: 'claim:seed-amount', subject_id: 'round:fixture-seed', predicate: 'round_amount', value: money() });
  addClaim(packet, {
    id: 'claim:seed-amount-syndicated', subject_id: 'round:fixture-seed',
    predicate: 'round_amount', value: money(), source_id: 'source:syndicated-copy',
  });
  addClaim(packet, {
    id: 'claim:seed-announced', subject_id: 'round:fixture-seed',
    predicate: 'announced_on', value: date('day', '2025-02-18'),
  });
  addClaim(packet, {
    id: 'claim:seed-closed', subject_id: 'round:fixture-seed',
    predicate: 'closed_on', value: date('month', '2025-02'),
  });
  addClaim(packet, { id: 'claim:extension-stage', subject_id: 'round:fixture-extension', predicate: 'stage', value: 'Seed extension' });
  addClaim(packet, { id: 'claim:extension-kind', subject_id: 'round:fixture-extension', predicate: 'transaction_kind', value: 'equity' });
  addClaim(packet, {
    id: 'claim:extension-amount', subject_id: 'round:fixture-extension', predicate: 'round_amount',
    value: money({
      precision: 'approximate', amount: '2500000',
      currency: { status: 'ambiguous', code: null, raw: '$' },
      raw: 'about $2.5 million',
    }),
  });
  addClaim(packet, {
    id: 'claim:extension-announced', subject_id: 'round:fixture-extension',
    predicate: 'announced_on', value: date('month', '2025-03'),
  });
  addClaim(packet, {
    id: 'claim:extension-closed', subject_id: 'round:fixture-extension',
    predicate: 'closed_on', value: date('year', '2025'),
  });
  addClaim(packet, {
    id: 'claim:manager-contribution', subject_id: 'participation:fixture-manager-seed', predicate: 'contribution',
    value: money({
      measure: 'investor_contribution', status: 'undisclosed', precision: null, amount: null,
      currency: { status: 'unknown', code: null, raw: null }, raw: 'Contribution amount not disclosed',
    }),
  });

  return packet;
}
