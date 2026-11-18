# Independent evidence review: Singapore fintech packet

**Decision: PASS for the named normalized staging artifacts below, within this bounded review.** The amount, date, participant and legal-entity distinctions are supported by the reviewed sources. Two requested normalization refinements have been verified in the generated country records. The original input is deliberately preserved unchanged for reproducibility.

- Reviewed on: 2026-11-18 UTC.
- Input: `/workspace/scratch/b4f5bb8bbff9/sg-fintech.json`.
- Reviewed SHA-256: `849e279a54fa2d4087d9a178f38c3e4cdcd2f7652cb17eb3134abade0a15e535`.
- Packet: 9 companies, 12 financing observations, 18 founder observations and 164 claims.
- Evidence review: 15 distinct URLs, focused on Nium, Aspire, Syfe, Endowus, Coda and named operating entities. Structural checks cover the entire packet. Thunes, bolttech, Funding Societies and StashAway funding history were not independently reread in this bounded pass.
- The reviewer did not modify the input or tracked files. This report is the only review artifact written.

## Verified normalized artifacts

Base directory: `/workspace/scratch/b4f5bb8bbff9/startup-atlas-singapore/research/countries/sg/2026-11-18-batch-001/`.

| File | SHA-256 at review | Verification |
|---|---|---|
| `claims.json` | `fa6a883f298ddc0cf601ad0decd8907dca18e4573c8922e86eb080bff30eaaf3` | All 164 fintech claims retained; all 40 participant names copied exactly into `value.name`; Endowus transaction-kind claim is `funding_and_note_conversion`. |
| `companies.json` | `b84af37328ec6a25ae93a30d18e4f52cdf844aa820898adc1a29a8c85a36b644` | All 9 fintech companies confirmed; Endowus `funding_events` uses `funding_and_note_conversion`, retaining the lower-bound amount and separate components. Receipt refreshed after an unrelated AMILI HQ qualification; all 164 fintech claims and their artifact hash remain unchanged. |
| `inputs/fintech.json` | `849e279a54fa2d4087d9a178f38c3e4cdcd2f7652cb17eb3134abade0a15e535` | Exact original reviewed input retained. |

The transformation decisions are explicitly recorded in `inputs/integration.json` and `provenance/input-manifest.json`, and applied by country-local `tools/build_packet.py`. These were inspected read-only. This pass applies to the generated normalized records with those transformations, not to a direct unmodified import of the original lane file.

## Findings and exact treatment

| Severity / disposition | Finding | Action |
|---|---|---|
| Medium, resolved in normalized records | Endowus' release identifies more than US$70 million, including US$20 million of fresh funding and conversion of existing notes. It does not expressly name the fresh funding instrument. | Verified replacement of `equity_and_note_conversion` by `funding_and_note_conversion` in both the event and transaction-kind claim. `greater_than`, the US$20 million cash component, the null converted-note amount and unknown stage remain intact. No exact US$50 million conversion is inferred. [F7] |
| Medium, resolved in normalized records | The original 40 `round_participant` claims use `value.stated_participant_name` without `value.name`; the existing enrichment validator requires `event_id`, `name` and explicit role. | Verified all 40 generated claims now have `value.name` exactly matching the existing stated name, and stable `claim_id` values are retained. No investor identity was resolved or invented by this mapping. |
| Pass; material transaction distinction | Coda's US$690 million event is a minority-stake acquisition, explicitly described as a secondary sale by its existing investor. | Keep stage null and `secondary_share_sale`; count it as secondary consideration rather than operating capital. Company-release evidence supports USD, April 14 and Smash Capital / Insight Partners / GIC; the GMO source supports the transaction type. Apis' retained holding does not create a new-investment edge. The April 14 ET release and April 15 investor notice are preserved separately. [F8–F9] |
| Pass; material aggregate distinction | Syfe's US$80 million Series C combines US$27 million C1 in 2024 and US$53 million C2 in 2025. | Count the combined round once. Keep the components nested, the aggregate's two unnamed UK family-office leads and named participants scoped to combined Series C, and both source URLs on C1: the 2024 release supplies its exact date/amount; the 2025 release calls it C1. Do not allocate all combined participants specifically to C2. [F5–F6] |
| Pass; distinct dates | Aspire's Series C page displays August 21, 2025 but carries an explicit February 14, 2023 announcement dateline. | Keep publication and event dates distinct, US$100 million and the disclosed investor roles, and exact close date null. Its later April 30, 2026 US-launch release explicitly supports Singapore HQ. [F4, F12] |
| Pass; investor and founder scopes | Nium's June 2024 Series E release names only an unnamed Southeast Asian sovereign wealth fund as lead; BOND, NewView and Tribe are described as investors from its prior round. The About FAQ names Prajit Nanu and Michael Bermingham as 2014 founders; its 2023 release separately calls Pratik Gandhi co-founder and COO. | Do not create current-round edges for the prior investors or resolve the unnamed lead to a guessed sovereign fund. Keep Gandhi's title as a dated 2023 observation, without claiming he was a named 2014 founder. Preserve Singapore/San Francisco co-HQ and the US$1.4 billion valuation as separate from the US$50 million round. [F1–F3] |
| Pass; legal-entity scope | MAS explicitly states Singapore incorporation for Coda Payments Pte. Ltd., Endowus Singapore Pte. Ltd., Syfe Pte. Ltd. and Asia Wealth Platform Pte. Ltd. Aspire's agreement names Aspire FT Pte. Ltd. but does not establish its incorporation country in the reviewed passage. | Keep each MAS assertion attached to that named operating entity. The packet correctly leaves all group/holding-entity countries null and does not transfer Endowus Singapore's jurisdiction to Endowus Technologies. Keep Aspire's December 11, 2024 agreement effective date distinct from incorporation. [F10–F11, F13–F15] |

Nium's default page excerpt did not initially reach its FAQ. A targeted read of the original source reference returned the explicit founding text, so this was a retrieval-window limitation, not a remaining evidence conflict.

## Read-only checks and remaining limits

All 164 claims refer to registered, accessed sources. No claim uses the blocked Aspire founder interview or the accessed brochure explicitly excluded for its confidentiality label. The registry records 43 requested source URLs: 42 accessed, including that excluded brochure, and 1 blocked. Thirty-seven sources bear accepted claims. This review independently read the 15 sources below; it does not certify the other source contents.

Checks found no duplicate claim/source IDs or canonical domains, orphan financing references, cross-company financing links, missing participant source URLs, unregistered nested source URLs, nonpositive known amounts, malformed currencies or announcement dates, or string placeholders substituting for JSON null. Known component reporting currency can remain USD when its amount is null; that is not a zero-value component. All nine group incorporation countries remain null, as do all 12 exact financing close dates. Unknown investors retain unresolved entity IDs.

The existing `sg-fintech-validation.json` reports 22 intermediate consistency checks passed. Repository-schema normalization and Atlas-wide deduplication remain root integration work. The original source/canonical-name history, unresolved investor identities, StashAway closing-status conflict, incomplete founder rosters and unexhausted newsroom pagination remain in the packet. This review does not assert current ownership/listing status, a complete financing history, or a complete Singapore startup universe.

## Source audit

| ID | Source | Independent web reference | Checked evidence |
|---|---|---|---|
| F1 | [Nium About](https://www.nium.com/about-us) | `turn207773108view0` | Founding FAQ, founders, rebrand and co-HQ. |
| F2 | [Nium Series E](https://www.nium.com/newsroom/nium-raises-us50-million-in-series-e-round-to-expand-real-time-payments-global-infrastructure) | `turn417983107view1` | US$50 million, June 4, 2024, unnamed lead, prior-round language and separate valuation. |
| F3 | [Nium Singapore HQ announcement](https://www.nium.com/newsroom/nium-opens-new-headquarters-in-singapore) | `turn417983107view2` | July 3, 2023 and Gandhi's stated role. |
| F4 | [Aspire Series C](https://aspireapp.com/en-sg/blog/aspire-closes-us-100m-series-c-round-led-by-lightspeed-and-sequoia-capital-sea) | `turn417983107view3` | Publication/event date difference, amount and participant roles. |
| F5 | [Syfe combined Series C](https://www.syfe.com/hk/magazine/syfe-raises-us-80-million-series-c-to-power-regional-expansion/) | `turn206427167view0` | Aggregate, component labels, combined participant scope and HQ. |
| F6 | [Syfe 2024 US$27 million announcement](https://www.syfe.com/magazine/syfe-raises-usd-27-million-in-new-funding-round-announces-profitability-in-singapore/) | `turn206427167view1` | August 14, 2024 date and all-equity component. |
| F7 | [Endowus October 2025 round](https://endowus.com/newsroom/endowus-client-assets-cross-10-billion-and-closes-70-million-fundraise-to-scale-wealth-technology-leadership) | `turn206427167view2` | More-than qualifier, fresh funding, note conversion and event participants. |
| F8 | [Coda company-issued minority-stake release](https://www.prnewswire.com/news-releases/leading-growth-investors-acquire-minority-stake-in-coda-payments-the-worlds-leading-independent-content-monetization-platform-301526263.html) | `turn304611322view0` | US$690 million, named purchasers, retained holdings and original release time. |
| F9 | [GMO VenturePartners Coda notice](https://gmo-vp.com/en/news/client-info/2022/04/coda-payments690.html) | `turn207773108view2` | Explicit secondary-sale classification. |
| F10 | [MAS: Coda Payments Pte. Ltd.](https://eservices.mas.gov.sg/fid/institution/detail/430099-CODA-PAYMENTS-PTE-LTD) | `turn304611322view2` | Named entity and explicit Singapore incorporation. |
| F11 | [MAS: Endowus Singapore Pte. Ltd.](https://eservices.mas.gov.sg/fid/institution/detail/218490-ENDOWUS-SINGAPORE-PTE-LTD) | `turn207773108view4` | Named entity and explicit Singapore incorporation. |
| F12 | [Aspire US launch](https://aspireapp.com/en-sg/blog/aspire-us-launch) | `turn357098196view0` | April 30, 2026 publication and Singapore HQ. |
| F13 | [Aspire Master Service Agreement](https://aspireapp.com/en-sg/tnc/master-service-agreement) | `turn357098196view1` | Contracting entity and agreement effective date. |
| F14 | [MAS: Syfe Pte. Ltd.](https://eservices.mas.gov.sg/fid/institution/detail/225171-SYFE-PTE-LTD) | `turn357098196view2` | Named entity and explicit Singapore incorporation. |
| F15 | [MAS: Asia Wealth Platform Pte. Ltd.](https://eservices.mas.gov.sg/fid/institution/detail/201134-ASIA-WEALTH-PLATFORM-PTE-LTD) | `turn357098196view3` | Named entity and explicit Singapore incorporation. |
