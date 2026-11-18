# Independent review — Singapore deeptech packet

Reviewed on 2026-11-18, completed at approximately 10:02 UTC, by `sg_platforms`.

**Input:** `/workspace/scratch/b4f5bb8bbff9/sg-deeptech.json`

**Pinned SHA-256:** `9ae3e0b3793925824f82faebd4f1989ddc9b78ab7cc526c3dacb822d6eaec7fe`

**Outcome: PASS for reviewable staging within the scope below. No blocking factual correction found.** The input remained unchanged. This review did not edit tracked files, approve production publication, or assert exhaustive financing or startup coverage.

## Scope and checks

The review read 15 distinct existing source URLs, all successfully accessible through the web tool on 2026-11-18. The set prioritised primary company and joint company releases, with the already-recorded CQT and Business Times reports needed to assess Atomionics' historical seed ambiguity and the company LinkedIn profile used for AMILI geography. No broad discovery search or access circumvention was performed.

Read-only structural checks passed: eight unique company IDs and canonical domains, 12 unique financing-event IDs, 136 unique claim IDs, and all claim and participant source URLs mapped to accessed registry entries. Every reviewed claim was marked accessed. Disclosed numeric round amounts were positive with explicit currencies; exact close dates and unestablished incorporation countries remained null. Counts reconciled to 133 reviewed staged claims, three conflict claims, seven accepted startup candidates and one listed ecosystem alumnus.

This is an independent evidence review of the specified risks and headquarters assertions, not a complete re-review of every claim, founder, round or page in the 31-source registry. Repository schema and projection validation remain the assembling owner's separate responsibility.

## Findings

| Check | Finding and integration implication |
|---|---|
| Horizon Quantum listing | The March 19, 2026 release says the business combination completed and announces trading for March 20. The May 5 results subsequently confirm that trading actually began March 20. The packet correctly uses `ecosystem_alumnus_listed`, keeps its historical venture round separate, and identifies the pre-combination operating company and listed reporting entity separately. The listing is source-confirmed as of May 5; it is not inferred solely from the forward-looking March 19 announcement. [Listing release](https://investors.horizonquantum.com/news-releases/news-release-details/horizon-quantum-leading-quantum-software-infrastructure-company), [subsequent results](https://investors.horizonquantum.com/news-releases/news-release-details/horizon-quantum-announces-first-quarter-2026-financial-results). |
| Atomionics historical seed | CQT's June 17, 2021 report explicitly says seed capital was received in 2019 and uses an unqualified dollar symbol. The April 7, 2021 Business Times article explicitly states SGD2.5m. Publication, announcement and receipt can differ; the packet conservatively keeps both dated source assertions in conflict records without creating two financings or inventing a precise close. This treatment is acceptable pending reconciliation. [CQT](https://www.cqt.sg/highlight/2021-06-atomionics-funding/), [Business Times](https://www.businesstimes.com.sg/startups-tech/startups/deeptech-startup-atomionics-raises-s2.5m-in-seed-funding-to-develop-product). |
| Atomionics 2025 round | The accessed release body explicitly gives September 16, 2025, US$12.7m and Pre-Series A. It names Paspalis as lead and the recorded other participants. The list is openly non-exhaustive, and exact close remains unknown. [Company release](https://www.atomionics.com/news-detail/atomionics-raises-12-7m-pre-series-copy). |
| Eureka announcement and close | The financing release contains a December 12, 2024 dateline, USD10.5m and the six recorded participants, while its web publication label is September 1, 2025. The About page says the Series A closed in 2025. The packet preserves these differences, stores one event and leaves exact close null. It also correctly excludes Touchstone from the event despite its investor logo on About: that logo does not establish participation in this round. [Financing release](https://eurekarobotics.com/resources/eureka-robotics-raises-usd-10-5-million-series-a), [About](https://eurekarobotics.com/about-us). |
| SpeQtral seed currency | The April 29, 2019 release states $1.9m without an explicit currency qualifier. The five recorded participants and Space Capital's lead role are supported. Keeping normalized amount and currency null, while preserving the reported amount text, is sound. The CQT page reviewed for Atomionics has a related-story teaser mentioning SpeQtral and US dollars; that is a useful next-source lead, not grounds to silently alter this event using an unreviewed linked article. [Company seed release](https://speqtralquantum.com/newsroom/speqtral-announces-1-9m-seed-funding-to-power-the-next-generation-of-secure-communications). |
| LionsBot factory expenditure | The company-issued release describes approximately SGD12m of factory setup and R&D expenditure. It independently identifies Translink Capital Partners V, L.P. as historical Series A lead without providing a round amount or announcement date. The packet correctly excludes the expenditure from funding and leaves the round's amount/date unknown. The same page names a historical Pre-A lead, a legitimate next-source queue item outside the selected round subset. [Company release](https://www.prnewswire.com/news-releases/lionsbot-announces-grand-opening-of-southeast-asias-largest-cleaning-robots-factory-302120943.html). |
| Headquarters versus incorporation | All eight headquarters assertions were corroborated in this read scope. Eureka labels Singapore headquarters and Atlanta North America HQ separately. Augmentus labels Singapore global HQ and Texas a robotics center. Atomionics' dated July 31, 2026 release names its new Singapore headquarters. The NTT/Transcelestial joint release explicitly identifies Singapore headquarters, dated February 24, 2026. AMILI's public company profile explicitly gives Singapore headquarters. None of these operating-location statements proves group incorporation jurisdiction, so the null incorporation treatment is appropriate. |

### Non-blocking provenance refinement

AMILI's headquarters claim (`sg-dt-41ae270d8909f362`) is supported by an accessible company LinkedIn profile, but its current generic high-confidence rationale does not distinguish self-reported profile evidence from a company-owned website or registry source. For consistency with the separate platforms packet's handling of Glints, the owner may use medium confidence and state that profile ownership was not independently authenticated. This is an evidence-quality refinement, not a contradiction of the Singapore headquarters value. No additional source read is required to preserve that limitation.

The root's later Augmentus contracting-entity addition was not part of this input hash or review. Keeping those source-reported entities separate from established incorporation jurisdiction is consistent with the checks above.

## Sources independently read

The reference IDs below identify this review's web reads; the canonical URLs are the durable citations. Page retrieval date for every row is 2026-11-18.

| Source | Review web reference | Scope |
|---|---|---|
| [Horizon Quantum About](https://www.horizonquantum.com/company/about) | `turn503290969view0` | Founding, founder, headquarters |
| [Horizon business combination](https://investors.horizonquantum.com/news-releases/news-release-details/horizon-quantum-leading-quantum-software-infrastructure-company) | `turn503290969view1` | Completed transaction and announced trading date |
| [Horizon Q1 results](https://investors.horizonquantum.com/news-releases/news-release-details/horizon-quantum-announces-first-quarter-2026-financial-results) | `turn503290969view2`; focused read `turn179941828view0` | Actual trading, operating and reporting entity distinction |
| [CQT Atomionics report](https://www.cqt.sg/highlight/2021-06-atomionics-funding/) | `turn503290969view3` | Seed receipt year and unqualified amount |
| [SpeQtral seed release](https://speqtralquantum.com/newsroom/speqtral-announces-1-9m-seed-funding-to-power-the-next-generation-of-secure-communications) | `turn431211023view0` | Amount precision, date and participants |
| [Eureka Series A](https://eurekarobotics.com/resources/eureka-robotics-raises-usd-10-5-million-series-a) | `turn431211023view1` | Body date, page date, amount and participants |
| [Eureka About](https://eurekarobotics.com/about-us) | `turn431211023view2` | Stated close year and regional HQ distinction |
| [LionsBot factory release](https://www.prnewswire.com/news-releases/lionsbot-announces-grand-opening-of-southeast-asias-largest-cleaning-robots-factory-302120943.html) | `turn431211023view3`; focused reads `turn216672242view3`, `turn216672242view4`, `turn216672242view5` | Factory spending, historical lead and HQ |
| [Atomionics Pre-Series A](https://www.atomionics.com/news-detail/atomionics-raises-12-7m-pre-series-copy) | `turn216672242view0` | USD amount, date, stage and participants |
| [Atomionics headquarters release](https://www.atomionics.com/news-detail/the-inside-story) | `turn216672242view1` | Dated headquarters and founder roles |
| [Business Times Atomionics seed](https://www.businesstimes.com.sg/startups-tech/startups/deeptech-startup-atomionics-raises-s2.5m-in-seed-funding-to-develop-product) | `turn216672242view2` | SGD amount and publication date |
| [SpeQtral About](https://speqtralquantum.com/about) | `turn606301225view0` | Explicit HQ and founder roles |
| [NTT/Transcelestial joint release](https://www.ntt-at.com/news/docs/release260224-e.pdf) | `turn606301225view1` | Explicit Singapore HQ as of publication |
| [Augmentus About](https://www.augmentus.tech/about/) | `turn606301225view2` | Global HQ versus US robotics center |
| [AMILI company profile](https://sg.linkedin.com/company/amili-asia) | `turn606301225view3` | Self-reported Singapore HQ |

## Retained gaps

The review does not settle Atomionics' historical seed chronology, Eureka's exact closing date, SpeQtral seed currency, LionsBot's Series A amount or date, legal incorporation jurisdictions, or completeness of any participant list. It does not verify every company's latest corporate status. These remain explicit bounded-research gaps rather than fabricated values or zeros.
