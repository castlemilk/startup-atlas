# Canonical contract parity

This source-only packet compares existing Atlas collection, storage, MCP and UI
read contracts at baseline `d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f`. It closes one
demonstrated projection bug: `web/graph-sql.js:getGraph()` discarded the source
revision already stored in SQLite, while the JSON fallback retained it.

The runtime proposal reads the existing metadata row and exposes a nonempty
`source_revision`. Unstamped builds remain unstamped. It changes no schema,
writer, accepted API field, data file, workflow, dependency, token or motion
adapter. The original packet was delivered locally and unpublished. Source execution does not establish
browser acceptance, deployed MCP capability or a production release.

## Ownership and review boundary

Improvement 3 owns this directory, its synthetic fixtures and the proposed
seven-line reader hunk. Adoption of the shared UI reader hunk requires the
existing read-model/integration owner's review. The [record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51)
retains canonical identity, accepted record fields, validation, source revision
preconditions and writers. Its continuation was already sent and is not repeated.
The [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2)
retains discovery and real records. The [compatibility owner](https://chatgpt.com/c/6afc3963-c358-83ec-883f-e4f4be682ef6)
retains token/motion adapters. Coverage, investor-round, capability, evidence UI
and operational receipt work remain with their separate lanes. No new owner
acknowledgement or approval is claimed.

Coordination is recorded in the [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).
The existing [DATA-04 issue 69](https://github.com/castlemilk/startup-atlas/issues/69)
owns reproducible snapshot/publication parity; this packet is bounded evidence
for it, not completion of that broader issue.

## Executable golden fixtures

Run from the repository root with Node 22 or later and Python 3:

```sh
node --test --test-reporter=tap contracts/canonical_parity/*.test.mjs
```

The coordinator's additive `tests/canonical-parity.test.js` entry now runs both
suites through the normal `npm test` glob. Each suite retains process isolation;
the child runner removes only Node's inherited test-worker marker and verifies
that at least 24 tests ran without failures or skips. Replaying the old reader
also fails this discovery entry, so a successful wrapper cannot hide the drift.
This follow-up preserves the original packet commit in history. It does not
change workflows or imply browser, CI, merge, deployment or owner acceptance.

No dependency installation is needed. The suite uses the checked-in SQL.js
JavaScript/WASM and existing production modules. It runs 24 source-level tests:
11 storage/UI tests and 13 MCP read-adapter tests. The storage suite failed twice
on the unmodified baseline, specifically at `getGraph().source_revision` and the
actual `openGraph()` database/fallback comparison. The other nine tests passed.

[fixtures.json](fixtures.json) is entirely synthetic. Reserved `.test` hosts,
fake commit tokens, Café Synthetic, Ada Example and Synthetic Firm are examples,
not research results. The observed programme candidate and explicitly authored
reviewed inputs occupy separate fixture sections. No code promotes one into the
other. Empty funding arrays keep funding schema and participation work outside
this packet.

[build_fixture.py](build_fixture.py) calls the real collector with one asserting
offline transport and a fixed observation clock, the real pure graph generator,
and the real SQLite builder with explicit empty asset/relationship mappings.
The graph publication stamp is an explicit fixture input, not a Git lookup. The
driver writes only to a new or empty directory outside the repository. It builds
all 13 allowlisted source documents without reading production data. Python
bytecode writes are disabled.

[storage-ui-parity.test.mjs](storage-ui-parity.test.mjs) loads the resulting
database through actual SQLite WASM in Node. It calls production SQL readers,
JSON detail helpers and both branches of `openGraph()` with exact local response
stubs. This exercises UI data logic; there is no DOM, browser, page rendering or
native acceptance. [mcp-read-parity.test.mjs](mcp-read-parity.test.mjs) uses the
same generated fixture inputs with the actual local `StartupStore` and hosted
`GitHubCatalogue` source adapters. It permits only expected GET-shaped stub
operations and validates every repository file's pinned ref. No constructor
credential, SDK session, HTTP/stdio server, OAuth operation or live MCP call is
used. Global fetch fails closed outside explicitly injected fixture responses.

## Cross-layer parity matrix

The matrix compares declared projections. Equal names or equal-looking tokens
do not make different identity or revision domains interchangeable.

| Layer and source authority | Entity and source identity | Missing, null and empty behavior | Revision and provenance | Executable evidence |
| --- | --- | --- | --- | --- |
| Collection observation: [`crawl_program_directories`](../../scripts/crawl.py) | Registry `source_id` names the source observation. `program_url` is a candidate destination, not a canonical programme ID. | Candidate `context: ""` is preserved; absent approval/review fields remain absent. `review_required: true` remains explicit. | Exact final `source_url`, `source_scope` and `checked_at` survive extraction. Observation time is not review time; directory scope is not eligibility. | One synthetic HTML response, exact candidate golden and no reviewed-record conversion. |
| Authoritative reviewed JSON: [`readStartupRecord` and `recordRevision`](../../backend/hosted/src/startup-edit.mjs) | Exact `startup:<startupSlug(name)>`; graph-only records cannot supply a reviewed overlay. A source is still an exact URL, not a global source entity. | Raw reads preserve omission, null, empty text and arrays. Lossless reading does not mean every raw value is accepted by the write schema. | Canonical `{id, record}` SHA-256 includes the complete source record and nested provenance. Object keys sort; array order and URL/text bytes matter. | Literal independently calculated digest, state variants, key ordering, array/URL/ID sensitivity and graph-only `NOT_FOUND`. |
| Generated graph JSON: [`build_graph`](../../scripts/make-graph.py) | Unicode slug contracts agree with JS; global founder and firm-scoped team identities remain distinct. Programmes use the catalogue ID. | The fixture's omitted founding year remains absent; some missing text projects to `""` and arrays to `[]`. Top-level startup `reviewed_at` is omitted. These are projection defaults, not new facts. | Nested profile-fact evidence/review date, edge source and exact URLs are retained. Build `source_revision` is a graph snapshot label. | Six literal IDs, three literal edge triples, exact nested fields and explicit source-versus-projection assertions. |
| SQLite storage: [`build`](../../scripts/build-graph-db.py) | Entity IDs and JSON payloads are exact. SQL `edges.source_id` means the **from entity**; it is not collector `source_id`. | JSON stored in `data` preserves omission/null/empty/zero. Optional relational indexes are not substitutes for original JSON. | Existing metadata stores `source_revision`; `source_documents` stores exact path, text and independent content SHA-256. | All four graph tables, raw-value variants and byte/digest parity for every one of the 13 documents. |
| Local MCP source adapter: [`StartupStore.get`](../../backend/mcp/startups.mjs) | Same shared canonical source-record lookup; no synthesis from a graph-only entity. | Complete raw record remains unchanged. Inputs remain byte-for-byte unchanged after reads. | Local snapshot `revision` is a 64-hex SHA-256 of four ordered raw input texts. `recordRevision` is shared; `origin: local_repository`, `published: false`. | Actual local file reads of synthetic inputs, independent expected snapshot hash and record-digest comparison. |
| Hosted MCP source adapter: [`getStartupRecord`, `graphSnapshot` and `getStartup`](../../backend/hosted/src/github.mjs) | Source records use the same lookup; published details preserve canonical graph IDs and their evidence. | Raw record parity is exact. Invalid/missing published `source_revision` becomes normalized `revision: null`, not zero or a current index claim. | Source `revision` is a 40-hex Git SHA, all input files pinned to it. Published `revision` and observed `mainRevision` may differ; index status is current, pending publication or unknown. | Actual source adapters with bounded local responses; source/current/stale/unknown cases and common published detail payloads. |
| UI read models: [`getGraph`/`getStartup`](../../web/graph-sql.js), [`entityDetails`](../../web/graph-model.js), [`openGraph`](../../web/graph-store.js) | SQL and fallback retain six exact IDs, source URLs and distinct person scopes. Detail field names are mapped explicitly for comparison. | Nested JSON payloads remain equal. Empty/missing snapshot metadata does not create a revision. | **Fixed in the local proposal:** nonempty stored `source_revision` now survives SQLite UI reads as it already did in JSON fallback. | Both formerly failing regression cases; production database/fallback code paths and common detail fields compared with hosted source adapter output. |

## Revision and identity domains

| Value | Authority and allowed comparison |
| --- | --- |
| `directory-synthetic` | Collector registry source ID. No automatic crosswalk to a reviewed programme or evidence URL. |
| `startup:cafe-synthetic` | Current canonical graph/source-record ID. Equal slug spelling alone is not evidence for merging other records. |
| `person:ada-example` versus `person:ada-example--synthetic-firm` | Founder and firm-scoped team identities. The fixture deliberately keeps both. |
| SQL `edges.source_id` | Edge's `from` entity ID. Evidence remains inside edge JSON as `source`. |
| Source document path and SHA-256 | Identity and exact bytes of one allowlisted document; not a record revision or proof that every claim is true. |
| Local snapshot `revision` | Raw-input digest; even source-file reformatting changes it. Compare only with a local precondition from the same contract. |
| Hosted source `revision` | Repository commit SHA. Compare with repository snapshot/precondition semantics. |
| `recordRevision` | Shared canonical-record digest. Equal ID and complete record must produce equal local/hosted digests. |
| Published graph `source_revision` / hosted `revision` | Snapshot provenance. Equality to observed `mainRevision` establishes that adapter's freshness status, not hosted-code identity or evidence completeness. |
| Graph `version: 1` / database `schema_version: "2"` | Independent format domains. The patch must not relabel database schema version as graph version. |

The synthetic complete-record golden digest is
`943133d77725ab379bb2a96498d1146191bcac758bb451360117e5c8fb491185`.
It was computed independently with Python's sorted, compact, UTF-8 JSON and
SHA-256 and is compared against production JavaScript. This fixture uses integers
and text, not a claim that Python and JavaScript serialize every possible JSON
number identically.

## Missing-value acceptance boundaries

| Location | Omitted | `null` | Empty value | Consequence |
| --- | --- | --- | --- | --- |
| Authoritative raw JSON/read/hash | Preserved as absent | Preserved and hashed distinctly | `""` and `[]` remain distinct values | A read is not a write-validation decision. The socials null/text goldens are explicitly invalid write-schema examples. |
| Existing strict edit contract | Preserve inherited value | Rejected | Empty keyed arrays preserve existing entries; not deletion | [`MCP-RECORD-EDITS.md`](../../docs/MCP-RECORD-EDITS.md) and the record owner remain authoritative; no new merge implementation here. |
| Graph payload JSON stored inside SQLite | Preserved | Preserved | Text, array and numeric zero preserved | Compare parsed complete payloads, not only relational columns or presentation text. |
| Graph envelope into current SQLite metadata | Becomes empty metadata | Rejected by `NOT NULL` | Explicit `""` becomes the same metadata as omission | This pre-existing loss cannot be reversed by the reader. Tests expose it rather than inventing a difference. |
| Proposed SQLite graph envelope read | Missing metadata row omits property | Not representable in current schema | Empty metadata omits property | Matches generator-supported unstamped output. Nonempty metadata is preserved exactly; it is not independently validated as a publication SHA. |
| Hosted published revision | `null` normalized result | `null` normalized result | Empty/invalid string yields `null` | Unknown freshness stays `indexStatus: unknown`; no inferred current state. |

The graph generator only adds `source_revision` when its build environment value
is nonempty. Thus the chosen fix restores the supported stamped/unstamped
generator path. It does not normalize URLs, fill missing dates, replace unknown
amounts, add a source registry or broaden write acceptance.

## Remaining differences and next gates

These observations stay outside the reader correction:

- `getGraph()` still omits graph `version`. The existing metadata contains a
  database schema version, not the graph version. A complete envelope migration
  needs an explicit compatibility decision.
- Graph `add()` updates an already-existing entity with truthy fields only.
  Therefore an entity introduced by a portfolio can omit falsy fields that a
  newly introduced reviewed entity receives as defaults. Graph projections are
  not authoritative records. The fixture tests the newly introduced case;
  the portfolio variation is a source-inspected follow-up, not claimed covered.
- Hosted graph search includes startup/partner/provider; UI SQL also includes
  people/programmes. SQL token-prefix search and JSON substring matching differ.
  Search completeness/ranking is not declared equal by these detail goldens.
  These source-inspected gaps remain with the search/read-model owners and
  [UX-04 issue 76](https://github.com/castlemilk/startup-atlas/issues/76).
- UI fallback fetches graph and later public documents separately. These
  fixtures provide one consistent snapshot; they do not prove atomicity across
  a live publication transition. That remains within DATA-04/release review.
- Stable identity migration remains [DATA-02 issue 68](https://github.com/castlemilk/startup-atlas/issues/68).
  No fixture or passing digest test resolves historic namesakes or establishes
  investor participation.

The next integration gate is independent source review of the bounded hunk and
goldens, followed by current-main reconciliation and owner acceptance. After
the holds are explicitly resolved, the existing release owner controls any
browser-enabled CI, branch/PR publication, hosted deployment and live readback.
Do not edit workflows or use a skip mechanism to route around the holds.

At the inspected baseline, [the Pages workflow](../../.github/workflows/pages.yml)
runs Chrome on pull requests. Existing main [run 44254107775](https://github.com/castlemilk/startup-atlas/actions/runs/44254107775)
completed successfully, and the [baseline commit status](https://api.github.com/repos/castlemilk/startup-atlas/commits/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/status)
also records a successful external Vercel deployment. These are observed
pre-existing results, not this packet's CI or release. Open PRs 107, 135, 160,
162 and 163 retain their owners and heads. No remote source objects/ref, PR,
push, merge, workflow dispatch, permission, credential, live-record/public-asset
write, robots request, deployment or release is required to reproduce this
packet's offline tests.
