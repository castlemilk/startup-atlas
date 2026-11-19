// Offline evidence contract. This module never authenticates, fetches, or writes.
import { createHash } from 'node:crypto';

export const SCHEMA_VERSION = 'atlas-capability-manifest/v1';
export const DIGEST_ALGORITHM = 'atlas-json-sorted-keys-v1';
export const FACETS = Object.freeze(['implemented_in_source', 'merged', 'deployed', 'discovered', 'authorized', 'verified_read', 'verified_write']);
export const REPOSITORY = 'castlemilk/startup-atlas';
const liveFacets = new Set(FACETS.slice(2));
const statuses = ['confirmed', 'unknown', 'unavailable', 'not_applicable'];
const kinds = ['source_inspection', 'repository_merge', 'deployment_receipt', 'tools_list', 'connector_registry', 'authorization_receipt', 'read_receipt', 'write_receipt', 'diagnostic_failure', 'source_test', 'synthetic'];
const sha = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const toolName = /^atlas_[a-z][a-z0-9_]*$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const pointer = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const issue = (code, path, message) => ({ code, path, message });
const equal = (a, b) => a === undefined || b === undefined ? a === b : canonical(a) === canonical(b);
const projectStrings = (value, keys) => plain(value) ? Object.fromEntries(keys.map(key => [key, typeof value[key] === 'string' ? value[key] : null])) : null;
const time = value => {
  if (typeof value !== 'string' || !timestamp.test(value)) return null;
  const n = Date.parse(value);
  if (!Number.isFinite(n)) return null;
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(n).toISOString() === canonical ? n : null;
};

export class ContractError extends Error {
  constructor(code, path, message) { super(message); this.name = 'ContractError'; this.code = code; this.path = path; }
}

function canonical(value, path = '', depth = 0) {
  if (depth > 64) throw new ContractError('JSON_DEPTH_EXCEEDED', path, 'JSON exceeds 64 nesting levels.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value).filter(key => key !== 'length');
    if (keys.length !== value.length || keys.some((key, i) => key !== String(i))) throw new ContractError('INVALID_JSON_VALUE', path, 'Arrays must be dense JSON arrays without extra properties.');
    const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(value, key));
    if (descriptors.some(item => !item.enumerable || !Object.hasOwn(item, 'value'))) throw new ContractError('INVALID_JSON_VALUE', path, 'Array elements must be enumerable JSON data properties.');
    return '[' + descriptors.map((item, i) => canonical(item.value, `${path}/${i}`, depth + 1)).join(',') + ']';
  }
  if (plain(value)) {
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || !Object.getOwnPropertyDescriptor(value, key).enumerable || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
      throw new ContractError('INVALID_JSON_VALUE', path, 'Only plain JSON data properties are accepted.');
    }
    return '{' + keys.sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], `${path}/${pointer(key)}`, depth + 1)).join(',') + '}';
  }
  throw new ContractError('INVALID_JSON_VALUE', path, 'Only finite JSON values are accepted; negative zero and unsafe integers are rejected.');
}

export function digestJson(value) {
  return 'sha256:' + createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

export function digestCatalogue(tools) {
  canonical(tools, '/tools');
  if (!Array.isArray(tools) || tools.length > 1000) throw new ContractError('INVALID_CATALOGUE', '/tools', 'Expected an array of at most 1,000 complete tool definitions.');
  const seen = new Set();
  for (const [i, tool] of tools.entries()) {
    if (!plain(tool) || typeof tool.name !== 'string' || !toolName.test(tool.name) || !plain(tool.inputSchema)) throw new ContractError('INVALID_TOOL', `/tools/${i}`, 'Each tool needs an Atlas name and an inputSchema object.');
    if (seen.has(tool.name)) throw new ContractError('DUPLICATE_TOOL', `/tools/${i}/name`, 'Tool names must be unique.');
    seen.add(tool.name);
    canonical(tool, `/tools/${i}`);
  }
  const ordered = [...tools].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const schemas = ordered.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema, ...(Object.hasOwn(tool, 'outputSchema') ? { outputSchema: tool.outputSchema } : {}) }));
  return {
    digestAlgorithm: DIGEST_ALGORITHM,
    toolsDigest: digestJson(ordered),
    schemaDigest: digestJson(schemas),
    tools: ordered.map((tool, i) => ({ name: tool.name, toolDigest: digestJson(tool), schemaDigest: digestJson(schemas[i]) })),
  };
}

export function compareCatalogues(expected, observed) {
  const left = digestCatalogue(expected), right = digestCatalogue(observed);
  const a = new Map(left.tools.map(tool => [tool.name, tool])), b = new Map(right.tools.map(tool => [tool.name, tool]));
  const removed = [...a.keys()].filter(name => !b.has(name));
  const added = [...b.keys()].filter(name => !a.has(name));
  const changed = [...a.keys()].filter(name => b.has(name)).flatMap(name => {
    const codes = [];
    if (a.get(name).schemaDigest !== b.get(name).schemaDigest) codes.push('SCHEMA_DIGEST_MISMATCH');
    if (a.get(name).toolDigest !== b.get(name).toolDigest) codes.push('TOOL_DIGEST_MISMATCH');
    return codes.length ? [{ name, codes }] : [];
  });
  return { digestAlgorithm: DIGEST_ALGORITHM, matching: !removed.length && !added.length && !changed.length, expected: left, observed: right, added, removed, changed };
}

function shape(value, keys, path, errors) {
  if (!plain(value)) { errors.push(issue('INVALID_OBJECT', path, 'Expected a plain object.')); return false; }
  for (const key of keys) if (!Object.hasOwn(value, key)) errors.push(issue('MISSING_FIELD', `${path}/${pointer(key)}`, 'Required field is missing.'));
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(issue('UNKNOWN_FIELD', `${path}/${pointer(key)}`, 'Unknown fields are not accepted in v1.'));
  return true;
}
function text(value, path, errors, { nullable = false, pattern, values } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || (pattern && !pattern.test(value)) || (values && !values.includes(value))) errors.push(issue('INVALID_VALUE', path, 'Expected a supported, nonempty exact value.'));
}
function stamp(value, path, errors) { if (time(value) === null) errors.push(issue('INVALID_TIMESTAMP', path, 'Expected a real UTC timestamp with seconds and optional three millisecond digits.')); }
function revision(value, path, errors, nullable = true) {
  if (nullable && value === null) return;
  if (!shape(value, ['kind', 'value'], path, errors)) return;
  text(value.kind, `${path}/kind`, errors, { values: ['git_sha', 'sha256'] });
  text(value.value, `${path}/value`, errors, { pattern: value.kind === 'git_sha' ? sha : /^[a-f0-9]{64}$/ });
}
function exact(actual, expected, path, errors) {
  if (!equal(actual, expected)) errors.push(issue('EVIDENCE_BINDING_MISMATCH', path, 'Evidence is bound to a different target or revision.'));
}
function nonnull(value, path, errors) {
  if (value === null || value === undefined) errors.push(issue('EVIDENCE_BINDING_REQUIRED', path, 'Confirmed evidence requires this exact binding.'));
}

export function validateManifest(manifest) {
  const errors = [];
  try { canonical(manifest); } catch (error) { return [issue(error.code || 'INVALID_JSON_VALUE', error.path || '', error.message)]; }
  if (!shape(manifest, ['schemaVersion', 'digestAlgorithm', 'repository', 'generatedAt', 'evidenceMode', 'capabilities'], '', errors)) return errors;
  text(manifest.schemaVersion, '/schemaVersion', errors, { values: [SCHEMA_VERSION] });
  text(manifest.digestAlgorithm, '/digestAlgorithm', errors, { values: [DIGEST_ALGORITHM] });
  text(manifest.repository, '/repository', errors, { values: [REPOSITORY] });
  text(manifest.evidenceMode, '/evidenceMode', errors, { values: ['observed', 'synthetic'] });
  stamp(manifest.generatedAt, '/generatedAt', errors);
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length > 1000) { errors.push(issue('INVALID_CAPABILITIES', '/capabilities', 'Expected at most 1,000 capability rows.')); return errors; }
  const identities = new Set();
  for (const [i, cap] of manifest.capabilities.entries()) {
    const p = `/capabilities/${i}`;
    if (!shape(cap, ['transport', 'tool', 'operation', 'principal', 'source', 'runtime', 'dataRevision', 'facets'], p, errors)) continue;
    text(cap.transport, `${p}/transport`, errors, { values: ['hosted_mcp', 'local_stdio'] });
    text(cap.tool, `${p}/tool`, errors, { pattern: toolName });
    text(cap.operation, `${p}/operation`, errors, { values: ['read', 'write'] });
    text(cap.principal, `${p}/principal`, errors, { nullable: true });
    const id = JSON.stringify([cap.transport, cap.tool, cap.runtime?.id ?? null, cap.principal]);
    if (identities.has(id)) errors.push(issue('DUPLICATE_CAPABILITY', p, 'Capability identity is duplicated.'));
    identities.add(id);
    if (shape(cap.source, ['revision', 'toolDigest', 'schemaDigest'], `${p}/source`, errors)) {
      text(cap.source.revision, `${p}/source/revision`, errors, { nullable: true, pattern: sha });
      for (const key of ['toolDigest', 'schemaDigest']) text(cap.source[key], `${p}/source/${key}`, errors, { nullable: true, pattern: digest });
    }
    if (shape(cap.runtime, ['id', 'revision', 'sourceRevision', 'toolDigest', 'schemaDigest'], `${p}/runtime`, errors)) {
      for (const key of ['id', 'revision']) text(cap.runtime[key], `${p}/runtime/${key}`, errors, { nullable: true });
      text(cap.runtime.sourceRevision, `${p}/runtime/sourceRevision`, errors, { nullable: true, pattern: sha });
      for (const key of ['toolDigest', 'schemaDigest']) text(cap.runtime[key], `${p}/runtime/${key}`, errors, { nullable: true, pattern: digest });
    }
    revision(cap.dataRevision, `${p}/dataRevision`, errors);
    if (!shape(cap.facets, FACETS, `${p}/facets`, errors)) continue;
    for (const facetName of FACETS) {
      const facet = cap.facets[facetName], q = `${p}/facets/${facetName}`;
      if (!shape(facet, ['status', 'reason', 'evidence'], q, errors)) continue;
      text(facet.status, `${q}/status`, errors, { values: statuses });
      if (facet.status === 'confirmed') {
        if (facet.reason !== null) errors.push(issue('CONFIRMED_REASON_MUST_BE_NULL', `${q}/reason`, 'Confirmed assertions use a null reason.'));
      } else text(facet.reason, `${q}/reason`, errors);
      if (!Array.isArray(facet.evidence) || facet.evidence.length > 32) { errors.push(issue('INVALID_EVIDENCE', `${q}/evidence`, 'Expected at most 32 evidence entries.')); continue; }
      if (facet.status === 'confirmed' && !facet.evidence.length) errors.push(issue('EVIDENCE_REQUIRED', `${q}/evidence`, 'Confirmed assertions require evidence.'));
      for (const [j, ev] of facet.evidence.entries()) {
        const e = `${q}/evidence/${j}`;
        if (!shape(ev, ['kind', 'observedAt', 'expiresAt', 'reference', 'binding', 'readback'], e, errors)) continue;
        text(ev.kind, `${e}/kind`, errors, { values: kinds });
        text(ev.reference, `${e}/reference`, errors);
        stamp(ev.observedAt, `${e}/observedAt`, errors); stamp(ev.expiresAt, `${e}/expiresAt`, errors);
        if (time(ev.expiresAt) !== null && time(ev.observedAt) !== null && time(ev.expiresAt) <= time(ev.observedAt)) errors.push(issue('INVALID_FRESHNESS_WINDOW', `${e}/expiresAt`, 'Expiry must be strictly later than observation.'));
        if (time(ev.observedAt) !== null && time(manifest.generatedAt) !== null && time(ev.observedAt) > time(manifest.generatedAt)) errors.push(issue('OBSERVATION_AFTER_GENERATION', `${e}/observedAt`, 'Evidence cannot be observed after manifest generation.'));
        const b = ev.binding;
        if (!shape(b, ['repository', 'transport', 'tool', 'sourceRevision', 'runtimeId', 'runtimeRevision', 'runtimeSourceRevision', 'toolDigest', 'schemaDigest', 'principal', 'operation'], `${e}/binding`, errors)) continue;
        text(b.repository, `${e}/binding/repository`, errors, { values: [REPOSITORY] });
        text(b.transport, `${e}/binding/transport`, errors, { values: ['hosted_mcp', 'local_stdio'] });
        text(b.tool, `${e}/binding/tool`, errors, { pattern: toolName });
        for (const key of ['sourceRevision', 'runtimeSourceRevision']) text(b[key], `${e}/binding/${key}`, errors, { nullable: true, pattern: sha });
        for (const key of ['runtimeId', 'runtimeRevision', 'principal']) text(b[key], `${e}/binding/${key}`, errors, { nullable: true });
        for (const key of ['toolDigest', 'schemaDigest']) text(b[key], `${e}/binding/${key}`, errors, { nullable: true, pattern: digest });
        text(b.operation, `${e}/binding/operation`, errors, { nullable: true, values: ['read', 'write', 'discover'] });
        if (ev.readback !== null && shape(ev.readback, ['revision', 'digest'], `${e}/readback`, errors)) {
          revision(ev.readback.revision, `${e}/readback/revision`, errors);
          text(ev.readback.digest, `${e}/readback/digest`, errors, { pattern: digest });
        }
        for (const key of ['repository', 'transport', 'tool']) exact(b[key], key === 'repository' ? manifest.repository : cap[key], `${e}/binding/${key}`, errors);
        if (facet.status !== 'confirmed') {
          if (facet.status === 'unavailable' && liveFacets.has(facetName) && ev.kind !== 'diagnostic_failure') {
            errors.push(issue('EVIDENCE_KIND_MISMATCH', `${e}/kind`, 'A measured live unavailable assertion requires diagnostic_failure evidence; source tests or catalogue names cannot establish it.'));
          }
          const sourceFacet = ['implemented_in_source', 'merged'].includes(facetName);
          const scoped = ['authorized', 'verified_read', 'verified_write'].includes(facetName);
          if (sourceFacet) {
            for (const [key, sourceKey] of [['sourceRevision', 'revision'], ['toolDigest', 'toolDigest'], ['schemaDigest', 'schemaDigest']]) exact(b[key], cap.source?.[sourceKey], `${e}/binding/${key}`, errors);
            for (const key of ['runtimeId', 'runtimeRevision', 'runtimeSourceRevision', 'principal', 'operation']) exact(b[key], null, `${e}/binding/${key}`, errors);
          } else if (ev.kind === 'connector_registry') {
            for (const key of ['sourceRevision', 'runtimeId', 'runtimeRevision', 'runtimeSourceRevision', 'toolDigest', 'schemaDigest', 'principal', 'operation']) exact(b[key], null, `${e}/binding/${key}`, errors);
          } else {
            // Failed reads may not reveal a code revision or schema. Any supplied
            // binding must match; the known runtime/principal cannot be dropped.
            exact(b.runtimeId, cap.runtime?.id, `${e}/binding/runtimeId`, errors);
            if (b.sourceRevision !== null) exact(b.sourceRevision, cap.source?.revision, `${e}/binding/sourceRevision`, errors);
            for (const [key, runtimeKey] of [['runtimeRevision', 'revision'], ['runtimeSourceRevision', 'sourceRevision'], ['toolDigest', 'toolDigest'], ['schemaDigest', 'schemaDigest']]) {
              if (b[key] !== null) exact(b[key], cap.runtime?.[runtimeKey], `${e}/binding/${key}`, errors);
            }
            exact(b.principal, scoped ? cap.principal : null, `${e}/binding/principal`, errors);
            exact(b.operation, scoped ? cap.operation : null, `${e}/binding/operation`, errors);
          }
          continue;
        }
        const allowed = {
          implemented_in_source: ['source_inspection', 'source_test'], merged: ['repository_merge'],
          deployed: ['deployment_receipt'], discovered: ['tools_list', 'connector_registry'],
          authorized: ['authorization_receipt'], verified_read: ['read_receipt'], verified_write: ['write_receipt'],
        }[facetName];
        if (!allowed.includes(ev.kind)) errors.push(issue('EVIDENCE_KIND_MISMATCH', `${e}/kind`, 'This evidence kind cannot confirm the facet.'));
        if (['implemented_in_source', 'merged'].includes(facetName)) {
          for (const [key, sourceKey] of [['sourceRevision', 'revision'], ['toolDigest', 'toolDigest'], ['schemaDigest', 'schemaDigest']]) {
            nonnull(cap.source?.[sourceKey], `${p}/source/${sourceKey}`, errors);
            exact(b[key], cap.source?.[sourceKey], `${e}/binding/${key}`, errors);
          }
          for (const key of ['runtimeId', 'runtimeRevision', 'runtimeSourceRevision', 'principal', 'operation']) exact(b[key], null, `${e}/binding/${key}`, errors);
          if (ev.readback !== null) errors.push(issue('UNEXPECTED_READBACK', `${e}/readback`, 'Source evidence does not carry a runtime readback.'));
        } else if (facetName === 'discovered' && ev.kind === 'connector_registry') {
          // A client registry is only a name observation, not an exact tools/list capture.
          for (const key of ['sourceRevision', 'runtimeId', 'runtimeRevision', 'runtimeSourceRevision', 'toolDigest', 'schemaDigest', 'principal']) exact(b[key], null, `${e}/binding/${key}`, errors);
          exact(b.operation, null, `${e}/binding/operation`, errors);
          if (ev.readback !== null) errors.push(issue('UNEXPECTED_READBACK', `${e}/readback`, 'Registry discovery does not carry execution readback.'));
        } else {
          exact(b.sourceRevision, cap.source?.revision, `${e}/binding/sourceRevision`, errors);
          for (const [key, runtimeKey] of [['runtimeId', 'id'], ['runtimeRevision', 'revision'], ['runtimeSourceRevision', 'sourceRevision'], ['toolDigest', 'toolDigest'], ['schemaDigest', 'schemaDigest']]) {
            exact(b[key], cap.runtime?.[runtimeKey], `${e}/binding/${key}`, errors);
            if (facetName !== 'discovered' || ['toolDigest', 'schemaDigest'].includes(key)) nonnull(cap.runtime?.[runtimeKey], `${p}/runtime/${runtimeKey}`, errors);
          }
          const scoped = ['authorized', 'verified_read', 'verified_write'].includes(facetName);
          exact(b.principal, scoped ? cap.principal : null, `${e}/binding/principal`, errors);
          exact(b.operation, scoped ? cap.operation : null, `${e}/binding/operation`, errors);
          if (scoped) nonnull(cap.principal, `${p}/principal`, errors);
          if (facetName === 'verified_read' || facetName === 'verified_write') {
            exact(cap.operation, facetName === 'verified_read' ? 'read' : 'write', `${p}/operation`, errors);
            if (ev.readback === null) errors.push(issue('READBACK_REQUIRED', `${e}/readback`, 'Verified execution requires an exact result digest.'));
            if (facetName === 'verified_write') {
              if (plain(ev.readback)) nonnull(ev.readback.revision, `${e}/readback/revision`, errors);
              const auth = cap.facets.authorized;
              if (auth?.status !== 'confirmed' || !Array.isArray(auth.evidence) || !auth.evidence.some(a => time(a.observedAt) !== null && time(ev.observedAt) !== null && time(a.expiresAt) !== null && time(a.observedAt) <= time(ev.observedAt) && time(a.expiresAt) > time(ev.observedAt))) errors.push(issue('PRIOR_AUTHORIZATION_REQUIRED', q, 'Verified write requires authorization valid before the operation.'));
            }
          } else if (ev.readback !== null) errors.push(issue('UNEXPECTED_READBACK', `${e}/readback`, 'This facet does not carry execution readback.'));
        }
      }
    }
  }
  return errors;
}

function parity(cap) {
  const codes = [];
  const pairs = [['revision', 'sourceRevision', 'SOURCE_RUNTIME_REVISION_MISMATCH'], ['toolDigest', 'toolDigest', 'TOOL_DIGEST_MISMATCH'], ['schemaDigest', 'schemaDigest', 'SCHEMA_DIGEST_MISMATCH']];
  let unknown = !cap.runtime?.id || !cap.runtime?.revision;
  for (const [s, r, code] of pairs) {
    if (cap.source?.[s] == null || cap.runtime?.[r] == null) unknown = true;
    else if (cap.source[s] !== cap.runtime[r]) codes.push(code);
  }
  return { status: codes.length ? 'mismatch' : unknown ? 'unknown' : 'matching', codes };
}

export function assessManifest(manifest, { now } = {}) {
  const errors = validateManifest(manifest);
  const current = time(now);
  if (current === null) errors.push(issue('INVALID_ASSESSMENT_TIME', '/now', 'Supply an exact UTC assessment time.'));
  if (errors.some(error => ['INVALID_JSON_VALUE', 'JSON_DEPTH_EXCEEDED'].includes(error.code))) {
    return { schemaVersion: SCHEMA_VERSION, digestAlgorithm: DIGEST_ALGORITHM, evidenceMode: null, assessedAt: now ?? null, authorizesActions: false, valid: false, errors, capabilities: [] };
  }
  if (current !== null && time(manifest?.generatedAt) !== null && time(manifest.generatedAt) > current) errors.push(issue('FUTURE_TIMESTAMP', '/generatedAt', 'Manifest generation is in the future.'));
  const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities.map((cap, i) => {
    const p = `/capabilities/${i}`, match = parity(cap ?? {}), facets = {};
    const generalErrors = errors.filter(error => !error.path.startsWith('/capabilities/') || error.path === p || (error.path.startsWith(p + '/') && !error.path.startsWith(p + '/facets/')));
    for (const name of FACETS) {
      const q = `${p}/facets/${name}`, facet = cap?.facets?.[name];
      let effective = facet?.status ?? 'invalid';
      const reasonCodes = [];
      const facetErrors = errors.filter(error => error.path === q || error.path.startsWith(q + '/'));
      if (generalErrors.length || facetErrors.length) { effective = 'invalid'; reasonCodes.push(...generalErrors.concat(facetErrors).map(error => error.code)); }
      else {
        if (facet.evidence.some(ev => time(ev.observedAt) > current)) { effective = 'invalid'; reasonCodes.push('FUTURE_TIMESTAMP'); }
        else if (facet.evidence.some(ev => time(ev.expiresAt) <= current)) {
          if (['confirmed', 'unavailable'].includes(facet.status)) effective = 'stale';
          reasonCodes.push('EVIDENCE_EXPIRED');
        }
        if (manifest.evidenceMode === 'synthetic' && ['confirmed', 'unavailable'].includes(facet.status) && effective !== 'invalid') { effective = 'synthetic'; reasonCodes.push('SYNTHETIC_NOT_OBSERVED'); }
        if (['verified_read', 'verified_write'].includes(name) && effective === 'confirmed' && match.status !== 'matching') { effective = 'unavailable'; reasonCodes.push(match.status === 'mismatch' ? 'SOURCE_RUNTIME_MISMATCH' : 'SOURCE_RUNTIME_UNVERIFIED'); }
      }
      const evidence = Array.isArray(facet?.evidence) ? facet.evidence : [];
      const datesValid = evidence.every(ev => time(ev?.observedAt) !== null && time(ev?.expiresAt) !== null);
      const freshness = !evidence.length ? 'unobserved' : !datesValid ? 'invalid' : evidence.some(ev => time(ev.observedAt) > current) ? 'future' : evidence.some(ev => time(ev.expiresAt) <= current) ? 'stale' : 'fresh';
      facets[name] = {
        declared: facet?.status ?? null, effective, reason: facet?.reason ?? null,
        freshness, reasonCodes: [...new Set(reasonCodes)],
        evidence: evidence.map(ev => projectStrings(ev, ['kind', 'observedAt', 'expiresAt', 'reference'])),
      };
    }
    for (const name of ['verified_read', 'verified_write']) {
      if (facets[name].effective === 'confirmed' && facets.authorized.effective !== 'confirmed') {
        facets[name].effective = 'unavailable'; facets[name].reasonCodes.push('AUTHORIZATION_NOT_CURRENT');
      }
    }
    return {
      transport: cap?.transport ?? null, tool: cap?.tool ?? null, operation: cap?.operation ?? null,
      runtimeId: cap?.runtime?.id ?? null, principal: cap?.principal ?? null,
      source: projectStrings(cap?.source, ['revision', 'toolDigest', 'schemaDigest']),
      runtime: projectStrings(cap?.runtime, ['id', 'revision', 'sourceRevision', 'toolDigest', 'schemaDigest']),
      dataRevision: projectStrings(cap?.dataRevision, ['kind', 'value']),
      parity: match, facets,
    };
  }) : [];
  return { schemaVersion: SCHEMA_VERSION, digestAlgorithm: DIGEST_ALGORITHM, evidenceMode: manifest?.evidenceMode ?? null, assessedAt: now ?? null, authorizesActions: false, valid: errors.length === 0, errors, capabilities };
}

// Parsing is bounded by the CLI and rejects duplicate keys before JSON.parse can
// discard them. Evidence references are inert strings; this never resolves URIs.
export function parseStrictJson(input) {
  if (typeof input !== 'string') throw new ContractError('INVALID_JSON', '', 'Expected UTF-8 JSON text.');
  let at = 0;
  const fail = message => { throw new ContractError('INVALID_JSON', '', message); };
  const space = () => { while (/[\x20\x09\x0a\x0d]/.test(input[at] ?? '\0')) at++; };
  function string() {
    const start = at++;
    while (at < input.length) {
      const c = input[at++];
      if (c === '"') { try { return JSON.parse(input.slice(start, at)); } catch { fail('Malformed JSON string.'); } }
      if (c === '\\') at++;
    }
    fail('Unterminated JSON string.');
  }
  function value(depth = 0) {
    if (depth > 64) throw new ContractError('JSON_DEPTH_EXCEEDED', '', 'JSON exceeds 64 nesting levels.');
    space(); const ch = input[at];
    if (ch === '"') { string(); return; }
    if (ch === '{') {
      at++; space(); const keys = new Set();
      if (input[at] === '}') { at++; return; }
      while (at < input.length) {
        space(); if (input[at] !== '"') fail('Expected an object key.');
        const key = string();
        if (keys.has(key)) throw new ContractError('DUPLICATE_JSON_KEY', '', 'Duplicate object keys are not accepted.');
        keys.add(key); space(); if (input[at++] !== ':') fail('Expected a colon.');
        value(depth + 1); space(); const end = input[at++];
        if (end === '}') return; if (end !== ',') fail('Expected a comma or closing brace.');
      }
      fail('Unterminated JSON object.');
    }
    if (ch === '[') {
      at++; space(); if (input[at] === ']') { at++; return; }
      while (at < input.length) { value(depth + 1); space(); const end = input[at++]; if (end === ']') return; if (end !== ',') fail('Expected a comma or closing bracket.'); }
      fail('Unterminated JSON array.');
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(input.slice(at));
    if (!match) fail('Malformed JSON value.'); at += match[0].length;
  }
  value(); space(); if (at !== input.length) fail('Trailing JSON content.');
  let parsed; try { parsed = JSON.parse(input); } catch { fail('Malformed JSON.'); }
  canonical(parsed); return parsed;
}
