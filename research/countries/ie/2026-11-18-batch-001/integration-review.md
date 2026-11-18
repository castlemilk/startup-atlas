# Independent integration review

Review date: 18 November 2026. Baseline: `f4bcbf7030d741772bb750deee584efa3ee17749`. Independent reviews were read-only except for explicitly coordinated corrections within the originating Ireland lane. No shared implementation or production files were changed.

## Evidence and projection corrections applied

| Finding | Resolution |
| --- | --- |
| Medtech funding claims use `value.id`; other lanes and participants use `value.event_id`. | Validator/projection joins use event_id with id fallback. All 30 rich events and 140 participant claims resolve to their company/event. Original claim keys are preserved. |
| Perfuze HQ was attached to a rewritten Business Wire representation. | `ie-med-077` and HQ now cite the actual Seroba-hosted release, whose About section explicitly identifies Galway HQ, dated 13 March 2025. The previous representation and caveat remain registered. |
| Fenergo DXC participation could appear to occur on the 2020 announcement date. | `ie-sw-047` now has effective_on null, summer 2019 timing with season precision, and a separate 12 February 2020 event announcement. EUR100m is ABN fund size, never round proceeds. |
| Luminate Series A currency and 8VC role conflict. | Current company EUR15m/ARTIS and 8VC leads and contemporaneous institutional USD15m/ARTIS-led accounts remain. Numeric amount/currency is omitted from the legacy projection. |
| Workhuman HQ evidence was challenged in review. | Direct reread of the privacy policy's International Data Transfers section confirms Ireland and US headquarters. July 2026 company reference identifies Framingham HQ and Dublin office. Both primary assertions remain a conflict; company held. |
| Projected HQ facts could lose historical context. | Known effective and publication dates are retained in profile-fact text, distinct from review date. This preserves Tines, Fin, AccountsIQ and Luminate temporal qualifiers. |
| Source-count label could imply all incomplete reads were among 19 failures. | Metric renamed unaccessed_unique_urls: 19; accessed_template_shells: 1 separately records IMF WEO. Access is not usable evidence or complete site coverage. |
| Seroba pagination and cursor population were underspecified. | Explicit task retains page 1 reviewed and observed pages 2–4/Next untraversed; link URL unknown, so follow observed links on reopen. Cursor offset explicitly indexes pending_company_candidate_ids, not all 43 candidates. |

## Identity and country boundaries

Independent normalization against the pinned overlay and committed graph found no matches to the 45 overlay startups or 46 graph startups, and no canonical name/domain collisions among 24 dossiers. Fin's Intercom alias matches **provider:intercom**, which offers **programme:intercom-early-stage**. Fin is held and those existing identities are preserved for owner resolution.

Fin, Workhuman and LetsGetChecked are held. Fin's completed Salesforce acquisition is corroborated by the acquirer. LetsGetChecked is currently part of Fuze Health with Dublin/Fairfield co-HQ; it is not treated as an independent company or an alias for the entire parent. Fenergo remains an explicitly acquired Ireland-HQ scaleup. XOCEAN, Akara and Flipdish retain unknown current HQ; offices and announcement datelines do not establish it. Everseen and Ubotica retain dated historical HQ observations.

The 44 supplied founder entries have no exact normalized-name match to the 103 committed graph people. This is a collision check, not exhaustive identity resolution. Three investor-name candidates match graph partners—8VC, Accel and Kleiner Perkins—and GV/Google Ventures is a manual alias lead. No investor ID is assigned from name similarity; portfolio/network membership never becomes an event investment.

## Independent structural findings

The existing production validator accepts 21 proposed and three held records. All 458 claims have exactly one projection-map entry; source/company claim indexes resolve. The 140 participant observations match the same company/event/source. Counts reconcile: **43 discovered = 25 reviewed + 18 queued**, and **25 reviewed = 21 accepted + 3 held + 1 rejected**.

Thirty rich event observations comprise 28 company-financing events, one grant and one secondary sale. Three additional grant, future-commitment or debt observations are separate. Legacy projections contain 26 proposed financing rows and two held rows. No cross-currency or cross-instrument funding total is computed.

Planner pagination covers 45 distinct overlay records in five offline pages, final cursor null. This proves exhaustion of that pinned inventory only. No national, directory, portfolio or full-site completeness claim follows.

## Owner integration gates

Preserve three boundary holds, nine conflicting claims, two candidate claims and all unknown/partial fields. Refresh main and dedup against concurrent country work before production admission. Owner fixes #179 and #181 are merged on inspected main `9be40c46aae078224ad41b78ba2d05e27f927b04`. Current graph replay verifies absent unknown years; omitted funding numerics still do not clear prior claims. Hosted MCP deployment is not asserted. This branch duplicates neither implementation. Historical status and exact original text remain in `integration-history.json`; current receipt is `current-main-review.json`.

Current schema lacks typed event participants and per-field precision. Keep the rich ledger/source registry/projection map with any selected records. Do not silently expand schema/API, approve crawler seeds or deploy MCP. Merge, production admission, release and source approval remain with existing owners.

Final offline command receipts are in `validation.json`, `packet-validation.json` and `evidence-validation.json`; final files are covered by `checksums.sha256`.
