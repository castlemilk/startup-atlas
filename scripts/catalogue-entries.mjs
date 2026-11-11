// Shared by the offline generator and MCP. No network or third-party dependencies.
const text = (maxLength = 4000) => ({ type: 'string', minLength: 1, maxLength });
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const url = { type: 'string', format: 'uri', maxLength: 2048 };
export const opportunitySchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'name', 'org', 'kind', 'access', 'scope', 'value', 'summary', 'eligibility', 'limits', 'url', 'status', 'checked', 'extra', 'facts'],
  properties: {
    id: { ...text(100), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
    name: text(200), org: text(200), kind: text(100), access: text(100),
    scope: { type: 'array', minItems: 1, maxItems: 250, uniqueItems: true, items: { type: 'string', pattern: '^(?:[A-Z]{2}|WORLD|UNKNOWN)$' } },
    value: text(500), summary: text(2000), eligibility: text(), limits: text(),
    url, status: text(200), checked: date,
    extra: { type: 'array', maxItems: 20, uniqueItems: true, items: url },
    facts: { type: 'object', maxProperties: 20, additionalProperties: text(1000) },
  },
};
export const provenanceSchema = {
  type: 'object', additionalProperties: false,
  required: ['sourceUrls', 'reviewedOn', 'evidence'],
  properties: {
    sourceUrls: { type: 'array', minItems: 1, maxItems: 21, uniqueItems: true, items: url },
    reviewedOn: date,
    evidence: { ...text(4000), description: 'Public, source-backed evidence for this entry, including geographic eligibility and material restrictions. Do not include private application details.' },
  },
};

export class EntryError extends Error {
  constructor(code, message) { super(message); this.name = 'EntryError'; this.code = code; }
}
const fail = message => { throw new EntryError('VALIDATION_ERROR', message); };
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
};
function exactKeys(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}.${key} is not supported`);
}
function string(value, label, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail(`${label} must be nonempty, trimmed text of at most ${max} characters without control characters`);
  }
}
export function validDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(`${label} must be a real calendar date`);
}
export function publicHttps(value, label) {
  string(value, label, 2048);
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${label} must be a public HTTPS URL`); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      (parsed.port && parsed.port !== '443') || !host.includes('.') || host.endsWith('.') ||
      /^[\d.]+$/.test(host) || host.startsWith('[') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) {
    fail(`${label} must be a public HTTPS hostname without credentials or a nonstandard port`);
  }
  return parsed.href;
}
function uniqueStrings(values, label, min, max, validate) {
  if (!Array.isArray(values) || values.length < min || values.length > max) fail(`${label} must contain ${min}–${max} items`);
  const seen = new Set();
  for (const value of values) {
    const normalized = validate(value, label) ?? value;
    if (seen.has(normalized)) fail(`${label} contains duplicates`);
    seen.add(normalized);
  }
}
export function validateOpportunity(entry) {
  exactKeys(entry, opportunitySchema.required, 'entry');
  for (const key of opportunitySchema.required) if (!(key in entry)) fail(`entry.${key} is required`);
  for (const key of ['id', 'name', 'org', 'kind', 'access', 'value', 'summary', 'eligibility', 'limits', 'status']) {
    string(entry[key], `entry.${key}`, opportunitySchema.properties[key].maxLength);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) fail('entry.id must be a lowercase ASCII slug');
  uniqueStrings(entry.scope, 'entry.scope', 1, 250, value => {
    if (typeof value !== 'string' || !/^(?:[A-Z]{2}|WORLD|UNKNOWN)$/.test(value)) fail('scope needs two-letter country codes, WORLD or UNKNOWN');
  });
  if (entry.scope.length > 1 && entry.scope.some(x => ['WORLD', 'UNKNOWN'].includes(x))) fail('WORLD and UNKNOWN must stand alone');
  publicHttps(entry.url, 'entry.url');
  uniqueStrings(entry.extra, 'entry.extra', 0, 20, publicHttps);
  if (entry.extra.some(link => publicHttps(link, 'entry.extra') === publicHttps(entry.url, 'entry.url'))) fail('extra sources must not repeat the primary URL');
  validDate(entry.checked, 'entry.checked');
  object(entry.facts, 'entry.facts');
  if (Object.keys(entry.facts).length > 20) fail('entry.facts has too many fields');
  for (const [key, value] of Object.entries(entry.facts)) {
    string(key, 'fact label', 100); string(value, `facts.${key}`, 1000);
    if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Unsafe fact label');
  }
  return entry;
}
export function validateProvenance(provenance, entry) {
  exactKeys(provenance, provenanceSchema.required, 'provenance');
  validDate(provenance.reviewedOn, 'provenance.reviewedOn');
  if (provenance.reviewedOn !== entry.checked) fail('provenance.reviewedOn must equal entry.checked');
  string(provenance.evidence, 'provenance.evidence');
  uniqueStrings(provenance.sourceUrls, 'provenance.sourceUrls', 1, 21, publicHttps);
  const cited = new Set(provenance.sourceUrls.map(link => publicHttps(link, 'provenance.sourceUrls')));
  const displayed = new Set([entry.url, ...entry.extra].map(link => publicHttps(link, 'entry sources')));
  if (cited.size !== displayed.size || [...displayed].some(link => !cited.has(link))) fail('Provenance source URLs must exactly match primary and extra entry sources');
  return provenance;
}
export function parseAdditions(document) {
  exactKeys(document, ['schemaVersion', 'entries'], 'additions');
  if (document.schemaVersion !== 1 || !Array.isArray(document.entries)) fail('Unsupported additions document; expected schemaVersion 1 and entries array');
  const ids = new Set();
  for (const record of document.entries) {
    exactKeys(record, ['entry', 'provenance', 'addedAt'], 'addition');
    validateOpportunity(record.entry); validateProvenance(record.provenance, record.entry);
    if (typeof record.addedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.addedAt) || new Date(record.addedAt).toISOString() !== record.addedAt) fail('addition.addedAt must be an ISO UTC timestamp');
    if (ids.has(record.entry.id)) fail(`Duplicate addition ID: ${record.entry.id}`);
    ids.add(record.entry.id);
  }
  return document;
}
export function mergeAdditions(catalogue, additions) {
  parseAdditions(additions);
  const ids = new Set(catalogue.opportunities.map(item => item.id));
  for (const { entry } of additions.entries) {
    if (ids.has(entry.id)) fail(`Addition ID ${entry.id} already exists in curated research; resolve it explicitly rather than overwriting either version`);
    ids.add(entry.id);
  }
  // Preserve the original research snapshot date; each entry has its own checked date.
  return { ...catalogue, opportunities: [...catalogue.opportunities, ...additions.entries.map(record => record.entry)] };
}
