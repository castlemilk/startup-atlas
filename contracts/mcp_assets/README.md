# Offline image adapter contract packet

This packet continues the existing image lane after the source foundations merged.
It is executable review material, not an upload tool, record writer, authenticated
approval system, storage decision or deployment.

Baseline: `01375e4c62fd0b057cd7d21a34223b26a9e23360`, containing record
[PR 157](https://github.com/castlemilk/startup-atlas/pull/157) at
`55a6efedf4ea03883c14e70df76885f97125d54b` and asset
[PR 158](https://github.com/castlemilk/startup-atlas/pull/158).
The [coordination Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
records the release receipt and this continuation. The
[record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51)
retains API schemas, identity, record hashing, authentication, concurrency and
proposal recovery. Its separate `contracts/mcp_record_attachments/` acceptance
packet consumes the image boundary; this packet does not replace that work.

## Source, hosted availability and image publication

| State | Observed or implemented here |
| --- | --- |
| Source foundation | Both foundations are merged. This packet adds isolated offline contracts and tests. |
| Hosted availability | The 17 November read exposed the existing thirteen tools, not new strict record editing or binary upload/retrieval tools. Current graph/main revision was `01375e4c...`; graph freshness does not identify hosted code. Release remains with the existing owner while credential approval is pending. |
| Image publication | No third-party image, real attachment or conversion was performed. No catalogue image is published; submitted image bytes are synthetic test fixtures represented in source. PsiQuantum's source-linked image-use hold remains intact. |

No credentials, permissions, dependencies, services, auth boundaries, shared
runtime files, parser guards, upload limits or release workflows are changed.
All bytes and names in fixtures are synthetic. URLs are test strings; this packet
performs no source or robots.txt requests. No helper sends a request.

## Files

| File | Responsibility |
| --- | --- |
| [transport.py](transport.py) | Complete UTF-8 body budget, standard base64 and actual-wire measurement. Schema validity remains unverified. |
| [canonical.py](canonical.py), [canonical.mjs](canonical.mjs) | Restricted asset serialization and strict JSON input with matching fixture bytes. Never substitute for record hashing. |
| [public_projection.py](public_projection.py) | Explicit public-field candidate held for disclosure, binding, storage and authenticated review. Private correspondence/digests are not emitted. |
| [targeting.py](targeting.py) | Consistency of supplied source reads, person mapping and startup/nested target. Does not authenticate captures or authorize an edit. |
| [RECOVERY.md](RECOVERY.md) | Atomic versus ordered proposals, lost-result stages and exact readback/revocation requirements. No remote recovery engine. |
| [CONVERSION.md](CONVERSION.md) | Review-only conversion lineage/approval contract and practical format limits. |
| [image_fixtures.py](image_fixtures.py) | Deterministic synthetic format specimens; no production converter. |
| [fixtures/](fixtures/) | Golden serialization vectors, synthetic private/public review and a complete offline request envelope. |

Additive tests are `tests/test_asset_*_contract.py`,
`tests/test_asset_adapter_packet.py` and `tests/asset-manifest-contract.test.js`.
The root test commands discover them without CI or package changes.

## Exact transport budget

The existing [hosted body reader](../../backend/hosted/src/worker.mjs) counts
streamed body bytes and rejects sizes above **131,072 bytes** before JSON parsing.
This is the complete HTTP entity body, not only an image or a character count.
HTTP headers are not included. Do not assume compression, multipart transport,
chunk-upload support or a larger limit.

Let `E` be the exact UTF-8 size of the complete serialized JSON envelope with
its one base64 field set to the empty string. Include the JSON-RPC wrapper, tool
name, request ID, metadata, target/revision fields, names, commas, quotes, escaping
and additional fields. For `n` raw bytes:

```text
base64 bytes = 4 * ceil(n / 3)
complete body bytes = E + 4 * ceil(n / 3)
max raw bytes = 3 * floor((131072 - E) / 4), when E <= 131072
```

These equations describe this packet's compact UTF-8 serializer. Its standard
base64 characters need no extra escaping. The final body must also pass
`validate_wire_body`: another serializer can add whitespace, escape Unicode or
slashes, or otherwise change length. Actual complete bytes take precedence over
an earlier budget. Padding and zero unused pad bits are checked. Data URLs,
alternate alphabets and embedded whitespace fail.

| Exact fixture | Empty envelope | Base64 budget | Maximum raw bytes | Final body at maximum |
| --- | ---: | ---: | ---: | ---: |
| Minimal generic transport test | 221 | 130,848 | 98,136 | 131,069 |
| Same test with three padding characters | 224 | 130,848 | 98,136 | 131,072 |
| [Complete JSON-RPC-shaped fixture](fixtures/request-envelope.json), including public manifest and target/revisions | 1,169 | 129,900 | 97,425 | 131,069 |

The complete wrapper uses `OFFLINE_ASSET_FIXTURE_NOT_A_TOOL`: it is not an
installed tool or accepted API schema. These are fixture-specific figures, not
a universal upload allowance. Remeasure after any field or request ID changes.
An oversized empty-slot envelope fails; an envelope consuming the cap permits
zero payload bytes only at the transport layer. An empty image still fails.

The local staging allowance of 1,000,000 image bytes cannot fit one hosted body.
Capacity tests fill the cap with arbitrary synthetic bytes, not valid images.
The composed packet test separately validates a real synthetic PNG.

```python
import base64
import json
from pathlib import Path
from contracts.mcp_assets.transport import (
    encode_request, request_budget, validate_wire_body,
)

fixtures = Path("contracts/mcp_assets/fixtures")
envelope = json.loads((fixtures / "request-envelope.json").read_text())
review = json.loads((fixtures / "synthetic-review.json").read_text())
slot = ("params", "arguments", "content_base64")
budget = request_budget(envelope, slot)
body = encode_request(base64.b64decode(review["png_base64"]), envelope, slot)
receipt = validate_wire_body(body, slot)
assert receipt["sent"] is False
assert receipt["schema_validated"] is False
assert receipt["wire_bytes"] == len(body) <= 131072
```

The generic budgeter counts extra fields without approving them. A real adapter
needs the API owner's field allowlist and semantic validation. Transport success
is not valid PNG, correct identity, rights approval or a successful request.

## Cross-language manifest parity

The `atlas.asset-canonical.v0` profile preserves existing validated
`atlas.asset-review.v0` bytes:

- Keys are bounded ASCII identifiers sorted lexically; array order stays exact.
  Numeric-looking and non-ASCII keys fail.
- Numbers are nonnegative JavaScript-safe integers. Strict parsing rejects
  fractional/exponent syntax, negative zero, negatives, unsafe and non-finite
  numbers. Blob schema checks remain separate.
- Unicode scalar strings stay exact: no normalization, URL rewriting, trimming
  or transliteration. Escaped surrogate pairs match their actual scalar;
  lone surrogates fail.
- Compact UTF-8 JSON rejects duplicate/escaped-duplicate keys, BOMs, trailing
  JSON, unsupported types, sparse arrays, cycles and accessors. Bounds are
  32,768 canonical bytes, depth 16 and 4,096 JSON value nodes.

This is a restricted asset profile, **not RFC 8785 or generic canonical JSON**.
JavaScript emits sorted members directly. Its strict parser uses null-prototype
objects so reserved-looking own keys remain data.

Do not hash the record owner's `{id, record}` with these helpers. Its schema,
number domain and JavaScript implementation remain authoritative. Target checks
retain and compare opaque record-owner revisions.

[canonical-vectors.json](fixtures/canonical-vectors.json) has eight valid
byte/digest vectors and eighteen rejected raw inputs: historical review digests,
normalization contrasts, astral/control text, reserved own keys, integer bounds
and the public candidate. Python tests directly invoke JavaScript and compare
emitted bytes and hashes. The historical review revisions remain:

```text
ASCII:   sha256:9a6cfe884c7549d12949cfb57ddf5132bff12178fce47f206c25fd68eb479dc8
Unicode: sha256:39074a146f91bdae2c9d79c78da0133827aed6dcac262dd54df29f29035f9a6c
```

Serialization does not prove claims. Image/provenance validation stays separate.

## Public-safe projection and private review binding

The private review is not an export manifest. `project_public_manifest` verifies
its expected digest and existing provenance structure. Recorded identity and
both public-use approvals are required even to build the held candidate; these
are still caller attestations, not authenticated authority.

Public output is built field by field from blob measurements and a **separate
public descriptor**: exact subject/role, source page, attribution and an applicable
public licence URL. No automatic copying of private source/final/redirect URLs,
host notes, identity/rights evidence, permission links, reviewers, attribution
drafts or private review digests occurs.

Queries/fragments fail instead of being silently stripped. Licence-based
candidates need a separately reviewed public licence reference. The
private-permission/owned fixture profile cannot put a permission URL in that slot.
These are proposed offline candidate rules, not adopted repository policy.

The allowlist prevents automatic private-field flow; it cannot classify arbitrary
caller text or URL paths as non-confidential. Public source/attribution still needs
disclosure and licence review. Required attribution must not be lost while
separating private notes. Output always retains:

```json
{
  "status": "projection_candidate",
  "authorization": "none",
  "published": false
}
```

`public_manifest_revision` hashes only the public candidate. It is not the private
`asset_revision`, record revision, Git object SHA or approval. Private-only changes
alter the private digest and preserve the public candidate; public attribution
changes alter its digest. Tests assert that no private sentinel **or private
digest** occurs in the public result or composed wire fixture.

The [synthetic review](fixtures/synthetic-review.json) pins:

```text
asset:   asset:sha256:733bb085d25acbd72c1a440f9d4eae5b7cabdf74b636a152afc65185c0d7f2b2
private: sha256:1d6fa25d50f01671ad48c43c37cdf6fde444a7a80d3e845feb5704182f7cfd2b
public:  sha256:6675008d1aadf8baab2db58883508be52ab3d31aecd56caa7fa47ed18a3d1ac8
```

All identify synthetic data. Retain the private-to-public binding through an
agreed private review mechanism. **Publishing a private correspondence hash is
not disclosure review; never relabel the public digest as the private digest.**
The future resolver's exported schema/digest and authenticated private approval
binding remain joint gates with the record owner.

## Founder, startup and nested target

| Value | Meaning |
| --- | --- |
| `edited_record_id` | Existing authoritative `startup:...` record being edited |
| `subject_id` and `role` | Exact subject/use from the separately verified asset manifest |
| `target.founder_pointer` and `target.founder_name` | Exact source location/spelling at the guarded whole-record revision |
| `expected_record_revision` | Opaque digest of the entire startup record |
| `expected_snapshot_revision` | Hosted source Git commit or local four-file snapshot digest, explicitly distinguished |
| `asset_repository_commit` | Separate Git commit resolving both bytes and exported manifest |

The checker compares complete supplied source/read inventory, reviewed founder
mapping, graph retrieval pins, person nodes and founded edges. It derives no ID
from a name, filename or index. An index is a location: stale whole-record tokens
fail; refreshing the token while keeping a reordered founder's old pointer fails.

Shared/ambiguous founders need the record owner's migration. Firm-scoped team
IDs remain generic asset subjects but are not accepted as existing startup
nested-founder identities here. A mapping cannot migrate identity domains.

The packet is supplied evidence, not authenticated truth or a live API shape.
It never recomputes record digests. Every result retains `authorization: none`,
`strict_record_preview_required: true`, `record_edit_constructed: false` and
`published: false`. The record owner still validates source pairs
(`logo`/`logo_source`, `photo_url`/`photo_source`), global identity/shared-founder
guards, source inheritance and current revisions before constructing a write.

## Minimum decisions before an integrated writer

These recommendations are not approvals or new default policy.

| Decision | Recommended minimum agreement | Gate until agreed |
| --- | --- | --- |
| Storage and manifest | Reuse suitable repository/static infrastructure; agree exact image/manifest paths, build ownership and retention/removal. | No public object or image path writes; no new service. |
| Review and disclosure | Identify existing authenticated authority, private approval location, private-to-public binding, attribution/disclosure and revocation lookup. | Caller flags cannot authorize exposure; correspondence remains private. |
| Wire contract | Adopt an API-owned envelope/allowlist, retain 131,072 bytes, budget and check each final body. | No universal raw allowance, invented tool or limit increase. |
| Transaction/recovery | Choose bounded atomic multifile or two ordered proposals. One tree binds asset/record; separate proposals require asset release before attachment. Review RECOVERY.md. | Do not widen existing one-file recovery or automatically complete partial writes. |
| Identity/export references | Agree public manifest schema/digest resolution at one commit, target mapping and strict preview. | No digest substitution, scoped-person migration or stale nested target. |
| Formats/conversion | Keep parser guards; decide whether transformations are allowed and who approves CONVERSION.md lineage. | Rejection remains rejection; no silent stripping/conversion/publication. |

Storage/review decisions are necessary before even an asset-only proposal.
Transaction/target decisions additionally precede attachment. A source PR with
synthetic fixtures does not settle them.

## Run offline checks

From repository root:

```sh
python3 -m unittest discover -s tests -p 'test_asset_*_contract.py' -v
python3 -m unittest discover -s tests -p 'test_asset_adapter_packet.py' -v
node --test tests/asset-manifest-contract.test.js
npm test
```

Tests perform no live calls, network acquisition or deployment. Root data
generation can refresh snapshots; that churn is excluded from this source packet.
Actual PR/CI and independent review receipts belong to the exact published head
and canonical Space, separately from reproducible contract checks.

## Executed source verification

The isolated packet was verified on 17 November 2026 against the baseline above.
The complete `npm test` run passed **123 JavaScript and 219 Python tests**, plus
the existing image audit. This includes **80 new Python contract tests and six
new JavaScript tests**; none requires a network request.

Independent read-only review ran those 80 Python and six JavaScript checks. It
also exercised 256 additional cross-language value trees, private-field mutation
and leakage probes, exact serialization bounds, varied transport budgets and all
256 one-byte base64 values. It decoded the synthetic PNG/JPEG/ancillary specimens
with the available image library and checked the frozen registry. Three generated
logo/portrait PNGs were also visually inspected as synthetic geometry.

Review corrections included consistent rejection of a very long numeric token,
preserving boolean-versus-number distinctions in captured source equality, and
rejecting a scoped team ID as a nested founder. No existing parser guard changed.
The merged image helper's SHA-256 remains
`1456dcce04ee48eb6545d29fdb53d93800e7f9988663004f70b24a64544f48cf`.
Hosted worker/record-edit source is unchanged. Both generated graph snapshots
were restored after the root tests and excluded from the packet.

These checks establish source consistency and synthetic acceptance/rejection,
not a live upload, authenticated approval, conversion service or publication.
