# Russia — GDP 8/30, research batch 001

**Research date: 18 November 2026. Status: validated research staging; no production import.**

This first checkpoint contains 19 company records with verified Russian operating-business connections, an ecosystem report, atomic evidence, funding-event relationships and a bounded continuation queue. It deliberately does not equate Russian origins, an office, headquarters, legal incorporation or a global holding company. It includes established venture-backed technology businesses without applying an arbitrary age cutoff; acceptance is not a claim that every business remains independent, unlisted or early stage.

Only `research/countries/ru/2026-11-18-batch-001/` belongs to this change. The inspected main revision is `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`. Existing collection, record-edit, crawler, schema and release owners remain in place.

## Deliverables and exact counts

| Measure | Checkpoint |
|---|---:|
| Selected named candidates discovered | 42 |
| Candidates reviewed | 24 |
| Accepted company projections | 19 |
| Held after review | 3 |
| Excluded from this batch | 2 |
| Queued, not company-reviewed | 18 |
| Published to production | 0 |
| Atomic company-ledger entries | 301 |
| Reviewed company facts | 220 |
| Conflicts / candidate / rejected claim dispositions | 5 / 1 / 2 |
| Unsearched / searched-unknown dispositions | 57 / 16 |
| Unique exact registered source URLs | 133 |
| Readable / unusable source URLs | 106 / 27 |
| Ecosystem fact observations | 20 |
| Projected financing-event records | 11 |
| Numeric company round/event amounts | 6 |
| Text-only contributions or ambiguous/undisclosed amounts | 5 |
| Additional nonprojected financing observations | 12 |
| Bounded source/field/candidate continuation units | 35 |
| National startup denominator | Unknown (`null`) |

These are packet counts, not a census, search-engine hit count or all directory cards. The ecosystem segment selected 18 labels; 17 add new queued candidates and ROBBO matches an accepted profile. Directory card observations remain separate. Failed access is a research gap, not evidence of inactivity or zero companies.

| File | Use |
|---|---|
| [ecosystem-report.md](ecosystem-report.md) | Hubs, programmes, sectors, investor networks, dates, institutional evidence and page gaps |
| [company-catalogue.md](company-catalogue.md) | Readable company, founder, geography and financing index |
| [records.json](records.json) |19 projections validated by the unchanged current startup-record contract |
| [profiles.json](profiles.json) | Rich research sidecars, aliases, founding precision, geography, field gaps and proposed identities |
| [claims.json](claims.json), [sources.json](sources.json) | Atomic claims, exact source URLs, dates, confidence, access observations and uncertainty |
| [funding-events.json](funding-events.json) |11 events with explicit participant evidence;12 nonprojected observations |
| [ecosystem-facts.json](ecosystem-facts.json), [search-log.json](search-log.json) | Institutional claim provenance and bounded discovery/research log |
| [coverage.json](coverage.json), [next-source-queue.json](next-source-queue.json) | Dispositions, finite source observations, candidate reconciliation and restart points |
| [manifest.json](manifest.json), [coordination-receipt.json](coordination-receipt.json) | Scope, base/input hashes, owners, concurrent India comparison and integration dependencies |
| [INTEGRATION.md](INTEGRATION.md), [validation-receipt.json](validation-receipt.json), [REVIEW.md](REVIEW.md) | Adoption instructions, exact test receipts and independent review findings |
| [SHA256SUMS](SHA256SUMS) | SHA-256 of every other final packet file |

## GDP cohort verified

The [official IMF WEO dataset](https://data.imf.org/datasets/WEO) identifies the October 2026 release. Its linked [workbook](https://data.imf.org/-/media/iData/External-Storage/Documents/0FA3DC49A04D446E9D69DBEB29979E1C/en/WEOOct2026all.xlsx), filtered to `Countries`, indicator `NGDPD`, year2026, gives Russia **USD 2,861.156 billion, rank8**. There are 191 numeric economy estimates and 6 null values among 197 economy rows. Aggregate sheets are excluded and Taiwan is separately reported. Russia's latest-actual field is 2025; 2026 is an estimate.

The supplied DataMapper endpoint was unavailable to the web tool and its older dataset page rendered a template. The exact requested vintage was verified by a successful public workbook download and read-only parsing. [Download receipt](imf-download-receipt.json) and [ranking receipt](imf-rank-receipt.json) preserve the URL, row, units, null handling and SHA-256. The complete workbook is not copied into this repository.

## Company acceptance and geography

| Company | Domain | Principal researched activity | Founding/origin handling |
|---|---|---|---|
| Motorica | motorica.org | Prosthetics and rehabilitation technology |2014 company origins;2015 registration kept separate |
| Celsus | celsus.ai | AI medical-image analysis |2017/2018 issuer conflict; year omitted |
| Third Opinion | thirdopinion.ai | Medical imaging and patient monitoring |2017, year precision |
| Smart Engines | smartengines.ru | OCR and document recognition |2010/2016 issuer conflict; year omitted |
| Just AI | just-ai.com | Conversational and agentic AI |2016, year precision |
| ROBBO | robbo.ru | Educational robotics |2010 idea/project origin; company year omitted |
| Promobot | promo-bot.ru | Service, education and industrial robots |January 2013, month precision in sidecar |
| NtechLab | ntechlab.com | AI video analytics |2015; secondary founder/structure evidence labelled |
| Mindbox | mindbox.ru | Customer data and marketing automation |2006, year precision |
| GetCourse | getcourse.ru | Online education business software |2014, year precision |
| Skyeng | skyeng.ru | Online education |2012, year precision |
| YouDo | youdo.com | Services marketplace |2012, year precision |
| Qummy | qummy.ru | Food technology and automated preparation |2019, year precision |
| CarPrice | carprice.ru | Used-car marketplace and auctions |2014, year precision |
| Sravni | sravni.ru | Financial comparison platform |2009, year precision |
| Dostavista | dostavista.ru | Delivery platform |2012 origin; September launch retained |
| QRate | goqrate.com | Quantum communications |Operating since2015; founding year unverified |
| QApp | qapp.tech | Post-quantum cybersecurity |2017 subproject origin; company founding unverified |
| Genotek | genotek.ru | Medical genetics and DNA testing |2010 founding;17 January 2011 legal registration separate |

The catalogue and ledger supply source URLs for these rows. Founder lists contain public professional information and are explicitly partial. Native names are retained; Latin forms used for graph-compatible identifiers are not claims about a person's legal spelling. Executives are not inferred to be founders from their title alone.

Motorica and Just AI publish explicit main/head-office labels; ROBBO supports Russia at country level without establishing an HQ city. Celsus's Kaluga HQ statement is historical to2023 and is not overwritten by a Moscow registered-office address. Other current HQ fields remain unknown where only offices or legal operators were established. NtechLab's2025 redomiciliation report is distinct from its older Cyprus controller statement and does not establish current HQ.

## Financing decisions that matter

**Round amount, investment-event proceeds and investor contribution have different scopes.** Motorica's2024 annual report supports company receipt of RUB 900m from a strategic investor; it is labelled `investment_event_total`, not the total of an inferred wider syndicate. Celsus's contemporaneous company account supports a first round of RUB 180m in late December 2020. The investor announcement is29 December; a later company account attributes it to 2021. One event is retained with that conflict.

Promobot's May 2013 RUB 300,000 and October 2016 RUB 150m statements identify investor contributions. Their current-schema records use `amount_text`; exact contributions remain in the sidecar, without becoming numeric company-round totals. MTS's RUB 187.7m for 7.5% of Just AI and RUB 824m for 13.68% of YouDo are separate ownership/contribution observations, not assumed round totals.

[Mindbox's transaction adviser](https://www.dlapiper.com/en/news/2022/01/dla-piper-advises-russian-marketing-automation-platform-mindbox) explicitly confirms USD 13m. December 2021 reporting, the company post and January 2022 adviser publication remain separate from an unknown closing day. [CarPrice's investor announcement](https://www.globalprivatecapital.org/newsroom/baring-vostok-capital-partners-and-almaz-capital-participate-in-round-for-carprice-cee-and-cis/) confirms a USD 40m Series B announced23 July 2015, led through Baring Vostok Private Equity Fund V.

Qummy's RUB 93m and RUB 440m observations retain explicit named allocations. The sponsors of the joint pre-IPO fund are not represented as direct investors. GetCourse's reported `$50m` and Genotek's `4 million dollars` remain textual because the accessed statements do not explicitly identify an ISO dollar currency. Skyeng's 2020 investment has an undisclosed amount and secondary-source evidence.

Genotek's 2026 blog is a retrospective source for its **2020** Yandex-led financing; contemporaneous reporting establishes24December 2020. It is not a new 2026 round. Global Borzo's 2021 SeriesC is not assigned to the current Russian Dostavista operator without a verified legal-recipient link. Portfolio, accelerator and customer membership alone never creates an event participant.

## Held and excluded candidates

- **Flowwow — held:** domestic/global entity and ownership split need current evidence.
- **Skyeer — held:** proposed domain redirected toward a domain-sale page and investor source failed; current identity unresolved.
- **Biomicrogels — held:** multiple inaccessible domains and the current Biopolymer identity cannot be merged from similar branding alone.
- **Botkin AI — excluded from independent-company enumeration:** Celsus reports a 100% acquisition in December 2023; acquisition evidence remains in the ledger.
- **Buddy.ai — excluded from this country checkpoint:** the accessed company-authored profile establishes a US HQ, while a current Russian operating-business link was not verified. Foreign HQ by itself is not the exclusion rule.

BestDoctor and 17 newly reconciled institutional leads remain queued. None is described as a verified startup merely because a programme lists it.

## Validation and integration boundary

The existing record validator is imported directly. Country checks cover normalization, native aliases, deduplication, source joins, founder evidence, projection parity, dates, nulls, event participants and resumable coverage. The existing #177 planner is exercised against a **temporary64-record combined overlay**; all 19 new candidates remain `seed_review_required`. Production overlay and seed bytes are checked unchanged. See the exact recorded commands/results in `validation-receipt.json`.

Names, verified aliases, domains and proposed slugs were checked against 45 source records and 46 committed startup identities, including the quarantined graph identity. Main advanced during final review; the country branch was fast-forwarded to `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840` and all relevant checks were repeated. The concurrent [India PR #180](https://github.com/castlemilk/startup-atlas/pull/180) adds 21 staged records at `4bdebdd32fcd77e893648270e9e1d76c664526da`; the read-only comparison found no name/alias/domain matches. This is not a claim about inaccessible or unpublished work.

**The existing owner's fixes are included and verified on the final base.** The initial graph builder synthesized zero for new records with omitted founding years. The owner merged [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) during this review; the final regression requires founding years to remain absent for Celsus, Smart Engines, ROBBO, QRate and QApp. [PR #181](https://github.com/castlemilk/startup-atlas/pull/181), protecting legacy funding source attribution, is also merged and its record tests pass. This country packet duplicates neither implementation. Richer geography, partial dates and investor identities remain sidecars under the present contract. Production adoption still requires the existing owner's normal review and release path.

The [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [planner#177](https://github.com/castlemilk/startup-atlas/pull/177) and [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) receive the review handoff. Seed approval, production adoption, merges and releases remain owner decisions. All 133 source entries and 35 queue units explicitly retain false crawler approval. No robots request, access-control bypass, outreach, credential, permission, schema or API change is part of this work.
