#!/usr/bin/env node
/** Offline validation of this research packet. No network, import, seed approval or publication. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateStartupRecord, startupSlug } from '../../../../backend/hosted/src/startup-record.mjs';

export const packetDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoDirectory = path.resolve(packetDirectory, '../../../..');
export const normalizeName = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export function normalizeDomain(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Expected credential-free public HTTPS URL');
  return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const key = value => JSON.stringify(value);
const unique = values => new Set(values).size === values.length;
const read = (directory, name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));

export function loadPacket(directory = packetDirectory) {
  return {
    manifest: read(directory, 'manifest.json'),
    dossiers: read(directory, 'dossiers.json'),
    records: read(directory, 'startup-records.staged.json'),
    registry: read(directory, 'source-registry.json'),
    ledger: read(directory, 'claims.json'),
    participants: read(directory, 'event-participants.json'),
    projection: read(directory, 'projection-map.json'),
    baseline: read(directory, 'evidence/baseline-identities.json'),
    queue: read(directory, 'next-source-queue.json'),
    ecosystem: read(directory, 'ecosystem.json'),
  };
}

export function validatePacket(packet, { verifyBaselines = true } = {}) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const safe = (fn, label) => { try { fn(); } catch (error) { errors.push(`${label}: ${error.message}`); } };
  const { manifest, dossiers, records, registry, ledger, participants, projection, baseline, queue, ecosystem } = packet;
  const companies = dossiers.companies;
  const sources = new Map(registry.sources.map(s => [s.id, s]));
  const claims = new Map(ledger.claims.map(c => [c.claim_id, c]));
  const events = new Map(companies.flatMap(c => c.funding_events.map(e => [e.id, {company:c, event:e}])));
  const acceptedKinds = new Set(['primary_company','primary_investor','regulatory','secondary']);
  check(sources.size === registry.sources.length, 'Duplicate source IDs');
  check(unique(registry.sources.map(s => s.url)), 'Duplicate source URLs require explicit registry reconciliation');
  check(claims.size === ledger.claims.length, 'Duplicate claim IDs');
  check(unique(companies.map(c => c.entity_id)), 'Duplicate staged company identities');
  check(unique(companies.map(c => normalizeDomain(c.website))), 'Duplicate staged domains');
  check(records.startups.length === companies.length, 'Projection and dossier company counts differ');
  check(manifest.national_eligible_startup_denominator === null, 'National denominator must remain unknown');
  check(manifest.cohort.verified_rank === null && manifest.cohort.exact_gdp_usd_billion === null, 'Unverified IMF cohort values must remain null');
  check(manifest.counts.production_records_written === 0 && manifest.counts.crawler_seeds_approved === 0, 'Research is not publication or seed approval');
  for (const s of registry.sources) {
    safe(() => normalizeDomain(s.url), `Source ${s.id}`);
    check(s.crawler_seed_approved === false, `Source ${s.id} silently approves a crawl`);
    check(typeof s.accessed === 'boolean', `Source ${s.id} missing access outcome`);
    check(s.retrieved_on === manifest.retrieved_on, `Source ${s.id} missing retrieval date`);
  }
  const sourceRefs = (ids, context, accepted = true) => {
    check(Array.isArray(ids) && ids.length > 0, `${context}: missing provenance`);
    for (const id of ids || []) {
      const s = sources.get(id);
      check(Boolean(s), `${context}: absent source ${id}`);
      if (s && accepted) {
        check(s.accessed === true, `${context}: inaccessible source ${id} used as evidence`);
        check(acceptedKinds.has(s.source_kind), `${context}: discovery or unsupported source kind ${id}`);
        check(stamp(s.retrieved_at), `${context}: source ${id} lacks actual timezone-aware retrieval`);
      }
    }
  };
  for (const cl of ledger.claims) {
    check(cl.publication_state === 'unsubmitted', `${cl.claim_id}: false publication state`);
    check(cl.entity_id.startsWith('unresolved:br:'), `${cl.claim_id}: new identity falsely resolved`);
    if (['reviewed_staged', 'conflict'].includes(cl.status)) {
      check(cl.value !== null && cl.value !== undefined, `${cl.claim_id}: null is not an accepted fact`);
      sourceRefs(cl.source_ids, cl.claim_id);
      const first = sources.get(cl.source_ids?.[0]);
      check(cl.source_url === first?.url && cl.source_kind === first?.source_kind, `${cl.claim_id}: primary provenance mismatch`);
      check(stamp(cl.retrieved_at) && stamp(cl.reviewed_at), `${cl.claim_id}: invalid retrieval/review time`);
      check(cl.retrieved_at === first?.retrieved_at, `${cl.claim_id}: invented retrieval time`);
      check(Boolean(cl.evidence) && Boolean(cl.rationale), `${cl.claim_id}: missing evidence or rationale`);
      check((cl.supporting_sources || []).length === cl.source_ids.length, `${cl.claim_id}: incomplete supporting source map`);
      for (const support of cl.supporting_sources || []) {
        const s=sources.get(support.source_id);
        check(s?.url===support.url && s?.retrieved_at===support.retrieved_at, `${cl.claim_id}: supporting source mismatch`);
      }
    } else {
      check(['unsearched','searched_unknown','blocked','not_applicable','rejected'].includes(cl.status), `${cl.claim_id}: unknown disposition`);
      check(cl.value === null && Boolean(cl.rationale), `${cl.claim_id}: unknown must be null with reason`);
      if(cl.status==='searched_unknown')check(cl.search_log?.length>0, `${cl.claim_id}: missing bounded search log`);
    }
  }
  const mappedPaths = new Set();
  for (const m of projection.mappings) {
    check(!mappedPaths.has(m.json_pointer), `Duplicate projection mapping ${m.json_pointer}`);
    mappedPaths.add(m.json_pointer);
    check(m.claim_ids.length>0 && m.claim_ids.every(id=>claims.has(id)), `Unproven projection ${m.json_pointer}`);
    const tokens=m.json_pointer.split('/').slice(1);
    let value=records;
    for(const token of tokens)value=value?.[token];
    check(value!==undefined, `Projection mapping points to missing value ${m.json_pointer}`);
  }
  for (const [index,c] of companies.entries()) {
    const r=records.startups[index];
    safe(()=>validateStartupRecord(r), `${c.name} current production schema`);
    check(c.name===r.name && c.website===r.website, `${c.name}: identity projection mismatch`);
    check(c.candidate_canonical_id===`startup:${startupSlug(c.name)}` && c.entity_id===`unresolved:br:${startupSlug(c.name)}`, `${c.name}: noncanonical provisional slug`);
    check(c.normalized_domain===normalizeDomain(c.website), `${c.name}: domain normalization mismatch`);
    check(!Object.hasOwn(r,'relationships'), `${c.name}: research-only participant edges leaked to runtime`);
    const identity=c.facts.find(f=>f.field==='identity');
    check(identity?.value.name===c.name && identity?.value.website===c.website, `${c.name}: unsourced top-level identity`);
    const ownNames=new Set([c.name,...c.aliases].map(normalizeName));
    for(const other of companies.filter(x=>x.key!==c.key)) {
      check(![other.name,...other.aliases].map(normalizeName).some(n=>ownNames.has(n)), `${c.name}: cross-company name or alias collision`);
    }
    const matches=baseline.identities.filter(b=>ownNames.has(b.normal_name) || (b.normal_host && b.normal_host===c.normalized_domain) || b.id===c.candidate_canonical_id);
    check(matches.length===0, `${c.name}: existing Atlas identity collision requires review`);
    for(const fact of c.facts) {
      sourceRefs(fact.source_ids, `${c.name} ${fact.field}`);
      check(fact.claim_ids?.every(id=>claims.has(id)), `${c.name}: missing fact claims`);
    }
    for(const [field,unknown] of Object.entries(c.unknowns))check(unknown.value===null && Boolean(unknown.reason), `${c.name}.${field}: unknown coerced to a fact`);
    const founders=c.facts.filter(f=>f.field==='founder');
    check(r.founders.length===founders.length, `${c.name}: historical founder lost`);
    for(const [j,f] of founders.entries())check(r.founders[j].name===f.value.name && r.founders[j].source===sources.get(f.source_ids[0]).url, `${c.name}: founder source mismatch`);
    check(r.funding_rounds.length===c.funding_events.length, `${c.name}: event lost or duplicated`);
    for(const [j,e] of c.funding_events.entries()) {
      const out=r.funding_rounds[j];
      check(out.id===e.id && out.stage===e.stage, `${e.id}: stage or event identity mismatch`);
      const article=r.articles?.find(a=>a.url===out.source);
      const articleSource=registry.sources.find(s=>s.url===out.source);
      const sourceDay=/^\d{4}-\d{2}-\d{2}$/.test(articleSource?.published_on || '')?articleSource.published_on:undefined;
      check(Boolean(article) && article.published_on===sourceDay, `${e.id}: article publication date must not inherit announcement date`);
      const datePattern={day:/^\d{4}-\d{2}-\d{2}$/,month:/^\d{4}-\d{2}$/,year:/^\d{4}$/}[e.date_precision];
      check(datePattern?.test(e.date), `${e.id}: date does not match precision`);
      if(e.date_precision==='day')check(new Date(`${e.date}T00:00:00Z`).toISOString().slice(0,10)===e.date, `${e.id}: impossible event date`);
      const canAnnounce=e.date_precision==='day' && e.date_kind==='announcement';
      check(canAnnounce?out.announced_on===e.date:!Object.hasOwn(out,'announced_on'), `${e.id}: invented date precision or wrong date meaning`);
      if(e.amount===null) {
        check(!Object.hasOwn(out,'amount') && !Object.hasOwn(out,'currency'), `${e.id}: unknown amount/currency leaked into scalar projection`);
        check(Boolean(out.amount_text), `${e.id}: held amount lacks explanation`);
      } else {
        check(Number.isSafeInteger(e.amount) && e.amount>0 && /^[A-Z]{3}$/.test(e.currency), `${e.id}: invalid observed amount/currency`);
        check(out.amount===e.amount && out.currency===e.currency, `${e.id}: amount or currency projection mismatch`);
      }
      for(const [field,ids] of Object.entries(e.field_sources)) {
        sourceRefs(ids, `${e.id}.${field}`);
        check(ids.every(id=>e.source_ids.includes(id)), `${e.id}.${field}: field source absent from event`);
      }
      check(e.participant_list_complete===false, `${e.id}: unsupported complete participant list`);
      check(unique(e.participants.map(p=>normalizeName(p.name))), `${e.id}: duplicate participant`);
      for(const p of e.participants) {
        sourceRefs(p.source_ids, `${e.id} participant ${p.name}`);
        const cl=claims.get(p.claim_id);
        check(cl?.field==='round_participant' && cl.value.event_id===e.id && cl.value.name===p.name, `${e.id}: detached participant claim`);
      }
    }
    const essential=['name','description','website',...r.founders.map((_,j)=>`founders/${j}/name`),...r.profile_facts.map((_,j)=>`profile_facts/${j}/value`)];
    for(const [j,a] of (r.articles || []).entries())for(const field of Object.keys(a))essential.push(`articles/${j}/${field}`);
    if(Object.hasOwn(r,'founded_year'))essential.push('founded_year');
    for(const field of essential)check(mappedPaths.has(`/startups/${index}/${field}`), `${c.name}: projection lacks claim mapping ${field}`);
  }
  check(events.size===companies.reduce((n,c)=>n+c.funding_events.length,0), 'Duplicate event IDs');
  check(unique(participants.participants.map(p=>`${p.event_id}|${normalizeName(p.name)}`)), 'Duplicate participant-event assertions');
  for(const p of participants.participants) {
    const e=events.get(p.event_id), cl=claims.get(p.claim_id);
    check(e && e.company.entity_id===p.startup_entity_id, `${p.id}: dangling event/startup`);
    check(p.relationship_basis==='explicit_event_statement', `${p.id}: portfolio membership cannot prove round participation`);
    check(p.resolved_entity_id===null && p.identity_resolution_status==='unresolved', `${p.id}: investor identity silently resolved`);
    check(p.publication_state==='unsubmitted', `${p.id}: false publication`);
    check(cl?.field==='round_participant' && cl.value.name===p.name && cl.value.role===p.role && cl.value.event_id===p.event_id, `${p.id}: participant claim mismatch`);
  }
  check(queue.crawler_seed_approved===false && queue.national_denominator===null, 'Queue changes approval or denominator');
  for(const q of queue.source_queue)check(q.crawler_seed_approved===false && q.eligible_denominator===null, `${q.id}: queue falsely approved or complete`);
  for(const lead of queue.discovery_only_leads)check(lead.status==='discovery_only' && lead.canonical_domain_verified===false && lead.eligible===null, `${lead.id}: unchecked directory lead promoted`);
  for(const f of ecosystem.findings)check(f.source_ids.every(id=>sources.has(id)), `${f.id}: missing ecosystem source`);
  const observed={accepted_staged_companies:companies.length,reviewed_companies:companies.length,
    deferred_discovery_only_companies:queue.discovery_only_leads.length,discovered_company_leads:companies.length+queue.discovery_only_leads.length,
    funding_events:events.size,event_participant_assertions:participants.participants.length,
    named_founder_assertions:records.startups.reduce((n,c)=>n+c.founders.length,0),source_registry_entries:registry.sources.length,
    source_registry_unique_urls:new Set(registry.sources.map(s=>s.url)).size,
    registry_urls_accessed:registry.sources.filter(s=>s.accessed).length,registry_urls_not_accessed:registry.sources.filter(s=>!s.accessed).length,
    ecosystem_reviewed_findings:ecosystem.findings.length,prioritized_ecosystem_source_routes:queue.source_queue.length,
    funding_events_with_resolved_amount_currency:[...events.values()].filter(({event:e})=>e.amount!==null).length,
    funding_events_with_held_amount:[...events.values()].filter(({event:e})=>e.amount===null).length};
  for(const [label,value] of Object.entries(observed))check(manifest.counts[label]===value, `Count mismatch ${label}`);
  if(verifyBaselines)for(const [filename,expected] of Object.entries(baseline.file_sha256)) {
    safe(()=>check(hash(fs.readFileSync(path.join(repoDirectory,filename)))===expected, `Baseline changed: ${filename}; rebase and dedup required`), filename);
  }
  return {valid:errors.length===0,errors,checked_at:new Date().toISOString(),base_revision:manifest.base_revision,
    counts:observed,checks:['existing whole-record schema','NFKC names and canonical hosts','pinned baseline hashes and dedup','null/missing and date precision',
      'claim-source access and timestamps','projection claim mapping','event-specific unresolved investor relationships','counts and unapproved resumable queue'],
    limitations:['Structural checks do not establish source truth; reviewed sources and independent audits supply factual evidence.',
      'No national denominator, complete funding history, canonical investor resolution, crawler approval or production publication.']};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=validatePacket(loadPacket());
  console.log(JSON.stringify(result,null,2));
  if(!result.valid)process.exitCode=1;
}
