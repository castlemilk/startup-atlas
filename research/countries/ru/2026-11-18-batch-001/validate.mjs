import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { startupSlug, validateStartupRecord } from '../../../../backend/hosted/src/startup-record.mjs';

// Offline checks for this one research packet. No fetch, writes, seed approval,
// production ingestion or alternative funding/collection API is implemented.
export const normalizeName = value => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
export function normalizeDomain(value) {
  if (value === null || value === undefined || value === '') return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Expected public HTTPS identity URL');
  return url.hostname.toLowerCase().replace(/^www\./u, '').replace(/\.$/u, '');
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const isoTime = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && !Number.isNaN(Date.parse(value));
const stable = value => JSON.stringify(value, null, 2) + '\n';

export function validatePartialDate(value) {
  if (value === null) return true;
  assert(value && typeof value === 'object', 'Date observation must be object or null');
  const text = value.value ?? value.date;
  assert(['year', 'month', 'day'].includes(value.precision), 'Unknown date precision');
  assert(typeof text === 'string', 'Date value is required');
  const patterns = { year: /^\d{4}$/u, month: /^\d{4}-\d{2}$/u, day: /^\d{4}-\d{2}-\d{2}$/u };
  assert(patterns[value.precision].test(text), 'Date precision does not match value');
  const full = text + (value.precision === 'year' ? '-01-01' : value.precision === 'month' ? '-01' : '');
  assert(!Number.isNaN(Date.parse(full)) && new Date(full).toISOString().slice(0, 10) === full, 'Invalid calendar date');
  return true;
}

export function findDuplicateCandidates(profiles, existing) {
  const decisions = [];
  const identity = item => {
    const name = item.canonical_name || item.name;
    const aliases = (item.aliases || []).map(alias => typeof alias === 'string' ? alias : alias.value ?? alias.name);
    assert(aliases.every(alias => typeof alias === 'string' && alias.trim()), 'Aliases must be nonempty names');
    const domain = normalizeDomain(item.record?.website || item.website);
    const alternativeDomains = (item.alternate_domains || []).map(value => typeof value === 'string' ? value : value.domain);
    const domains = [domain, ...alternativeDomains.map(value => normalizeDomain(value.includes('://') ? value : `https://${value}`))].filter(Boolean);
    return {name, id: item.id || `startup:${startupSlug(item.record?.name || name)}`, domain,
      names: [...new Set([name, ...aliases].map(normalizeName))], domains: [...new Set(domains)]};
  };
  const known = existing.map(identity);
  for (const item of profiles) {
    const candidate = identity(item);
    const matches = known.filter(x => candidate.names.some(name => x.names.includes(name)) || candidate.domains.some(domain => x.domains.includes(domain)) || x.id === candidate.id);
    decisions.push({candidate_id: item.candidate_id, proposed_entity_id: candidate.id, normalized_domain: candidate.domain, matches, decision: matches.length ? 'review_existing_identity' : 'new_candidate'});
    known.push(candidate);
  }
  return decisions;
}

function noNulls(value, path) {
  assert(value !== null && value !== undefined, `Null/undefined is not supported in production projection: ${path}`);
  if (typeof value === 'object') for (const [key, child] of Object.entries(value)) noNulls(child, `${path}/${key}`);
}

export function validatePacket(packet, existing) {
  const {records, profiles, claims, sources, coverage, queue, events} = packet;
  assert(records.startups.length > 0 && records.startups.length <= 50, 'Batch must contain 1..50 staged records');
  assert(profiles.length === records.startups.length, 'Profiles/projection count mismatch');
  const sourceMap = new Map();
  for (const source of sources) {
    assert(source.source_id && !sourceMap.has(source.source_id), 'Duplicate/missing source ID');
    normalizeDomain(source.url);
    assert(source.crawler_seed_approved === false, 'Research cannot approve crawler seeds');
    assert(isoTime(source.retrieved_at), `Missing retrieval time: ${source.source_id}`);
    sourceMap.set(source.source_id, source);
  }
  const names = new Set(), ids = new Set(), domains = new Set();
  for (const record of records.startups) {
    validateStartupRecord(record);
    noNulls(record, record.name);
    const name = normalizeName(record.name), id = startupSlug(record.name), domain = normalizeDomain(record.website);
    assert(!names.has(name) && !ids.has(id) && !domains.has(domain), `Duplicate staged identity: ${record.name}`);
    names.add(name); ids.add(id); domains.add(domain);
    assert(domain && record.description, 'New candidate requires official website and description');
    for (const founder of record.founders || []) assert(startupSlug(founder.name), 'Founder requires a nonempty source-compatible identifier');
    for (const round of record.funding_rounds || []) {
      assert(!(round.amount === 0 && !round.note?.includes('explicit zero')), 'Unknown funding must not become zero');
      if (round.announced_on) validatePartialDate({value: round.announced_on, precision: 'day'});
    }
  }
  const recordsByName = new Map(records.startups.map(record => [record.name, record]));
  const profilesByEntity = new Map(), profilesByCandidate = new Map();
  for (const profile of profiles) {
    assert(profile.candidate_id && !profilesByCandidate.has(profile.candidate_id), 'Duplicate/missing profile candidate identity');
    assert(profile.entity_id === `unresolved:${profile.candidate_id}` && !profilesByEntity.has(profile.entity_id), 'Profile needs a unique unresolved entity identity');
    assert(profile.canonical_name === profile.record?.name, 'Profile canonical name and projected record identity differ');
    const record = recordsByName.get(profile.record.name);
    assert(record && isDeepStrictEqual(record, profile.record), `Profile/record exact parity failed: ${profile.candidate_id}`);
    if (profile.proposed_entity_id) assert(profile.proposed_entity_id === `startup:${startupSlug(record.name)}`, 'Proposed graph identity differs from record slug');
    profilesByEntity.set(profile.entity_id, profile); profilesByCandidate.set(profile.candidate_id, profile);
    const projectedSources = [];
    const collectSources = value => {
      if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
        if (['source', 'logo_source', 'photo_source'].includes(key)) projectedSources.push(child);
        else collectSources(child);
      }
    };
    collectSources(record);
    projectedSources.push(...(record.articles || []).map(article => article.url));
    for (const url of projectedSources) assert(sources.some(source => source.url === url && source.accessed === true && source.source_kind !== 'discovery'), `Projected source must be registered and accessed: ${url}`);
  }
  const duplicates = findDuplicateCandidates(profiles, existing);
  assert(duplicates.every(x => x.matches.length === 0), 'Staged identity collides with existing Atlas or another candidate');
  const claimIds = new Set(), claimsById = new Map();
  const statuses = new Map();
  const allowedStatuses = new Set(['reviewed_staged','candidate','conflict','searched_unknown','unsearched','blocked','rejected','not_applicable']);
  for (const claim of claims) {
    assert(claim.claim_id && !claimIds.has(claim.claim_id), 'Duplicate/missing claim ID');
    claimIds.add(claim.claim_id); claimsById.set(claim.claim_id, claim);
    assert(claim.entity_id && claim.field && claim.status, 'Claim identity/field/status required');
    assert(allowedStatuses.has(claim.status), 'Unrecognized claim status');
    assert(claim.publication_state === 'unsubmitted', 'Research packet is not production publication');
    statuses.set(claim.status, (statuses.get(claim.status) || 0) + 1);
    if (['searched_unknown','unsearched','blocked','rejected','not_applicable'].includes(claim.status)) {
      assert(claim.rationale, 'Missing-value disposition needs a reason');
      if (claim.status === 'searched_unknown') assert(claim.search_log?.length, 'Searched unknown needs actual search evidence');
      continue;
    }
    assert(claim.value !== null && claim.value !== undefined, 'Null is a disposition, not a reviewed fact');
    const source = sourceMap.get(claim.source_id);
    assert(source && source.url === claim.source_url, `Claim provenance must resolve exactly: ${claim.claim_id}`);
    assert(source.source_kind === claim.source_kind, 'Claim source kind must match its registered source');
    assert(isoTime(claim.retrieved_at), 'Claim needs a timezone-aware retrieval time');
    assert(claim.evidence && claim.rationale && claim.acquisition, 'Claim evidence metadata required');
    if (claim.status === 'reviewed_staged') {
      assert(profilesByEntity.has(claim.entity_id), 'Accepted company claim references an unknown profile entity');
      assert(claim.accessed === true && source.accessed === true, 'Unopened page cannot support accepted claim');
      assert(claim.source_kind !== 'discovery', 'Search snippets are discovery, not accepted evidence');
      assert(isoTime(claim.reviewed_at), 'Accepted claim needs review time');
    }
  }
  assert(claims.some(claim => claim.status === 'reviewed_staged'), 'Packet requires nonempty accepted claims');
  for (const profile of profiles) {
    assert(Array.isArray(profile.claim_ids) && profile.claim_ids.length && new Set(profile.claim_ids).size === profile.claim_ids.length, 'Profile needs unique claim references');
    const linkedClaims = profile.claim_ids.map(id => claimsById.get(id));
    assert(linkedClaims.every(claim => claim && claim.entity_id === profile.entity_id), 'Profile claim references must resolve to the same company entity');
    const accepted = linkedClaims.filter(claim => claim.status === 'reviewed_staged');
    assert(accepted.length, 'Every profile requires accepted company claims');
    assert(claims.filter(claim => claim.entity_id === profile.entity_id && claim.status === 'reviewed_staged').every(claim => profile.claim_ids.includes(claim.claim_id)), 'Profile omitted an accepted company claim');
    if (Object.hasOwn(profile.record, 'founded_year')) assert(accepted.some(claim => {
      if (claim.field === 'founded_year') return claim.value === profile.record.founded_year;
      if (claim.field !== 'founding_date') return false;
      validatePartialDate(claim.value);
      return Number((claim.value.value ?? claim.value.date).slice(0, 4)) === profile.record.founded_year;
    }), 'Projected founding year needs a matching accepted founding claim, not a conflict or incorporation date');
    for (const founder of profile.record.founders || []) {
      assert(accepted.some(claim => (claim.field === 'founder' || claim.field.startsWith('founders.')) && claim.value?.name === founder.name && claim.source_url === founder.source), `Projected founder needs matching accepted name and source: ${founder.name}`);
    }
  }
  const eventMap = new Map();
  for (const event of events) {
    assert(event.event_id && !eventMap.has(event.event_id), 'Duplicate/missing financing-event ID');
    eventMap.set(event.event_id, event);
    assert(event.company_id && event.source_ids.length, 'Event company and sources required');
    assert(profilesByEntity.has(event.company_id), 'Financing event company must resolve to a profile entity');
    assert(typeof event.production_projection === 'boolean', 'Event needs an explicit production projection disposition');
    for (const id of event.source_ids) assert(sourceMap.get(id)?.accessed === true && sourceMap.get(id)?.source_kind !== 'discovery', 'Event source missing or unreviewed');
    if (event.announced_on) validatePartialDate(event.announced_on);
    if (event.closed_on) validatePartialDate(event.closed_on);
    if (event.amount !== null && event.amount !== undefined) {
      assert(Number.isSafeInteger(event.amount) && event.amount >= 0 && /^[A-Z]{3}$/u.test(event.currency || ''), 'Numeric amount requires explicit currency (ISO code) and nonnegative integer');
      assert(['round_total','investment_event_total'].includes(event.amount_scope), 'Numeric amount requires company investment or round-total scope');
      const basis = event.amount_scope === 'round_total' ? 'explicit_round_total' : 'explicit_company_receipt';
      assert(event.amount_basis === basis, 'Numeric amount basis must establish company receipt or explicit round total');
    }
    assert(event.amount !== 0 || event.amount_status === 'explicit_zero', 'Unknown amount is not zero');
    for (const participant of event.participants || []) {
      assert(['lead','participant','unspecified'].includes(participant.role), 'Unrecognized participation role');
      assert(participant.evidence_basis === 'explicit_event_statement', 'Portfolio/customer/programme membership cannot create funding participation');
      assert(sourceMap.get(participant.source_id)?.accessed, 'Participant needs accessed event source');
      assert(participant.canonical_entity_id === null, 'Investor canonical identity remains unresolved in this packet');
      if (participant.amount !== null && participant.amount !== undefined) assert(Number.isSafeInteger(participant.amount) && participant.amount >= 0 && /^[A-Z]{3}$/u.test(participant.currency || ''), 'Participant contribution needs explicit currency and nonnegative integer');
    }
  }
  const projectedEventIds = new Set();
  for (const profile of profiles) for (const round of profile.record.funding_rounds || []) {
    const eventId = profile.projection_map?.funding_rounds?.[round.id] || round.id;
    const event = eventMap.get(eventId);
    assert(event && event.company_id === profile.entity_id && event.production_projection === true, 'Projected round needs a matching eligible event for this company');
    assert(!projectedEventIds.has(eventId), 'One financing event cannot be projected twice');
    projectedEventIds.add(eventId);
    assert(event.source_ids.some(id => sourceMap.get(id)?.url === round.source), 'Projected round source must belong to the matching event');
    const projectedAmount = Object.hasOwn(round, 'amount');
    const eventAmount = event.amount !== null && event.amount !== undefined;
    assert(projectedAmount === eventAmount && (!projectedAmount || (round.amount === event.amount && round.currency === event.currency)), 'Projected amount/currency must exactly match the eligible event');
    if (round.announced_on) assert(event.announced_on?.precision === 'day' && round.announced_on === (event.announced_on.value ?? event.announced_on.date), 'Projected date must match a day-precision announcement, not publication or partial date');
  }
  for (const event of events) assert(event.production_projection !== true || projectedEventIds.has(event.event_id), 'Eligible event is missing its production projection');
  for (const claim of claims.filter(x => x.field === 'round_participant' && x.status === 'reviewed_staged')) {
    assert(eventMap.has(claim.value.event_id), 'Participant references an unknown event');
    assert(eventMap.get(claim.value.event_id).company_id === claim.entity_id, 'Participant claim and event company differ');
    assert(claim.value.evidence_basis === 'explicit_event_statement', 'Participation needs explicit event evidence');
  }
  const candidateIds = new Set();
  for (const candidate of coverage.candidates) {
    assert(candidate.candidate_id && !candidateIds.has(candidate.candidate_id), 'Duplicate/missing discovered candidate');
    assert(['accepted','held','rejected','queued'].includes(candidate.status) && candidate.reason, 'Candidate disposition missing');
    candidateIds.add(candidate.candidate_id);
  }
  const counts = Object.fromEntries(['accepted','held','rejected','queued'].map(status => [status, coverage.candidates.filter(x => x.status === status).length]));
  assert(coverage.counts.discovered === candidateIds.size, 'Discovery count mismatch');
  assert(coverage.counts.reviewed === counts.accepted + counts.held + counts.rejected, 'Reviewed count mismatch');
  for (const [status,count] of Object.entries(counts)) assert(coverage.counts[status] === count, `Coverage count mismatch: ${status}`);
  assert(counts.accepted === profiles.length, 'Accepted profile count mismatch');
  const acceptedIds = coverage.candidates.filter(candidate => candidate.status === 'accepted').map(candidate => candidate.candidate_id).sort();
  assert(isDeepStrictEqual(acceptedIds, [...profilesByCandidate.keys()].sort()), 'Accepted coverage identities must exactly match profiles');
  assert(coverage.country_startup_denominator === null && coverage.complete === false, 'No defensible national denominator/completeness');
  assert(coverage.counts.published === 0, 'Staged records must not count as published');
  const expectedReview = coverage.candidates.filter(x => x.status !== 'queued').map(x => x.candidate_id).sort();
  assert(JSON.stringify(queue.checkpoint.reviewed_candidate_ids.slice().sort()) === JSON.stringify(expectedReview), 'Resume checkpoint drops or duplicates reviewed candidates');
  assert(queue.source_queue.length > 0 && queue.checkpoint.collection_complete === false, 'Resume source gaps must remain explicit');
  const queueIds = new Set();
  for (const item of queue.source_queue) {
    assert(item.queue_id && !queueIds.has(item.queue_id), 'Duplicate resume item');
    assert(item.status && item.next_action && item.approved_for_crawl === false, 'Queue cannot imply seed approval');
    assert(item.eligible_population === null || (Number.isInteger(item.eligible_population) && item.eligible_population >= 0), 'Unknown source population must remain null; known population cannot be negative');
    queueIds.add(item.queue_id);
  }
  return {valid:true,records:records.startups.length,claims:claims.length,sources:sources.length,events:events.length,
    claim_statuses:Object.fromEntries(statuses),candidate_counts:coverage.counts,duplicates,
    integration_requirements:[
      'Existing collection owners review and adopt the staged packet through their normal merge and release process.',
      'Research validation does not approve crawler seeds or publish production records.',
    ],
    limitations:['Checks establish structural consistency and cited-source joins, not exhaustive factual coverage or present-day ownership.','Inventory resumption is separate from source pagination and research completion.'],
    production_written:false,warning:'Structural and identity checks; factual review is separately recorded. No network or publication.'};
}

export async function loadPacket(directory = fileURLToPath(new URL('.', import.meta.url))) {
  const read = async name => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
  const [records,profileData,claimData,sourceData,coverage,queue,eventData] = await Promise.all(['records.json','profiles.json','claims.json','sources.json','coverage.json','next-source-queue.json','funding-events.json'].map(read));
  return {records,profiles:profileData.companies,claims:claimData.claims,sources:sourceData.sources,coverage,queue,events:eventData.events};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packet = await loadPacket();
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const overlay = JSON.parse(await readFile(resolve(root,'data/startup-research.json'),'utf8'));
  const graph = JSON.parse(await readFile(resolve(root,'data/graph.json'),'utf8'));
  const existing = [...overlay.startups,...graph.entities.filter(x=>x.kind==='startup')];
  const result = validatePacket(packet, existing);
  process.stdout.write(stable(result));
}
