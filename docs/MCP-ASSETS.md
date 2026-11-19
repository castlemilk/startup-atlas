# Image assets for Startup Atlas agents

The asset helper in [`scripts/atlas_assets.py`](../scripts/atlas_assets.py) validates
supplied image bytes, binds their provenance to an immutable manifest, stages them
in a local store outside Git, and verifies them on readback. It does not fetch an
image, authenticate a reviewer, upload to GitHub, attach metadata, or publish a
website. Those distinctions are part of its result contract.

This is a bounded foundation for the requested agent journey, not a newly deployed
MCP upload tool. The remote tool catalogue inspected on 17 November 2026 exposed
the existing thirteen connection, opportunity, partner and startup tools, with no
asset upload or asset retrieval tool. Existing logo and portrait URL fields are
not content-verified asset references.

## Ownership and accepted boundary

The asset and record-contract lanes agreed the following boundary in the
[canonical project Page](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
on 17 November 2026. The record lane's
[conversation](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51) and branch
`feat/mcp-record-edit-contracts` retain canonical identity, API/tool schemas,
metadata merge semantics, authentication, optimistic concurrency and repository
proposal recovery. This lane owns byte validation, asset provenance, private
staging, readback and the integration requirements below.

| Identifier | Meaning | Must not be used as |
| --- | --- | --- |
| `asset:sha256:<64 lowercase hex>` | SHA-256 of the exact stored image bytes | Entity identity, rights approval or a record revision |
| Asset review revision | SHA-256 of canonical manifest JSON, including byte measurements and the complete source/subject/role/rights attestation | A Git commit, authenticated approval or proof that a source is true |
| Repository revision | Exact Git commit containing the reviewed bytes and manifest | Proof that Pages or the private MCP has deployed it |
| Record revision | Record-lane SHA-256 of canonical JSON `{id, record}` | Asset digest or permission to overwrite a newer record |
| Published revision | Revision actually read from the released graph/SQLite snapshot | Current repository main when the index lags |

Canonical JSON orders object keys, preserves array order and exact string values,
and uses a defined UTF-8 representation. Never silently normalize source URLs,
subject IDs, attribution or review text when computing a review revision. The
helper's manifest format is versioned `atlas.asset-review.v0`; its exact
serialization is implemented in the module. Any future cross-language adapter
must compare against the same canonical byte fixtures, rather than assuming all
JSON serializers hash identically.

The Unicode fixture in `tests/test_atlas_assets.py` pins a literal PNG and
attribution `Crédit Ω — 作者`. Its content ID is
`asset:sha256:733bb085d25acbd72c1a440f9d4eae5b7cabdf74b636a152afc65185c0d7f2b2`
and its review revision is
`sha256:39074a146f91bdae2c9d79c78da0133827aed6dcac262dd54df29f29035f9a6c`.
Use that complete fixture, including all provenance fields, for adapter parity.

Byte deduplication does not merge entities or transfer permission. The same bytes
with different sources, subjects, roles or rights evidence retain different
manifests. A replacement image gets a new content ID; a revised review gets a new
review revision. Old references do not silently follow either change.

## Existing acquisition and publication paths

The inspected repository baseline is
[`a8da234e976142647277d799d84bae792d47bf98`](https://github.com/castlemilk/startup-atlas/commit/a8da234e976142647277d799d84bae792d47bf98).
Read current owners and main again before integrating this work.

| Surface | Existing behavior | Integration consequence |
| --- | --- | --- |
| [`scripts/crawl.py`](../scripts/crawl.py) | Stages opaque digest-named `.bin` candidates from the exact approved page or asset host; excludes social-preview candidates from logo capture | A captured file still needs byte, identity and rights review |
| Company-profile collection | Records labelled image and social-link observations without fetching those destinations | A label does not verify a headshot subject or account ownership |
| [`backend/mcp`](../backend/mcp) | Local stdio is read-only unless `--write`; existing writes use locks and revisions | Asset staging is an explicit separate local command, not an implicit MCP write |
| [`backend/hosted`](../backend/hosted/README.md) | Startup `logo`/`logo_source` and founder `photo_url`/`photo_source` are paired HTTPS URLs; partner updates do not import image files | No automatic mapping from a staged packet into a record |
| Hosted request body | The complete JSON request is capped at 128 KiB | The offline 1,000,000-byte limit is not an accepted hosted upload size; base64 and envelope overhead count |
| Hosted GitHub adapter | Six JSON paths are readable; startup/partner retry verification expects exactly one modified JSON file | A multi-file asset proposal needs a separately reviewed allowlist and recovery adapter |
| [`scripts/build.mjs`](../scripts/build.mjs) | Copies the existing `web/assets/logos` and design-lab trees | A new directory does not become a public asset path automatically |
| [`web/logos.js`](../web/logos.js) | Uses an exact reviewed-name map | Uploading bytes does not attach partner cards or prove identity |
| [`Pages workflow`](../.github/workflows/pages.yml) | PRs validate; main uses the existing release path | A successful draft or merge is not released-asset readback |

The repository is public. Bytes in a Git blob or draft branch can be publicly
retrieved before merge. A draft PR is a review boundary, not private quarantine.
Keep unreviewed captures, private permission correspondence and staging stores out
of Git and build outputs. Record a public-safe reference or concise attestation to
permission evidence; do not copy private correspondence into a public manifest.

The crawler remains the owner of acquisition controls: approved exact hosts,
public-address checks, HTTPS, per-host delay, bounded responses and redirects,
timeouts, and stopping a host after 429. No robots.txt request is needed or allowed.
This helper adds no network operation and does not resolve DNS. Its URL checks are
offline syntax/host checks, not a statement that a hostname currently resolves
publicly. Do not use it as a replacement for the crawler's transport policy.

## Technical validation and source review

The first policy deliberately accepts a small PNG subset:

- At most 1,000,000 encoded bytes, 4,096 pixels on either axis, and 16,000,000 pixels.
- Non-interlaced, 8-bit truecolor RGB or RGBA.
- Exactly the PNG signature and correctly ordered `IHDR`, consecutive `IDAT`, and
  terminal `IEND` chunks; no ancillary chunks or appended data.
- Bounded chunk count and lengths, every chunk CRC, the complete zlib stream and
  checksum, exact decompressed scanline length, and valid per-row filter bytes.
- Caller-declared MIME and optional observed HTTP MIME checked separately against
  the inspected format. A missing historical response MIME remains unavailable.
- At most 256 chunks and 32,768 bytes of canonical manifest JSON.

SVG, JPEG, GIF, WebP, ICO, APNG, indexed/greyscale/16-bit/interlaced PNG, metadata
chunks and malformed/truncated files are rejected. This does not say these formats
are universally unsafe; they are outside this implementation's validation policy.
Do not relabel an unsupported file, change its suffix, or strip licence-bearing
metadata to make it pass. A separately approved conversion must preserve original
and derivative digests, permitted transformations, provenance and attribution.

The parser follows the relevant PNG signature, chunk, filter and compression
rules in the [W3C PNG specification](https://www.w3.org/TR/png-3/), sections 5,
9, 10 and 11.2. Its strict stream checks are not a universal image decoder,
malware scan or visual inspection. A technically valid image can still depict the
wrong organisation, be a social card, contain unsuitable content or lack permission.

The provenance manifest keeps these separate:

| Evidence | Required meaning |
| --- | --- |
| Canonical subject and role | An exact supplied subject ID and `logo` or `portrait`; the helper does not resolve or invent identity |
| Source page | The page that establishes context or subject association |
| Asset and final URLs | Exact original asset URL and observed final acquisition URL, on the approved exact asset host |
| Host evidence | Where use of that asset/CDN host was confirmed; no wildcard suffix approval |
| Acquisition and time | How and when these bytes were obtained, separate from review time |
| Identity review | Explicit decision, evidence, reviewer label and review date |
| Rights review | Explicit decision and basis, terms/permission evidence, attribution and public-repository/public-website use dispositions |
| Byte measurements | Recomputed SHA-256, format, byte length and dimensions; supplied claims cannot replace measurement |

These reviewer fields are caller attestations. Hashing them makes substitution
detectable when the expected digest is retained; it does not authenticate the
reviewer or adjudicate the licence. The authenticated proposal/review layer must
still establish who is allowed to approve a public use. It must inspect the exact
bytes and evidence before export to a public repository.

Unknown rights, unreviewed identity or rejected dispositions may remain private
staged evidence when structurally valid. They cannot produce a public-export-ready packet. A
social-preview candidate cannot be turned into a logo merely by choosing a role.
No automated claim of affiliation follows from an asset or matching name.

The live PsiQuantum profile is a useful blocked example: its official press
materials are source-linked, while copying/embedding permission remains unresolved.
Use synthetic bytes for acceptance tests rather than publishing that logo as a
demonstration.

## Local staging and interrupted results

Call the read-only `validate` command first and retain its complete result before
starting `stage`. It returns both `asset_id` and `asset_revision`, so a lost first
write response does not lose the identifiers needed for reconciliation. `inspect`
checks bytes alone; `validate` binds bytes and provenance without creating a store.

For explicitly selected local input files, the CLI sequence is:

```sh
python3 scripts/atlas_assets.py inspect --file /private/atlas-input/logo.bin --declared-mime image/png
python3 scripts/atlas_assets.py validate --file /private/atlas-input/logo.bin --provenance /private/atlas-input/review.json
python3 scripts/atlas_assets.py stage --file /private/atlas-input/logo.bin --provenance /private/atlas-input/review.json --store /private/atlas-staging
```

The paths above represent operator-selected local files; the helper does not
create their parent directories or acquire the image. Use the exact IDs from the
retained validation result with `get --store --asset-id --asset-revision` and
`prepare --store --asset-id --asset-revision --subject-id --role`. Each option
requires its value. `prepare` revalidates the stored packet and checks the exact
subject/role plus public-use attestations; it writes no bytes and returns
`authorization: caller-attestation-only`, `record_attached: false` and
`public_write_performed: false`. This is a review handoff, not an authorization
token. `--help` lists complete command syntax. Results and ordinary argument errors
use bounded JSON; successful commands exit 0, rejected commands exit 1.

Choose an explicit local staging directory outside any Git checkout. It must not
be a directory served by a web server or synced to a public destination. The helper
rejects Git-contained roots and symlinked paths, uses private file/directory modes,
and derives internal names from complete validated digests. It never consumes a
crawler receipt's `file` field as an arbitrary path.

The store deduplicates bytes by their content digest and retains each immutable
manifest separately. A pending intent records an in-progress stage before the
completion receipt is written. Readback recomputes the manifest and byte digests
and reruns technical validation. A receipt alone is insufficient.

| Observed state | Agent action |
| --- | --- |
| Complete bytes, manifest and receipt match the intended IDs | Reuse the verified receipt; do not upload/stage again |
| Matching request returns after acknowledgement was lost | Inspect the same IDs; an exact completed duplicate is read-only |
| Pending intent or incomplete packet without a complete matching receipt | Stop with an uncertain/incomplete outcome; retain evidence and inspect the writer before recovery |
| Existing bytes or manifest differ from the requested digest | Report integrity conflict; do not replace or repair automatically |
| Manifest revision, subject or role differs from the requested attachment | Reject the reference; re-read and resolve the intended asset |
| Rights/identity no longer support the intended use | Hold attachment and start an explicit correction/revocation review |

The store is a local operator-controlled workspace, not a durable remote service
or a security boundary against a malicious process running as the same user.
Private filesystem permissions do not encrypt data. There is no automatic lock
deletion, abandoned-stage promotion, garbage collection or remote durability claim.
These are explicit operator decisions after uncertain outcomes are reconciled.

## Adapter requirements before a hosted upload

The following is the agreed semantic handoff with implementation decisions still
open. These are requirements, not advertised new MCP tools or accepted record
fields.

1. Resolve the canonical entity using the record owner's authoritative source read.
   Retain the record revision and repository revision separately.
2. Validate supplied bytes and provenance, and retain their content and manifest
   revisions. Resolve rights and identity for the intended public use.
3. Select an agreed repository path derived from the validated digest and format.
   Caller filenames, arbitrary paths and URLs must not choose write targets.
4. Before the first public Git write, enforce the authenticated review/authorization
   decision. A client-supplied `approved` or `verified` flag is insufficient.
5. Create the reviewed byte/manifest proposal through the existing repository
   authentication and review path. Verify the exact tree, bytes and manifest at
   the returned commit. Preserve `published: false`.
6. Resolve the asset reference at that exact commit. Check content digest, manifest
   digest, target ID, role, technical policy and permitted use again. Independently
   resolve the latest record and require its expected record and repository
   revisions before constructing metadata changes.
7. Produce the record proposal through the sibling-owned implementation. Preserve
   omitted fields, source links and concurrent additions. Do not add unrecognised
   asset fields to existing startup/founder schemas.
8. Read the complete resulting source record and exact PR head. A generated index
   or old published profile is not authoritative draft readback.

A future combined proposal must verify its exact allowed file set, contents,
parent/head/history and PR repository/base during recovery. The existing one-file
`updateProposal` check cannot simply be bypassed or widened. If upload and
attachment use separate PRs, the attachment must not point to a missing or
unreleased asset, and release order/rollback must be explicit. Either design needs
tests for lost responses at blob/tree/commit/ref/PR steps, stale revisions and
concurrent requests. A branch with no confirmed PR remains uncertain.

### Decisions still open

| Decision | Preferred bounded approach | Remaining agreement |
| --- | --- | --- |
| Public byte storage | Reuse repository-managed static assets after rights review | Confirm exact logo/portrait paths and build ownership; no new service |
| Public provenance | A bounded public-safe immutable manifest | Confirm manifest path and how confidential evidence is represented |
| Hosted ingress | Preserve the existing 128 KiB request boundary | Decide a smaller raw-byte limit with envelope budget, or a separately reviewed transport; no silent limit increase |
| Publication transaction | Keep asset and metadata integrity bound to exact Git commits | Choose one reviewed multi-file proposal or an explicitly ordered two-proposal flow |
| Review authority | Existing private Site identity and repository review | Decide who can attest public use and how revocation is enforced; no permission change here |
| Formats and transformations | Strict PNG-only policy initially | Broader decoder/runtime and licence-preserving transformations require separate review |
| Retention and revocation | Retain immutable evidence; explicit correction | Define rejected/stale staging retention and public removal/record fallback without silently rewriting old IDs |

No R2 bucket, D1 image storage, CDN, credential, endpoint, public Site audience,
permission, schedule or billing change is included.

## End-to-end acceptance and evidence boundaries

The complete requested journey has two kinds of evidence: executable local
asset checks, and the existing record-service/release checks. A live cross-surface
image upload is pending the adapter and storage decisions above.

| Step | Demonstration and required readback | Evidence boundary |
| --- | --- | --- |
| Discover and review source | Exact current entity; source page; image URL; acquisition; identity/rights disposition | Synthetic fixture locally; PsiQuantum is an observed blocked-rights case |
| Validate bytes and provenance | Strict PNG checks; measured digest/size/dimensions; immutable manifest | Implemented offline and exercised with adversarial fixtures |
| Stage and prepare | Re-read exact content/review IDs; dedupe complete duplicates; unknown rights cannot prepare public use | Local private store; no remote upload |
| Attach with expected revision | Resolve asset commit/content/review and canonical target, then require sibling record/repository revisions | Adapter pending; existing hosted stale-revision tests remain separate evidence |
| Inspect PR | Exact permitted paths and bytes/record diff, parent/head/PR identity and CI | This source PR is reviewable; it is not a real image-data proposal |
| Release | Authorized merge; successful existing Pages release; private MCP deployment checked separately | No release of this feature is claimed by passing source tests |
| Retrieve asset and record | Fetch the released record and bytes, verify revision, MIME, size, dimensions and SHA-256 against its manifest | Local asset readback is implemented; live uploaded-asset readback remains pending |

Run the new offline tests without fetching any source:

```sh
python3 -m unittest discover -s tests -p 'test_atlas_assets.py' -v
```

Run existing proposal/recovery evidence independently, without altering their
fixtures or claiming they exercise an image upload:

```sh
node --test backend/hosted/tests/update-retry.test.mjs backend/hosted/tests/startup.test.mjs
```

The existing suite checks stale new proposals, exact duplicate recovery, a lost
accepted PR response, branch-only partial writes, unexpected files/history and
wrong PR identity. The receipt continues to report `published: false` even after
merge until release verification supplies separate evidence. These tests use mocked GitHub;
they are not real uploads or deployments.

For full source verification use the repository's existing `npm test`,
`npm run test:mcp`, hosted test/build and static build commands. The new Python
test file is discovered by the existing root suite without changing CI triggers.
Record the exact commit, command outcomes, independent review and PR/CI URLs in
the delivery receipt. Never report a not-run or blocked stage as passed.

### Release retrieval contract

After a separately authorized release, record all of the following before saying
an asset is published and verified:

- Exact proposal head, merge commit and successful release run.
- Actual graph/SQLite source revision and the source record at that revision.
- Actual asset URL, observed HTTP MIME, retrieved byte length, dimensions and
  recomputed SHA-256; compare these with the manifest at the released commit.
- Asset review revision, exact entity binding, attribution and permitted use.
- Read time, cache/revision mismatch and any 404, MIME or digest failure.

Do not follow an arbitrary manifest URL with credentials or forward authorization
across redirects. Use the approved release/source transport and exact allowed
host. A stale cached image, a correct record with a missing image, or main ahead of
the published graph is an incomplete readback. A green Pages release does not
establish that the private MCP service exposes a new tool.

## Verification receipt

Executed on 17 November 2026 in an isolated checkout based on
`a8da234e976142647277d799d84bae792d47bf98`, using Python 3.12.14 and Node 24.22.1.
The existing CI uses its own configured Node runtime; CI evidence belongs to the
PR's exact head and must be inspected separately.

| Check | Observed result |
| --- | --- |
| Focused asset suite | 49 tests passed |
| Independent source review | No remaining blocker for offline scope; five additional interruption, hardlink, altered-intent and chunk-limit probes passed |
| Root `npm test` | Passed, including the new asset tests and the existing image-reference inventory |
| Local `npm run test:mcp` | 4 protocol tests passed |
| Hosted `npm --prefix backend/hosted test` | 109 tests passed, including existing stale-revision and proposal-recovery cases |
| Hosted build | Passed |
| Static build | Passed; generated graph and Go snapshot changes were excluded from the source patch |
| Actual CLI exercise | Inspect, preflight, stage, exact duplicate, get and prepare succeeded; unknown review revision and active SVG were rejected |
| Live baseline read | Existing `atlas_get_startup` returned published and main revision `a8da234e976142647277d799d84bae792d47bf98`, `indexStatus: current`; PsiQuantum's unresolved-logo-use source note remained intact |

The independent review pinned implementation SHA-256
`1456dcce04ee48eb6545d29fdb53d93800e7f9988663004f70b24a64544f48cf` and test-file
SHA-256 `ad2d35e63a13f70bcf5a3b5d86e9b8e76c4c9f9e7c314f85add840305f45a0bb`.
The final test file differs from the reviewed file only by removal of an extra blank line at EOF. The review found and resolved a concrete recovery gap: callers now obtain both
deterministic identifiers through read-only preflight before any stage write.
Additional regressions preserve firm-scoped person IDs and freeze mutable input
before validation and storage.

The separate CLI exercise used synthetic pixels and a synthetic public-safe
provenance fixture in a disposable private directory. The repeated stage and
readback returned:

```json
{
  "asset_id": "asset:sha256:733bb085d25acbd72c1a440f9d4eae5b7cabdf74b636a152afc65185c0d7f2b2",
  "asset_revision": "sha256:9a6cfe884c7549d12949cfb57ddf5132bff12178fce47f206c25fd68eb479dc8",
  "state": "staged",
  "published": false
}
```

There was one stored blob and one review after the duplicate. This review digest
differs from the Unicode parity fixture because its attribution is different.
The local exercise performed zero real source requests, public writes or record
writes. Its temporary store was removed after verification. The adversarial suite
separately exercises lost acknowledgement and interrupted first-write recovery;
neither is represented as a live hosted upload.

The pre-existing baseline Pages run
[44071809051](https://github.com/castlemilk/startup-atlas/actions/runs/44071809051)
succeeded for `a8da234e`. That establishes baseline publication only. This asset
feature remains a source proposal until separately merged, deployed where needed,
and exercised through an agreed hosted adapter with live asset and record readback.

## Sources and related contracts

- [Local MCP contract](MCP.md) and [hosted implementation](../backend/hosted/README.md).
- [Collection and release runbook](AGENT-RUNBOOK.md) and
  [collection skill](../.agents/skills/startup-atlas-collection/SKILL.md).
- [Crawler provenance work](https://chatgpt.com/space/page_ee16a19c0af881919e31b3306d594675).
- [Hosted proposal recovery](../backend/hosted/tests/update-retry.test.mjs) and
  [published graph verification](../scripts/verify-published-graph.py).
- [PNG specification](https://www.w3.org/TR/png-3/) for the technical container
  rules; the helper's policy intentionally accepts a smaller subset.
