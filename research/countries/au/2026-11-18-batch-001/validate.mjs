#!/usr/bin/env node
// Offline, packet-scoped checks. No network, imports of crawler code, or production writes.
// Run from any directory: node /path/to/this/validate.mjs [--write-report]
// Requires Node 18+ and python3. CHECKSUMS.sha256 excludes itself and validation-report.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';

globalThis.crypto ??= webcrypto;
const packetDir = path.dirname(fileURLToPath(import.meta.url));
let root = packetDir;
while (!fs.existsSync(path.join(root, 'backend/hosted/src/startup-edit.mjs'))) {
  const parent = path.dirname(root);
  if (parent === root) throw new Error('Cannot locate the repository from validate.mjs.');
  root = parent;
}
const relative = value => path.relative(root, value).split(path.sep).join('/');
const own = (value, key) => Object.hasOwn(value, key);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stable = value => JSON.stringify(canonical(value));
const digest = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.join(packetDir, file), 'utf8'));
const readProduction = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hashFile = file => digest(fs.readFileSync(path.join(root, file)));
function packetFiles(directory = packetDir) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    ensure(!entry.isSymbolicLink(), 'Packet checksum traversal does not follow symbolic links.', { filename: path.relative(packetDir, filename) });
    return entry.isDirectory() ? packetFiles(filename) : entry.isFile() ? [path.relative(packetDir, filename).split(path.sep).join('/')] : [];
  });
}
const nonempty = value => typeof value === 'string' && value.trim() === value && value.length > 0;
const normalizeName = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const unique = values => new Set(values).size === values.length;
const sameSet = (a, b) => stable([...a].sort()) === stable([...b].sort());
function ensure(condition, message, details) {
  if (!condition) { const error = new Error(message); error.details = details; throw error; }
}
function publicUrl(value) {
  const url = new URL(value);
  ensure(url.protocol === 'https:' && !url.username && !url.password, 'Expected a public HTTPS source URL.', { url: value });
  ensure(!decodeURIComponent(url.pathname).split('/').some(part => part.toLowerCase() === 'robots.txt'), 'Forbidden robots.txt reference.', { url: value });
  return url;
}
function domain(value) {
  if (!value) return null;
  return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}
function sourceKey(value) {
  const url = publicUrl(value);
  url.hostname = url.hostname.replace(/^www\./, ''); url.hash = ''; url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}
function sourceReferences(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'source' || key === 'source_url' || key.endsWith('_source_url')) && typeof item === 'string') found.push(item);
    else if (item && typeof item === 'object') sourceReferences(item, found);
  }
  return found;
}
function dateWithPrecision(value, precision, label) {
  if (value === null) { ensure(precision === 'unknown' || precision === null || precision === undefined, `${label}: null date has a known precision.`); return; }
  const formats = { year: /^\d{4}$/, month: /^\d{4}-(0[1-9]|1[0-2])$/, day: /^\d{4}-\d{2}-\d{2}$/ };
  ensure(typeof value === 'string' && formats[precision]?.test(value), `${label}: value does not retain its stated precision.`, { value, precision });
  if (precision === 'day') ensure(!Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, `${label}: invalid calendar date.`);
}
function buildGraph(inputs) {
  // run_path does not invoke main(); -B also prevents Python cache-file writes.
  const python = 'import json,runpy,sys\nfrom pathlib import Path\np=Path(sys.argv[1])\nf=runpy.run_path(str(p/"scripts/make-graph.py"))["build_graph"]\nx=json.load(sys.stdin)\nprint(json.dumps(f(x["profiles"],x["leads"],x["reviewed"],x["catalogue"],x["research"]),ensure_ascii=False,separators=(",",":")))';
  const result = spawnSync('python3', ['-B', '-c', python, root], { input: JSON.stringify(inputs), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  ensure(!result.error && result.status === 0, 'Offline Python build_graph failed.', { error: result.error?.message, stderr: result.stderr?.trim() });
  return JSON.parse(result.stdout);
}

const groups = [];
const warnings = [];
async function check(groupName, name, callback) {
  let group = groups.find(item => item.name === groupName);
  if (!group) { group = { name: groupName, checks: 0, passed: 0, failed: 0, failures: [] }; groups.push(group); }
  group.checks++;
  try { await callback(); group.passed++; }
  catch (error) { group.failed++; group.failures.push({ check: name, message: error.message, ...(error.code ? { code: error.code } : {}), ...(error.details ? { details: error.details } : {}) }); }
}
async function rejects(callback, code) {
  let caught;
  try { await callback(); } catch (error) { caught = error; }
  ensure(caught, `Expected rejection${code ? ` ${code}` : ''}.`);
  if (code) ensure(caught.code === code, 'Unexpected rejection code.', { expected: code, actual: caught.code, message: caught.message });
}

async function main() {
  ensure(process.argv.slice(2).every(arg => arg === '--write-report'), 'Only --write-report is supported.');
  const { validateStartupRecord, startupSlug } = await import(pathToFileURL(path.join(root, 'backend/hosted/src/startup-record.mjs')));
  const { prepareStartupEdit, recordRevision } = await import(pathToFileURL(path.join(root, 'backend/hosted/src/startup-edit.mjs')));
  const manifest = read('manifest.json'), baseline = read('baseline-index.json'), coverage = read('coverage.json');
  const companies = read('companies.json').companies, claims = read('claims.json').claims;
  const ecosystem = read('ecosystem.json'), registry = read('source-registry.json').sources;
  const relationshipsFile = read('funding-relationships.json'), relationships = relationshipsFile.relationships;
  const additions = read('staged-additions.json'), edits = read('staged-edits.json'), records = read('staged-records.json');
  const projection = read('projection-map.json'), decisions = read('review-decisions.json');
  const inputs = { profiles: readProduction('data/partner-profiles.json'), leads: readProduction('data/partner-leads.json'), reviewed: readProduction('data/partners-reviewed.json'), catalogue: readProduction('data/catalogue.json'), research: readProduction('data/startup-research.json') };
  const guardedFiles = [...new Set([...manifest.preserved_production_files.map(item => item.path), 'data/graph.json', 'backend/internal/graph/snapshot.json', 'scripts/make-graph.py', 'backend/hosted/src/startup-record.mjs', 'backend/hosted/src/startup-edit.mjs'])].filter(file => fs.existsSync(path.join(root, file)));
  const initialHashes = Object.fromEntries(guardedFiles.map(file => [file, hashFile(file)]));
  const graph = buildGraph(inputs);
  const current = { head: manifest.base_revision, graph, leads: inputs.leads, catalogue: inputs.catalogue, research: inputs.research };
  const byCompany = new Map(companies.map(item => [item.entity_id, item]));
  const byRecord = new Map(records.map(item => [`startup:${startupSlug(item.name)}`, item]));
  const byExisting = new Map(inputs.research.startups.map(item => [`startup:${startupSlug(item.name)}`, item]));
  const byClaim = new Map(claims.map(item => [item.claim_id, item]));
  const bySource = new Map(registry.map(item => [item.source_id, item]));
  const sourceByUrl = new Map(registry.map(item => [item.url, item]));
  const accepted = companies.filter(item => item.review_disposition === 'accepted');
  const events = companies.flatMap(company => (company.funding_events || []).map(event => ({ ...event, startup_id: company.entity_id })));
  const eventByKey = new Map(events.map(event => [`${event.startup_id}|${event.id}`, event]));
  const allClaims = [...claims, ...ecosystem.ecosystem_claims];
  const requireSource = url => {
    publicUrl(url);
    const source = sourceByUrl.get(url);
    ensure(source && source.accessed === true && source.observations.some(observation => observation.accessed === true), 'Claim source is unregistered or has no readable observation.', { url });
    return source;
  };

  await check('snapshot_integrity', 'manifest and pinned baseline', () => {
    ensure(/^[a-f0-9]{40}$/.test(manifest.base_revision), 'Invalid pinned revision.');
    ensure(manifest.base_revision === baseline.source_revision && projection.base_revision === manifest.base_revision && read('claims.json').base_revision === manifest.base_revision, 'Packet base revisions differ.');
    ensure(stable(manifest.preserved_production_files) === stable(baseline.files), 'Manifest and baseline file hashes differ.');
    ensure(manifest.owned_path.replace(/\/$/, '') === relative(packetDir), 'Manifest owned path differs from validator location.');
    ensure(manifest.production_published === false && manifest.crawler_seed_approval === false && projection.production_changes_applied === false, 'Packet claims a production or crawler mutation.');
    ensure(manifest.schema.extension === null && manifest.normalization_policy.unknown_legacy_fields === 'omitted', 'Unexpected schema or null policy.');
  });
  for (const file of manifest.preserved_production_files) await check('snapshot_integrity', file.path, () => ensure(initialHashes[file.path] === file.sha256, 'Pinned source file changed; refresh and reconcile the packet.', { path: file.path, expected: file.sha256, actual: initialHashes[file.path] }));
  await check('snapshot_integrity', 'fresh graph matches deduplication baseline', () => {
    const entities = graph.entities.map(entity => Object.fromEntries(['id', 'kind', 'name', 'website'].filter(key => own(entity, key)).map(key => [key, entity[key]])));
    ensure(stable(entities) === stable(baseline.entities), 'Freshly built entities differ from the baseline index.');
    ensure(graph.funding_rounds.length === baseline.funding_events.length, 'Freshly built funding count differs from baseline.');
    ensure(graph.entities.length === read('baseline-built-inventory.json').entity_total, 'Fresh graph inventory count differs.');
  });

  for (const record of records) await check('production_schema', `record ${record.name}`, () => validateStartupRecord(record));
  for (const record of additions) await check('production_schema', `addition ${record.name}`, () => validateStartupRecord(record));
  const prepared = new Map();
  for (const edit of edits) await check('production_schema', `guarded edit ${edit.id}`, async () => {
    const result = await prepareStartupEdit(current, edit); prepared.set(edit.id, result);
    ensure(stable(result.merged) === stable(byRecord.get(edit.id)), 'Staged record differs from the actual guarded merge.', { id: edit.id });
    for (const warning of result.warnings) warnings.push({ entity_id: edit.id, ...warning });
  });
  await check('production_schema', 'staged membership and combined graph', () => {
    const additionIds = additions.map(record => `startup:${startupSlug(record.name)}`), editIds = edits.map(edit => edit.id);
    ensure(unique([...additionIds, ...editIds]) && unique([...byRecord.keys()]) && byRecord.size === records.length, 'Duplicate staged record identity.');
    ensure(sameSet([...additionIds, ...editIds], accepted.map(company => company.entity_id)) && sameSet([...byRecord.keys()], accepted.map(company => company.entity_id)), 'Accepted companies and staged projections differ.');
    ensure(prepared.size === edits.length, 'Not all guarded edits prepared successfully.');
    for (const record of additions) ensure(stable(record) === stable(byRecord.get(`startup:${startupSlug(record.name)}`)), 'Addition differs from staged record.', { name: record.name });
    const next = { ...inputs.research, startups: inputs.research.startups.map(record => prepared.get(`startup:${startupSlug(record.name)}`)?.merged || record).concat(additions) };
    const candidateGraph = buildGraph({ ...inputs, research: next });
    ensure(unique(candidateGraph.entities.map(entity => entity.id)) && unique(candidateGraph.funding_rounds.map(event => event.id)), 'Candidate graph has duplicate identities.');
  });

  const names = new Map(), domains = new Map();
  for (const company of companies) await check('identity_deduplication', company.entity_id, () => {
    ensure(nonempty(company.name) && company.entity_id === `startup:${startupSlug(company.name)}`, 'Invalid canonical name or ID.');
    ensure(unique(company.aliases || []) && unique(company.domain_aliases || []), 'Exact duplicate aliases.');
    const companyNames = new Set([company.name, ...(company.aliases || [])].map(normalizeName));
    const companySlugs = new Set([company.name, ...(company.aliases || [])].map(startupSlug));
    const companyDomains = new Set([company.domain, ...(company.domain_aliases || [])].filter(Boolean).map(domain));
    ensure(company.domain === null || company.domain === domain(company.domain), 'Canonical domain is not normalized.');
    if (company.website) ensure(companyDomains.has(domain(company.website)), 'Website host is not the canonical domain or an evidenced alias.');
    for (const name of companyNames) { ensure(!names.has(name) || names.get(name) === company.entity_id, 'Name/alias collision across companies.', { name, other: names.get(name) }); names.set(name, company.entity_id); }
    for (const hostname of companyDomains) { ensure(!domains.has(hostname) || domains.get(hostname) === company.entity_id, 'Domain/alias collision across companies.', { domain: hostname, other: domains.get(hostname) }); domains.set(hostname, company.entity_id); }
    const matches = graph.entities.filter(entity => companyNames.has(normalizeName(entity.name)) || companySlugs.has(startupSlug(entity.name)) || (entity.website && companyDomains.has(domain(entity.website))));
    ensure(sameSet(matches.map(entity => entity.id), company.deduplication.matches.map(match => match.entity_id)), 'Recorded deduplication differs from fresh full-graph matches.', { id: company.entity_id, actual: matches.map(entity => entity.id) });
    ensure(company.deduplication.entities_checked === graph.entities.length && company.deduplication.authoritative_overlay_records_checked === byExisting.size && company.deduplication.revision === manifest.base_revision, 'Deduplication denominator/revision mismatch.');
    if (company.review_disposition === 'accepted') {
      if (byExisting.has(company.entity_id)) ensure(edits.some(edit => edit.id === company.entity_id) && matches.every(match => match.id === company.entity_id), 'Existing identity is not an unambiguous guarded edit.');
      else ensure(matches.length === 0 && additions.some(record => `startup:${startupSlug(record.name)}` === company.entity_id), 'New company duplicates an existing graph entity.');
    } else ensure(!byRecord.has(company.entity_id), 'Held/rejected company entered a production projection.');
  });
  await check('identity_deduplication', 'canonical and alias slug uniqueness', () => {
    const owners = new Map();
    for (const company of companies) for (const name of [company.name, ...(company.aliases || [])]) {
      const slug = startupSlug(name); ensure(slug && (!owners.has(slug) || owners.get(slug) === company.entity_id), 'Cross-company alias slug collision.', { name, other: owners.get(slug) }); owners.set(slug, company.entity_id);
    }
    ensure(byCompany.size === companies.length, 'Duplicate company IDs.');
  });

  await check('source_provenance', 'source registry identities', () => ensure(bySource.size === registry.length && sourceByUrl.size === registry.length, 'Duplicate source IDs or URLs.'));
  for (const source of registry) await check('source_provenance', source.source_id, () => {
    publicUrl(source.url);
    ensure(Array.isArray(source.observations) && source.observations.length > 0, 'Source has no acquisition observations.');
    ensure(source.accessed === source.observations.some(item => item.accessed === true), 'Source access flag differs from acquisition observations.');
    ensure(source.crawler_seed_approved === false && source.research_use_only === true, 'Source registry entry implies crawler approval.');
    for (const observation of source.observations) ensure(observation.url === source.url && nonempty(observation.retrieved_at) && nonempty(observation.access_status), 'Incomplete source acquisition observation.');
  });
  await check('claim_provenance', 'claim identities', () => ensure(unique(allClaims.map(claim => claim.claim_id)), 'Duplicate claim IDs.'));
  for (const claim of allClaims) await check('claim_provenance', claim.claim_id, () => {
    const source = requireSource(claim.source_url);
    ensure(source.source_id === claim.source_id && claim.accessed === true, 'Claim/source join or access flag differs.');
    ensure(['reviewed_staged', 'conflict'].includes(claim.status) && nonempty(claim.evidence) && nonempty(claim.retrieved_at) && nonempty(claim.retrieval_precision), 'Missing claim review, evidence or retrieval precision.');
    ensure(nonempty(claim.acquisition) && nonempty(claim.source_kind) && nonempty(claim.confidence) && nonempty(claim.rationale), 'Incomplete claim provenance.');
    if (claim.entity_id) ensure(byCompany.has(claim.entity_id) && byCompany.get(claim.entity_id).claim_ids.includes(claim.claim_id) && claim.publication_state === 'unsubmitted', 'Claim is orphaned or marked published.');
    for (const url of sourceReferences(claim)) requireSource(url);
  });
  for (const company of companies) await check('claim_provenance', `company links ${company.entity_id}`, () => {
    ensure(unique(company.claim_ids) && sameSet(company.claim_ids, claims.filter(claim => claim.entity_id === company.entity_id).map(claim => claim.claim_id)), 'Company/claim membership differs.');
    for (const founder of company.founders || []) ensure(company.claim_ids.some(id => { const claim = byClaim.get(id); return claim.field === 'founder' && claim.value?.name === founder.name && claim.source_url === founder.source_url; }), 'Founder lacks a matching claim.', { name: founder.name });
    ensure(company.publication_state === 'unsubmitted' && company.country_scope.incorporation_inferred === false, 'Company scope implies publication or incorporation inference.');
    for (const field of ['incorporation', 'headquarters', 'founding']) if (company[field] === null) ensure(['unsearched', 'searched_unknown', 'conflict'].includes(company.field_dispositions[field]), 'Unknown field has no explicit disposition.', { field });
  });

  for (const mapping of projection.mapping) await check('projection_integrity', mapping.entity_id, () => {
    const company = byCompany.get(mapping.entity_id);
    ensure(company?.review_disposition === 'accepted' && byRecord.has(mapping.entity_id), 'Mapping has no accepted company and record.');
    ensure(sameSet(mapping.research_claim_ids, company.claim_ids), 'Projection omits or imports another company’s claim IDs.');
    ensure(sameSet([...new Set(Object.values(mapping.field_claims).flat())], company.claim_ids), 'Field-level claim mapping is incomplete.');
    for (const ids of Object.values(mapping.field_claims)) ensure(ids.every(id => byClaim.get(id)?.entity_id === mapping.entity_id), 'Field-level claim mapping crosses company boundaries.');
    if (mapping.mode === 'guarded_edit') {
      const result = prepared.get(mapping.entity_id); ensure(result, 'Mapped edit did not prepare.');
      ensure(mapping.expectedRecordRevision === result.recordRevision && mapping.nextRecordRevision === result.nextRecordRevision && stable(mapping.changedPaths) === stable(result.changedPaths) && stable(mapping.warnings) === stable(result.warnings), 'Projection edit receipt differs from actual validator result.');
    } else ensure(mapping.mode === 'addition' && !byExisting.has(mapping.entity_id), 'Invalid projection mode.');
  });
  await check('projection_integrity', 'mapping membership and new source references', () => {
    ensure(unique(projection.mapping.map(item => item.entity_id)) && sameSet(projection.mapping.map(item => item.entity_id), accepted.map(item => item.entity_id)), 'Projection membership differs.');
    for (const proposal of [...additions, ...edits.map(edit => edit.patch)]) for (const url of sourceReferences(proposal)) requireSource(url);
  });

  const assertionGroup = url => sourceByUrl.get(url)?.assertion_group || null;
  const eventSource = event => event.source_url || event.source;
  const stageKey = event => normalizeName(event.stage || 'unspecified').replace(/\s*round$/, '').replace(/^funding.*$/, 'unspecified');
  function duplicateEvents(a, b) {
    if (a.startup_id !== b.startup_id || a.id === b.id) return false;
    const sameFinancials = a.amount != null && a.currency != null && a.amount === b.amount && a.currency === b.currency;
    if (a.announced_on != null && a.announced_on === b.announced_on && sameFinancials) return true;
    const aSource = eventSource(a), bSource = eventSource(b);
    const sameSource = sourceKey(aSource) === sourceKey(bSource) || (assertionGroup(aSource) && assertionGroup(aSource) === assertionGroup(bSource));
    // One release can describe different rounds (e.g. Zeller seed and Series A).
    return Boolean(sameSource && stageKey(a) === stageKey(b) && (sameFinancials || a.amount == null || b.amount == null));
  }
  function rejectSemanticDuplicates(list) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) ensure(!duplicateEvents(list[i], list[j]), 'Semantic duplicate financing under different IDs.', { startup_id: list[i].startup_id, first_id: list[i].id, second_id: list[j].id });
  }
  const currentRounds = inputs.research.startups.flatMap(record => (record.funding_rounds || []).map(event => ({ ...event, startup_id: `startup:${startupSlug(record.name)}` })));
  await check('funding_semantics', 'existing IDs and semantic duplicates', () => {
    ensure(unique(events.map(event => event.id)), 'Research events reuse an ID.');
    for (const event of events) for (const previous of currentRounds) {
      if (event.id === previous.id) {
        ensure(event.startup_id === previous.startup_id, 'Existing event ID was assigned to another company.');
        ensure(stageKey(event) === stageKey(previous), 'An existing financing ID changed stage without a separate conflict review.', { id: event.id });
        for (const field of ['announced_on', 'amount', 'currency']) if (event[field] != null && previous[field] != null) ensure(event[field] === previous[field], 'An existing known financing value changed without a separate conflict review.', { id: event.id, field, previous: previous[field], proposed: event[field] });
      }
      ensure(!duplicateEvents(event, previous), 'Existing event must retain its ID.', { startup_id: event.startup_id, proposed_id: event.id, existing_id: previous.id });
    }
    rejectSemanticDuplicates(events);
    const combined = new Map(currentRounds.map(event => [event.id, event]));
    for (const record of records) for (const event of record.funding_rounds || []) combined.set(event.id, { ...event, startup_id: `startup:${startupSlug(record.name)}` });
    rejectSemanticDuplicates([...combined.values()]);
  });
  for (const event of events) await check('funding_semantics', event.id, () => {
    ensure(own(event, 'amount') && own(event, 'currency') && (event.amount === null) === (event.currency === null), 'Missing/null amount and currency do not agree.');
    if (event.amount !== null) ensure(Number.isSafeInteger(event.amount) && event.amount >= 0 && /^[A-Z]{3}$/.test(event.currency), 'Invalid normalized funding amount/currency.');
    dateWithPrecision(event.announced_on, event.date_precision, `${event.id}.announced_on`);
    dateWithPrecision(event.closed_on, event.closing_date_precision ?? event.closed_on_precision, `${event.id}.closed_on`);
    for (const observation of event.date_observations || []) { dateWithPrecision(observation.value, observation.precision, `${event.id}.date_observation`); requireSource(observation.source_url); }
    if (event.round_period) dateWithPrecision(event.round_period, event.round_period_precision, `${event.id}.round_period`);
    ensure(event.participant_list_complete === false && event.publication_state === 'unsubmitted', 'Funding history/participant completeness or publication inferred.');
    ensure(event.claim_ids?.length > 0 && event.claim_ids.every(id => { const claim = byClaim.get(id); return claim?.entity_id === event.startup_id && claim.field === 'funding_round' && claim.value?.id === event.id; }), 'Funding event lacks exact claim linkage.');
    for (const id of event.claim_ids) {
      const claim = byClaim.get(id);
      for (const field of ['stage', 'announced_on', 'date_precision', 'closed_on', 'closing_date_precision', 'amount', 'currency']) ensure(stable(event[field]) === stable(claim.value[field]), 'Event value or precision differs from its supporting claim.', { id: event.id, claim_id: id, field });
    }
    const record = byRecord.get(event.startup_id), projected = record?.funding_rounds?.find(round => round.id === event.id);
    if (byCompany.get(event.startup_id).review_disposition === 'accepted') {
      ensure(projected, 'Accepted event missing from staged projection.');
      if (event.amount === null) ensure(!own(projected, 'amount') && !own(projected, 'currency'), 'Unknown normalized money leaked into legacy fields.');
      else ensure(projected.amount === event.amount && projected.currency === event.currency, 'Projected funding amount/currency differs.');
      if (event.date_precision === 'day') ensure(projected.announced_on === event.announced_on, 'Projected announcement date differs.');
      else ensure(!own(projected, 'announced_on'), 'Partial/unknown announcement was padded into a legacy date.');
      ensure(!own(projected, 'closed_on'), 'Closing date leaked into unsupported legacy field.');
    }
  });
  const relationKey = item => stable([item.startup_id, item.event_id, item.investor_name_as_stated, item.role, item.source_url]);
  const expectedRelations = events.flatMap(event => event.participants.map(participant => ({ startup_id: event.startup_id, event_id: event.id, investor_name_as_stated: participant.name, role: participant.role, source_url: participant.source_url, participant })));
  await check('funding_relationships', 'complete exact participant joins', () => {
    ensure(relationshipsFile.canonical_investor_edges_created === 0, 'Canonical investor edges were inferred.');
    ensure(unique(relationships.map(relationKey)) && unique(expectedRelations.map(relationKey)) && sameSet(relationships.map(relationKey), expectedRelations.map(relationKey)), 'Participant and relationship sets differ or contain duplicates.');
  });
  for (const relationship of relationships) await check('funding_relationships', `${relationship.event_id}: ${relationship.investor_name_as_stated}`, () => {
    const event = eventByKey.get(`${relationship.startup_id}|${relationship.event_id}`);
    const participant = event?.participants.find(item => item.name === relationship.investor_name_as_stated && item.role === relationship.role && item.source_url === relationship.source_url);
    ensure(participant && relationship.investor_entity_id === null && participant.resolved_entity_id === null && relationship.production_edge_created === false, 'Missing participant or inferred canonical investor identity.');
    ensure(relationship.role_as_stated === participant.role_as_stated && sameSet(relationship.claim_ids, participant.claim_ids), 'Participant role/claim relationship differs.');
    ensure(relationship.claim_ids.length > 0 && relationship.claim_ids.some(id => byClaim.get(id)?.source_url === relationship.source_url), 'Investor relationship lacks a claim at its stated source.');
    for (const id of relationship.claim_ids) {
      const claim = byClaim.get(id);
      ensure(claim?.field === 'round_participant' && claim.entity_id === relationship.startup_id && claim.value?.event_id === relationship.event_id && claim.value?.name === relationship.investor_name_as_stated && claim.value?.role === relationship.role && claim.value?.resolved_entity_id === null, 'Investor association lacks an exact event-specific claim.', { claim_id: id });
      requireSource(claim.source_url);
    }
    requireSource(relationship.source_url);
  });

  for (const company of accepted) await check('null_and_precision', company.entity_id, () => {
    const record = byRecord.get(company.entity_id);
    if (company.founding === null) ensure(!own(record, 'founded_year'), 'Unknown founding year populated in projection.');
    else { dateWithPrecision(company.founding.value, company.founding.precision, `${company.entity_id}.founding`); ensure(record.founded_year === Number(company.founding.value.slice(0, 4)), 'Projected founding year differs.'); }
    for (const value of [record, ...(record.funding_rounds || []), ...(record.founders || []), ...(record.profile_facts || [])]) ensure(!Object.values(value).some(item => item === null), 'Null value entered the existing production schema.');
  });

  const populationDigest = digest(stable(coverage.population));
  function page(cursor, size) {
    ensure(cursor.population_sha256 === populationDigest, 'Stale coverage population digest.');
    ensure(Number.isInteger(cursor.next_index) && cursor.next_index >= 0 && cursor.next_index <= coverage.population.length, 'Invalid coverage cursor index.');
    if (own(cursor, 'next_key')) ensure(cursor.next_key === (coverage.population[cursor.next_index]?.key ?? null), 'Cursor next key differs from its position.');
    const items = coverage.population.slice(cursor.next_index, cursor.next_index + size);
    const next_index = cursor.next_index + items.length;
    return { items, cursor: { population_sha256: populationDigest, next_index, next_key: coverage.population[next_index]?.key ?? null } };
  }
  await check('coverage_resume', 'fixed population, counts and checkpoint', () => {
    ensure(coverage.population.length === 48 && unique(coverage.population.map(item => item.key)), 'Fixed 48-item population changed or contains duplicates.');
    ensure(coverage.population_sha256 === populationDigest && coverage.cursor.population_sha256 === populationDigest, 'Population digest mismatch.');
    ensure(coverage.national_startup_denominator === null && coverage.national_completeness_claim === false, 'Unsupported national completeness claim.');
    const expectedCounts = { discovered: coverage.population.length, reviewed: companies.length, accepted: accepted.length, held: companies.filter(item => item.review_disposition === 'held').length, rejected_companies: companies.filter(item => item.review_disposition === 'rejected').length, pending: ecosystem.candidate_next_companies.length, new_staged_identities: additions.length, existing_records_reviewed: companies.filter(item => byExisting.has(item.entity_id)).length, rejected_inferences: decisions.rejected_inferences.length, company_claims: claims.length, ecosystem_claims: ecosystem.ecosystem_claims.length, funding_events: events.length, event_participant_observations: relationships.length, published_records: 0 };
    ensure(stable(coverage.counts) === stable(expectedCounts), 'Reported coverage counts differ.', { expected: expectedCounts, reported: coverage.counts });
    ensure(coverage.cursor.next_index === companies.length && coverage.cursor.processed_prefix_count === companies.length, 'Review checkpoint differs from processed prefix.');
    ensure(stable(coverage.population.slice(0, companies.length).map(item => [item.key, item.name, item.state])) === stable(companies.map(item => [item.entity_id, item.name, item.review_disposition])), 'Reviewed prefix has gaps or reordering.');
    ensure(stable(coverage.population.slice(companies.length).map(item => [item.key, item.name, item.state])) === stable(ecosystem.candidate_next_companies.map(item => [item.candidate_id, item.candidate_name, 'pending'])), 'Continuation queue and remaining population differ.');
    ensure(sameSet(coverage.cursor.held_keys, companies.filter(item => item.review_disposition === 'held').map(item => item.entity_id)), 'Held-company requeue is incomplete.');
    page(coverage.cursor, 1);
    ensure(coverage.source_urls_attempted_unique === registry.length && coverage.source_urls_with_readable_evidence === registry.filter(source => source.accessed).length, 'Source coverage counts differ.');
    const statuses = {}; for (const source of registry) for (const observation of source.observations) statuses[observation.access_status] = (statuses[observation.access_status] || 0) + 1;
    ensure(stable(statuses) === stable(coverage.source_status_observations), 'Source status counts differ.');
  });
  for (let interruption = 0; interruption <= coverage.population.length; interruption++) await check('coverage_resume', `interrupt after ${interruption}`, () => {
    let cursor = { population_sha256: populationDigest, next_index: 0 }, seen = [];
    while (cursor.next_index < interruption) { const result = page(cursor, Math.min(7, interruption - cursor.next_index)); seen.push(...result.items.map(item => item.key)); cursor = result.cursor; }
    cursor = JSON.parse(JSON.stringify(cursor));
    while (cursor.next_index < coverage.population.length) { const result = page(cursor, 7); seen.push(...result.items.map(item => item.key)); cursor = result.cursor; }
    ensure(unique(seen) && stable(seen) === stable(coverage.population.map(item => item.key)), 'Interrupted replay skipped or duplicated candidates.');
  });
  await check('coverage_resume', 'stale cursor rejection', () => rejects(() => page({ ...coverage.cursor, population_sha256: '0'.repeat(64) }, 7)));

  const probeRecord = structuredClone(additions.find(record => record.funding_rounds?.some(event => own(event, 'amount'))));
  await check('negative_regressions', 'null amount rejected', () => { const record = structuredClone(probeRecord); record.funding_rounds.find(event => own(event, 'amount')).amount = null; return rejects(() => validateStartupRecord(record), 'VALIDATION_ERROR'); });
  await check('negative_regressions', 'currency omission rejected', () => { const record = structuredClone(probeRecord); delete record.funding_rounds.find(event => own(event, 'amount')).currency; return rejects(() => validateStartupRecord(record), 'VALIDATION_ERROR'); });
  await check('negative_regressions', 'stale revision rejected', () => rejects(() => prepareStartupEdit(current, { ...edits[0], expectedRecordRevision: '0'.repeat(64) }), 'RECORD_CONFLICT'));
  const canva = byExisting.get('startup:canva');
  const canvaEdit = { id: 'startup:canva', expectedRecordRevision: await recordRevision('startup:canva', canva) };
  await check('negative_regressions', 'source inheritance rejected', () => rejects(() => prepareStartupEdit(current, { ...canvaEdit, patch: { reviewed_at: manifest.reviewed_on, source: 'https://www.canva.com/ai-research/' } }), 'SOURCE_INHERITANCE'));
  await check('negative_regressions', 'shared Canva founder rejected', () => rejects(() => prepareStartupEdit(current, { ...canvaEdit, patch: { reviewed_at: manifest.reviewed_on, founders: [{ name: 'Melanie Perkins', source: 'https://www.canva.com/newsroom/news/canva-2025-wrap/' }] } }), 'IDENTITY_CONFLICT'));
  await check('negative_regressions', 'semantic duplicate rejected beyond production validator', async () => {
    const duplicate = { ...canva.funding_rounds[0], id: 'canva-synthetic-duplicate-probe' };
    const result = await prepareStartupEdit(current, { ...canvaEdit, patch: { reviewed_at: manifest.reviewed_on, funding_rounds: [duplicate] } });
    ensure(result.merged.funding_rounds.some(event => event.id === duplicate.id), 'Production-validator premise changed; review this probe.');
    await rejects(() => rejectSemanticDuplicates(result.merged.funding_rounds.map(event => ({ ...event, startup_id: 'startup:canva' }))));
  });

  const checksumFile = path.join(packetDir, 'CHECKSUMS.sha256');
  let checksumStatus = { status: 'not_present', files_checked: 0, excluded: ['CHECKSUMS.sha256', 'validation-report.json'] };
  if (fs.existsSync(checksumFile)) {
    await check('checksums', 'packet checksums and non-circular coverage', () => {
      const entries = fs.readFileSync(checksumFile, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
        const match = /^([a-f0-9]{64}) [ *](.+)$/.exec(line); ensure(match, 'Malformed checksum line.', { line });
        const filename = match[2].replace(/^\.\//, '');
        ensure(filename !== 'CHECKSUMS.sha256' && filename !== 'validation-report.json' && !path.isAbsolute(filename) && !filename.split('/').includes('..'), 'Circular or outside-packet checksum entry.', { filename });
        return { expected: match[1], filename };
      });
      ensure(unique(entries.map(entry => entry.filename)), 'Duplicate checksum paths.');
      const files = packetFiles().filter(name => !checksumStatus.excluded.includes(name));
      ensure(sameSet(entries.map(entry => entry.filename), files), 'Checksum inventory does not cover the packet.', { missing: files.filter(file => !entries.some(entry => entry.filename === file)), extra: entries.filter(entry => !files.includes(entry.filename)).map(entry => entry.filename) });
      for (const entry of entries) ensure(digest(fs.readFileSync(path.join(packetDir, entry.filename))) === entry.expected, 'Packet checksum mismatch.', { filename: entry.filename });
      checksumStatus = { ...checksumStatus, status: 'verified', files_checked: entries.length };
    });
    if (checksumStatus.status !== 'verified') checksumStatus.status = 'failed';
  }
  for (const file of guardedFiles) await check('production_immutability', file, () => ensure(hashFile(file) === initialHashes[file], 'Production/source file changed while validation ran.', { path: file }));
  return {
    validator: 'au-batch-001-offline-v1', base_revision: manifest.base_revision, packet: relative(packetDir),
    result: groups.every(group => group.failed === 0) ? 'pass' : 'fail',
    tests: { groups: groups.length, checks: groups.reduce((n, group) => n + group.checks, 0), passed: groups.reduce((n, group) => n + group.passed, 0), failed: groups.reduce((n, group) => n + group.failed, 0) },
    counts: { graph_entities_checked: graph.entities.length, authoritative_records_checked: byExisting.size, companies_reviewed: companies.length, companies_accepted: accepted.length, additions: additions.length, guarded_edits: edits.length, staged_records: records.length, company_claims: claims.length, ecosystem_claims: ecosystem.ecosystem_claims.length, source_urls: registry.length, funding_events: events.length, event_participants: relationships.length, fixed_population: coverage.population.length, interruption_checkpoints_replayed: coverage.population.length + 1 },
    groups, warnings, checksums: checksumStatus,
    limits: { evidence_truth: 'Offline checks verify recorded provenance and joins; they do not re-fetch or independently establish source truth.', conflicting_claims_retained: claims.filter(claim => claim.status === 'conflict').length, unreadable_source_urls: registry.filter(source => !source.accessed).length, inherited_fields: 'Guarded edits preserve inherited claims; this packet does not re-verify every inherited field.', semantic_deduplication: 'Exact identity/date/amount/currency and source/assertion-group checks; fuzzy event equivalence still needs review.', national_startup_denominator: null, production_writes: 0, network_requests: 0 },
  };
}

let report;
try { report = await main(); }
catch (error) { report = { validator: 'au-batch-001-offline-v1', result: 'fail', fatal: { message: error.message, ...(error.details ? { details: error.details } : {}) }, groups }; }
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes('--write-report')) fs.writeFileSync(path.join(packetDir, 'validation-report.json'), output);
process.stdout.write(output);
if (report.result !== 'pass') process.exitCode = 1;
