# Independent evidence review: Singapore platforms packet

**Decision: PASS for reviewable staging, within the scope below.** No unresolved blocking error was found in the reviewed evidence. This is a bounded evidence review, not a certification of every claim or present-day company status.

- Reviewed on: 2026-11-18 UTC.
- Input: `/workspace/scratch/b4f5bb8bbff9/sg-platforms.json`.
- Reviewed SHA-256: `e7c35e2f55f7acfc8516cf66943063a1cb878bc08a1dd86118ae9125bf2b5498`.
- Input scope: 8 companies, 12 financing events, 20 founders, 138 claims; 136 `reviewed_staged`, 2 `conflict`.
- Independent evidence scope: 15 distinct URLs, focused on ShopBack, Trax, Patsnap, Glints, Ninja Van and Doctor Anywhere. Carro and Carousell received structural checks only in this review. Sources below were opened and their relevant text inspected; the Glints About page initially timed out but a subsequent read succeeded.
- No input, production data, repository implementation, access controls or external service was modified. This report is the only review artifact written.

## Findings and dispositions

| Severity / disposition | Finding | Required treatment / corrective action |
|---|---|---|
| Medium, resolved; pass | ShopBack's US$200 million Series F is a final aggregate containing earlier US$80 million tranches and Westpac's US$30 million. The June announcement identifies Asia Partners as lead and January Capital as participant for the initial tranche. | Verified the final file now scopes both participants to `initial tranche announced 2022-06-24`; claims `sgp-shopback-010` and `011` use that effective date. Claim `009` now uses `final close total including prior tranches`. Preserve these fields and count the US$200 million once. Do not flatten Asia Partners' tranche lead role into an unqualified final-close lead assertion. [S1–S3] |
| High consequence if flattened; pass as recorded | Trax's 2021 US$640 million financing explicitly includes primary and secondary transactions. The company blog does not supply an unambiguous USD label or event date. | Keep `mixed_primary_secondary`, both component amounts null, USD evidence attached to the transaction adviser's announcement, and the April 7 announcement date attached to the dated Reuters report. Do not treat all US$640 million as new company cash. Existing claim separation is correct. [S4–S6] |
| Medium, pass | Patsnap states Singapore, London and Toronto headquarters. Its 2021 release distinguishes regional HQs; the 2022 company release calls all three global headquarters. | Keep `country_code: null`, the three `country_codes`, and `as_of: 2022-03-23`. Do not replace them with sole Singapore HQ or infer legal incorporation. The US$300 million Series E and named co-leads/participants are supported by the dated company PDF. [S7–S8] |
| Medium, unresolved source conflict correctly held; pass | The same Glints About page describes a 2013 internship-matching origin and a 2015 official launch/founding timeline. Its duplicated timeline also disagrees on other milestones. | Keep `founded.value: null`, `precision: unknown`, and both dated observations as conflicts. Do not resolve the entity's founding year from the launch year without further evidence. Its August 30, 2022 US$50 million Series D and three co-leads are supported separately. [S9–S10] |
| Medium, pass | Ninja Van's Series E amount is explicitly US$578 million; Geopost/DPDgroup is the lead investor. | Keep USD, September 27, 2021 announcement precision, and round-level participation evidence. The investor's 40% post-transaction stake must not be interpreted as a disclosed investment amount. The packet does not make that error. [S11–S12] |
| Medium, pass | Doctor Anywhere's 2021 Series C is S$88 million with a US$65.7 million source-reported equivalent. Its 2022 US$38.8 million Series C1 is a separate financing, partly used for an acquisition. | Preserve the SGD amount and reported USD equivalent as one event; preserve C1 as a separate event. Do not infer the acquisition consideration from the C1 financing or add cumulative funding as another round. Named investors and lead roles match both releases. [S13–S14] |
| Low, pass with historical scope | Trax's Singapore HQ and 2017 US$64 million financing are supported by a June 28, 2017 investor release. Its lead is an unnamed Warburg Pincus affiliate. | Preserve the historical HQ date, unnamed-affiliate qualification, unknown round stage and incomplete participant list. This source does not establish current HQ, incorporation jurisdiction or a specific legal investment vehicle. [S15] |
| Low, nonblocking provenance caveat | The existing source-kind enum stores Latham's first-party adviser account under `secondary`; the packet documents its transaction role. Retrieval timestamps are declared batch capture times, not exact per-request instants. | Preserve those notes and the actual retrieval day. No schema expansion is required for this packet. Do not report the batch timestamp as an independently measured request time. |

## Read-only checks

The packet parses as JSON. All 138 claims have registered source URLs and `accessed: true`; none depends on the registry's two blocked pages or its wrong-destination redirect. The registry records 45 distinct requested URLs: 42 accessed, 2 blocked and 1 redirect without supporting content. Those access statuses were checked for internal consistency; this review independently reread the 15 selected URLs below, not all 45.

Checks found no duplicate claim IDs, duplicate company domains, orphan round-participant references, cross-company funding links, missing participant source URLs, nonpositive funding amounts, invalid three-letter currency formatting, amount/currency null-pair inconsistency or literal `"null"`/`"None"`/`"N/A"`/`"NaN"` substitutes. All eight incorporation countries remain genuine JSON null. Carro's reported legal name does not silently turn into a jurisdiction assertion. Exact closing dates remain null where only an announcement or closed-by boundary is supported. These checks do not replace root's repository deduplication or production-schema validation.

The existing `/workspace/scratch/b4f5bb8bbff9/sg-platforms-validation.json` reports `valid: true`, no errors, 138 claims, 8 entities and 36 claim-bearing sources; its own scope is structural validation. Independent source checks above provide the bounded factual review.

## Source audit

| ID | Page | Independent web reference | Review result |
|---|---|---|---|
| S1 | [ShopBack final Series F close](https://corporate.shopback.com/press/shopback-completes-final-close-of-oversubscribed-us-200m-series-f-with-strategic-investment-from-westpac) | `turn362798522view0` | Final aggregate and Westpac component verified. |
| S2 | [ShopBack initial Series F tranche](https://www.shopback.co.jp/press/shopback-raises-us-80-million-in-series-f-investment-led-by-asia-partners) | `turn362798522view1` | June 24 date, initial amount and participant roles verified. |
| S3 | [65 Equity Partners extension announcement](https://www.65equitypartners.com/shopback-extends-oversubscribed-series-f/) | `turn362798522view2` | October 25 publication, subscription agreement and regulatory-completion condition verified. |
| S4 | [Trax Series E company account](https://traxretail.com/blog/visionary-investors-back-trax-with-640-million-in-new-funding/) | `turn362798522view3` | Mixed transaction and named participants verified; date/currency not attributed to this page alone. |
| S5 | [Latham's Trax financing announcement](https://www.lw.com/en/news/latham-advises-trax-series-e-financing) | `turn362798522view4` | Explicit US$ amount, mixed transaction and adviser role verified. |
| S6 | [Reuters Trax report, hosted by Investing.com](https://www.investing.com/news/technology-news/technology-firm-trax-raised-640-million-in-funding-led-by-softbank-vf2-blackrock-2468082) | `turn663579013view0` | April 7 publication and same-day company announcement wording verified. |
| S7 | [Patsnap / Evalueserve company release](https://www.patsnap.com/resources/blog/press-release-patsnap-and-evalueserve-team-up-to-deliver-decision-centric-intelligence-solutions/) | `turn663579013view3` | March 23, 2022 body date, three HQs and 2007 founding statement verified. |
| S8 | [Patsnap Series E PDF](https://www.patsnap.com/wp-content/uploads/2021/03/patsnap-press-release-march-16-2021-patsnap-secures-300-million-dollars-in-series-e-funding.pdf) | `turn663579013view1` | March 16, 2021 date, US$300 million and explicit participant roles verified. |
| S9 | [Glints About](https://glints.com/id/about) | `turn996037619view1` | Both conflicting origin/launch timelines read successfully on retry. |
| S10 | [Glints Series D release](https://glints.com/sg/inside/glints-raises-usd50m-funding/) | `turn286222695view1` | August 30, 2022 date, US$50 million and three co-leads verified. |
| S11 | [Monk's Hill Ventures: Ninja Van Series E](https://monkshill.com/content-hub/ninja-van-raises-usd578m-in-series-e-funding) | `turn286222695view2` | Explicit USD amount and named participation verified. |
| S12 | [La Poste / Geopost: Ninja Van financing](https://www.lapostegroupe.com/en/news/geopost-dpdgroup-strengthens-its-presence-in-south-east-asia-acting-as-lead-investor-in-ninja-van-s-latest-financing-round) | `turn286222695view3` | Lead role, date and USD amount verified independently from another investor source. |
| S13 | [Doctor Anywhere Series C release](https://doctoranywhere.com/blog/2021/08/31/doctor-anywhere-series-c-release/) | `turn286222695view4` | SGD amount, reported USD equivalent, date, SG HQ and participants verified. |
| S14 | [Doctor Anywhere C1 and acquisition release](https://doctoranywhere.com/blog/2022/12/21/doctor-anywhere-singapore-listed-asian-healthcare-specialists/) | `turn286222695view5` | US$38.8 million financing and separately described use of proceeds verified. |
| S15 | [Warburg Pincus: Trax 2017 financing PDF](https://warburgpincus.com/wp-content/uploads/2019/10/Trax-WP_FINAL-Press-Release_June28_FINAL.pdf) | `turn663579013view2` | Body date, US$64 million, unnamed affiliate lead and historical Singapore HQ verified. |

## Remaining scope limits

This review did not independently verify every founder, every source-registry entry, current listing/acquisition status, or 2026 HQ freshness. Entity resolution of named investor brands to Atlas IDs remains an integration task; null resolved IDs are intentional. No funding list or company list is declared complete. The reviewed file is a staging packet and must retain its conflicts, historical scope, tranche relationships and mixed-transaction qualification when incorporated into the country deliverable. If a downstream projection cannot preserve a material qualification, omit the affected projection until the existing owners can represent it safely; do not silently change the schema.
