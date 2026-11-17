# Startup Atlas record editing contract

This contract lets an agent edit one existing startup through its canonical ID,
review the complete result, and read back exactly what was proposed or saved.
The authoritative input is `data/startup-research.json`. A graph entity is a
projection and must not be submitted as a complete editable source record.

The implementation starts from main
`a8da234e976142647277d799d84bae792d47bf98` on 17 November 2026. The private hosted
MCP and GitHub Pages have separate release paths. A source implementation, green
test or GitHub merge does not establish that a connected client's tool catalogue
has been refreshed. Discover the actual tools before using this workflow.

## Scope and ownership

The first version edits existing startup source records. It covers descriptions,
websites, founding years, dated profile facts, founders, funding events, articles,
sourced relationships and typed social references. It does not migrate entity
IDs, rename people or startups, remove assertions, upload images, change
authentication, create credentials, change permissions or enable a new service.

Existing opportunity and partner tools retain their current contracts. The
legacy `atlas_validate_startup` / `atlas_propose_startup` tools remain available
for additions and compatibility. Their complete merged record is now validated,
but they do not offer the strict edit contract's target digest, validation token
or source-inheritance guard. Prefer the strict tools below for existing startups.
Do not fall back to a legacy writer to evade a strict identity or evidence error.

Image bytes, manifests, staging and retrieval belong to the separate asset lane.
The shared reference boundary was accepted in the
[canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).
Crawler provenance, Hardware/Next.js/Fluid, design and held PRs 107/135 retain
their owners. This implementation makes no crawler requests.

## Tools and authoritative reads

| Operation | Hosted MCP | Local stdio MCP |
| --- | --- | --- |
| Find a startup | Existing `atlas_search_graph` returns the published projection | `atlas_search_startup_records` searches reviewed source records |
| Read an editable record | `atlas_get_startup_record({id})` | Same name and argument |
| Preview a strict edit | `atlas_validate_startup_edit({edit})` | Same name and argument |
| Submit the preview | `atlas_propose_startup_edit({edit, expectedRevision, validationToken})` creates a draft PR | `atlas_apply_startup_edit({edit, expectedRevision, validationToken})` saves the local overlay and requires `--write` |
| Recover an uncertain result | `atlas_get_startup_edit_proposal({edit})` is read-only | Read `atlas_get_startup_record({id})`, compare the expected digest and inspect the local diff |
| Verify public data | Existing `atlas_get_startup({id})`, plus release and JSON/SQLite checks | Local reads do not establish publication |

The editable read returns `id`, the complete `record`, `sourceFile`, `revision`,
`recordRevision`, `schemaVersion`, `origin` and `published: false`. Hosted reads
pin every input file to one main commit. Local reads identify their origin as
`local_repository`. A startup that exists only in a portfolio graph has no
reviewed overlay to edit; the read returns `NOT_FOUND` with an addition-workflow
instruction. It does not synthesize a researched record from an incomplete graph.

### Four distinct revision meanings

| Field | Meaning |
| --- | --- |
| `revision` / submitted `expectedRevision` | Hosted: the 40-character Git commit SHA of the source snapshot. Local: a 64-character SHA-256 digest of the raw startup research, graph, partner-lead and catalogue inputs. These tokens are not interchangeable. |
| `recordRevision` / `edit.expectedRecordRevision` | SHA-256 of canonical JSON `{id, record}` for the full authoritative record. This catches record edits independently of unrelated repository changes. |
| `validationToken` | SHA-256 binding the schema version, source-snapshot revision, exact intent digest and complete merged record digest. It is an integrity precondition, not a credential, permission or proof of source truth. |
| Published graph `revision`, `mainRevision`, `indexStatus` | The graph's publication state, returned by the existing graph tools. A current graph does not identify the deployed private MCP code version. |

Canonical JSON recursively sorts object keys; array order, text and URL strings
remain significant. `recordRevision` is not a hash of the source file's whitespace.
The local snapshot revision does include raw input formatting. The full intent
digest includes `schemaVersion`, `id`, `expectedRecordRevision` and `patch`, and
is independent of the current main commit.

## Edit request and merge semantics

The schema authority is
[`startup-edit.mjs`](../backend/hosted/src/startup-edit.mjs), which derives patch
fields from [`startup-record.mjs`](../backend/hosted/src/startup-record.mjs).
Both transports import those definitions; there is no separately maintained
copy of the startup edit schema.

An `edit` contains three required fields:

```json
{
  "id": "startup:psiquantum",
  "expectedRecordRevision": "REPLACE_WITH_THE_EXACT_64_CHARACTER_READ_RESULT",
  "patch": {
    "reviewed_at": "2026-11-17",
    "socials": [
      {
        "label": "LinkedIn",
        "url": "https://www.linkedin.com/company/psiquantum-ltd",
        "source": "https://www.psiquantum.com/",
        "reviewed_at": "2026-11-17"
      }
    ]
  }
}
```

The digest placeholder is deliberately not a valid request. Obtain the actual
value from the editable read. The social entry demonstrates Atlas's already
reviewed homepage-linked reference; this example is not a new live proposal.

| Input | Defined behavior |
| --- | --- |
| Omitted field | Preserve the previous value exactly. |
| Scalar value | Replace only that field after validation. |
| Empty collection | Preserve existing entries; it is not deletion. |
| `null`, unknown field, rename or removal argument | Reject with `VALIDATION_ERROR`; nothing is silently dropped. |
| Matching collection item | Upsert by its declared key; preserve omitted item fields. |
| New collection item | Append in submitted order, then validate the whole resulting record. |
| Matching source URL | Preserve its exact string; equality does not prove source or entity equivalence. |

Collection keys are normalized founder name, funding event ID, exact article URL,
profile-fact key, relationship `(kind, target_id, source)` and exact social URL.
These are storage keys, not identity evidence. All arrays reject duplicate keys
within one submitted patch. Founder social upserts preserve omitted existing
social references. The limits apply to both the patch and final merged record:
30 founders, 30 social references per startup/founder, and 100 each for funding,
articles, profile facts and relationships.

The patch requires a real non-future `reviewed_at`. This records the review of
this edit; it does not establish that every inherited claim was researched again.
Item review dates and historical dates remain distinct. Amounts require explicit
currency pairs; image URLs require their existing source pairs. Source URLs must
be public HTTPS references without embedded credentials or nonstandard ports.
Validation never fetches those URLs and does not decide factual accuracy or
image-use rights.

### Source inheritance

Changing a top-level `source` while retaining an omitted description, website or
founding year returns `SOURCE_INHERITANCE` with the affected JSON Pointer paths.
Keep the existing source when adding independently sourced socials, rounds or
facts. To replace the top-level source, review and explicitly resubmit every
inherited claim that would appear supported by the replacement.

The same rule protects inherited funding-event fields when their source changes,
and an inherited founder profile URL when its source changes. Supplied source
changes produce a `SOURCE_CHANGED` review warning after the structural guard
passes. Repeating a field only satisfies the structural requirement; the agent
must still read and verify its evidence.

There is no new global source-entity registry in this version. `source` remains
an exact evidence URL with item-specific dates where supported. Article content
hashes, immutable source captures, contradictory claims and event participants
that do not fit the schema remain in the reviewed evidence ledger. Do not force
them into a misleading field or erase them to make validation pass.

### Entity and person identity

The target ID must select exactly one existing source record under the current
graph slug contract. The startup name is immutable in this edit path. The validator
rejects source/graph identity disagreement, duplicate source IDs, another startup's
funding event ID and unknown/self relationship targets.

Founders still use the current name-derived person IDs. The strict path rejects
spelling/slug collisions and new links that would reuse another startup's person
identity. It also rejects changes to founder metadata shared across startups;
that needs a person-scoped reviewed migration. Omitted founders and exactly
unchanged shared-founder resubmissions are preserved. This prevents a successful
single-record edit from silently changing another company's person projection.
It does not claim to have resolved historic namesakes or added globally stable
person IDs.

Company and founder social references flow through the graph generator. A
successful source readback alone is still insufficient: verify the affected
published entity after the normal release.

## Proposal, concurrency and recovery

Validation returns the complete `previous` and `merged` records, JSON Pointer
`changedPaths`, warnings, current source and record revisions,
`nextRecordRevision`, `intentDigest`, `branch`, `validationToken` and
`persisted: false`. Inspect the complete preview before submission.

Hosted submission checks the immutable intent for an existing proposal first.
A matching proposal is returned only after verifying its full one-file diff,
single-parent history, parent ancestry, complete source contents, PR repository,
base and exact head. This lookup is read-only; it does not reopen a closed PR or
complete a branch left without a confirmed PR.

A fresh proposal requires the current main SHA and the exact validation token.
It writes one source file to a new deterministic `atlas-edit/` branch, creates a
draft PR, and verifies the proposal again before reporting success. The receipt
includes `baseRevision`, `headRevision`, observed `mainRevision`, PR URL, intent,
exact record and its digest. Main is never modified. A concurrent main advance
after preflight may leave the draft behind current main; the reviewer must check
the combined result before merge. A GitHub branch proposal is not a global lock
on repository main.

| Result | Required next action |
| --- | --- |
| `STALE_REVISION` | Read current source, reconcile the intended change, review the new preview and validate again. Do not merely replace the SHA. |
| `RECORD_CONFLICT` | Re-read the record. Preserve the concurrent change and reassess the patch. |
| `VALIDATION_CONFLICT` | The payload or preview changed. Validate the exact intended edit again. |
| `SOURCE_INHERITANCE` | Keep the old source or reverify and explicitly resubmit the affected claims. |
| `IDENTITY_CONFLICT` / `AMBIGUOUS_ID` | Resolve identity through a reviewed migration; do not change spelling to evade the error. |
| `WRITE_BUSY` | Another local MCP writer owns the shared lock. Do not remove its lock. |
| `WRITE_UNCERTAIN` | Retain the original exact intent and read its proposal/local record before any further mutation. |
| `BRANCH_CONFLICT` | Inspect the differing branch/PR. Do not force-update it or vary the intent to manufacture another branch. |

After any unconfirmed hosted POST or failed post-write readback, the error includes
the deterministic branch, intent, expected resulting record digest and
`recoveryTool: atlas_get_startup_edit_proposal`. Recovery can report `not_found`,
`proposed`, `closed` or `merged`; incomplete or mismatching states remain explicit
errors. `not_found` means no matching branch/PR was observed, not that no orphan
Git object was created. Do not automatically repeat an uncertain request.

Multiple proposals for different startups still change the same source file.
Merge sequentially and validate each combined result against the then-current
base. Never copy one branch's entire research file over another proposal.

Local application requires `--write`, uses the existing shared lock, compares
all four input files after locking and again immediately before atomic replacement,
syncs the replacement and directory, and verifies the full saved source plus
record digest. Failure after replacement returns `WRITE_UNCERTAIN` and the
expected digest. The lock coordinates MCP writers; an external editor can race
after the final check, so retain the local diff and inspect uncertain results.
No-op application preserves file bytes. Repeating an already-applied request
with stale preconditions is a conflict, not a local exactly-once guarantee.

## Agent workflow example

Use the following sequence with the newly deployed tools. The first source check
must establish the organisation, social account and evidence—not just URL shape.
PsiQuantum's existing permission hold on logo reuse remains intact.

1. Discover tools and call `atlas_get_connection`; confirm
   `castlemilk/startup-atlas`. Search the published graph for PsiQuantum.
2. Read the official source independently. Keep the observed source, review date,
   temporal scope and any unavailable/uncertain claims in the research ledger.
3. Call `atlas_get_startup_record` for the exact startup ID. Preserve the complete
   returned source record and digest. Inspect open proposals affecting that intent.
4. Construct only the reviewed patch; call `atlas_validate_startup_edit`. Review
   every changed path and the full merged record, including inherited sources.
5. Submit the exact edit, returned revision and token through
   `atlas_propose_startup_edit` once. Retain the receipt and exact head.
6. Inspect the PR's complete diff, CI, source evidence and identity. The tool has
   not approved the facts or merged the PR.
7. Under existing merge authorization, check current base, independently review
   the combined result and merge through the existing release path. Otherwise
   leave the PR reviewable. Check the terminal Pages run and actual published
   JSON/SQLite revision and affected records.
8. Read `atlas_get_startup` for publication and `atlas_get_startup_record` for the
   authoritative repository state. Compare claim fields and source attribution,
   not only revision strings. Verify the private MCP deployment and refreshed
   tool catalogue separately when code/schema changed.

This complete SDK helper deliberately separates preparation from submission;
the supplied social records must already have been independently reviewed:

```js
async function callAtlas(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find(item => item.type === 'text')?.text;
  const value = result.structuredContent ?? (text ? JSON.parse(text) : null);
  if (result.isError) throw Object.assign(new Error(value?.message ?? 'Atlas call failed'), value);
  return value;
}

async function prepareReviewedSocialEdit(client, id, reviewedSocials, reviewDate) {
  const before = await callAtlas(client, 'atlas_get_startup_record', { id });
  const edit = {
    id,
    expectedRecordRevision: before.recordRevision,
    patch: { reviewed_at: reviewDate, socials: reviewedSocials },
  };
  const preview = await callAtlas(client, 'atlas_validate_startup_edit', { edit });
  return { before, edit, preview };
}

async function submitReviewedPreview(client, prepared) {
  return callAtlas(client, 'atlas_propose_startup_edit', {
    edit: prepared.edit,
    expectedRevision: prepared.preview.revision,
    validationToken: prepared.preview.validationToken,
  });
}

async function inspectUncertainProposal(client, prepared) {
  return callAtlas(client, 'atlas_get_startup_edit_proposal', {
    edit: prepared.edit,
  });
}
```

On `STALE_REVISION`, call the read again and construct a newly reconciled preview.
On an uncertain result, call `inspectUncertainProposal` with the original intent;
do not create a new intent simply to retry. An unchanged record hash alone does
not prove an image attachment or published profile has been verified.

## Asset reference boundary

The agreed conceptual attachment tuple is:

| Component | Owner and meaning |
| --- | --- |
| Canonical target ID and expected record revision | This lane; identifies the exact record and its pre-edit state. |
| `asset:sha256:<full digest>` | Asset lane; identifies exact bytes, not a subject or permission. |
| Canonical manifest SHA-256 | Asset lane; identifies the exact subject/role/source/rights review. |
| Exact repository commit resolving the approved asset and manifest | Future integration adapter; prevents a moving path from changing the attachment silently. |

The tuple is not yet an accepted field in the record tool schema. The integration
adapter must resolve both digests and target/role compatibility at a pinned
revision, require the asset owner's publication eligibility result, then create
a revision-guarded record proposal. No arbitrary storage URL, path or caller's
`approved: true` may substitute for that resolution. Byte deduplication must not
merge people/companies or transfer rights between manifests.

Unreviewed captures remain outside public Git and site assets. A draft branch in
this public repository already exposes its committed files. Public export needs
the separately reviewed identity and rights decision for those exact bytes and
use. Storage location, upload/finalization tools and attachment transaction
boundaries remain separate reviewed choices; this change adds none of them.

## Verification and release gates

The regression suite covers actual protocol calls, complete merged limits,
typed social propagation, exact payload tokens, stale record and snapshot
revisions, inherited-source rejection, identity collisions, concurrent requests,
tampered branch/PR state, and lost responses after GitHub writes. Local cases also
exercise read-only mode, the shared lock, atomic replacement, unexpected external
changes and failed readback after replacement. Fixtures never create real
catalogue proposals or fetch evidence.

Run from the repository root:

```sh
npm test
npm run test:mcp
npm --prefix backend/hosted test
npm run build
npm --prefix backend/hosted run build
go test -mod=readonly ./backend/internal/graph ./api
git diff --check
```

The existing Pages PR workflow supplies its required browser/runtime checks.
Record the exact tested head and inspect terminal CI, not merely a dispatched
run. The private MCP needs its normal owner-private deployment with existing
identity/OAuth/D1 bindings preserved, followed by real connection/read/schema
discovery. Do not use a production write solely to test the new tools. This
change leaves the data, auth configuration and private MCP release unmodified.
