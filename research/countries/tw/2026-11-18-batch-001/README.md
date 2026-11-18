# Taiwan — GDP cohort 22/30 — research batch 001

Research checkpoint: **18 November 2026**. This is a source-backed, bounded research packet for review, separate from the production overlay and crawler inventory.

| Measure | Count and interpretation |
| --- | --- |
| Explicitly logged candidate identities | **42**; excludes incidental names visible on source pages |
| Companies reviewed | **24** |
| Accepted into staging | **20** |
| Held for further review | **3**: Appier, Avalanche Computing, Chimes AI |
| Excluded from this country batch | **1**: SHOPLINE, whose company profile identifies Singapore HQ |
| Discovery-only leads | **18**, including three research-team names whose company formation is unverified |
| Claim/disposition rows | **267**: 246 reviewed observations, 4 conflicts, 13 unsearched, 3 searched-unknown, 1 blocked |
| Reviewed claims for accepted companies | **234**; the other 12 reviewed observations concern held/excluded identities |
| Source registry | **123 observations across 111 distinct URLs**, including blocked/partial responses and independent rechecks |
| Financing/investment events | **19** in staging; **18** historical entries in the schema projection; the additional event is a planned FunNow contribution retained as a profile fact |
| Event participant observations | **47**, including the planned Hotai participation; **0 canonical investor edges** proposed |
| Follow-up tasks | **45**, bounded and resumable; includes paused/access-blocked tasks |
| Production records changed / crawler seeds approved | **0 / 0** |

There is **no national startup denominator or completion percentage**. The accepted set contains five confirmed listed alumni, one public-market reference with unresolved current segment, two company self-reports of private status, and twelve companies whose current listing status was not established. It is not a list of twenty verified private, Taiwan-headquartered startups.

## Deliverables

| File | Purpose |
| --- | --- |
| [ecosystem-report.md](ecosystem-report.md) | Regional hubs, sectors, accelerators, public programmes, investor networks, source limitations and next research priorities |
| [companies.json](companies.json) | Twenty rich staging records with separate geography, founding precision, aliases, public professional founders, source claims and uncertainty |
| [startup-records.json](startup-records.json) | Twenty records validated with the unchanged `backend/hosted/src/startup-record.mjs` contract |
| [claims.json](claims.json) | Per-claim URLs, source IDs, retrieval/review dates, confidence, conflicts and dispositions |
| [source-registry.json](source-registry.json) | Source observations, languages, access outcomes and pagination limitations |
| [funding-events.json](funding-events.json) | Precise event scope, dates, amounts/currencies and event-specific participant assertions, with unresolved canonical investor IDs |
| [projection-provenance.json](projection-provenance.json) | Source/claim joins for all 173 projected factual items; structural metadata is not treated as a sourced fact |
| [decisions.json](decisions.json) | Held/excluded identities and discovery-only leads |
| [coverage.json](coverage.json) | Counts, boundaries, gaps and hash-bound resume checkpoint |
| [next-source-queue.json](next-source-queue.json) | Page budgets, stop conditions, observed source URLs and unknown remote cursors |
| [manifest.json](manifest.json) | Country scope, pinned baseline, ownership and input hashes |
| [validation.json](validation.json) | Actual schema, provenance, deduplication, funding, graph and resume checks |
| [claims-validation.json](claims-validation.json) | Enrichment skill's structural claim-ledger validation |
| [regression-tests.json](regression-tests.json) | Relevant existing repository test receipts |
| [planner-baseline.json](planner-baseline.json) | Five pages produced by the existing #177 planner over the 45-record baseline overlay |
| [baseline-inventory.json](baseline-inventory.json) | Refreshed committed-snapshot inventory; see the source-rebuilt counts in validation.json |
| [baseline-inventory.initial.json](baseline-inventory.initial.json) | Original main inspection before the owner's #179 merge |
| [research-captures.json](research-captures.json) | Partial researcher paraphrases produced by the existing enrichment helper; not live crawler captures or an ingestion instruction |
| [INTEGRATION.md](INTEGRATION.md) | Exact review/integration steps and owner boundaries |
| [review-notes.md](review-notes.md) | Independent review corrections and remaining representation limitations |
| [SHA256SUMS](SHA256SUMS) | Checksums for the packet's other files |

## Accepted identities

| Canonical name | Canonical domain | Material qualification |
| --- | --- | --- |
| iKala | `ikala.ai` | Taiwan HQ at economy precision; B+ amount is a lower bound; host paused after HTTP 429 |
| CyCraft | `cycraft.com` | Listed alumni; USD 5.65 million 2019 Series B |
| KDAN | `kdan.com` | Former Kdan Mobile domain/brand; Tainan HQ; emerging-stock history and unresolved current segment |
| TeamT5 | `teamt5.org` | 2014 versus 2017 founding conflict; Series A investment year 2022, no announcement/close day |
| 91APP | `91app.com` | Listed alumni; Taiwan business founding and Cayman parent incorporation are separate |
| Gogolook | `gogolook.com` | Listed alumni; partial founder-name evidence is not promoted to resolved people |
| XREX | `xrex.io` | Taipei HQ; 2018-08 origin; group/subsidiary and investment-total distinctions retained |
| Numbers Protocol | `numbersprotocol.io` | Taiwan investor tag, not verified HQ; 2019 is a project-origin observation |
| Dcard | `dcard.tw` | Product began in 2011, company in 2015; exact Chinese founder name kept without fabricated transliteration |
| Jmem Tek | `jmemtek.com` | Taiwan HQ at economy precision; month-precision financing timeline with unknown amounts |
| Profet AI | `profetai.com` | Manufacturing AI; USD 5.6 million Series A with dateline/distribution-date distinction |
| Tensor Tech | `tensortech.co` | Satellite controls; registry-derived establishment year and operating location are qualified |
| JelloX Biotech | `jellox.com` | Month-precision company/funding timeline; explicit cofounder evidence only |
| CancerFree Biotech | `cancerfree.io` | Incorporation-month observation is not automatically founding; accelerator/competition investments distinguished |
| aetherAI | `aetherai.com` | Listed on TWSE TIB in 2026; 2015 operating founding differs from 2020 legal establishment |
| TMYTEK | `tmytek.com` | Listed on TWSE TIB in 2026; USD 25 million B+ increment, USD 40 million Series B aggregate |
| CoolBitX | `coolbitx.com` | Historical Taiwan base; current HQ/incorporation unknown; USD 16.75 million Series B |
| KKday | `kkday.com` | Taiwan founding 2014-05; approximate mixed investment and credit-facility financing |
| KryptoGO | `kryptogo.com` | 2019 company origin versus 2018 register observation; funding headline conflict held |
| FunNow | `myfunnow.com` | Taipei group profile; Netherlands origin is not incorporation; Hotai contribution remains planned |

The JSON records and their claims are authoritative for exact field evidence. Company websites, product names and parent/group names are not automatically interchangeable legal identities.

## Validation and ownership

Initial main was `f4bcbf7030d741772bb750deee584efa3ee17749`. Before publication, main advanced to **`ff4d51cf729d6a654787e9a1db63967b292df8c9`**, incorporating the owner's [unknown-year fix #179](https://github.com/castlemilk/startup-atlas/pull/179). This branch includes that revision. All twenty projections validate, eleven omitted founding years remain absent in the in-memory graph, and no exact normalized company name/alias/domain/ID, founder slug or event ID collision was found against the **555-entity source-rebuilt baseline**. The 537-entity committed graph is explicitly distinguished from that rebuilt baseline.

The packet has ten rejecting negative probes and fifty passing relevant existing tests: sixteen planner, twenty-four startup-edit domain/corpus, and ten graph tests. The existing planner resumes through all forty-five supplied overlay records without omissions or duplicates. That finite inventory result is not a Taiwan coverage claim.

The [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [planner #177](https://github.com/castlemilk/startup-atlas/pull/177), record, investor-round and release owners retain their responsibilities. Owner acknowledgement remains pending. This PR proposes only the country research packet. Review acceptance, production integration, crawler seed approval, merge and release are distinct actions.

The GDP cohort position follows the user's October 2026 IMF WEO convention. The exact API could not be read; no independently verified GDP value or reconstructed rank is asserted.
