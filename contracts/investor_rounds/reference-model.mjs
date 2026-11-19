/** Offline, synthetic-only proposal. No IO, collector, transport or publication path. */
import { createHash } from 'node:crypto';
import { validateStartupRecord, startupSlug } from '../../backend/hosted/src/startup-record.mjs';
import { recordRevision } from '../../backend/hosted/src/startup-edit.mjs';
import { publicHttps } from '../../scripts/catalogue-entries.mjs';

export const VERSION = 'atlas.investor-rounds/1';
const clone = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const ensure = (test, message) => { if (!test) fail(message); };
const same = (a, b) => canonical(a) === canonical(b);
const sha = text => createHash('sha256').update(text).digest('hex');
const kinds = new Set(['startup', 'partner', 'provider', 'person']);
const roundPredicates = new Set(['stage', 'instrument', 'transaction_kind', 'round_amount', 'component_amount', 'cumulative_funding', 'valuation', 'announced_on', 'closed_on', 'legacy_amount_text', 'legacy_note']);
const participantPredicates = new Set(['participation', 'role', 'contribution']);
const moneyMeasures = {round_amount:['round_total'], contribution:['investor_contribution'], component_amount:['equity_component','debt_component','secondary_component','grant_component'], cumulative_funding:['cumulative_total'], valuation:['pre_money','post_money','unspecified_valuation']};
const moneyPredicates = new Set(Object.keys(moneyMeasures));
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { ensure(Number.isSafeInteger(value), 'Only safe integer JSON numbers are supported'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, 'Expected a JSON object');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function shape(value, keys, label) {
  ensure(value && Object.getPrototypeOf(value) === Object.prototype, `${label}: expected object`);
  ensure(Object.keys(value).sort().join('|') === [...keys].sort().join('|'), `${label}: unsupported or missing fields`);
}
function text(value, label, maximum = 2000) {
  ensure(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value), `${label}: expected bounded trimmed text`);
}
function nullableText(value, label) { if (value !== null) text(value, label); }
function list(value, label) { ensure(Array.isArray(value) && value.length <= 1000, `${label}: expected bounded array`); }
function unique(value, label) { list(value, label); ensure(new Set(value).size === value.length, `${label}: duplicate reference`); }
function id(value, prefix) { ensure(typeof value === 'string' && new RegExp(`^${prefix}:[a-z0-9][a-z0-9-]{0,159}$`).test(value), `Invalid ${prefix} identity`); }
function index(rows, prefix) {
  list(rows, prefix);
  const map = new Map();
  for (const row of rows) { id(row.id, prefix); ensure(!map.has(row.id), `Duplicate ${prefix} ID`); map.set(row.id, row); }
  return map;
}
function https(value) {
  text(value, 'Source URL', 2048);
  publicHttps(value, 'source.url');
}
function timestamp(value) {
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), 'Expected timezone-aware retrieval timestamp');
  validateDate({status:'known', precision:'day', value:value.slice(0,10)});
}

export function validateDate(value) {
  shape(value, ['status', 'precision', 'value'], 'Date');
  ensure(['known', 'unknown', 'undisclosed'].includes(value.status), 'Invalid date disclosure');
  if (value.status !== 'known') { ensure(value.precision === null && value.value === null, 'Unknown date cannot gain precision'); return; }
  ensure(['year', 'month', 'day'].includes(value.precision), 'Invalid date precision');
  const re = {year: /^\d{4}$/, month: /^\d{4}-\d{2}$/, day: /^\d{4}-\d{2}-\d{2}$/}[value.precision];
  ensure(typeof value.value === 'string' && re.test(value.value), 'Date and precision disagree');
  const [year, month = 1, day = 1] = value.value.split('-').map(Number);
  const calendar = new Date(0); calendar.setUTCFullYear(year, month - 1, day); calendar.setUTCHours(0, 0, 0, 0);
  ensure(year >= 1 && year <= 9999 && calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day, 'Invalid calendar date');
}

function decimal(value) { ensure(typeof value === 'string' && value.length <= 100 && DECIMAL.test(value), 'Money must be a nonnegative decimal string'); }
function decimalCompare(a, b) {
  const [ai, af = ''] = a.split('.'), [bi, bf = ''] = b.split('.');
  const width = Math.max(af.length, bf.length);
  const aa = BigInt(ai + af.padEnd(width, '0')), bb = BigInt(bi + bf.padEnd(width, '0'));
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

export function validateMoney(value, measures) {
  shape(value, ['measure', 'status', 'precision', 'amount', 'minimum', 'maximum', 'bound_inclusive', 'currency', 'raw'], 'Money');
  ensure(measures.includes(value.measure), 'Financial measure does not match predicate');
  ensure(['disclosed', 'undisclosed', 'unknown'].includes(value.status), 'Invalid money disclosure');
  nullableText(value.raw, 'Reported money text');
  shape(value.currency, ['status', 'code', 'raw'], 'Currency');
  ensure(['known', 'ambiguous', 'unknown'].includes(value.currency.status), 'Invalid currency status');
  nullableText(value.currency.raw, 'Reported currency text');
  if (value.currency.status === 'known') ensure(typeof value.currency.code === 'string' && /^[A-Z]{3}$/.test(value.currency.code), 'Expected explicit three-letter currency code');
  else { ensure(value.currency.code === null, 'Unresolved currency cannot acquire a code'); if (value.currency.status === 'ambiguous') text(value.currency.raw, 'Ambiguous currency symbol'); }
  const numeric = ['amount', 'minimum', 'maximum'];
  if (value.status !== 'disclosed') {
    ensure(value.precision === null && numeric.every(key => value[key] === null) && value.bound_inclusive === null, 'Unknown or undisclosed money cannot contain a number'); return;
  }
  ensure(['exact', 'approximate', 'range', 'lower_bound', 'upper_bound', 'legacy_unspecified'].includes(value.precision), 'Invalid monetary precision');
  const present = value.precision === 'range' ? ['minimum', 'maximum'] : value.precision === 'lower_bound' ? ['minimum'] : value.precision === 'upper_bound' ? ['maximum'] : ['amount'];
  for (const key of numeric) { if (present.includes(key)) decimal(value[key]); else ensure(value[key] === null, 'Unexpected numeric component'); }
  if (value.precision === 'range') ensure(decimalCompare(value.minimum, value.maximum) <= 0, 'Reversed amount range');
  if (value.precision.endsWith('_bound')) ensure(typeof value.bound_inclusive === 'boolean', 'Bounds require explicit inclusivity');
  else ensure(value.bound_inclusive === null, 'Inclusivity belongs only to one-sided bounds');
}

function maps(packet) {
  return Object.fromEntries(['sources', 'evidence', 'investors', 'rounds', 'participations', 'claims', 'identity_decisions'].map((key, i) => [key, index(packet[key], ['source', 'evidence', 'investor', 'round', 'participation', 'claim', 'decision'][i])]));
}
function redirectMap(packet) {
  return new Map(packet.identity_decisions.filter(d => d.review_status === 'reviewed' && d.verdict === 'same').map(d => [d.from_id, d.to_id]));
}
function follow(map, start) {
  let current = start; const seen = new Set();
  while (map.has(current)) { ensure(!seen.has(current), 'Identity/source cycle'); seen.add(current); current = map.get(current); }
  return current;
}
export function canonicalIdentity(packet, identity) { return follow(redirectMap(packet), identity); }

function evidenceFor(ids, subject, predicate, m, explicit = false) {
  unique(ids, 'Evidence'); ensure(ids.length > 0, 'Fact requires evidence');
  for (const evidenceId of ids) {
    const evidence = m.evidence.get(evidenceId);
    ensure(evidence && evidence.subject_id === subject && evidence.predicate === predicate, 'Evidence scope mismatch');
    if (explicit) {
      ensure(evidence.basis === 'explicit', 'Discovery evidence cannot support a reviewed fact');
      const source = m.sources.get(evidence.source_id);
      ensure(!['discovery', 'legacy_unclassified'].includes(source.kind) && source.retrieved_at !== null, 'Reviewed evidence requires an accessed attributable source');
    }
  }
}

export function validateContract(packet) {
  shape(packet, ['schema_version', 'synthetic', 'source_revision', 'entity_refs', 'sources', 'evidence', 'investors', 'rounds', 'participations', 'claims', 'identity_decisions', 'legacy'], 'Contract');
  ensure(packet.schema_version === VERSION && packet.synthetic === true, 'Only this synthetic proposal version is executable');
  ensure(/^[0-9a-f]{40}$/.test(packet.source_revision), 'Expected exact source commit');
  const m = maps(packet), entities = new Map();
  list(packet.entity_refs, 'Entity references');
  for (const entity of packet.entity_refs) {
    shape(entity, ['id', 'kind'], 'Entity reference'); ensure(kinds.has(entity.kind), 'Unsupported canonical entity kind'); id(entity.id, entity.kind);
    ensure(!entities.has(entity.id), 'Duplicate canonical entity'); entities.set(entity.id, entity);
  }
  const subjects = new Set([...m.investors.keys(), ...m.rounds.keys(), ...m.participations.keys(), ...m.identity_decisions.keys()]);
  for (const source of packet.sources) {
    shape(source, ['id', 'url', 'publisher', 'kind', 'retrieved_at', 'published_on', 'duplicate_of'], 'Source'); https(source.url); nullableText(source.publisher, 'Publisher');
    ensure(['primary_company', 'primary_investor', 'regulatory', 'secondary', 'discovery', 'legacy_unclassified'].includes(source.kind), 'Invalid source kind');
    if (source.retrieved_at !== null) timestamp(source.retrieved_at);
    validateDate(source.published_on);
    if (source.duplicate_of !== null) ensure(source.duplicate_of !== source.id && m.sources.has(source.duplicate_of), 'Invalid syndicated source reference');
  }
  const sourceRedirects = new Map(packet.sources.filter(s => s.duplicate_of).map(s => [s.id, s.duplicate_of]));
  for (const source of packet.sources) follow(sourceRedirects, source.id);
  for (const evidence of packet.evidence) {
    shape(evidence, ['id', 'source_id', 'subject_id', 'predicate', 'basis', 'statement'], 'Evidence');
    ensure(m.sources.has(evidence.source_id) && subjects.has(evidence.subject_id), 'Dangling evidence reference'); text(evidence.predicate, 'Evidence predicate', 100); text(evidence.statement, 'Evidence statement');
    ensure(['explicit', 'discovery'].includes(evidence.basis), 'Invalid evidence basis');
  }
  for (const investor of packet.investors) {
    shape(investor, ['id', 'display_name', 'kind', 'identity_status', 'canonical_entity_id', 'identity_evidence_ids'], 'Investor');
    text(investor.display_name, 'Investor name', 200); ensure(['organisation', 'manager', 'fund', 'person', 'unresolved'].includes(investor.kind), 'Invalid investor kind');
    ensure(['resolved', 'unresolved'].includes(investor.identity_status), 'Invalid identity status');
    evidenceFor(investor.identity_evidence_ids, investor.id, 'identity', m, investor.identity_status === 'resolved');
    if (investor.identity_status === 'resolved') {
      const entity = entities.get(investor.canonical_entity_id); ensure(entity && investor.kind !== 'unresolved', 'Resolved investor needs an existing canonical reference');
      ensure((investor.kind === 'person') === (entity.kind === 'person'), 'Person/organisation identity mismatch');
    } else ensure(investor.canonical_entity_id === null, 'Unresolved investor cannot acquire a canonical reference');
  }
  for (const round of packet.rounds) {
    shape(round, ['id', 'startup_id', 'legacy_id', 'review_status', 'identity_evidence_ids'], 'Round');
    ensure(entities.get(round.startup_id)?.kind === 'startup', 'Round requires exact canonical startup');
    if (round.legacy_id !== null) ensure(typeof round.legacy_id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(round.legacy_id) && round.legacy_id.length <= 100, 'Invalid legacy round ID');
    ensure(['candidate', 'reviewed', 'rejected'].includes(round.review_status), 'Invalid round identity review');
    evidenceFor(round.identity_evidence_ids, round.id, 'identity', m, round.review_status === 'reviewed');
  }
  const legacyIds = packet.rounds.filter(r => r.legacy_id !== null).map(r => r.legacy_id);
  ensure(new Set(legacyIds).size === legacyIds.length, 'Duplicate legacy event identity');
  for (const participation of packet.participations) {
    shape(participation, ['id', 'round_id', 'investor_id', 'stated_name'], 'Participation');
    ensure(m.rounds.has(participation.round_id) && m.investors.has(participation.investor_id), 'Dangling participation endpoint'); text(participation.stated_name, 'Source-stated name', 200);
  }
  for (const decision of packet.identity_decisions) {
    shape(decision, ['id', 'from_id', 'to_id', 'verdict', 'review_status', 'evidence_ids', 'reason'], 'Identity decision');
    const a = decision.from_id, b = decision.to_id;
    ensure(a !== b && subjects.has(a) && subjects.has(b) && a.split(':')[0] === b.split(':')[0] && !a.startsWith('decision:'), 'Identity decision requires distinct same-kind subjects');
    ensure(['same', 'distinct'].includes(decision.verdict) && ['candidate', 'reviewed', 'rejected'].includes(decision.review_status), 'Invalid identity decision'); text(decision.reason, 'Identity decision reason');
    evidenceFor(decision.evidence_ids, decision.id, decision.verdict === 'same' ? 'same_identity' : 'distinct_identity', m, decision.review_status === 'reviewed');
    if (decision.verdict === 'same') {
      if (m.rounds.has(a)) ensure(m.rounds.get(a).startup_id === m.rounds.get(b).startup_id, 'Cannot merge rounds across startups');
      if (m.investors.has(a)) {
        const aa = m.investors.get(a), bb = m.investors.get(b);
        ensure(aa.kind === bb.kind, 'Fund, manager and person identities cannot be collapsed');
        ensure(!aa.canonical_entity_id || !bb.canonical_entity_id || aa.canonical_entity_id === bb.canonical_entity_id, 'Canonical investor references disagree');
      }
    }
  }
  const redirect = redirectMap(packet);
  const approved = packet.identity_decisions.filter(d => d.review_status === 'reviewed' && d.verdict === 'same');
  ensure(new Set(approved.map(d => d.from_id)).size === approved.length, 'Conflicting reviewed identity decisions');
  for (const subject of subjects) follow(redirect, subject);
  const canonicalInvestors = new Map();
  const componentReferences = new Map();
  for (const investor of packet.investors.filter(i => i.canonical_entity_id !== null)) {
    const canonicalId = follow(redirect, investor.id);
    ensure(!componentReferences.has(canonicalId) || componentReferences.get(canonicalId) === investor.canonical_entity_id, 'Transitive investor identities disagree');
    componentReferences.set(canonicalId, investor.canonical_entity_id);
    ensure(!canonicalInvestors.has(investor.canonical_entity_id) || canonicalInvestors.get(investor.canonical_entity_id) === canonicalId, 'Duplicate canonical investor needs an explicit identity decision');
    canonicalInvestors.set(investor.canonical_entity_id, canonicalId);
  }
  for (const decision of packet.identity_decisions) {
    if (decision.review_status !== 'reviewed') continue;
    if (decision.verdict === 'distinct') ensure(follow(redirect, decision.from_id) !== follow(redirect, decision.to_id), 'Distinct decision conflicts with canonical identity');
    if (decision.verdict === 'same' && m.participations.has(decision.from_id)) {
      const a = m.participations.get(decision.from_id), b = m.participations.get(decision.to_id);
      ensure(follow(redirect, a.round_id) === follow(redirect, b.round_id) && follow(redirect, a.investor_id) === follow(redirect, b.investor_id), 'Participation identity endpoints disagree');
    }
  }
  const pairs = new Map();
  for (const p of packet.participations) {
    const pair = canonical([follow(redirect, p.round_id), follow(redirect, p.investor_id)]), identity = follow(redirect, p.id);
    ensure(!pairs.has(pair) || pairs.get(pair) === identity, 'Duplicate participation needs an explicit identity decision'); pairs.set(pair, identity);
  }
  for (const claim of packet.claims) {
    shape(claim, ['id', 'subject_id', 'predicate', 'value', 'evidence_ids', 'review_status', 'supersedes', 'correction_reason'], 'Claim');
    const round = m.rounds.get(claim.subject_id), participation = m.participations.get(claim.subject_id);
    ensure((round && roundPredicates.has(claim.predicate)) || (participation && participantPredicates.has(claim.predicate)), 'Unsupported subject/predicate');
    ensure(['candidate', 'reviewed', 'rejected'].includes(claim.review_status), 'Invalid claim review status');
    evidenceFor(claim.evidence_ids, claim.subject_id, claim.predicate, m, claim.review_status === 'reviewed');
    const v = claim.value;
    if (moneyPredicates.has(claim.predicate)) {
      validateMoney(v, moneyMeasures[claim.predicate]);
    } else if (['announced_on', 'closed_on'].includes(claim.predicate)) validateDate(v);
    else if (claim.predicate === 'transaction_kind') ensure(['equity', 'debt', 'grant', 'secondary', 'tender', 'acquisition', 'mixed', 'unknown'].includes(v), 'Invalid transaction kind');
    else if (claim.predicate === 'role') ensure(['lead', 'co_lead', 'participant', 'unknown'].includes(v), 'Invalid source-stated role');
    else if (claim.predicate === 'participation') {
      shape(v, ['round_id', 'investor_id', 'assertion'], 'Participation assertion');
      ensure(v.round_id === participation.round_id && v.investor_id === participation.investor_id && ['participates','retracted'].includes(v.assertion), 'Participation claim endpoints disagree');
    } else text(v, 'Claim value');
    unique(claim.supersedes, 'Supersession');
    if (claim.supersedes.length) text(claim.correction_reason, 'Correction reason'); else ensure(claim.correction_reason === null, 'Reason without supersession');
    for (const previousId of claim.supersedes) {
      const previous = m.claims.get(previousId);
      ensure(previous && previous.id !== claim.id && follow(redirect, previous.subject_id) === follow(redirect, claim.subject_id) && previous.predicate === claim.predicate, 'Correction crosses claim scope');
      if (moneyPredicates.has(claim.predicate)) ensure(previous.value.measure === claim.value.measure, 'Correction crosses financial measure');
    }
  }
  const visitedClaims = new Set();
  const visit = (claim, path = new Set()) => {
    ensure(!path.has(claim.id), 'Correction cycle');
    if (visitedClaims.has(claim.id)) return;
    for (const previous of claim.supersedes) visit(m.claims.get(previous), new Set([...path, claim.id]));
    visitedClaims.add(claim.id);
  };
  for (const claim of packet.claims) visit(claim);
  if (packet.legacy !== null) {
    shape(packet.legacy, ['startup_id', 'record_json', 'record_sha256', 'record_revision'], 'Legacy binding');
    ensure(typeof packet.legacy.record_json === 'string' && packet.legacy.record_json.length <= 131072, 'Invalid legacy JSON');
    const original = JSON.parse(packet.legacy.record_json); validateStartupRecord(original);
    ensure(entities.get(packet.legacy.startup_id)?.kind === 'startup', 'Invalid legacy startup binding');
    // The authoritative async producer is used at import. The synchronous
    // verifier is parity-tested against it for the strict legacy record shape.
    ensure(packet.legacy.record_sha256 === sha(packet.legacy.record_json) && packet.legacy.record_revision === sha(canonical({id:packet.legacy.startup_id,record:original})), 'Legacy revision/hash mismatch');
    ensure(packet.legacy.startup_id === `startup:${startupSlug(original.name)}`, 'Legacy startup identity mismatch');
    for (const r of packet.rounds.filter(r => r.legacy_id !== null)) ensure(r.startup_id === packet.legacy.startup_id && (original.funding_rounds || []).some(x => x.id === r.legacy_id), 'Legacy alias is not in the bound record');
  }
  return true;
}

export function contractDigest(packet) { validateContract(packet); return sha(canonical(packet)); }

export function resolveFact(packet, subjectId, predicate, measure = null) {
  validateContract(packet);
  if (measure !== null) { text(measure, 'Financial measure selector', 100); ensure(moneyPredicates.has(predicate) && moneyMeasures[predicate].includes(measure), 'Invalid financial measure selector'); }
  const subject = canonicalIdentity(packet, subjectId);
  const claims = packet.claims.filter(c => canonicalIdentity(packet, c.subject_id) === subject && c.predicate === predicate && c.review_status === 'reviewed' && (measure === null || c.value.measure === measure));
  const superseded = new Set(claims.flatMap(c => c.supersedes));
  const active = claims.filter(c => !superseded.has(c.id));
  if (!active.length) return {status:'unknown', value:null, claim_ids:[], source_groups:[]};
  const comparable = claim => predicate === 'participation'
    ? {...claim.value, round_id:canonicalIdentity(packet, claim.value.round_id), investor_id:canonicalIdentity(packet, claim.value.investor_id)}
    : claim.value;
  const values = new Map(active.map(c => { const value = comparable(c); return [canonical(value), value]; }));
  const evidence = new Map(packet.evidence.map(e => [e.id, e]));
  const redirects = new Map(packet.sources.filter(s => s.duplicate_of).map(s => [s.id, s.duplicate_of]));
  const sourceGroups = [...new Set(active.flatMap(c => c.evidence_ids.map(e => follow(redirects, evidence.get(e).source_id))))].sort();
  const measures = moneyPredicates.has(predicate) ? [...new Set(active.map(c => c.value.measure))].sort() : [];
  if (measures.length > 1) return {status:'selection_required',value:null,claim_ids:active.map(c=>c.id).sort(),source_groups:sourceGroups,measures};
  return {status:values.size === 1 ? 'known' : 'conflict', value:values.size === 1 ? clone(values.values().next().value) : null, claim_ids:active.map(c => c.id).sort(), source_groups:sourceGroups};
}

export function appendClaim(packet, claim) {
  validateContract(packet);
  const existing = packet.claims.find(c => c.id === claim.id);
  if (existing) { ensure(same(existing, claim), 'Claim ID collision: append a sourced correction instead'); return clone(packet); }
  const next = clone(packet); next.claims.push(clone(claim)); validateContract(next); return next;
}

export function projectParticipations(packet) {
  validateContract(packet);
  const relations = [], held = [], visited = new Set();
  for (const original of packet.participations) {
    const identity = canonicalIdentity(packet, original.id); if (visited.has(identity)) continue; visited.add(identity);
    const p = packet.participations.find(x => x.id === identity), membership = resolveFact(packet, identity, 'participation');
    const investorId = canonicalIdentity(packet, p.investor_id), investor = packet.investors.find(x => x.id === investorId), role = resolveFact(packet, identity, 'role');
    const round = packet.rounds.find(x => x.id === canonicalIdentity(packet, p.round_id)), transaction = resolveFact(packet, round.id, 'transaction_kind');
    if (membership.status !== 'known' || membership.value.assertion !== 'participates' || investor.identity_status !== 'resolved' || round.review_status !== 'reviewed' || role.status === 'conflict' || transaction.status === 'conflict') {
      held.push({participation_id:identity, reason:membership.status !== 'known' ? `membership_${membership.status}` : membership.value.assertion === 'retracted' ? 'membership_retracted' : investor.identity_status !== 'resolved' ? 'identity_unresolved' : round.review_status !== 'reviewed' ? 'round_identity_unreviewed' : role.status === 'conflict' ? 'role_conflict' : 'transaction_kind_conflict'}); continue;
    }
    relations.push({participation_id:identity, round_id:canonicalIdentity(packet, p.round_id), investor_id:investorId, canonical_entity_id:investor.canonical_entity_id, predicate:'participated_in_funding_event', transaction_kind:transaction.status === 'known' ? transaction.value : 'unknown', role:role.status === 'known' ? role.value : 'unknown', membership_claim_ids:membership.claim_ids, role_claim_ids:role.claim_ids});
  }
  return {authorization:'none', runtime_supported:false, published:false, relations, held};
}

const unknownDate = () => ({status:'unknown', precision:null, value:null});
function legacyMoney(amount, currency, measure) {
  return {measure, status:'disclosed', precision:'legacy_unspecified', amount:String(amount), minimum:null, maximum:null, bound_inclusive:null, currency:{status:'known',code:currency,raw:null}, raw:null};
}

export async function migrateLegacyRecord(startupId, recordJson, sourceRevision) {
  const record = JSON.parse(recordJson); validateStartupRecord(record);
  const packet = {schema_version:VERSION, synthetic:true, source_revision:sourceRevision, entity_refs:[{id:startupId,kind:'startup'}], sources:[], evidence:[], investors:[], rounds:[], participations:[], claims:[], identity_decisions:[], legacy:{startup_id:startupId,record_json:recordJson,record_sha256:sha(recordJson),record_revision:await recordRevision(startupId,record)}};
  for (const event of record.funding_rounds || []) {
    const subject = `round:legacy-${event.id}`, source = `source:legacy-${event.id}`;
    packet.sources.push({id:source,url:event.source,publisher:null,kind:'legacy_unclassified',retrieved_at:null,published_on:unknownDate(),duplicate_of:null});
    const addEvidence = (predicate, statement) => {
      const identity = `evidence:legacy-${event.id}-${predicate.replaceAll('_','-')}`;
      packet.evidence.push({id:identity,source_id:source,subject_id:subject,predicate,basis:'discovery',statement}); return identity;
    };
    packet.rounds.push({id:subject,startup_id:startupId,legacy_id:event.id,review_status:'candidate',identity_evidence_ids:[addEvidence('identity', 'Synthetic legacy record identity; no new source retrieval or identity review.')]});
    const add = (predicate, value) => packet.claims.push({id:`claim:legacy-${event.id}-${predicate.replaceAll('_','-')}`,subject_id:subject,predicate,value,evidence_ids:[addEvidence(predicate, `Synthetic legacy field ${predicate}; retained without a new factual review.`)],review_status:'candidate',supersedes:[],correction_reason:null});
    add('stage', event.stage);
    if (event.announced_on !== undefined) add('announced_on', {status:'known',precision:'day',value:event.announced_on});
    if (event.amount !== undefined) add('round_amount', legacyMoney(event.amount,event.currency,'round_total'));
    if (event.valuation !== undefined) add('valuation', legacyMoney(event.valuation,event.valuation_currency,'unspecified_valuation'));
    if (event.amount_text !== undefined) add('legacy_amount_text',event.amount_text);
    if (event.note !== undefined) add('legacy_note',event.note);
  }
  validateContract(packet); return packet;
}

export function restoreLegacyRecord(packet) {
  validateContract(packet); ensure(packet.legacy !== null, 'No legacy record to restore'); return packet.legacy.record_json;
}
