// Every value in this module is synthetic. No fixture is a live observation.
import { DIGEST_ALGORITHM, SCHEMA_VERSION, digestCatalogue } from './validator.mjs';

export const FIXTURE_NOW = '2026-11-18T08:00:00Z';
export const FIXTURE_OBSERVED_AT = '2026-11-18T07:00:00Z';
export const FIXTURE_EXPIRES_AT = '2026-11-18T09:00:00Z';
export const FIXTURE_SHA = 'a'.repeat(40);
export const FACET_NAMES = [
  'implemented_in_source', 'merged', 'deployed', 'discovered', 'authorized',
  'verified_read', 'verified_write',
];

export function fixtureTools(operation = 'read') {
  return [{
    name: operation === 'read' ? 'atlas_fixture_read' : 'atlas_fixture_propose',
    description: 'Synthetic contract fixture; never a registered Atlas tool.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1 } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: operation === 'read', destructiveHint: false },
  }];
}

export function fixtureBinding(capability, facet) {
  const source = ['implemented_in_source', 'merged'].includes(facet);
  const scoped = ['authorized', 'verified_read', 'verified_write'].includes(facet);
  return {
    repository: 'castlemilk/startup-atlas',
    transport: capability.transport,
    tool: capability.tool,
    sourceRevision: capability.source.revision,
    runtimeId: source ? null : capability.runtime.id,
    runtimeRevision: source ? null : capability.runtime.revision,
    runtimeSourceRevision: source ? null : capability.runtime.sourceRevision,
    toolDigest: source ? capability.source.toolDigest : capability.runtime.toolDigest,
    schemaDigest: source ? capability.source.schemaDigest : capability.runtime.schemaDigest,
    principal: scoped ? capability.principal : null,
    operation: scoped ? capability.operation : null,
  };
}

export function fixtureEvidence(capability, facet) {
  const kinds = {
    implemented_in_source: 'source_inspection',
    merged: 'repository_merge',
    deployed: 'deployment_receipt',
    discovered: 'tools_list',
    authorized: 'authorization_receipt',
    verified_read: 'read_receipt',
    verified_write: 'write_receipt',
  };
  return {
    kind: kinds[facet],
    observedAt: FIXTURE_OBSERVED_AT,
    expiresAt: FIXTURE_EXPIRES_AT,
    reference: `fixture:${facet}`,
    binding: fixtureBinding(capability, facet),
    readback: ['verified_read', 'verified_write'].includes(facet)
      ? { revision: facet === 'verified_write' ? { kind: 'git_sha', value: 'b'.repeat(40) } : null, digest: `sha256:${'d'.repeat(64)}` }
      : null,
  };
}

export function makeSyntheticManifest(operation = 'read') {
  const catalogue = digestCatalogue(fixtureTools(operation));
  const tool = catalogue.tools[0];
  const capability = {
    transport: 'hosted_mcp',
    tool: tool.name,
    operation,
    principal: 'synthetic:principal-a',
    source: { revision: FIXTURE_SHA, toolDigest: tool.toolDigest, schemaDigest: tool.schemaDigest },
    runtime: {
      id: 'synthetic:runtime-a', revision: 'synthetic:build-1', sourceRevision: FIXTURE_SHA,
      toolDigest: tool.toolDigest, schemaDigest: tool.schemaDigest,
    },
    dataRevision: { kind: 'git_sha', value: 'c'.repeat(40) },
    facets: {},
  };
  for (const facet of FACET_NAMES) {
    const inapplicable = (facet === 'verified_read' && operation === 'write') ||
      (facet === 'verified_write' && operation === 'read');
    capability.facets[facet] = inapplicable
      ? { status: 'not_applicable', reason: `${operation}_operation`, evidence: [] }
      : { status: 'confirmed', reason: null, evidence: [fixtureEvidence(capability, facet)] };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    digestAlgorithm: DIGEST_ALGORITHM,
    repository: 'castlemilk/startup-atlas',
    generatedAt: FIXTURE_OBSERVED_AT,
    evidenceMode: 'synthetic',
    capabilities: [capability],
  };
}

// In-memory branch coverage for receipt validation. The returned value must
// never be persisted or described as an actual observed manifest.
export function observedSimulation(operation = 'read') {
  return { ...makeSyntheticManifest(operation), evidenceMode: 'observed' };
}

export function clearFacet(manifest, facet, reason = 'not_observed') {
  manifest.capabilities[0].facets[facet] = { status: 'unknown', reason, evidence: [] };
  return manifest;
}
