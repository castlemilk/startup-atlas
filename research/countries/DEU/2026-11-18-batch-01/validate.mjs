/** Offline checks for this staged country packet. No writes, network or seed approval. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, dirname} from 'node:path';
import {validateStartupRecord, startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';

export const nameKey = name => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export function domainKey(value) {
  const u = new URL(value);
  assert.equal(u.protocol, 'https:', 'Website must use HTTPS');
  assert(!u.username && !u.password, 'Website must not contain credentials');
  return u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/** Candidate matching only. A matching name or domain never authorizes a merge. */
export function findIdentityMatches(existing, incoming) {
  const keys = new Set([incoming.name, ...(incoming.aliases || [])].map(nameKey));
  const domain = incoming.website ? domainKey(incoming.website) : null;
  return existing.flatMap(row => {
    const reasons = [];
    if ([row.name, ...(row.aliases || [])].some(n => keys.has(nameKey(n)))) reasons.push('name_or_alias');
    if (domain && row.website && domainKey(row.website) === domain) reasons.push('official_domain');
    if (startupSlug(row.name) === startupSlug(incoming.name)) reasons.push('atlas_slug');
    return reasons.length ? [{name: row.name, id: row.id || `startup:${startupSlug(row.name)}`, reasons}] : [];
  });
}

export function validateProvenance(claims, sources) {
  const sourceByUrl = new Map();
  const sourceById = new Map();
  const sourceIds = new Set();
  for (const s of sources) {
    assert(s.source_id && !sourceIds.has(s.source_id), `Duplicate source ID ${s.source_id}`);
    sourceIds.add(s.source_id);
    sourceById.set(s.source_id, s);
    assert.equal(new URL(s.url).protocol, 'https:');
    assert.equal(s.crawler_seed_approved, false, 'Research source must not approve a crawler seed');
    for (const url of [s.url, ...(s.alternate_urls || [])]) {
      const old = sourceByUrl.get(url);
      if (!old || (old.access_status !== 'accessed' && s.access_status === 'accessed')) sourceByUrl.set(url, s);
    }
  }
  const seen = new Set();
  for (const c of claims) {
    assert(c.claim_id && !seen.has(c.claim_id), `Duplicate claim ID ${c.claim_id}`);
    seen.add(c.claim_id);
    assert(c.entity_id && c.field && c.status, `Incomplete claim ${c.claim_id}`);
    assert.notEqual(c.status, 'published_verified', 'Staging is not publication');
    if (!['reviewed_staged', 'candidate', 'conflict'].includes(c.status)) {
      assert(c.rationale, `Disposition needs rationale ${c.claim_id}`);
      if (c.status === 'searched_unknown') assert(c.search_log?.length, 'Searched unknown needs a search log');
      continue;
    }
    assert(c.value !== null && c.value !== undefined, 'Null is a disposition, not an accepted fact');
    assert(c.source_url && c.evidence && c.rationale, `Missing evidence ${c.claim_id}`);
    const source = sourceByUrl.get(c.source_url);
    assert(source, `Unregistered source ${c.source_url}`);
    for (const sourceId of [...(c.source_ids || []), ...(c.source_id ? [c.source_id] : [])]) {
      assert(sourceById.has(sourceId), `Unknown source ID ${sourceId} in ${c.claim_id}`);
    }
    if (c.source_id) {
      const s = sourceById.get(c.source_id);
      assert([s.url, ...(s.alternate_urls || [])].includes(c.source_url), 'Claim source ID and URL disagree');
    }
    if (c.source_ids?.length) {
      assert(c.source_ids.some(id => {
        const s=sourceById.get(id); return [s.url, ...(s.alternate_urls || [])].includes(c.source_url);
      }), 'Claim primary URL is absent from its source IDs');
    }
    if (c.status === 'reviewed_staged') {
      assert.equal(c.accessed, true, `Unaccessed reviewed source ${c.claim_id}`);
      assert(['accessed', 'partial'].includes(source.access_status), `Blocked source cannot support acceptance ${c.claim_id}`);
      assert.notEqual(c.source_kind, 'discovery', 'Discovery is not factual review');
      assert(c.reviewed_at && Number.isFinite(Date.parse(c.reviewed_at)), 'Review timestamp required');
    }
  }
  return sourceByUrl;
}

export function validateFundingRelations(events, participants, claims) {
  const eventMap = new Map();
  const claimMap = new Map(claims.map(c => [c.claim_id, c]));
  for (const e of events) {
    assert(e.event_id && !eventMap.has(e.event_id), `Duplicate event ${e.event_id}`);
    assert(e.company_id && e.evidence_claim_id, 'Event identity and evidence required');
    const claim = claimMap.get(e.evidence_claim_id);
    assert(claim && claim.field === 'funding_round' && claim.status === 'reviewed_staged', 'Event must bind reviewed funding evidence');
    assert.equal(claim.entity_id, e.company_id, 'Cross-company event evidence');
    assert.equal(claim.source_url, e.source_url, 'Event source drift');
    assert.equal(claim.value.event_id || claim.value.id, e.event_id, 'Event ID disagrees with evidence');
    if (Object.hasOwn(claim.value, 'amount')) assert.equal(claim.value.amount, e.amount, 'Event amount disagrees with evidence');
    if (Object.hasOwn(claim.value, 'currency')) assert.equal(claim.value.currency, e.currency, 'Event currency disagrees with evidence');
    if (e.amount !== null) {
      assert(Number.isSafeInteger(e.amount) && e.amount >= 0, 'Amount must be an integer or null');
      assert(/^[A-Z]{3}$/.test(e.currency || ''), 'Numeric amount needs known ISO currency');
    }
    eventMap.set(e.event_id, e);
  }
  const participationKeys = new Set();
  for (const p of participants) {
    const e = eventMap.get(p.event_id);
    assert(e, `Orphan participant ${p.event_id}`);
    const claim = claimMap.get(p.evidence_claim_id);
    assert(claim && claim.field === 'round_participant' && claim.status === 'reviewed_staged', 'Participant must bind reviewed event evidence');
    assert.equal(claim.entity_id, e.company_id, 'Cross-company participant');
    assert.equal(p.company_id, e.company_id, 'Participant company disagrees with event');
    assert.equal(claim.value.event_id, p.event_id, 'Participant evidence names another event');
    assert.equal(claim.value.name, p.name, 'Participant name disagrees with evidence');
    assert.equal(claim.value.role, p.role, 'Participant role disagrees with evidence');
    assert.equal(p.relationship_basis, 'explicit_round_announcement', 'Portfolio membership cannot establish a round investment');
    assert(['lead','participant','unspecified'].includes(p.role), 'Role must be explicitly modeled');
    assert.equal(p.source_url, claim.source_url, 'Participant source drift');
    assert.equal(p.resolved_entity_id, null, 'This packet does not resolve canonical investor identities');
    const key = `${p.event_id}|${nameKey(p.name)}|${p.source_url}`;
    assert(!participationKeys.has(key), `Duplicate participation ${key}`);
    participationKeys.add(key);
  }
}

export function validatePacket(p) {
  const sourceByUrl = validateProvenance(p.claims.claims, p.sources.sources);
  const ids = new Set(), hosts = new Set(), eventIds = new Set();
  const entityMap = new Map(p.entities.entities.map(x => [x.name, x]));
  const fundingMap = new Map(p.funding.events.map(x => [x.event_id, x]));
  for (const record of p.records.startups) {
    validateStartupRecord(record); // authoritative existing repository validator
    const id = `startup:${startupSlug(record.name)}`;
    assert(!ids.has(id), `Duplicate record slug ${id}`); ids.add(id);
    const host = domainKey(record.website);
    assert(!hosts.has(host), `Duplicate company domain ${host}`); hosts.add(host);
    const entity = entityMap.get(record.name);
    assert(entity && entity.proposed_atlas_id === id, 'Projection must bind its staged entity');
    assert.equal(entity.canonical_domain, host, 'Domain projection drift');
    assert(entity.field_dispositions, 'Field dispositions required');
    for (const value of [record.source, ...(record.founders || []).map(x=>x.source), ...(record.profile_facts || []).map(x=>x.source), ...(record.funding_rounds || []).map(x=>x.source)]) {
      const source = sourceByUrl.get(value);
      assert(source && ['accessed','partial'].includes(source.access_status), `Projection has no accessed evidence: ${value}`);
    }
    for (const round of record.funding_rounds || []) {
      assert(!eventIds.has(round.id), `Round ID collision ${round.id}`); eventIds.add(round.id);
      const event = fundingMap.get(round.id);
      assert(event?.production_projection, 'Projected round is not marked for schema projection');
      assert.equal(event.company_id, entity.entity_id, 'Projected funding attached to another company');
      assert.equal(event.stage, round.stage, 'Projected stage drift');
      assert.equal(event.source_url, round.source, 'Projected source drift');
      if (round.announced_on !== undefined) {
        assert.equal(event.announcement_date_precision, 'day', 'Projection fabricated day precision');
        assert.equal(event.announced_on, round.announced_on, 'Projected announcement date drift');
      }
      if (round.amount !== undefined) {
        assert.equal(round.amount, event.amount, 'Projected amount drift');
        assert.equal(round.currency, event.currency, 'Projected currency drift');
      }
      // Numeric projections are only supplied for exact, non-overlapping disclosed amounts.
      if (round.amount !== undefined) assert(round.amount > 0, 'Unknown funding must not become zero');
    }
    const collisions = findIdentityMatches(p.baseline.startups, {name:record.name, website:record.website, aliases:entity.aliases});
    assert.equal(collisions.length, 0, `Baseline identity collision ${record.name}: ${JSON.stringify(collisions)}`);
  }
  assert.deepEqual([...eventIds].sort(), p.funding.events.filter(e=>e.production_projection).map(e=>e.event_id).sort(), 'Funding projection is not a bijection with staged event selections');
  assert.equal(p.coverage.entities.accepted_staged, p.records.startups.length, 'Accepted count drift');
  assert.equal(p.coverage.entities.reviewed, p.records.startups.length + p.coverage.entities.rejected, 'Reviewed count drift');
  assert.equal(p.coverage.national_eligible_population, null, 'Unknown country denominator must remain null');
  assert.equal(p.coverage.publication.production_records_written, 0);
  assert.equal(p.coverage.publication.crawler_seeds_approved, 0);
  validateFundingRelations(p.funding.events, p.funding.participants, p.claims.claims);
  return {valid:true, records:ids.size, claims:p.claims.claims.length, sources:p.sources.sources.length,
    funding_events:p.funding.events.length, participant_observations:p.funding.participants.length,
    production_records_written:0, canonical_investor_edges_created:0};
}

export function readPacket(directory = dirname(fileURLToPath(import.meta.url))) {
  const read = name => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
  return {records:read('records.json'), entities:read('entities.json'), claims:read('claims.json'),
    sources:read('source-registry.json'), funding:read('funding-evidence.json'),
    coverage:read('coverage.json'), baseline:read('baseline-identities.json')};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(validatePacket(readPacket()), null, 2));
}
