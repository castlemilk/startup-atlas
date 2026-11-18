import { applyStartupEdit, recordRevision } from '../../backend/hosted/src/startup-edit.mjs';
import { startupSlug } from '../../backend/hosted/src/startup-record.mjs';

const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const gitRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function sameJSON(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((item, index) => sameJSON(item, right[index]));
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameJSON(left[key], right[key]));
}

export function envelopeError(message) {
  return Object.assign(new Error(message), { code: 'READBACK_MISMATCH' });
}

export async function checkSourceRead(input, id) {
  const value = structuredClone(input);
  if (!object(value) || value.id !== id || value.origin !== 'repository' ||
      value.sourceFile !== 'data/startup-research.json' || value.schemaVersion !== 'startup-edit-v1' ||
      value.published !== false || !gitRevision(value.revision) || !digest(value.recordRevision) ||
      !object(value.record) || typeof value.record.name !== 'string' || `startup:${startupSlug(value.record.name)}` !== id) {
    throw envelopeError('The source response does not match this hosted record context.');
  }
  if (await recordRevision(id, value.record) !== value.recordRevision) {
    throw envelopeError('The source record contents do not match their supplied digest.');
  }
  return value;
}

export function previewMatchesSource(preview, source) {
  return Boolean(preview && source && preview.id === source.id && preview.revision === source.revision &&
    preview.recordRevision === source.recordRevision && sameJSON(preview.previous, source.record));
}

export async function checkPreview(input, sourceInput, candidate) {
  const value = structuredClone(input), source = structuredClone(sourceInput), intent = structuredClone(candidate);
  if (!object(value) || value.id !== source.id || value.recordRevision !== source.recordRevision ||
      value.revision !== source.revision || value.schemaVersion !== source.schemaVersion ||
      value.persisted !== false || value.published !== false || !digest(value.nextRecordRevision) ||
      !digest(value.intentDigest) || !digest(value.validationToken) || !object(value.previous) ||
      !object(value.merged) || !sameJSON(value.previous, source.record) ||
      !Array.isArray(value.changedPaths) || !Array.isArray(value.warnings)) {
    throw envelopeError('The preview is not bound to the selected source record and revision.');
  }
  // Reuse the canonical pure edit function so a correct intent label cannot be
  // paired with a different edit's internally consistent resulting record.
  const expected = await applyStartupEdit({startups:[source.record]}, intent);
  if (expected.id !== value.id || expected.intentDigest !== value.intentDigest || expected.branch !== value.branch ||
      intent.expectedRecordRevision !== source.recordRevision || expected.nextRecordRevision !== value.nextRecordRevision ||
      !sameJSON(expected.merged, value.merged) || !sameJSON(expected.changedPaths, value.changedPaths) || !sameJSON(expected.warnings, value.warnings)) {
    throw envelopeError('The preview does not match the exact intended edit and resulting record digest.');
  }
  return value;
}

export async function checkProposal(input, previewInput) {
  const value = structuredClone(input), preview = structuredClone(previewInput);
  if (value?.status === 'already_present') {
    const receipt = await checkSourceRead(value, preview.id);
    if (receipt.intentDigest !== preview.intentDigest || receipt.branch !== preview.branch ||
        receipt.recordRevision !== preview.nextRecordRevision || !sameJSON(receipt.record, preview.merged)) {
      throw envelopeError('The already-present receipt does not match the reviewed result and intent.');
    }
    return receipt;
  }
  if (!object(value) || !['proposed', 'closed', 'merged'].includes(value.status) ||
      value.id !== preview.id || value.origin !== 'proposal' || value.published !== false ||
      value.recordRevision !== preview.nextRecordRevision || value.intentDigest !== preview.intentDigest ||
      value.branch !== preview.branch || !gitRevision(value.baseRevision) ||
      !gitRevision(value.headRevision) || value.revision !== value.headRevision ||
      !sameJSON(value.record, preview.merged)) {
    throw envelopeError('The proposal receipt does not match the reviewed intent and exact head.');
  }
  return value;
}

export async function compareMain(input, previewInput) {
  const preview = structuredClone(previewInput);
  const value = await checkSourceRead(input, preview.id);
  return { status: value.recordRevision === preview.nextRecordRevision && sameJSON(value.record, preview.merged) ? 'matching' : 'mismatch', value };
}

export function describePublication(input, id, independentMainRevision = null) {
  const value = structuredClone(input);
  if (!object(value) || value.startup?.id !== id ||
      !['current', 'pending_publication', 'unknown'].includes(value.indexStatus)) {
    throw envelopeError('The published projection does not identify the selected entity and index state.');
  }
  if (value.indexStatus === 'current' && (!gitRevision(value.revision) || value.revision !== value.mainRevision)) {
    throw envelopeError('The current-index label is inconsistent with the supplied revisions.');
  }
  if (value.indexStatus === 'pending_publication' &&
      (!gitRevision(value.revision) || !gitRevision(value.mainRevision) || value.revision === value.mainRevision)) {
    throw envelopeError('The publication-lag label is inconsistent with the supplied revisions.');
  }
  const disagrees = gitRevision(independentMainRevision) && gitRevision(value.mainRevision) && value.mainRevision !== independentMainRevision;
  return { status: disagrees ? 'context_mismatch' : value.indexStatus, value,
    comparedMainRevision: independentMainRevision };
}

export const errorMessages = Object.freeze({
  RECORD_CONFLICT: ['Record changed', 'Keep the reviewed intent. Read the current source, reconcile the difference, then validate again.'],
  STALE_REVISION: ['Source revision changed', 'Read the current source and review the same intent again. Replacing only the revision is insufficient.'],
  VALIDATION_CONFLICT: ['Preview changed', 'Revalidate the complete intended edit before another proposal.'],
  SOURCE_INHERITANCE: ['Source attribution needs review', 'Review the affected inherited claims. Do not attach them silently to a different source.'],
  IDENTITY_CONFLICT: ['Identity review required', 'The record owner must resolve the identity before this edit can continue.'],
  AMBIGUOUS_ID: ['Identity is ambiguous', 'Keep the canonical ID visible and ask the record owner to resolve the collision.'],
  WRITE_UNCERTAIN: ['Proposal outcome uncertain', 'Retain this exact intent. Inspect the proposal through read-only recovery; do not submit again automatically.'],
  BRANCH_CONFLICT: ['Proposal needs inspection', 'Keep the original intent and inspect the existing branch. Do not force-update or create a replacement.'],
  NOT_FOUND: ['Source record unavailable', 'A published entity can exist without an editable source record. Keep its published evidence readable.'],
  INDEX_UNAVAILABLE: ['Published data unavailable', 'Retain earlier evidence with its original revision. A failed read is not an empty result.'],
  STALE_CURSOR: ['Search snapshot changed', 'The search owner must restart this query against a fresh snapshot.'],
  READBACK_MISMATCH: ['Readback needs review', 'The supplied response does not establish this reviewed result. Preserve the intent and inspect the mismatch.'],
  INTERRUPTED: ['Read interrupted', 'Retry this read explicitly when ready. No request is replayed automatically.'],
});

export function explainError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'UNAVAILABLE';
  const [title, action] = errorMessages[code] || ['Read unavailable', 'Keep the existing evidence and retry this read explicitly.'];
  return { code, title, action, message: typeof error?.message === 'string' ? error.message : title };
}

export function claimValue(claim) {
  if (claim.knowledge === 'unknown' || !Object.hasOwn(claim, 'value') || claim.value === null) return 'Not recorded';
  if (claim.value === '') return 'Recorded empty value';
  return String(claim.value);
}

export function freshSession() {
  return { source: null, claimKey: null, preview: null, proposal: null, main: null, publication: null,
    busy: null, error: null, uncertain: false, recoveryNotFound: false, previewValid: false, stage: 'entity' };
}
