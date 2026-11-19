# Record attachment acceptance contract

This is a **source-only review packet** for a future Startup Atlas attachment
adapter. It defines the record-side conditions that a proposed asset reference
must satisfy and exercises them with synthetic fixtures. It adds no accepted
MCP field, tool, asset writer, storage path, GitHub allowlist or authentication
mechanism. A positive fixture is never permission to write or publish.

The packet starts from main
[`01375e4c62fd0b057cd7d21a34223b26a9e23360`](https://github.com/castlemilk/startup-atlas/commit/01375e4c62fd0b057cd7d21a34223b26a9e23360).
[PR 157](https://github.com/castlemilk/startup-atlas/pull/157) merged as
`55a6efedf4ea03883c14e70df76885f97125d54b`; [PR 158](https://github.com/castlemilk/startup-atlas/pull/158)
merged as the current baseline. Their source merge does not establish hosted
availability. The existing release owner handles hosted deployment; credential
approval is pending. This packet does not create credentials, change permissions
or auth, deploy, fetch images, request robots.txt, or make real record writes.

## Ownership and integration boundary

The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
coordinates the two ordinary Pro strands. The
[record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51) owns this
packet, API schemas, canonical record/person identity, metadata semantics,
optimistic concurrency, existing auth boundaries and proposal recovery. The
[image owner](https://chatgpt.com/c/6afc366d-edec-83ec-b7e7-dad3998b2861) owns
`contracts/mcp_assets/`: the complete 128 KiB request budget, canonical byte
parity, public-safe manifest projection and transaction tradeoff. This packet
consumes the asset lane's verified outputs; it does not implement those functions.

The current authorities remain the
[record editing contract](../../docs/MCP-RECORD-EDITS.md),
[asset foundation](../../docs/MCP-ASSETS.md),
[startup edit validator](../../backend/hosted/src/startup-edit.mjs),
[hosted proposal verifier](../../backend/hosted/src/github.mjs) and
[local store](../../backend/mcp/startups.mjs). Crawler, Hardware/Next.js/Fluid and
design ownership, held PRs 107/135 and PsiQuantum's unresolved image-use hold stay
in force.

## Conceptual intent and independent revisions

The strict envelope below is a contract fixture, **not an accepted HTTP or MCP
request**. `fixtures.mjs` supplies complete synthetic values and computes the
actual whole-record digest through the existing production helper.

| Field | Required meaning |
| --- | --- |
| `contractVersion` | Exactly `atlas.record-attachment.v0`; this is a review-model version, not a deployed API version. |
| `target.recordId` | An exact existing `startup:<slug>` selecting one authoritative source overlay. A graph-only entity is insufficient. |
| `target.expectedRecordRevision` | Bare lowercase SHA-256 of canonical JSON `{id, record}` for the entire startup record. |
| `target.subjectId` | The startup ID for a logo; the existing global `person:<slug>` for a founder portrait. |
| `target.role` | `logo` or `portrait`, matching the exact manifest subject and intended use. |
| `target.locator` | `{kind: 'startup'}` or `{kind: 'founder', name: <exact existing source spelling>}`. No supplied array index or path. |
| `asset.repository` | Exactly `castlemilk/startup-atlas`. |
| `asset.commit` | Exact lowercase 40-character Git commit resolving the asset and manifest together. No `main`, branch, tag, shortened SHA or local snapshot hash. |
| `asset.assetId` | `asset:sha256:<64 lowercase hex>`, identifying the exact bytes. |
| `asset.manifestRevision` | `sha256:<64 lowercase hex>`, identifying the exact canonical manifest resolved at that commit. |

The source snapshot precondition is supplied separately in the review context.
Hosted mode uses the current 40-character repository commit; local mode uses the
existing 64-character digest of four source files. Neither is interchangeable
with the asset commit or the whole-record digest. Even when a target record is
unchanged, an unrelated main advance invalidates a fresh proposal's old source
snapshot precondition.

The review context is an out-of-band trusted snapshot assembled through the
existing source-read boundary, not another caller-supplied request. Its graph and
research must come from the same pinned source snapshot; `now` comes from the
service's trusted clock. Synthetic context can test those obligations but cannot
prove a real read or clock is trustworthy.

`manifestRevision` adopts the helper's `sha256:` representation. It does **not**
assume that a private staged review's `asset_revision` equals a future public
manifest digest. Removing private permission correspondence or otherwise changing
canonical bytes changes the digest. The image owner must define and verify the
public projection and its binding to private review evidence. This packet never
requests that private evidence be put in Git, a tool response or a public manifest.

The model's intent digest binds the version, exact target and locator, whole-record
revision, repository, asset commit, content ID and manifest revision. It uses a
fixed ordered scalar tuple, not the image manifest's serialization. Object property
ordering does not change identity. The source snapshot is excluded so an existing
intent can be located after unrelated main changes. Changing the record revision,
subject, role, commit or either asset digest creates a different intent and needs
fresh review; it must not be used to escape an uncertain original proposal.

## Canonical target and founder mapping

The authoritative source is `data/startup-research.json`. The existing
`readStartupRecord` and `recordRevision` helpers resolve and hash it. A projected
graph result, nested founder hash or stale source response cannot substitute for
the full source record.

| Attachment | Required mapping | Explanatory record pointer |
| --- | --- | --- |
| Startup logo | `recordId === subjectId`; the exact startup source and graph identity agree | `/logo` |
| Founder portrait | The startup contains exactly one founder with the supplied exact name; existing `startupSlug(name)` equals the supplied global person ID | `/founders/<derived index>/photo_url` |

These pointers explain the existing record location. They do not choose an asset
URL, authorize a field update or establish a new storage mapping. The adapter must
derive the index from the revision-pinned source, never trust a client index.
Reordering founders or changing another field changes the whole-record revision
and prevents an old locator from targeting a different person.

Founder upsert keys currently use Unicode NFKC, lowercase and whitespace
normalization; graph founder IDs use NFKD followed by ASCII slug generation.
Those are different operations. The contract pins the exact source spelling and
the existing derived person ID together. It rejects missing founders, duplicate
or colliding person IDs, spelling substitutions, graph/name disagreement and
firm-scoped team-member IDs such as `person:<name>--<partner>`. A name match is not
a person-identity migration or a new founder association.

A fresh company-scoped portrait attachment must also inspect other source
startups and graph-only `founded` edges. A founder shared with another startup is
blocked for this attachment path pending a reviewed person-scoped migration.
Checking only the selected record would miss that global projection effect.
Ordinary record edits may continue to omit founders or resubmit an exactly
unchanged shared founder; the existing guard retains that behavior. This packet
does not silently introduce an exception for attachment writes.

## Asset resolution and approval prerequisites

The model takes two out-of-band dependencies, `resolveAsset` and `verifyApproval`.
They are **synthetic trusted-context stubs in tests**. No production resolver or
approval authority is implemented. Client payload fields cannot replace either
dependency.

The asset resolver must report verification of the exact requested repository,
commit, content ID, manifest revision, subject and role. A matching byte digest
alone is insufficient: identical bytes may have different subject and rights
reviews. A moving reference, mismatched manifest, stale commit or another subject's
review must fail. The image owner remains responsible for recomputing bytes,
canonical manifest parity, technical policy and the public-safe projection. The
record checker does not reimplement image parsing or hash arbitrary caller claims
as if they were verified assets.

The approval dependency must attest that an authenticated, currently authorized
decision covers the exact intent and both intended public-repository and
public-website uses. The synthetic model requires a decision identity, policy
reference, active validity and no revocation. Missing, unknown, expired, revoked,
wrong-intent or wrong-use decisions fail. These are acceptance obligations;
the actual approver policy, trust source, verification mechanism, expiry and
revocation enforcement remain owner decisions.

In particular, none of the following supplies authenticated approval:

- `approved: true`, a caller-supplied reviewer name or a field named `approval`.
- The asset helper's `authorization: caller-attestation-only` preparation result.
- A content/manifest hash, validation token, existing GitHub OAuth connection,
  green CI run, draft PR or source merge.
- Possession of an image URL or accessible press download.

Approval must be enforced **before the first public Git write**, including blob
creation, not after a draft PR is opened. This repository is public. For an asset
already at an exact commit, attachment approval must bind that exact reference.
For a newly prepared asset, the image owner must define pre-export authorization
and subsequent commit readback as part of the transaction decision. This packet
does not pretend a not-yet-created commit can be confirmed or choose that
transaction on the owner's behalf.

The input intent and source context are frozen snapshots for asynchronous checks.
Mutating caller objects while a resolver runs cannot change what was hashed,
reviewed or returned. No private manifest, permission correspondence or credential
is returned by the model. Every positive result still has `sourceOnly: true`,
`runtimeSupported: false`, `writePermitted: false` and `published: false`.

## Stale proposals and uncertain results

The source model is a precondition checker, not a second writer or recovery
engine. The existing hosted and local implementations remain the executable
authority for their current one-file record edits. Their tests provide baseline
evidence for the recovery invariants below; they do not establish combined image
attachment recovery.

| Observation | Required disposition |
| --- | --- |
| Whole-record digest changed, including a different founder or array order | Read the complete current record, preserve concurrent edits, resolve the target again and review a new intent. |
| Repository/local snapshot changed but target digest is unchanged | Re-read and validate against the current snapshot before a fresh write; do not just replace the precondition token. |
| Payload differs from the validated intent | Validate and review the exact payload again; a previous token or approval cannot cover substitution. |
| Submission returned an uncertain result | Retain the original intent and inspect it read-only before any new mutation. |
| Exact verified proposal exists and main has advanced | Return its exact readback without writing; inspect current compatibility before any authorized merge. |
| Verified proposal is closed or merged | Report that state without reopening, rewriting, claiming publication or repeating the write. |
| Branch exists without confirmed PR, or PR exists without its branch | Stop with an uncertain/conflict result; do not complete or repair the partial proposal automatically. |
| Wrong file set, content, commit history, repository, base or PR head | Explicit conflict; never widen the verifier or force-update the branch. |
| No matching proposal is observed after an uncertain write | Preserve uncertainty: orphan blobs/trees/commits may still exist. No automatic replay. |
| Local replacement may have succeeded but acknowledgement/readback failed | Inspect the actual source and complete expected record digest under the existing lock/revision protocol; no blind replay. |

The future adapter must retain the exact asset commit and manifest binding in its
intent and authoritative proposal readback. A correct record digest cannot excuse
an extra or changed asset file. Current `updateProposal` verifies exactly one
modified JSON file, single-commit/single-parent history, base ancestry, complete
contents and exact PR identity/head. The new runtime fence deliberately rejects a
proposal with an additional synthetic manifest file. That is evidence that the
existing boundary is preserved, not an implemented multifile strategy.

The image owner compares ordered asset/record proposals with an atomic multifile
proposal. Whichever is reviewed must explicitly handle lost acknowledgements,
stale records, changed asset branches, dangling references, release ordering,
revocation and full exact-head readback. No choice is made here. Existing recovery
must not be bypassed to make either option appear to work.

## Agent sequence and evidence levels

1. Discover actual MCP capabilities; verify the existing connection and search for
   the canonical entity. Source merge alone is insufficient discovery evidence.
2. Review the exact company/person and primary source. Keep byte acquisition,
   subject identity, rights and authenticated approval separate.
3. Read the complete source record and both record/source revisions. For a founder,
   bind the global person to the existing nested founder and check shared identity.
4. Obtain the image owner's verified asset/manifest result at an exact commit and
   the trusted approval decision for the intended use. Until these dependencies
   and the integration decisions are available, stop at this review packet.
5. Validate the exact proposed attachment and inspect its complete preview. This
   packet provides synthetic contract tests only; no attachment call is advertised.
6. After separately reviewed runtime integration, propose once through the existing
   auth boundary, inspect the complete PR and authoritative readback, and reconcile
   any stale or uncertain result as above.
7. Merge/release only through existing authorized owners and routes. Verify source
   head, successful release, published graph/SQLite, actual bytes and manifest, and
   the affected source and public record. Verify hosted code/tool discovery
   separately. Source merge, PR state and graph freshness are distinct evidence.

## Executable evidence

[`reference-model.mjs`](reference-model.mjs) exports
`ATTACHMENT_CONTRACT_VERSION`, `attachmentIntentDigest(intent)` and
`evaluateAttachmentContract(intent, context, {resolveAsset, verifyApproval})`.
Context includes `mode`, `head`, `expectedRevision`, `research`, `graph` and an
explicit check time `now`. There are no network, filesystem or mutation APIs in
this reference model. Only tests import it; runtime code does not.

| Test surface | What it establishes | What it does not establish |
| --- | --- | --- |
| `tests/record-attachment-contract.test.js` | Synthetic target/revision/asset/approval conditions and non-mutating, fail-closed results | Live approval, rights truth, asset bytes, accepted API or hosted availability |
| `backend/hosted/tests/attachment-boundary.test.mjs` | Real hosted dispatch refuses unsupported attachments/approval, preserves shared-founder and file/recovery boundaries, with mocked repository I/O | Real GitHub writes or an implemented attachment adapter |
| `backend/mcp/tests/attachment-boundary.test.mjs` | Real stdio rejects unsupported fields without changing disposable source bytes; `--write` is still required | Public record writes or remote asset storage |
| Existing `startup-edit-transport.test.mjs` and local `startup-edits.test.mjs` | Stale snapshots/records, deterministic intent recovery, lost acknowledgements, partial proposals, exact readback, concurrent identical requests and lock behavior | Cross-file image transaction recovery |

From the repository root, run the focused acceptance and recovery evidence:

```sh
node --test tests/record-attachment-contract.test.js
node --test backend/hosted/tests/attachment-boundary.test.mjs backend/hosted/tests/startup-edit-transport.test.mjs
node --test backend/mcp/tests/attachment-boundary.test.mjs backend/mcp/tests/startup-edits.test.mjs
```

The files are also discovered by the existing root, hosted and local test scripts.
Full verification uses `npm test`, `npm run test:mcp`,
`npm --prefix backend/hosted test`, `npm run build`,
`npm --prefix backend/hosted run build` and the existing CI gates. No CI trigger,
package, deployment workflow or live test record is added. Record actual tested
SHAs and terminal CI outcomes in the PR and canonical Space; preserve historical
foundation CI evidence separately.

## Decisions required before integration

| Gate | Required review and owner |
| --- | --- |
| Shared manifest binding | Both lanes agree which exact public manifest digest is pinned and how it binds to private review without disclosing correspondence. Image owner supplies canonical parity and projection evidence. |
| Authenticated authority | Owner chooses the existing-identity approval policy and verification/revocation mechanism. No real decision may be inferred from the test stubs or a caller attestation. |
| Public paths and mapping | Image/storage and record owners agree immutable asset/manifest paths and the record URL/reference projection. No current file allowlist or accepted record field changes before review. |
| Transaction and recovery | Image owner presents the ordered versus atomic tradeoff; both lanes review exact file/history verification, fault cases and release dependencies before changing the current one-file boundary. |
| Runtime schema and transport | Review explicit schema changes against this packet and the image owner's complete 128 KiB budget. Preserve local read-only/lock checks and existing hosted auth. |
| Release and live readback | Existing release owner completes the authorized hosted route after credential approval; verify actual tool catalogue and live asset/record retrieval independently of source merge. |

Passing this packet advances review of those obligations. It does not resolve
the gates or enable a write path.
