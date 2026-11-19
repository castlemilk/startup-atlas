# Atlas capability evidence manifest v1

This isolated contract records what is known about one Atlas tool on one
transport, runtime and principal scope. It separates source implementation,
merge, deployment, discovery, authorization and actual execution evidence.
It introduces no MCP endpoint, writer field, deployment mechanism or status UI.
The [source audit](SOURCE-AUDIT.md) records the inspected implementation,
existing owners, current holds and integration gate.

`schemaVersion` is `atlas-capability-manifest/v1` and `digestAlgorithm` is
`atlas-json-sorted-keys-v1`. Unknown versions and fields fail validation. The
[JSON Schema](manifest.schema.json) defines structure; [validator.mjs](validator.mjs)
also enforces cross-field bindings, chronology and evidence semantics. Both are
needed for acceptance. The reference implementation uses Node.js built-ins only.

## Seven independent facets

| Facet | What a confirmed assertion means | Required supporting kind |
| --- | --- | --- |
| `implemented_in_source` | The exact named tool definition was inspected or tested at the pinned source commit. | `source_inspection` or `source_test` |
| `merged` | The definition is present in the explicitly observed repository revision accepted as merged. It does not mean that revision is still main. | `repository_merge` |
| `deployed` | An identified runtime build has a deployment receipt bound to its code revision and tool/schema digests. | `deployment_receipt` |
| `discovered` | This tool name was observed in a client registry, or its full descriptor was returned by discovery. Those are different strengths of evidence. | `connector_registry` or `tools_list` |
| `authorized` | An authorization receipt covers this exact operation, principal, repository, runtime and descriptor. A stored connection flag is insufficient. | `authorization_receipt` |
| `verified_read` | A read receipt binds the operation and exact result digest to this runtime and principal. | `read_receipt` with `readback.digest` |
| `verified_write` | A write receipt binds an already authorized operation and authoritative result readback to the exact runtime and principal. | `write_receipt` with a result digest and exact typed readback revision |

No facet automatically promotes another. A deployment can be known while the
currently connected client has not discovered its tools. Discovery can be known
while authorization and the runtime build are unknown. A current published graph
can coexist with an older MCP deployment. The manifest preserves these states.

Each facet contains `status`, `reason` and `evidence`:

- `confirmed` requires appropriate, bound evidence and `reason: null`.
- `unknown` requires a reason; missing evidence is not failure or zero.
- `unavailable` retains an explicit reason. Runtime failures require
  `diagnostic_failure` evidence; source tests, synthetic claims and cached
  registry names cannot establish a measured live failure. With that evidence it is an
  observed negative, subject to binding and expiry. Without evidence it is only
  a declared hold and has `freshness: unobserved`; consumers must not present it
  as a measured runtime failure.
- `not_applicable` retains a reason, such as the write-verification facet on a
  read operation. It does not establish the availability of another operation.

The stable row identity is transport, tool, runtime ID and principal. Duplicate
rows fail validation. Use separate manifests for historical snapshots; do not
overwrite evidence timestamps to make history appear current.

## Exact identities and revisions

| Field | Meaning |
| --- | --- |
| `repository` | Exactly `castlemilk/startup-atlas` in v1. |
| `transport` | `hosted_mcp` or `local_stdio`; their tool names, data revision formats and effects remain separate. |
| `tool` | Exact Atlas tool name. No alias or fallback writer is inferred. |
| `operation` | `read` or `write` business effect. This does not promise freedom from credential side effects. |
| `principal` | Nonsecret, locally meaningful authorization-scope identifier; `null` when unknown. It must distinguish different principals/grant contexts. It is not a token or authority grant. |
| `source.revision` | Full 40-character lowercase Git SHA of inspected source, or explicit `null`. |
| `source.toolDigest`, `source.schemaDigest` | Per-tool digests derived from the source definition. |
| `runtime.id` | Nonsecret identity of the actual deployment/instance being observed, or `null`. A label guessed from a repository or URL is insufficient. |
| `runtime.revision` | Exact runtime build/version identity supplied by the release evidence, or `null`. A hard-coded package/server version cannot substitute for an exact release identity. |
| `runtime.sourceRevision` | Independently evidenced source Git SHA used by that runtime, or `null`. |
| `runtime.toolDigest`, `runtime.schemaDigest` | Digests of the actual discovered/deployed definition, never filled from source merely because the names match. |
| `dataRevision` | Optional typed `git_sha` or `sha256` observation for graph/repository data; always independent of runtime code. |
| `readback.revision` | Exact typed result revision. A write proposal head can differ from published graph data; read results without a revision use `null`. |

Required fields are never silently omitted. `null` means unknown where allowed;
an empty string is invalid. A 64-character local snapshot digest cannot be used
as a 40-character source Git SHA. Runtime IDs and principal identifiers must
not contain credentials or private operational content.

Every evidence item includes a kind, inert reference, UTC `observedAt` and
`expiresAt`, exact binding object, and a readback object or explicit `null`.
Source/merge evidence binds source revision and per-tool digests, with runtime,
principal and operation fields null. Runtime evidence binds its actual runtime
identity, code and descriptors. Authorization and execution additionally bind
principal and operation.

A `connector_registry` observation binds only repository, transport and tool
name: all revision, descriptor, principal and operation fields in its evidence
binding must be null. A complete `tools_list` observation requires actual
per-tool digests but may retain unknown runtime build fields. Neither case
proves authorization. Missing tools in a partial/cached client registry remain
unknown; only a complete appropriately bound discovery observation can support
a stronger negative claim.

## Digest contract

`digestCatalogue(tools)` accepts complete tool definition objects and returns:

- `toolsDigest`: SHA-256 of the whole canonical tool list.
- `schemaDigest`: SHA-256 of the canonical list of each tool's name, input schema
  and output schema when present.
- `tools`: a sorted array of `{name, toolDigest, schemaDigest}` for manifest rows.

Canonicalization recursively sorts object keys by JavaScript string order,
sorts the outer tool list by exact tool name, preserves every other array order,
uses JSON string/number serialization and hashes UTF-8 bytes. It does not
normalize Unicode, URLs, descriptions or semantic schema equivalences. The
algorithm is explicitly versioned and is not advertised as RFC 8785 JCS.

The full-tool digest includes descriptions, annotations and all supplied
descriptor fields. Consequently changing `readOnlyHint` or description changes
the full digest even when the schema stays identical. Duplicate names and
incomplete definitions reject. Undefined values, accessors, sparse/extended
arrays, non-finite numbers, negative zero, unsafe integers and excessive nesting
reject instead of disappearing during serialization. Raw JSON additionally
rejects duplicate keys, including escaped-equivalent spellings.

`readback.digest` uses the same `digestJson` canonicalization on the authoritative
readback result retained by the evidence producer. A digest of source bytes is
a separate artifact hash; it is not a tool-schema fingerprint. Digests establish
integrity of the supplied representation, not evidence authenticity, rights,
permission, factual truth or successful execution by themselves.

## Freshness and diagnostics

`assessManifest(manifest, {now})` requires an explicit UTC evaluation time.
Evidence is fresh only when `observedAt <= now < expiresAt`. Exactly at expiry
it is stale. Invalid calendar values, future evidence and reversed windows fail
closed. Updating `generatedAt` never refreshes old evidence. Expired negative
observations also become stale. All evidence supplied to a facet must remain
applicable; retain superseded evidence in a historical manifest, not alongside
the active assertion.

The assessed result retains declared status, effective status, reason,
freshness and stable diagnostic codes. Exact source/runtime parity is
`matching`, `mismatch` or `unknown`, compared separately by code revision,
full-tool digest and schema digest. Unknown runtime identity prevents exact
parity. Effective read/write verification is withheld when parity is unknown or
mismatched or authorization is not current. Write evidence also requires
authorization valid at the time of the operation, not retroactively added.

An `evidenceMode: synthetic` manifest cannot produce any effective confirmed
facet, including source and merge; its unavailable assertions are likewise
labelled synthetic rather than observed negatives. The result retains that mode. Every assessed
result sets `authorizesActions: false`: it is evidence for a consumer, never
permission to execute tools, merge, deploy or spend. The validator checks
structure and consistency of supplied observations; it cannot authenticate a
receipt or establish a caller's entitlement. Trusted evidence acquisition and
real approval remain with the existing owners.

Common diagnostic codes include `EVIDENCE_BINDING_MISMATCH`,
`EVIDENCE_BINDING_REQUIRED`, `EVIDENCE_KIND_MISMATCH`, `EVIDENCE_EXPIRED`,
`SOURCE_RUNTIME_REVISION_MISMATCH`, `TOOL_DIGEST_MISMATCH`,
`SCHEMA_DIGEST_MISMATCH`, `AUTHORIZATION_NOT_CURRENT`,
`PRIOR_AUTHORIZATION_REQUIRED`, `READBACK_REQUIRED` and `DUPLICATE_JSON_KEY`.
Errors carry JSON Pointer paths. Consumers should use codes and fields rather
than parse diagnostic prose.

## Offline commands

From the repository root, with Node.js 22.13 or later:

```sh
node contracts/capability_manifest/cli.mjs validate contracts/capability_manifest/source-baseline.json
node contracts/capability_manifest/cli.mjs assess contracts/capability_manifest/source-baseline.json --now 2026-11-18T07:30:00Z
node contracts/capability_manifest/cli.mjs digest contracts/capability_manifest/evidence/source-catalogue.json
node contracts/capability_manifest/cli.mjs compare contracts/capability_manifest/evidence/source-catalogue.json contracts/capability_manifest/evidence/source-catalogue.json
node --test contracts/capability_manifest/manifest.test.mjs
```

The shown assessment time reproduces the dated example; use the actual current
time for a current assessment. `validate` checks consistency, not current
availability. CLI exit 0 means valid input or matching comparison, never that
runtime tools are usable. Exit 1 means contract rejection or catalogue mismatch;
exit 2 means input/usage failure. `assess` can return exit 0 while all runtime
states remain unknown or stale: inspect its fields.

Inputs must be local regular JSON files of at most 4 MiB. URLs, direct symlinks,
invalid UTF-8, ambiguous JSON and unsupported arguments reject. Evidence
references are never followed. The CLI has no network, MCP, browser, writer,
credential, source-import, server-start, shell-execution or deployment command.
Tests spawn only this local CLI against synthetic temporary files. They do not
launch the existing server or execute its writer/protocol suites.

## Supplied baseline and tests

`source-baseline.json` records actual source inspection at main
`d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f` and a client-registry observation at
`2026-11-18T07:07:20Z`. All 17 hosted tool definitions have source and merged
evidence. Thirteen names have limited client-registry discovery evidence; four
strict record tools remain not observed. Every runtime build identity,
authorization and read/write verification remains unknown or not applicable.
There is no manufactured live evidence.

The sample uses a 24-hour recheck window for source/merge observations and one
hour for the local registry observation. These are explicit sample assessment
policies, not claims about the registry's unknown server-cache age or a new
repository-wide freshness rule. Release and operational-receipts owners must
agree production windows before adoption.

`fixtures.mjs` contains clearly synthetic read/write examples. Tests change
their mode only in memory to exercise receipt-validation branches; no such
object is saved as live evidence. Regressions cover stale and mismatched
observations, missing identity, partial discovery, authorization, authoritative
readback, timestamps, digest determinism, schema/annotation drift, malformed
JSON, and CLI isolation. Source/DOM/unit results are not browser acceptance.

The next gate is owner review of this stable manifest and evidence-acquisition
boundary. Wiring it into discovery, release metadata or operational presentation
is a separate owner-controlled change; this packet does not broaden API
semantics, lift existing holds or publish a hosted capability.
