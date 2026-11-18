# Operational receipt v1

This is an offline, source-only proposal owned by improvement 6. It reports
evidence; it authorizes no action. The existing release owner retains release
decisions. The capability-manifest owner retains capability schema, validation,
digests and state derivation. No workflow or runtime integration is included.

## Input and API

`report.py` exposes `validate_receipt(receipt, as_of)`,
`build_report(receipt, as_of, *, manifest_bytes=None, capability_consumer=None)`
and `render_markdown(report)`. `as_of` is an explicit timezone-aware ISO 8601
timestamp. Inputs are copied, never changed. CLI input is bounded to 1 MiB;
duplicate JSON keys and non-finite numbers are invalid. The core CLI reads local files
and writes stdout only: no network, Git, subprocess, browser, credential or
release integration. The separate optional `with_capabilities.py` bridge runs
only the exact pinned lane 4 validator in a bounded local Node.js subprocess.

The JSON object has exactly these required fields:

| Field | Meaning |
| --- | --- |
| `schema_version` | Integer `1`; no guessing for future versions. |
| `receipt_id` | Nonempty identifier for this observation packet. |
| `repository` | Exact `owner/name`. Every event concerns this repository. |
| `source` | `{head, ref, observed_at, evidence_ref}`. `head` is a full lowercase 40-character Git SHA. This observation does not claim the ref is still current. |
| `owner`, `release_owner` | Each `{name, reference}`; preserve an unknown exact release-owner identity explicitly in the name rather than inventing a person/chat. |
| `policy` | `{source_checks, ci, targets, fresh_for_seconds, merge_target_ref}`. Source checks are nonempty unique names. CI requirements are `{workflow, jobs}` with nonempty unique required jobs. Targets are `{surface, environment, verification_scopes}` with nonempty unique scopes. Freshness is a positive integer of at most one year. `merge_target_ref` names the target branch explicitly. This policy is declared by the packet, not an authorization policy. |
| `history` | Array of evidence events described below; unique IDs, no input-order precedence. Empty means unknown. Events are retained verbatim in JSON output. |
| `capability_manifest` | `{owner_ref, artifact, unavailable_reason}`. `artifact` is null or `{reference, sha256, schema_version}`. Version is an opaque nonempty string. SHA-256 pins exact file bytes, not reserialized JSON. Missing artifact requires a reason. This is a reference to lane 4's document, not a capability model. |
| `gates` | Array of `{id, owner, reason, next_action}`. These are open gates; empty means no gate was supplied, not permission. |

All events require `{id, kind, at, evidence_ref}`. `at` is the time of the
underlying observation/event, not the time this report copied it. References
must be nonempty; they are rendered as escaped text, never fetched or executed.
Optional `note` provides context. Unknown fields are rejected, including an
invented inferred capability field. Kinds have these additional required fields:

| Kind | Fields |
| --- | --- |
| `review` | `source_head`, `reviewer`, `scope` (`source-only`), `conclusion` (`approved`, `changes_requested`, `commented`). A peer review is identified as such in reviewer/note; it is not a human GitHub approval. |
| `source_check` | `source_head`, `check`, `command`, `conclusion`. |
| `ci` | `workflow`, `run_id` (string), `attempt` (positive integer), `run_head`, `checkout_head` (SHA or null), `association` (null or `{source_head, base_head, checkout_head, evidence_ref}`), `conclusion`, `jobs` (unique `{name, conclusion}` entries). |
| `merge` | `source_head`, `merge_head`, `base_ref`, `pr_number` (positive integer). |
| `deployment` | `surface`, `environment`, `revision`, `deployment_id`, `conclusion`. |
| `verification` | `surface`, `environment`, `revision`, `scope`, `mode` (`recorded_ci`, `live_read`, `offline`), `conclusion`. |

Conclusions other than review are `success`, `failure`, `cancelled`, `skipped`,
`pending` or `unknown`. No absent, null or empty conclusion means success.

## Derivation

- **Source-ready** means exact-head source-only review plus all declared source
  checks succeeded. It says nothing about browser acceptance, remote CI, merge
  permission or deployment. Remote CI is assessed separately.
- An assessment is `established`, `unknown`, `mismatch`, `failed`, `partial`,
  `stale` or `conflict`, with reason and evidence IDs. Read the individual scopes;
  there is no global release-ready or globally verified badge.
- Latest events are selected by observation time per kind/scope. Equal-time
  alternatives are a conflict, not input-order precedence. A later review or
  check at a different source head is a mismatch, not carried approval.
- CI first selects the highest attempt within each workflow/run, then the
  latest run observation. An older green attempt cannot override a newer failed
  attempt. The exact run head and actual checkout head remain separate. A
  different checkout is usable only with an explicit evidence-backed PR-merge
  association matching all three supplied SHAs; a matching run label is not
  proof of what was tested. Missing/skipped required jobs cannot satisfy CI even
  if the aggregate run says success. Equal-time competing runs conflict.
- A merge records that the PR source head or exact merge head was merged into
  the declared target branch; no ancestry inference is attempted. A merge into
  another branch does not establish this milestone. Old merge facts never expire.
- Deployment is scoped to surface/environment. The newest attempt and last
  successful deployment are both retained. A failed deployment does not prove
  rollback, removal or continued serving of the previous revision. Deployment
  events never expire; current-serving claims need fresh verification.
- Verification requires the exact source revision, surface, environment and
  scope. An offline check never establishes served behavior. Successful live or
  recorded-CI observations expire at `at + fresh_for_seconds` (exclusive upper
  bound: exactly at expiry is stale). A copied historical CI observation retains
  `mode=recorded_ci` and its original time. Freshness does not renew by rendering.
  Deployment activity at or after the verification invalidates that current
  assessment until a subsequent verification, including failed, cancelled or
  pending attempts; skipped deployment is not activity. The historical result
  stays intact. An offline failure also cannot assert that the served target fails.
- Freshness applies to the source-ref observation too. Historical immutable
  review/merge/deployment facts remain visible even when current observations
  are stale. Future source/event timestamps are rejected relative to `as_of`.
- Markdown output escapes evidence and names. JSON output contains an unchanged
  history and exact identities. Rendering is deterministic at fixed `as_of`.

## Capability consumption boundary

The capability contract is absent from inspected main
`d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f`, but its
[owner](https://chatgpt.com/c/6afd4d25-b898-83ec-88f1-65ef63a9113e)
delivered a reviewed local/unpublished packet at
`6f76913b45f2b56ffdc3c14e15877319e155a52e`, version
`atlas-capability-manifest/v1`. The operational report consumes that exact
implementation. The operational report must not
reconstruct capabilities from source scans, a historical tool count, source
merge, graph data revision or an invented temporary manifest.

`capability_consumer` is an optional in-process adapter with signature
`(raw_bytes, schema_version, as_of) -> JSON object`. The separate
`with_capabilities.py` implements it by invoking lane 4's actual `parseStrictJson`
and `assessManifest(manifest, {now})`, and returns that complete public projection
unchanged. Core `report.py` remains usable without Node or the dependency. It
checks the manifest byte digest before any consumer call; a missing consumer
remains explicitly unavailable. A canonical `valid: false` result stays invalid,
with original diagnostic fields preserved. No facet is recomputed by this lane.

The bridge pins the owner validator's exact bytes to SHA-256
`471e308cd2483632c7ad3354d81ff156632153fe9aec66742d8fa3ddfd3e62c1`.
It imports those checked bytes in memory, so execution cannot reread a changed
module path. That implementation imports only Node's built-in crypto module.
The bridge passes manifest bytes via stdin, uses fixed arguments without a shell,
sets a ten-second timeout, and supplies only PATH to the child environment.
It passes no credential variables or Node preload options. Millisecond UTC clock
normalization is exact; finer input precision is rejected for this consumer.
Unknown code versions require a new reviewed pin. No sibling source is copied
into or modified by the proposed Git patch.

Missing bytes, digest mismatch, unsupported/rejected documents and unavailable
adapter remain distinct consumer outcomes. Graph/public-data revisions and MCP
service-code revisions must remain distinct inside lane 4's own projection.

## Adoption gate

The capability owner has supplied the exact schema version, artifact and validator
entry point. Both owners still need to accept this adapter; no acknowledgement
or adoption agreement is claimed. The existing release owner
reviews milestone meanings, target scopes and freshness policy. Browser/native
and hosted-credential holds remain. This packet must not be pushed or opened as
a PR while that would invoke browser CI or an external deployment. No workflow
edit, skip directive or permission change is part of adoption. Source-only
evidence is not browser acceptance; source merge is not hosted capability.
