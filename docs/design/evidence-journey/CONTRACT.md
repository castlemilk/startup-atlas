# Evidence journey integration contract

This contract covers one isolated, synthetic search/filter → entity → claim/source → review/propose → authoritative readback journey. It defines an integration specimen, not an operational route, replacement design system or service client. File ownership and the exact next owner gate are in [HANDOFF.md](HANDOFF.md). Existing authorities remain [the record-edit contract](../../MCP-RECORD-EDITS.md), [Signal evidence conditions](../../SIGNAL-EVIDENCE-STATES.md), [motion embedding](../../MOTION-EMBEDDING.md), [UI SDK integration](../../UI-SDK.md) and [canonical tokens](../../../web/design-tokens.css).

## Mount boundary

The host authors a complete root using [`renderJourney(fixtures, prefix)`](../../../specimens/evidence-journey/render.mjs), then calls [`mountEvidenceJourney(root, options)`](../../../specimens/evidence-journey/journey.mjs). `prefix` must be a unique lowercase slug beginning with a letter. Each root needs unique IDs and matching labels/fragments before JavaScript runs. Mount only connected roots; keep multiple instances as siblings, not nested roots.

| Option | Contract |
| --- | --- |
| `rows` | Supplied known entities with canonical `id`, `name`, `summary` and `country`. The specimen knows three fictional startups; it does not discover entities or resolve identity collisions. |
| `claimsFor(id, source)` | Returns the selected entity's presentation claims. `source` is `null` before a successful editable-record read. The host owns their scope and provenance. |
| `candidateFor(id, key)` | Returns an existing-schema edit candidate, or `null`. No form assembles arbitrary patches. Only Aster's region correction has a supplied candidate. |
| `adapters` | The six injected operations below. No network, credential lookup, writer or authenticated session is installed by this component. |
| `inspector` | Optional existing owner port: `select(id, {opener, focus})` and `close({reason: 'dismiss', restoreFocus})`. A rejecting `select` leaves this journey unchanged. The host retains inspector teardown. |

The mount returns:

| Method | Behavior |
| --- | --- |
| `select(id, {opener = null, focus = 'preserve'} = {})` | Synchronously accepts a known ID or returns `false`; records identity immediately and starts the source read when needed. `true` does not mean that read succeeded. `focus: 'panel'` requests explicit heading navigation. |
| `close({restoreFocus = true} = {})` | Clears inspection while retaining search, filters and per-entity review context; returns whether an inspection closed. |
| `setResults(rows, {status = 'ready', reason = ''} = {})` | Receives host-owned result membership. `loading`/`error` retain earlier rows; ready empty results mean no matches. Filtering never closes or retargets inspection. |
| `readSource()`, `review()`, `simulate()`, `recover()`, `readback()` | Return a promise of an accepted, current operation. Guarded or discarded operations return `false`. An accepted readback may contain a failed section; inspect individual contexts rather than treating `true` as universal success. |
| `snapshot()` | Returns a cloned diagnostic snapshot, including selected ID, visible IDs and the current session. It is not a storage or service contract. |
| `resetDemo()` | Explicitly clears synthetic scenario sessions. This is demonstration plumbing, not a live recovery or cancellation API. |
| `destroy()` | Idempotently cancels owned work/listeners, disables enhancement controls and restores static dossiers. Call before removing the root. |

Remounting a root disposes its prior journey owner. An old destroy call cannot dispose its replacement. Destroying a journey neither destroys an injected inspector nor resets shared controls or host motion.

## Supplied operations and envelope integrity

Each adapter receives `{signal}` as its last argument and may return a value/promise or throw. Cancellation suppresses late application even if an adapter ignores the signal. These are specimen ports, not newly published MCP tool names.

| Port | Required result and meaning |
| --- | --- |
| `readSource(id, {signal})` | Hosted editable envelope: exact ID, complete `record`, `origin: 'repository'`, `sourceFile: 'data/startup-research.json'`, `schemaVersion: 'startup-edit-v1'`, 40-character Git `revision`, 64-character `recordRevision`, `published: false`. |
| `validate(edit, {signal})` | Existing preview: complete `previous`/`merged`, `changedPaths`, `warnings`, source/record revisions, `nextRecordRevision`, immutable `intentDigest`/`branch`, `validationToken`, `persisted: false`, `published: false`. |
| `simulateProposal(edit, preview, {signal})` | **Synthetic only.** Supplies an existing-shaped proposed/closed/merged receipt or repository `already_present` result. It performs no proposal, Git write or merge. |
| `recoverProposal(originalEdit, {signal})` | Read-only lookup of the unchanged reviewed intent. Returns its verified receipt or matching `not_found` identity/digest/branch. It never invokes proposal simulation. |
| `readMain(id, {signal})` | Fresh editable repository envelope, independently compared with the review's full expected record and digest. |
| `readPublished(id, {signal})` | Published projection with `startup.id`, `revision`, observed `mainRevision` and `indexStatus`. A graph projection is not the full editable source record. |

[`model.mjs`](../../../specimens/evidence-journey/model.mjs) imports the existing `recordRevision` and pure `applyStartupEdit` helpers; the latter retains the canonical intent identity and merge rules. It does not invent a second hashing, merge or writer algorithm. Clone supplied envelopes before asynchronous verification. Bind the preview to the exact candidate, previous record, source snapshot, canonical merged result, changed paths and warnings; check a proposal's exact intent, full resulting record and head. A valid existing same-intent proposal may retain an older base after unrelated main advancement. Preserve that base visibly instead of confusing it with the new validation snapshot.

These checks establish consistency of supplied envelopes, not authenticated transport, source truth or hosted availability. Local stdio's `local_repository` origin and 64-character snapshot revision are deliberately outside this hosted-shaped specimen. Future live binding belongs to the record owner and must retain the existing authorization, preflight, token and recovery semantics.

## Evidence and state meaning

Knowledge, access, claim review, freshness and publication are independent dimensions. A dated reviewed claim may still be stale or unavailable. [`fixture-source.mjs`](../../../specimens/evidence-journey/fixture-source.mjs) keeps `knowledge`, `freshness` and conflict alternatives in presentation context; these are not added startup-record fields and never enter the patch.

| Condition | Required presentation and action |
| --- | --- |
| No matching results | Explicit zero matches, retained filters and a clear-filter action. Do not infer an empty catalogue. |
| Search/source unavailable | Identify the failed context, retain earlier evidence and allow explicit read retry. A failure is not a successful empty result. |
| Unknown claim | “Not recorded”; missing information does not become zero or false. Recorded empty text and numeric zero remain distinguishable in presentation. |
| Empty claim collection | “No profile claims recorded”; do not assert the entity has no such facts. |
| Conflicting sources | Keep both values, exact URLs and claim review dates. Select no winner and offer no unsupported edit candidate. |
| Stale claim | Keep its value/date plus the supplied reason, policy and evaluation time. The 180-day policy is synthetic only; no production TTL is introduced. |
| Preview | Show before/after, source attribution, full record context, changed paths and warnings. State that nothing was saved and structural validation does not verify facts. |
| Invalidated preview | Keep the original review visible; require source reconciliation and exact validation again. A later unrelated successful read must not re-enable a stale validation token. |
| Uncertain proposal | Preserve original intent across filtering, selection and close/reopen. Block new review/proposal; offer read-only recovery without automatic replay. |
| Recovery `not_found` | State that no matching proposal was observed. This is not permission to repeat an uncertain request. |

Claim links preserve exact URL strings and dates. Unsupported schemes and embedded credentials do not become active source links. Reserved `example.com` subdomains and the synthetic proposal URL are never fetched by the specimen. The demo's claims are fixed fixture observations; a future host must supply correctly scoped claims through `claimsFor`, rather than assuming a new source read silently rebases them. A record-level review date or graph build cannot refresh inherited claim dates.

Three readback panels remain separate: proposal outcome/head, authoritative main, and published snapshot. `already_present` means no proposal was created. Proposed/closed/merged receipts still say `published: false`. Main requires full-record and digest agreement. Publication compares its own revisions and the independent main observation when available; differing observations are explicit context disagreement, not “current.” If one read fails, the other remains usable with its own provenance. Even matching graph revisions leave claim-level projection and hosted capability acceptance separate.

## Interaction, lifecycle and progressive enhancement

The demo harness owns only `ejq` and `ejcountry` query parameters, preserving unrelated URL context. It reuses existing search semantics, separates IME draft text from committed search, and leaves native input/select enhancement to the existing SDK. Production query/history behavior belongs to the controls/host owner.

Inspection remains selected when filtering removes its row; a visible notice explains this. Explicit entity-link navigation focuses its heading, claim selection focuses the claim heading, and review/readback actions focus their destination heading. Ordinary asynchronous completions and result updates do not move focus. Closing delegates to the inspector when supplied; the standalone fallback returns to a usable opener, replacement row control or results heading. Escape closes only within the dossier and yields to inputs, selects and existing SDK select ownership. There is no modal trap or invented composite widget.

Native controls, labels, links, disclosures, headings and a polite atomic status region carry semantics. Disabled actions explain their prerequisite in adjacent text. All evidence remains in authored static dossiers before enhancement; absent JavaScript leaves useful local dossier anchors and source links. Disposing enhancement restores that content. Each request generation is checked after transport and asynchronous integrity work, before any retained-session mutation. Selection changes, cancellation, hidden-document interruption and disposal prevent stale callbacks from winning; visibility return performs no replay.

Scoped component CSS consumes Signal porcelain/graphite/cobalt/Geist tokens. Standalone page chrome has a separate opt-in selector. The journey introduces no animation, ticker or motion runtime; shared controls/inspector retain their single owner and reduced-motion contract. Container reflow, wrapping evidence strings and focus styles express layout intent only.

The [source/DOM tests](../../../tests/evidence-journey.test.js) can establish fixture, state, isolation and simulated-event behavior. Actual focus, keyboard/IME, accessibility announcements, responsive rendering, reduced-motion delivery and JavaScript-disabled browsing remain **BLOCKED** by the existing browser/native hold. Hosted credential, push/CI/deployment and release holds also remain. Exact executed tests/SHA belong to the accompanying evidence receipt; neither this contract nor a source merge establishes browser or hosted acceptance.
