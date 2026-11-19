# Asset proposal recovery requirements

This is a review contract for a future repository adapter. It does not implement
an upload endpoint, GitHub writer, recovery service or release operation. The
current offline helpers cannot turn a candidate target or prepared asset packet
into permission to publish. The existing record implementation and its
[record editing contract](../../docs/MCP-RECORD-EDITS.md) retain ownership of
identity, record revisions, validation tokens, writes and proposal recovery.

## Decisions required before the first public write

The adapter must have an agreed storage path, ingress size/transport, authenticated
review decision and transaction shape. Changing one of those decisions is not a
routine retry. The current six-file hosted read allowlist, 128 KiB request bound
and one-file startup proposal verifier remain in effect until their owners review
a concrete integration. No new service or permission is implied by these notes.

The public repository is already an exposure boundary. Creating a Git blob may
make bytes retrievable before a branch, PR, merge or Pages release exists. Before
the blob request, review the exact bytes, correct subject/role, rights for public
repository storage and website use, and the public provenance projection. Keep
private captures, reviewer context and permission correspondence out of Git.
The public projection has its own digest; its redacted bytes cannot reuse the
complete private review manifest's digest.

Retain a preflight receipt before any mutation. It needs exact content and private
review identities, the selected public projection and its digest, intended
subject/role/target, relevant source and record preconditions, intended file set,
transaction shape and recovery locators. An operation whose result is lost must
not also lose the information needed to identify that operation. The adapter
owner must define the semantic intent and its canonicalization before assigning
branches or idempotency keys. Do not use a display name, truncated asset hash or
moving URL as the full identity.

The preflight receipt is evidence for reconciliation. It is not an authenticated
approval token. The private staging helper's `authorization: caller-attestation-only`
and the target checker's `authorization: none` must remain explicit.

## Choose a transaction shape

Neither transaction below is selected or implemented by this packet.

| Choice | Integrity and release behavior | Review requirements and cost |
| --- | --- | --- |
| One atomic multi-file proposal | One Git tree/commit contains the approved image, public manifest and exact source-record change. The record cannot be merged without its proposed asset files. Git object creation and PR creation are still multiple remote operations. | A new bounded adapter must verify the entire allowed file set, all bytes and records, parent/history and exact PR identity. The existing one-file verifier cannot be weakened or bypassed. Build/publish paths and provenance behavior need joint review. |
| Two ordered proposals | Asset/public-manifest PR is reviewed, merged, released and retrieved first. Only then may a fresh record preview reference the released asset; that record PR has its own release and readback. | Each proposal has independent exact intent/recovery evidence. The second proposal must resolve the first proposal's released bytes and manifest at a pinned commit. This adds release ordering and can leave a reviewed but unreferenced public asset if attachment is rejected. |

For separate proposals, a public raw Git URL or successful blob upload is not
proof that the chosen website asset URL is released. Before constructing the
attachment proposal, retrieve the released image and manifest, verify digests,
MIME, size and dimensions, confirm current use eligibility, then reread the record
and obtain its current strict preview. If the asset release is incomplete or the
record revision changed, attachment stops. Do not simply copy a new SHA into an
old request.

For an atomic proposal, the adapter must supply a complete exact allowlist rather
than accepting arbitrary extra files beside `data/startup-research.json`. It must
also account for added versus modified paths, forbidden modes/symlinks, path
traversal, unexpected deletions, and incomplete/truncated comparison responses.
The approval covers those exact bytes and that exact merged record; it does not
authorize a different tree after a conflict.

## Lost-result stage table

Every row below requires read-only reconciliation first. HTTP success with an
unreadable body, timeout, disconnected client, process termination and failed
post-write readback can all leave an unconfirmed write. An apparent network
failure is not evidence that nothing was stored. Preserve the original intent;
do not change its content or key to manufacture another branch.

| Last attempted stage | What may exist | Read-only evidence to inspect | Allowed conclusion or hold |
| --- | --- | --- | --- |
| Before any public write | Only private preflight and staged bytes | Verify retained input/review/public-projection identities and absence of an attempted mutation in the local operation record | A fresh submission still requires current authorization and preconditions. Do not label an unrecorded operation as definitely unattempted. |
| Blob creation, response lost | Public blob object, even without a branch | If a blob locator was retained, retrieve and decode those bytes, compare content digest and exact size/format. Inspect any later known tree/ref/PR as well. | Matching bytes confirm only that object. No locator or no matching ref does not prove absence of an orphan object. Hold for explicit reconciliation; do not blindly replay the blob request. |
| Blob confirmed, before tree | One or more approved public blobs | Re-read each exact blob and its public-manifest counterpart; compare the complete planned object set | Objects are uploaded, not a proposal or release. Continuing a partial transaction requires the reviewed recovery procedure. |
| Tree creation, response lost | Tree and blobs | Inspect any retained tree locator and later known commit/ref. Verify all expected path/mode/type/blob entries and that the response is complete | Matching tree is insufficient for success. Unknown tree locator or an unexpected/truncated tree remains uncertain; do not create a replacement tree automatically. |
| Tree confirmed, before commit | Verified tree, no confirmed commit | Verify the tree and original parent/base intent | No record proposal exists yet. Do not promote this partial state automatically. |
| Commit creation, response lost | Commit/tree/blobs | Inspect retained commit or branch/PR locator. Verify the exact expected tree, single parent, parent ancestry and complete allowed diff | A verified commit is not a branch, PR or release. Unknown commit locator or unexpected history stays uncertain. |
| Commit confirmed, before ref | A public commit may be addressable directly | Verify exact commit/tree/diff and original planned branch | Do not attach a fresh branch automatically as an uncertain-write retry. An operator-reviewed continuation must preserve the original intent and current preconditions. |
| Branch/ref creation, response lost | Deterministic branch may exist | Read that exact ref and all matching PRs; compare the branch head to the verified intended commit | Matching branch without a confirmed PR is an incomplete proposal. Missing branch does not rule out orphan objects or a deleted branch. Hold; never force-update. |
| Ref confirmed, before PR | Matching branch without a PR | Re-read ref, complete diff/history and matching PR inventory | Remains branch-only and uncertain. Do not auto-complete it by creating a PR. |
| PR creation, response lost | One matching PR, none observed, or a conflicting/multiple set | Inspect all matching PRs with complete pagination; verify repository, base, branch, exact head, state and complete proposal contents | Exactly one fully matching PR can yield its verified existing receipt. Zero PRs with a branch stays incomplete; more than one or conflicting state fails closed. |
| PR confirmed, final readback lost | A proposal exists but the returned result was not verified | Repeat read-only proposal inspection, including full source record, digests and current PR head | Return a receipt only after complete verification. Do not replay writes because the final read failed. |
| Merge or release result lost | PR may be merged; Pages may be pending, failed or complete | Read PR merge state and exact merge commit, existing release run and actual released artifacts | Report observed merged/release state separately. A merged PR does not establish successful publication or refreshed private MCP code. |

The Git object SHA and the asset content SHA-256 are different identifiers. Never
use one as proof of the other. A tool/API limit or truncated PR/file list is a
verification failure, not permission to verify only the visible subset.

## Identical duplicates and divergent intent

| Observed situation | Required handling |
| --- | --- |
| Same complete semantic intent, one matching proposal | Read the exact branch/PR and verify all objects, manifests, record contents, file set, parent/history and PR identity. Return the existing receipt without writing. |
| Same intent after unrelated main advances | Recovery may identify the old proposal, but it must report its original base and current main separately. Revalidate the combined result before any authorized merge. A successful recovery is not permission for a fresh write with stale preconditions. |
| Same branch or key, different bytes, manifest, subject, role or target | Treat as a conflict. Do not force-update, overwrite a manifest, widen the allowlist or change the key to escape the discrepancy. |
| Changed source/record precondition or intended content | Retain the original uncertain intent for reconciliation. A genuinely new intent requires a fresh source read, evidence review and strict preview; it is not a retry. |
| Matching proposal is closed | Report closed. Do not reopen it or create a substitute automatically. |
| Matching proposal is merged | Report merged with exact merge evidence. Keep publication unverified until the release and artifact readback succeed. |
| Blob present but manifest absent, or vice versa | Incomplete. A digest-named object alone is not an attachable asset and cannot confer rights on another manifest. |
| Branch missing but PR still exists, wrong PR head/base/repository, extra files, unexpected history or multiple PRs | Return an explicit uncertain/conflict disposition and preserve evidence for manual reconciliation. |

For all recovered proposals, read the complete authoritative source record at the
proposal head. A graph entity, search result or a matching changed field is not
an adequate replacement. Validate that unrelated records and omitted metadata are
preserved. Multiple startup proposals modify the same source file: merge in the
existing reviewed order and validate the combined result at the then-current base.

## Target and revision checks remain mandatory

The offline [`targeting.py`](targeting.py) checks consistency of supplied source
reads, a complete founder occurrence inventory, graph retrieval pins and an
explicit reviewed source-to-person mapping. It preserves opaque record-owner
revision tokens; it never recomputes them with asset canonicalization. Its
candidate format is not accepted by the current MCP tools.

A startup logo has the startup as both edited record and asset subject. A
portrait has a startup as the edited record, a person as the asset subject, and
an exact existing founder pointer/name as the nested target. The whole startup's
`expectedRecordRevision` guards that edit. Do not select a founder by normalized
name or derive a person ID from a proposed filename. Do not change a nested
portrait into a top-level logo when a mapping fails.

The returned pointer identifies the intended image slot, not a complete patch.
The future record adapter must preserve the existing `logo`/`logo_source` or
`photo_url`/`photo_source` pair and all source-inheritance guards. It must obtain
the plan's subject and role from the verified asset manifest/projection; merely
supplying those strings to the target checker does not bind an image to them.

Graph data is supporting projection evidence. The checker requires an explicit
retrieval pin and reviewed adapter mapping for the supplied source snapshot.
The graph's embedded build revision is recorded separately by its owner and may
be historical; it is not silently treated as the current source token. These
offline captures and reviewer labels are not authenticated. The production
adapter must acquire them through the approved source-read boundary and perform
the existing strict record preview immediately before submission.

The checker rejects observed shared or ambiguous portrait targets. The existing
strict record implementation still owns global founder collision, normalized
name, shared-person and source-inheritance guards. An offline candidate does not
override any of them. Generic asset reviews retain firm-scoped team IDs such as
`person:pat-example--fixture-firm`, but this startup attachment checker rejects
them as nested-founder targets even when a supplied mapping claims a founded
edge. Firm-scoped team members and the current global founders are distinct;
any conversion belongs to the record owner's separately reviewed migration.
The founder array position is a location in the whole revision-guarded record,
never an identity. A reordered record requires a fresh read and reviewed mapping;
changing only the array index or revision token does not resolve the conflict.

Hosted `expectedRevision` is a Git commit. Local `expectedRevision` is a digest of
four input files and must never be used as an asset Git commit. The authoritative
record revision, private asset review revision and public projection revision
also remain separate. The adapter must resolve the appropriate values afresh
rather than treating similar-looking hashes as interchangeable.

## Release verification and revocation

After an authorized release, read the actual record and image bytes. Verify the
graph/SQLite source revision, complete record/attribution, exact image and public
manifest digests, HTTP MIME, size and dimensions. Record cache lag, 404s and any
revision mismatch. A successful source PR or unchanged record hash is not asset
retrieval evidence. Verify private MCP code deployment and tool discovery
separately from Pages.

A later rights withdrawal or identity correction does not rewrite history or
silently make an old manifest current. Block new attachment under the withdrawn
review, prepare the explicit record fallback/removal and public asset change,
review them through the existing owners, release, then verify both surfaces.
Deleting a path from the current tree does not retract public Git history or
previously retrieved copies. Storage retention and revocation procedures must
be agreed before upload is enabled; this packet does not implement deletion,
cache purge, credential changes or automatic cleanup.

## Evidence and remaining implementation gates

The target contract tests are synthetic, offline consistency tests. Existing
hosted proposal tests separately exercise one-file startup recovery against
mocked GitHub. Neither suite demonstrates a multi-file asset upload or a real
release. This stage table is a review requirement, not an executable remote
reconciler. Implementing it requires the storage, ingress, authenticated review,
transaction and exact-file recovery adapters to be reviewed together, with
failure injection at every remote-write boundary above.
