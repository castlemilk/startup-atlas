// SOURCE-ONLY acceptance oracle. Never import this module into an MCP runtime.
// It has no writer, byte/manifest parser, approval provider or storage adapter.
// Dependencies below are synthetic trusted-context fixtures, not caller claims.
import { createHash } from 'node:crypto';
import { readStartupRecord, recordRevision } from '../../backend/hosted/src/startup-edit.mjs';
import { startupSlug } from '../../backend/hosted/src/startup-record.mjs';

export const ATTACHMENT_CONTRACT_VERSION = 'atlas.record-attachment.v0';
const REPOSITORY = 'castlemilk/startup-atlas';
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const STARTUP_ID = /^startup:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUBJECT_ID = /^(?:startup|person):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const USES = Object.freeze(['public_repository', 'public_website']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const pointer = key => key.replaceAll('~', '~0').replaceAll('/', '~1');

function fail(code, path, message, action) {
  throw Object.assign(new Error(message), {code, details:{path, action}});
}
function shape(value, keys, path) {
  if (!plain(value)) fail('VALIDATION_ERROR', path, 'Expected a plain object.', 'Correct the source contract fixture.');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail('VALIDATION_ERROR', `${path}/${pointer(key)}`, 'Unsupported attachment contract field.', 'Do not add caller approval, paths, URLs or array indices.');
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail('VALIDATION_ERROR', `${path}/${key}`, 'Required attachment contract field is missing.', 'Supply the exact source or asset identity.');
  }
}
function text(value, path, pattern, max = 200) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max
      || /[\u0000-\u001f\u007f]/.test(value) || (pattern && !pattern.test(value))) {
    fail('VALIDATION_ERROR', path, 'Invalid exact identifier or revision.', 'Use the unmodified identifier from its authoritative read.');
  }
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function snapshot(value, path) {
  try { return freeze(structuredClone(value)); }
  catch { fail('INVALID_DATA', path, 'Fixture input could not be snapshotted.', 'Supply immutable JSON-compatible evidence.'); }
}
function checkIntent(intent) {
  shape(intent, ['contractVersion', 'target', 'asset'], '');
  if (intent.contractVersion !== ATTACHMENT_CONTRACT_VERSION) {
    fail('VALIDATION_ERROR', '/contractVersion', 'Unknown source contract version.', 'Use the reviewed source contract version.');
  }
  const {target, asset} = intent;
  shape(target, ['recordId', 'expectedRecordRevision', 'subjectId', 'role', 'locator'], '/target');
  text(target.recordId, '/target/recordId', STARTUP_ID);
  text(target.expectedRecordRevision, '/target/expectedRecordRevision', HEX64);
  text(target.subjectId, '/target/subjectId', SUBJECT_ID);
  if (!['logo', 'portrait'].includes(target.role)) {
    fail('VALIDATION_ERROR', '/target/role', 'Unsupported subject role.', 'Use the reviewed logo or portrait binding.');
  }
  const founder = target.role === 'portrait';
  shape(target.locator, founder ? ['kind', 'name'] : ['kind'], '/target/locator');
  if (target.locator.kind !== (founder ? 'founder' : 'startup')) {
    fail('IDENTITY_CONFLICT', '/target/locator/kind', 'The nested target does not match the asset role.', 'Resolve company logos and founder portraits separately.');
  }
  if (founder) text(target.locator.name, '/target/locator/name');
  shape(asset, ['repository', 'commit', 'assetId', 'manifestRevision'], '/asset');
  if (asset.repository !== REPOSITORY) {
    fail('VALIDATION_ERROR', '/asset/repository', 'Asset repository differs from the agreed source repository.', 'Keep the existing repository boundary.');
  }
  text(asset.commit, '/asset/commit', HEX40);
  text(asset.assetId, '/asset/assetId', /^asset:sha256:[a-f0-9]{64}$/);
  text(asset.manifestRevision, '/asset/manifestRevision', /^sha256:[a-f0-9]{64}$/);
}

// This fixed scalar sequence hashes only the attachment intent. It is NOT the
// asset owner's manifest serializer and never hashes private/public manifests.
export function attachmentIntentDigest(intent) {
  checkIntent(intent);
  const {target:t, asset:a} = intent;
  const tuple = [intent.contractVersion, t.recordId, t.expectedRecordRevision,
    t.subjectId, t.role, t.locator.kind, t.locator.name ?? null,
    a.repository, a.commit, a.assetId, a.manifestRevision];
  return createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex');
}

function checkContext(context) {
  if (!plain(context) || !['hosted', 'local'].includes(context.mode)
      || !plain(context.graph) || !Array.isArray(context.graph.entities)
      || !Array.isArray(context.graph.edges)) {
    fail('INVALID_DATA', '/context', 'A pinned source and graph context is required.', 'Read the authoritative source snapshot before evaluating the contract.');
  }
  if (context.graph.entities.some(entity => !plain(entity) || typeof entity.id !== 'string')
      || context.graph.edges.some(edge => !plain(edge) || !['from', 'to', 'kind'].every(key => typeof edge[key] === 'string'))) {
    fail('INVALID_DATA', '/context/graph', 'Malformed graph identity evidence.', 'Repair or re-read the complete pinned graph.');
  }
  if (!Number.isFinite(instant(context.now))) {
    fail('INVALID_DATA', '/context/now', 'The evaluation time is not a valid UTC instant.', 'Supply the trusted evaluation time.');
  }
  const pattern = context.mode === 'hosted' ? HEX40 : HEX64;
  text(context.head, '/context/head', pattern);
  text(context.expectedRevision, '/context/expectedRevision', pattern);
  if (context.head !== context.expectedRevision) {
    fail('STALE_REVISION', '/context/expectedRevision', 'The source snapshot changed.', 'Re-read and reconcile the source; do not replace only the revision token.');
  }
}
function identityFailure(path, message) {
  fail('IDENTITY_CONFLICT', path, message, 'Resolve the person or company identity in a separate reviewed migration.');
}
function graphIdentity(graph, id, name, kind, path) {
  const matches = graph.entities.filter(entity => entity.id === id);
  if (matches.length > 1 || matches.some(entity => entity.name !== name || entity.kind !== kind)) {
    identityFailure(path, 'The graph and authoritative source disagree on identity.');
  }
}
function resolveTarget(context, intent, record) {
  const {target} = intent;
  graphIdentity(context.graph, target.recordId, record.name, 'startup', '/target/recordId');
  if (target.role === 'logo') {
    if (target.subjectId !== target.recordId) identityFailure('/target/subjectId', 'A startup logo must name that exact startup subject.');
    return {recordId:target.recordId, subjectId:target.subjectId, role:'logo', recordPointer:'/logo'};
  }
  const founders = record.founders ?? [];
  if (!Array.isArray(founders)) fail('INVALID_DATA', '/source/founders', 'Malformed founder source.', 'Repair the authoritative source before attachment.');
  const seen = new Set();
  for (const founder of founders) {
    if (!plain(founder) || typeof founder.name !== 'string') {
      fail('INVALID_DATA', '/source/founders', 'A founder has no exact name.', 'Repair the authoritative founder source.');
    }
    const slug = startupSlug(founder.name);
    if (!slug || seen.has(slug)) identityFailure('/target/locator/name', 'Founder names collide under the existing canonical person identity.');
    seen.add(slug);
  }
  const index = founders.findIndex(founder => founder.name === target.locator.name);
  if (index < 0) identityFailure('/target/locator/name', 'No exact existing founder has this name; attachment cannot create an association.');
  const personId = `person:${startupSlug(founders[index].name)}`;
  if (target.subjectId !== personId) identityFailure('/target/subjectId', 'The person subject differs from the exact nested founder.');
  graphIdentity(context.graph, personId, founders[index].name, 'person', '/target/subjectId');
  for (const other of context.research.startups) {
    if (`startup:${startupSlug(other.name)}` === target.recordId) continue;
    if (other.founders !== undefined && !Array.isArray(other.founders)) {
      fail('INVALID_DATA', '/source/founders', 'A related founder source is malformed.', 'Repair source identity data before attachment.');
    }
    for (const founder of other.founders ?? []) {
      if (!plain(founder) || typeof founder.name !== 'string') {
        fail('INVALID_DATA', '/source/founders', 'A related founder has no exact name.', 'Repair source identity data before attachment.');
      }
      if (`person:${startupSlug(founder.name)}` === personId) {
        identityFailure('/target/subjectId', 'This founder is shared with another startup or collides with its person identity.');
      }
    }
  }
  if (context.graph.edges.some(edge => edge.from === personId && edge.kind === 'founded' && edge.to !== target.recordId)) {
    identityFailure('/target/subjectId', 'A graph-only founded edge makes this shared person metadata.');
  }
  return {recordId:target.recordId, subjectId:personId, role:'portrait', founderName:founders[index].name,
    recordPointer:`/founders/${index}/photo_url`};
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN;
  const result = Date.parse(value);
  return Number.isFinite(result) && new Date(result).toISOString() === value ? result : NaN;
}

/** Evaluate synthetic source obligations. No result grants permission to write. */
export async function evaluateAttachmentContract(input, sourceContext, dependencies = {}) {
  // Snapshot before recordRevision/any dependency can yield to another writer.
  const intent = snapshot(input, '/intent');
  const context = snapshot(sourceContext, '/context');
  if (!plain(dependencies)) {
    fail('INVALID_DATA', '/dependencies', 'Expected a trusted dependency context object.', 'Supply the separately verified asset and approval resolvers as test dependencies.');
  }
  const {resolveAsset, verifyApproval} = dependencies;
  const intentDigest = attachmentIntentDigest(intent);
  checkContext(context);
  const {record} = readStartupRecord(context.research, intent.target.recordId);
  const currentRecordRevision = await recordRevision(intent.target.recordId, record);
  if (currentRecordRevision !== intent.target.expectedRecordRevision) {
    fail('RECORD_CONFLICT', '/target/expectedRecordRevision', 'The whole startup record changed.', 'Re-read every inherited field and founder, reconcile the intended attachment and validate again.');
  }
  const resolvedTarget = resolveTarget(context, intent, record);
  const binding = freeze({...intent.asset, subjectId:intent.target.subjectId, role:intent.target.role});
  if (typeof resolveAsset !== 'function') {
    fail('ASSET_RESOLUTION_REQUIRED', '/asset', 'No verified asset resolver is available.', 'Wait for the separately reviewed asset adapter; caller claims cannot resolve bytes.');
  }
  let asset;
  try { asset = snapshot(await resolveAsset(binding), '/assetEvidence'); }
  catch (error) {
    if (error?.code === 'INVALID_DATA') throw error;
    fail('ASSET_RESOLUTION_REQUIRED', '/asset', 'Asset resolution is unavailable or uncertain.', 'Read the exact commit and both digests; do not substitute a moving ref.');
  }
  if (!plain(asset) || asset.verified !== true) {
    fail('ASSET_RESOLUTION_REQUIRED', '/asset', 'The asset owner has not verified this reference.', 'Obtain verified exact-commit byte and manifest evidence.');
  }
  for (const [key, expected] of Object.entries(binding)) {
    if (asset[key] !== expected) {
      fail('ASSET_CONFLICT', `/assetEvidence/${key}`, 'Resolved asset evidence does not match the complete attachment binding.', 'Reconcile the exact commit, content, manifest, subject and role; never silently substitute one.');
    }
  }
  if (typeof verifyApproval !== 'function') {
    fail('APPROVAL_REQUIRED', '/approval', 'Authenticated approval verification is unavailable.', 'Agree and implement the existing-authority review prerequisite before any public Git write.');
  }
  const approvalRequest = freeze({intentDigest, binding, target:intent.target, uses:USES});
  let approval;
  try { approval = snapshot(await verifyApproval(approvalRequest), '/approval'); }
  catch (error) {
    if (error?.code === 'INVALID_DATA') throw error;
    fail('APPROVAL_REQUIRED', '/approval', 'Approval verification is unavailable or uncertain.', 'Hold public writes until the authenticated decision can be verified.');
  }
  if (!plain(approval) || approval.verified !== true || approval.authorization !== 'authenticated'
      || approval.status !== 'approved' || !['principal', 'policyRevision', 'decisionId'].every(key => typeof approval[key] === 'string' && approval[key].trim())) {
    fail('APPROVAL_REQUIRED', '/approval', 'Caller attestations or unknown review authority do not satisfy the approval prerequisite.', 'Require a trusted decision for the exact intended public uses.');
  }
  if (approval.intentDigest !== intentDigest || !Array.isArray(approval.uses)
      || approval.uses.length !== USES.length || !USES.every(use => approval.uses.includes(use))) {
    fail('APPROVAL_CONFLICT', '/approval', 'Approval applies to a different intent or public use.', 'Obtain a decision bound to this exact target, record, asset commit and manifest.');
  }
  const now = instant(context.now), notBefore = instant(approval.notBefore), expiresAt = instant(approval.expiresAt);
  if (approval.revoked !== false || !Number.isFinite(notBefore) || !Number.isFinite(expiresAt)
      || notBefore > now || expiresAt <= now) {
    fail('APPROVAL_INACTIVE', '/approval', 'The decision is expired, revoked, not active or has unknown validity.', 'Hold public writes and obtain a current authenticated review decision.');
  }
  // Return no approval identity/evidence or manifest content. Even a positive
  // fixture is explicitly blocked from runtime use and public mutation.
  return {contractVersion:ATTACHMENT_CONTRACT_VERSION, conditionStatus:'fixture_satisfied',
    sourceOnly:true, runtimeSupported:false, writePermitted:false, published:false,
    intentDigest, recordRevision:currentRecordRevision, snapshotRevision:context.head,
    resolvedTarget, asset:{...intent.asset}};
}
