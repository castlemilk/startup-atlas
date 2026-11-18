# Investor round contract proposal

This is Atlas improvement 2: an **offline, synthetic-only, additive contract** for
investor identity, financing events and event-specific participation. It is not a
new accepted startup field, crawler, public dataset, database migration or MCP
tool. The executable reference rejects a packet unless `synthetic` is `true`.
That marker is a test boundary, not an automated real-person/data detector or an
authorization mechanism. Every supplied fixture is fictional.

## Ownership and baseline

Inspected repository baseline:
[`d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f`](https://github.com/castlemilk/startup-atlas/tree/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f).
This packet reserves only `contracts/investor_rounds/`. The
[collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2)
retains source acquisition, extraction and real-record review. The
[record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51)
retains accepted fields, canonical source identities, whole-record revisions,
validation, proposal recovery and authenticated writes. No repeat continuation
was sent to that owner. Agreement to this new contract is **pending**, not implied
by this packet or an earlier asset-contract agreement.

[Canonical coordination](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
and existing [CRAWL-06 issue 84](https://github.com/castlemilk/startup-atlas/issues/84)
are the handoff destinations. Coverage/resumability, whole-system contract parity,
capability discovery, evidence-first UI and operational release receipts keep their
separate owners. This packet's parity checks concern only the legacy funding seam.

### Observed current contracts

| Surface | Current behavior and implication |
| --- | --- |
| [Collector](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/scripts/crawl.py) | Emits unreviewed amount mentions, source URLs, context and publication hints. It does not produce normalized investors or round participants. No collector code is duplicated here. |
| [Authoritative record schema](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/backend/hosted/src/startup-record.mjs) | A round requires `id`, `stage`, `source`; allows `announced_on`, `amount`, `amount_text`, `currency`, `valuation`, `valuation_currency`, `note`; rejects unknown properties. Numeric amounts are nonnegative safe integers; dates require a full day. Currency checks three-uppercase-letter syntax, not membership in an ISO registry. |
| [Record editing](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/backend/hosted/src/startup-edit.mjs) | Funding merges by exact event ID, preserves omitted fields, rejects cross-startup ID collisions and protects whole-record/source revisions. Source replacement requires resubmitting inherited fields. Adding a field to the shared schema changes both transports and belongs to the record owner. |
| [Graph builder](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/scripts/make-graph.py) | Copies funding objects with `startup_id`, requires globally unique event IDs, and creates announcement article links. Portfolio `supports` edges do not create participation. Its permissive copying is not permission to bypass the strict record validator. |
| [SQLite builder](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/scripts/build-graph-db.py) | Stores complete event JSON, with no normalized investor/participation tables. The public source-file allowlist does not include this packet. |
| [Proto](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/backend/proto/atlas/graph/v1/graph.proto) and [Go service](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/backend/internal/graph/service.go) | Funding amounts use non-optional scalar `int64`; typed reads cannot retain absent-versus-zero presence. New JSON fields are not preserved by that message. This is a handoff to the parity owner, not fixed here. |
| [Financial read model](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/web/treemap-model.js) | Compares positive numeric event amounts with exact dates, matching currencies and sources. Do not feed it range midpoints, padded dates or inferred currency. |

## Contract shape

`reference-model.mjs` is the executable proposal; `fixtures/structured.json` is a
complete representative instance. All object shapes reject unknown fields.
Collections are bounded to 1,000 entries in this reference, not a proposed hosted
ingress allowance. Arrays retain order for the independent packet digest.

| Collection | Identity and purpose |
| --- | --- |
| `entity_refs` | Explicit existing `startup`, `partner`, `provider` or `person` references, qualified by the exact `source_revision`. These declarations must eventually be checked against the authoritative snapshot; the fixture is not a live registry lookup. |
| `investors` | Opaque `investor:*` ID, source-stated display name, kind, resolved/unresolved state, optional existing canonical entity reference, and identity evidence. This is an investor role registry, not a new production graph node kind. |
| `rounds` | Opaque `round:*` ID, exact startup reference, optional unchanged `legacy_id`, identity-review state and evidence. A round ID does not depend on an editable amount, stage, date or URL. |
| `participations` | Opaque `participation:*` ID, exact round/investor endpoints and source-stated name. A structural record alone does not assert that an investment occurred. |
| `sources` | Source ID, exact HTTPS URL, publisher if known, source kind, actual retrieval timestamp or unknown, publication date with precision, optional explicit syndicated-copy reference. |
| `evidence` | Source reference, exact subject and predicate, short supporting statement and explicit-versus-discovery basis. Evidence for an amount cannot stand in for a role or identity claim. |
| `claims` | Immutable claim ID, subject, predicate, typed value, evidence IDs, candidate/reviewed/rejected state and optional supersession links with a correction reason. |
| `identity_decisions` | Explicit same/distinct decision with source/target, evidence, reason and review state. Candidate matches never redirect identities. |
| `legacy` | Optional exact original record JSON, original-byte SHA-256, exact canonical startup ID and whole-record revision. It supports restoration of the archived original, not translation of new fields into the old API. |

The packet digest, original-byte digest, canonical record revision and repository
commit identify different things. They must not replace one another. An
integration proposal must bind the reviewed packet digest to the record owner's
fresh whole-record revision and source commit. A source-only digest does not
authorize a write or indicate public availability.

### Investor, fund and person identity

A manager, its managed fund, a brand/group and an individual can all be named in
the same announcement. Retain distinct IDs and kinds. The manager's portfolio
does not establish the fund's participation. An unresolved name may remain in a
participation candidate with `canonical_entity_id: null`; it cannot produce a
canonical investor edge. Two investors with the same display name remain distinct.

Resolved identity requires scoped explicit identity evidence and a declared
canonical reference. Person and organisation mappings cannot cross kinds.
Fund/manager/person equivalence is rejected. Duplicate canonical references and
duplicate round/investor pairs require explicit reviewed identity decisions;
name normalization, matching domains, identical amounts or source URLs do not
perform merges. Firm-scoped team people retain their existing identities until
the identity owner separately reviews the mapping.

### Financing event scope

`transaction_kind` distinguishes equity, debt, grant, secondary, tender,
acquisition, mixed and unknown. `instrument` and `stage` retain source wording.
The legacy field called `funding_rounds` may contain events of different kinds;
its name is not evidence of primary equity issuance.

`round_amount` is only `round_total`. `component_amount` identifies equity, debt,
secondary or grant components. `contribution` belongs to a participation and
means that investor's contribution. `cumulative_funding` remains a separate
`cumulative_total`; `valuation` explicitly distinguishes pre-money, post-money
and unspecified valuation. The validator rejects a financial measure submitted
under the wrong predicate. The reference performs no sums, FX conversions,
contribution allocations or stage inference. Extensions and separate closes are
distinct events until reviewed identity evidence establishes otherwise.

`resolveFact(packet, subject, predicate, measure)` permits explicit selection of
a financial measure. Pre-money and post-money valuations, or debt and equity
components, are different measures rather than contradictory observations. Without
a selector, multiple measures return `selection_required` and the available
measure names. Contradictions are evaluated within a selected measure. Multiple
tranches of the same component type still require a separately reviewed event or
component identity extension; this version does not sum or invent that identity.

### Money and disclosure

Money uses decimal **strings**, never floating-point arithmetic or a padded
integer. All values are in stated major currency units. There is no implied
scale, FX rate or currency conversion.

| State or precision | Required representation |
| --- | --- |
| `disclosed` + `exact` | One decimal `amount`; preserve `0` when explicitly stated. |
| `approximate` | One decimal `amount` with approximate precision, not an exact point estimate. |
| `range` | `minimum` and `maximum`, ordered using exact decimal comparison. |
| `lower_bound` / `upper_bound` | One bound and explicit `bound_inclusive`, distinguishing “over” from “at least.” |
| `undisclosed` | No numeric value or precision; requires evidence of nondisclosure. |
| `unknown` | No numeric value or precision; no zero or undisclosed inference. A missing claim also resolves as unknown. |
| `legacy_unspecified` | Preserves an existing numeric record without asserting that its reporting precision was exact. Only the imported record establishes its existing value. |

`currency.status` is `known`, `ambiguous` or `unknown`. Known currency requires an
explicit three-letter code; the reference checks shape, not the ISO registry.
Ambiguous currency retains its source symbol and no code. `"$"` never defaults
to USD, AUD or a currency inferred from company location. The raw amount text
remains available independently. Decimal fractions and large exact decimals are
representable in the sidecar but are not automatically acceptable legacy amounts.

### Dates and attribution

Date values carry `known`/`unknown`/`undisclosed` status and, when known, `year`,
`month` or `day` precision. Invalid calendar dates fail. `2025` and `2025-03`
remain those exact strings; no first day, January date or artificial timestamp
is added. `announced_on`, `closed_on`, source publication and source retrieval are
separate fields. A publication date is not automatically the event date. An
unknown legacy retrieval timestamp remains null.

Every claim has evidence scoped to its exact subject and predicate. Reviewed
claims require an attributable source with a retrieval timestamp; `discovery`
and `legacy_unclassified` sources cannot be promoted merely by changing an
evidence basis flag. The same
source may support several independently identified statements. Amount evidence
does not imply lead status; identity evidence does not imply participation.
The reference checks structure and consistency of these declarations. It cannot
establish that a passage really supports a fact, that a reviewer is authenticated,
or that a source is complete. Those remain collection and record review gates.

### Participation and roles

A membership claim binds both exact endpoints and says `participates` or
`retracted`. Lead, co-lead and participant roles have their **own** claims and
evidence. No role claim means `unknown`, not non-lead. `participant` means only
that the source used that role; it does not prove the investor was not a lead.

`projectParticipations` produces a synthetic candidate relation only when round
identity is reviewed, investor identity is resolved, membership is reviewed and
uncontested, and any stated role and transaction kind are uncontested. It uses
the neutral predicate `participated_in_funding_event`, with the stated transaction
kind or unknown. This does not relabel grant, tender or acquisition participation
as an equity investment. An unresolved investor, candidate
membership, retraction or conflict yields an explicit held reason. Portfolio,
cohort, programme, customer, advisory, proximity and generic backing evidence do
not create a round participant. The output always states `authorization: none`,
`runtime_supported: false`, `published: false`.

## Duplicate and correction behavior

1. Repeating an identical claim ID and payload is idempotent. Reusing that ID for
   different content is rejected; append a separately evidenced correction.
2. A correction names previous claim IDs, stays within the same canonical
   subject/predicate/financial measure and records a reason. Missing references, cross-field
   replacement and cycles fail. Earlier evidence remains intact.
3. Only reviewed corrections supersede reviewed display claims. A pending or
   rejected correction cannot silently hide an accepted observation.
4. Multiple active reviewed values remain a conflict. The resolver returns no
   preferred value and preserves claim IDs. It does not choose the newest URL,
   highest amount or latest retrieval timestamp. Participation endpoints use
   reviewed identity redirects for comparison while preserving original claims.
   Other typed values use strict value equality;
   semantically equivalent but differently qualified values may need review.
5. Syndicated copies retain their own URLs and evidence with an explicit
   `duplicate_of` chain. They count as one declared source group, not independent
   corroboration. This is a declared lineage, not automated plagiarism detection.
6. Reviewed identity redirects preserve both original records and decisions;
   cycles, contradictory distinct decisions and cross-startup round merges fail.
   Resolved investor references must agree across the entire redirect component,
   including chains through unresolved intermediate identities.
   Candidate matches never change canonical identity. The model does not modify
   existing source IDs, routes or production redirect tables.

## Migration and legacy parity

`await migrateLegacyRecord(startupId, originalJson, sourceCommit)` calls the real
strict record validator and whole-record revision producer. It retains the exact
original JSON bytes, including whitespace, array order, source URLs and text.
Each existing event receives a deterministic sidecar identity plus its exact
legacy event ID. No new canonical investor, membership or graph edge is inferred.

Imported facts remain candidates and use discovery evidence with
`legacy_unclassified` sources. Existing numeric values use `legacy_unspecified`
precision; source text is not parsed into numbers, currency, dates or people.
The migration does not claim a new primary-source retrieval or review. Known
legacy dates remain day dates, missing fields stay missing and zero stays zero.

`restoreLegacyRecord(packet)` returns only the archived original JSON. It is a
byte-exact recovery operation. It deliberately does not project new sidecar facts
into `funding_rounds`, `relationships`, notes or any accepted API field. A packet
without a legacy binding cannot use this operation. The sidecar must accompany
any handoff: stripping it loses new information even though the old record is
restored exactly. There is no downgrade writer or automatic production migration.

Focused tests exercise the actual current legacy validators, graph builder and
SQLite builder with synthetic records and temporary files. They verify original
record digests, source inheritance, unknown versus zero, event uniqueness and
complete funding/edge JSON preservation. They do not establish new public table,
JSON/SQLite normalized-model, Go/protobuf, hosted transport, UI or browser parity.

## Running the packet

From the repository root, using installed Node and Python only:

```sh
node --test contracts/investor_rounds/*.test.mjs
python3 -m unittest discover -s contracts/investor_rounds -p 'test_*.py' -v
git diff --check
```

These commands perform no collection, remote requests, record writes, browser
launches or deployment. Do not substitute root `npm test`: it regenerates real
derived datasets before its tests. No dependency installation is required.

## Adoption gates

The first decision is collection and record owner agreement to the isolated
identity/evidence contract, its unrepresentable legacy fields and an authoritative
sidecar location. No accepted record field, source allowlist or hosted envelope is
expanded by this packet. A future adapter must prove fresh whole-record/source
guards, explicit reviewed identity mappings, input limits, authenticated review,
idempotent proposal/recovery and exact readback before a real proposal.

The parity owner must separately agree normalized JSON/SQLite/protobuf/Go
representations, presence semantics and source revisions. The evidence-first UI
owner retains display and conflict/unknown language. The release owner retains
capability discovery, deployment and operational receipts.

The current browser/native hold and hosted credential hold remain. The existing
[Pages workflow](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/.github/workflows/pages.yml)
runs Chrome checks on every main-target PR and deployment after main pushes.
Consequently this delivery stays a local commit and transferable patch packet;
no remote branch, PR, push, merge, workflow alteration or release is part of it.
Historical CI and successful main runs are context, not this packet's acceptance.
