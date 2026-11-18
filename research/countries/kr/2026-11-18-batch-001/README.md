# South Korea — GDP 12/30 — research checkpoint 001

**Reviewed 18 November 2026.** This packet stages **22 companies**, **21 financing-event projections**, and **20 public founder observations** for owner review. It also preserves **85 event-specific participant observations** for those financing events in the research ledger. No production records are changed. The accompanying [ecosystem report](ECOSYSTEM.md) covers hubs, public programmes, accelerators and investor networks; [coverage.json](coverage.json) and [next-source-queue.json](next-source-queue.json) make the gaps resumable.

## Scope and measured coverage

| Measure | Checkpoint result |
| --- | ---: |
| Explicitly selected/discovered company candidates | 28 |
| Candidates reviewed | 27 |
| Accepted company identities for staging | 22 |
| Held company | 1 — Wrtn Technologies |
| Rejected from this startup batch, retained as listed ecosystem graduates | 4 |
| Discovery-only company | 1 — Kurly |
| Complete company profiles or complete funding histories claimed | 0 |
| Company claims, including conflicts/candidates/rejections | 325 |
| Reviewed staged ecosystem findings | 23 |
| Registered company/ecosystem source URLs | 120 |
| Source observations with accessed supporting content | 103 |
| Unavailable, insufficient, redirected or deliberately unused source observations | 17 |
| Funding observations before holds/conflict filtering | 23 |
| Financing events in the strict record projection | 21 |
| All event-participant observations, including held/conflicted and strategic events | 98 |
| Participant observations associated with accepted projected financing events | 85 |
| Resumable source work items | 48 |

The denominator is this explicitly selected research queue. It is not a count of all search-result names, all Korean startups, all programme alumni, or the national startup population. The selection deliberately mixes deep technology, software, health and consumer platforms, but it still overweights companies with accessible public English/Korean announcements. Regional life sciences, maritime technology, early-stage companies and less-publicized spinouts remain expansion priorities.

“Accepted” means the company identity and selected claims passed this checkpoint's evidence gates. It does not certify that every firm remains privately held today, that every founder was found, or that a historical round is its latest financing. Known listed graduates are separated because their source positively establishes a different maturity state; missing listing evidence for other companies is preserved as unknown.

### GDP cohort

The user specified the **IMF October 2026 WEO, 2026 nominal GDP estimates**, excluding aggregates and retaining Taiwan under the IMF separately reported economy convention. The retrieved [NGDPD endpoint](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026), intersected with the [IMF country-code endpoint](https://www.imf.org/external/datamapper/api/v1/countries), gives Korea **rank 12** and **USD 2,245.847 billion** among 191 economies with a 2026 value. These are estimates, not final actuals.

The DataMapper response itself is not vintage-stamped. The requested October 2026 cohort and the live endpoint observation are therefore recorded separately, without claiming an API field verifies the edition. See [cohort-observation.json](evidence/cohort-observation.json), the two retained JSON responses and their retrieval-time hashes. The [WEO dataset page](https://www.imf.org/external/datamapper/datasets/WEO) is the user-specified dataset reference.

## Initial company enumeration

Founding values below retain their actual meaning. A year shown in this table may be held in a separately sourced profile fact when it is not supported by the record's main source. “Unknown” means not established in this bounded pass. Every entry has atomic evidence and field dispositions in [companies.json](companies.json) and [claims.json](claims.json).

| Company and canonical site | Research sectors | Founding/origin evidence | Selected financing evidence or principal gap |
| --- | --- | --- | --- |
| [Rebellions](https://rebellions.ai/) | AI accelerators; infrastructure | 2020-09, company history | 2026-03-30 pre-IPO; reported `$400m`, dollar currency unresolved. Two named leaders. SAPEON is a merger counterparty, not an automatic alias. |
| [FuriosaAI](https://furiosa.ai/) | AI accelerators; infrastructure | 2017 | 2025 bridge and 2026 Series D; bare-dollar totals retained as text. SEC filing supports Korean jurisdiction and Seoul principal place of business, with that exact scope. |
| [DEEPX](https://deepx.ai/) | Edge AI semiconductors | Unknown; origin narrative not a formation date | 2024-05-09 Series C, KRW 110bn, from company-issued release; later funding queued. |
| [Mobilint](https://www.mobilint.com/) | Edge NPUs; inference software | 2019; KAIST research origin separately recorded | Founder/HQ/funding gaps retained after a redirect and a forbidden brochure. Korean ecosystem association is research/programme context, not inferred HQ. |
| [Neubility](https://www.neubility.ai/) | Robotics; physical AI | Unknown | KRW 25.1bn Series B announced 2025-12-10, article published the following day. About page yielded no text. |
| [Standard Energy](https://stndenergy.com/) | Batteries; energy storage | 2013, investor-source history | Lotte's approximately KRW 65bn for approximately 15% is a strategic stake event. Primary/secondary split unknown; excluded from financing-round projection. |
| [Upstage](https://www.upstage.ai/) | Enterprise AI; document intelligence | 2020-10 | 2024 Series B and 2025 bridge; `$72m` and `$45m` remain currency-unresolved text. Seoul/US/Japan hubs are not assumed HQs. |
| [Liner](https://liner.com/) | AI research; search | Unknown; 2015 product-history entry is not company formation | KRW 50bn Series C announced 2026-08-25. Native investor spellings preserved. |
| [DeepBrain AI](https://www.aistudios.com/) | AI video; virtual humans | 2016 | 2021 Series B described as over `$40m`; no invented exact day or currency. Seoul HQ explicitly supported. |
| [Mathpresso](https://mathpresso.com/en) | Education AI; QANDA | 2015-06 | 2021 Series C announced July 1, with June completion-month evidence; `$50m` currency unresolved. Seoul HQ explicit. |
| [Socra AI](https://corp.socra.ai/) | Education AI | 2014 Riiid predecessor, secondary attribution | Riiid-to-Socra name change effective 2025-09-01. May 2021 funding and October stage confirmation have separate provenance. Current corporate host and registrable domain are distinct normalization fields. |
| [AB180](https://www.ab180.co/) | Marketing analytics; B2B SaaS | 2015, secondary attribution | KRW 12bn Series B and KRW 21.4bn Series C; sources and date certainty differ. |
| [Channel Corporation](https://channel.io/) | Customer communication; SaaS | Unknown | KRW 11bn investment announced 2025-01-13, stage unstated. The earlier `$30m` fundraising intention is not treated as completed. |
| [Deep Bio](https://www.deepbio.co.kr/) | Digital pathology; medical AI | 2015-10 | Company identity accepted; Series A amount/date held because the company-hosted article conflicts internally. |
| [Medical AI](https://medicalai.com/) | ECG analysis; medical AI | Unresolved 2019 origin versus 2020 founding | Two company-reported investments retained with unknown amounts. Proposed share issue is not automatically Naver's investment. |
| [Viva Republica / Toss](https://toss.im/) | Financial services; fintech | Unknown in accessed primary body | Seunggun Lee explicitly founder. Funding announcements and legal establishment remain queued; no zero-funding inference. |
| [Karrot / 당근](https://about.daangn.com/) | Local marketplace; community | 2015 company origin; July service launch separately | International brand verified; 2023 service rename is not a legal rename. Specific founder and funding claims remain unresolved. |
| [MUSINSA](https://www.musinsa.com/) | Fashion; commerce | 2001 community origin; legal establishment 2012-06-25 | US$190m Series C signed agreements, announced 2023-07-18. KRX listing application does not prove a completed IPO. |
| [Bucketplace / Ohouse](https://www.bucketplace.com/) | Home; lifestyle commerce | Incorporated 2014-07; jurisdiction not established | Investor reports USD177m Series D in first half of 2022. October article date is not the round date; Vertex's general backing is not promoted into round participation. |
| [Tridge](https://www.tridge.com/) | Agrifood; trade intelligence | 2015 Tridge origin; 2012 TP Partners predecessor separately | KRW 50bn Series D, August 2022; exact-day companion announcement retained separately. Seoul business location is not labelled HQ. |
| [RIDI](https://ridicorp.com/) | Digital reading; webtoons | 2008 | KRW 120bn investment agreements announced 2022-02-28; stage and closing day unstated. CEO is not automatically a founder. |
| [Yanolja](https://www.yanoljagroup.com/) | Travel technology; hospitality SaaS | 2005 business origin; legal incorporation unresolved | USD1.7bn round completed by 2021-07-15 announcement, SoftBank Vision Fund 2 sole investor. NOL UNIVERSE remains a subsidiary, not an alias. |

The linked sites establish identity; exact claim-supporting article URLs, source publication dates, access timestamps and evidence notes are in the claim/source files. The table deliberately avoids currency conversion and cumulative funding totals.

### Holds and exclusions

**Wrtn Technologies** remains held because current official domains returned access errors. Historical issuer, investor and professional-biography evidence stays available. Its KRW 83bn additional Series B closing and KRW 108bn aggregate are not additive events.

**MakinaRocks, Nara Space, S2W and Nota AI** have source-backed listing evidence and remain listed ecosystem graduates in `companies.json`. Nota's November 3, 2025 caption establishes a listing celebration; it is not independently verified first-trading-date evidence. No listed record is silently counted among the 22 staged startup identities.

**Kurly** is a discovery-only next-source candidate, with no accepted profile. Deep Bio's conflicted funding event is retained with its five participant observations; those relationships are not promoted independently of the held event.

## Evidence and normalization decisions

The [source registry](sources.json) records publisher, language, exact URL, source kind, retrieval timing, access outcome and crawler-approval state. English, Korean and selected Japanese material were used. Primary company, investor, government and regulatory evidence is preferred; a small number of secondary sources are explicitly labelled. A directly accessed source supports only the scoped claims recorded, not every fact about a company.

Retrieval dates are 18 November 2026. Some agent tool results did not expose request completion timestamps, so those lanes record a real bounded acquisition window and its completion checkpoint. They do not pretend to have exact per-HTTP timestamps. The Socra rename notice was successfully read initially; later audit reopens encountered a redirect/access failure. Its historical observation and the reproducibility limitation are both retained.

Headquarters, business contact locations, remote hubs, registered head office, filed principal place of business, research origin and legal jurisdiction remain distinct. A Seoul dateline does not establish HQ. Incorporation is largely unknown and remains null in research; optional unknowns are omitted from strict production-shaped records. No unknown amount or founding date is converted to zero.

Funding records preserve announced versus closed versus published dates, month/year precision, signed agreements versus completed-by-announcement status, amount bounds, unstated stages, and participant roles. Bare dollar symbols do not receive an inferred ISO currency. Government support, LP commitments, portfolio membership, accelerator admission, IR sessions and secondary stake purchases are not interchangeable with company financing rounds.

The production schema cannot express typed event participation. Therefore the 85 corresponding participant observations remain in the sidecar; no unresolved investor is manufactured into a generic graph relationship. The separate investor-round contract in this repository is synthetic-only and has not been populated or changed.

## Repository baseline and deduplication

Inspected `AGENTS.md`, collection guidance, runbook, knowledge graph documentation, source files, hosted record validator, merged planner [#177](https://github.com/castlemilk/startup-atlas/pull/177), replay [#178](https://github.com/castlemilk/startup-atlas/pull/178), published MCP revision and ownership notes before collection. Main was refreshed again before delivery and remained **`f4bcbf7030d741772bb750deee584efa3ee17749`**.

At that revision, the authoritative overlay contains **45** startups. Building the existing graph function in memory yields **555 entities, 46 startups, 273 edges and 25 funding rounds**. The committed graph file is an older generated snapshot with 537 entities and 17 rounds; it is not relabelled as the current published graph. [Baseline receipts](evidence/) retain the distinction.

Deduplication compared every reviewed candidate's normalized name and sourced aliases, ASCII graph slug and canonical website host against the overlay and rebuilt startup graph. There are **zero exact baseline matches and zero within-packet collisions**. This is not a worldwide legal-identity guarantee. Riiid/Socra is one staged company; Rebellions/SAPEON is a merger relation, and Yanolja/NOL UNIVERSE is a parent/subsidiary distinction. Founder IDs were separately checked for collisions with both existing founders and partner-scoped team identities.

## Validation and reproducibility

Run from the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 research/countries/kr/2026-11-18-batch-001/assemble.py
node research/countries/kr/2026-11-18-batch-001/validate.mjs
PYTHONDONTWRITEBYTECODE=1 python3 research/countries/kr/2026-11-18-batch-001/test_graph.py -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_company_profile_plan.py' -v
git diff --check
```

The country validator covers **17 test groups**: current strict schema, normalization, source/claim binding, null handling, precise dates, participant/event ownership, held/conflicted records, portfolio-versus-round separation, funding-ID uniqueness, counts, location semantics and resumable queue fingerprints. Negative mutations exercise unknown-to-zero, padded dates, wrong sources, orphan/cross-company participants and stale queue/revision/candidate-order checkpoints.

The country graph suite has **10 tests**, including non-ASCII-only founder rejection, slug collisions, same-name person ambiguity and global event-ID collisions. The unchanged #177 planner suite has **16 tests**. See [validation.json](validation.json) for the actual execution receipt and [SHA256SUMS](SHA256SUMS) for payload integrity.

The combined graph was built in memory only: **597 entities, 68 startups, 293 edges, 46 funding rounds and 57 deduplicated articles**. That is a compatibility result, not a published graph or production ingestion claim. The existing builder's zero/empty-string missing-field sentinels are not counted as verified evidence.

## Integration and ownership handoff

Only `research/countries/kr/2026-11-18-batch-001/` belongs to this contribution, on `research/south-korea-gdp-12-batch-001-20261118`. Production overlays, approval CSVs, allowlists, transport, APIs, workflows and deployed MCP are unchanged. The [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection and source approval; the [record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51) retains canonical identity and schema adoption. Review acknowledgements, merges and releases are separate actions, not implied by this packet.

1. Review the country PR and `manifest.json`, then verify `SHA256SUMS` and rerun the checks above against the intended integration revision.
2. Use `startup-records.json` as the current-schema proposal only. Review each record's `projection-map.json` before selectively merging through the existing record path. Do not copy this whole research directory into the production overlay or import unknown/unsupported fields.
3. Resolve any new baseline collisions after concurrent country changes. Investor IDs and typed participation stay in research until the existing owner-approved model supports them.
4. Keep source discovery separate from `data/company-profile-seeds.csv` approval. The unmodified #177 baseline planner found 45 source records, one approved seed, 43 requiring seed review and one missing a reviewed website. Inventory exhaustion does not establish crawler or country completeness.
5. Resume the 48 queued source tasks into a new numbered South Korea batch. Preserve all reviewed records, blocked sources and conflicts. Changed revision/candidate ordering/queue bytes require a fresh checkpoint fingerprint, not reuse of a stale cursor.

Immediate next-source priorities are current TIPS/KISED selections and operators; regional Seoul/Daedeok/Busan/Gwangju/Songdo/Osong cohorts; Pangyo pages 2–5; dcamp/MARU/SparkLabs/Primer cohorts; named VC portfolio and deal announcements; and company-specific held fields. The observed Pangyo **38 rows/five pages** describe consortium/territory entries, not 38 eligible startups. The [ecosystem report](ECOSYSTEM.md) explains why KSGC membership is not proof of Korean HQ, KDB NextRound sessions are not funding rounds, and the main Songdo K-Bio Lab Hub's planned 2029 support must not be recorded as operational in 2026.
