# Japan startup ecosystem — research batch 001

**Research date: 18 November 2026. Evidence status: reviewed and staged; production promotion pending owner review.** This country packet belongs to the Japan research lane in `castlemilk/startup-atlas`, on [research/japan-gdp-04-batch-001-20261118](https://github.com/castlemilk/startup-atlas/tree/research/japan-gdp-04-batch-001-20261118). Initial inspection used [f4bcbf7030d741772bb750deee584efa3ee17749](https://github.com/castlemilk/startup-atlas/commit/f4bcbf7030d741772bb750deee584efa3ee17749); after concurrent owner fixes merged, validation and deduplication were refreshed against [988a4ddcc4dbbc853da0c7f7899b6d6e7579f840](https://github.com/castlemilk/startup-atlas/commit/988a4ddcc4dbbc853da0c7f7899b6d6e7579f840). The packet is proposed in [draft PR #187](https://github.com/castlemilk/startup-atlas/pull/187). Evidence timestamps remain the original review checkpoints; the PR and [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) carry the post-commit delivery receipt. A branch or draft PR does not imply production publication.

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection, merge and release ownership; [crawler planner #177](https://github.com/castlemilk/startup-atlas/pull/177) remains the crawler coordination reference. It was already merged when inspected. This packet introduces no production data mutation, schema/API expansion, deployment, crawler run or seed approval. Evidence discovery does not authorize automated retrieval.

## Scope and checkpoint

The batch reviews **30 deliberately selected companies**, below the initial 50-company ceiling. It accepts **19 staged research identities**, separates **nine listed/acquired alumni**, holds **Spiber** for legal-identity resolution, and rejects **GITAI** from the Japan-headquarters projection. Accepted means source-reviewed identity and claims; it does not certify that all 19 remain independent private companies after a complete ownership audit. Decisions and remaining work are explicit in [companies.json](companies.json) and [coverage.json](coverage.json).

| Measure | Checkpoint |
| --- | ---: |
| Selected candidates discovered / reviewed | 30 / 30 |
| Accepted / alumni / held / rejected | 19 / 9 / 1 / 1 |
| Unique source URLs / raw registry observations | 165 / 166 |
| URLs accessed / not accessed | 149 / 16 |
| Canonical company claims / claim–source assertions | 549 / 703 |
| Explicit founder claims | 38 |
| Financing observations / projected observations | 38 / 37 |
| Event-specific participant observations | 216 |
| Policy hubs / programmes / investor networks reviewed | 13 / 9 / 7 |

Two of the 16 URLs classified as not accessed returned partial/template material. These are not counted as successfully read supporting pages. The founder count includes a claim for rejected GITAI and is not a count of founders of the accepted private subset. The held former-Spiber financing accounts for the difference between 38 observations and 37 projections. These counts describe the packet, not Japan’s startup population.

### GDP cohort qualification

“**GDP 4/30**” is the user-supplied cohort label. The [October 2026 IMF WEO release](https://www.imf.org/en/Publications/WEO/Issues/2026/10/13/world-economic-outlook-october-2026) was identified, but the requested [NGDPD/2026 endpoint](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) was unavailable and the [Data Mapper WEO page](https://www.imf.org/external/datamapper/datasets/WEO) yielded a template shell. Japan’s nominal GDP value and independently calculated rank remain null. Any later calculation must use the October 2026 vintage, 2026 estimates rather than final actuals, exclude aggregates and preserve Taiwan’s separately reported economy convention.

## Ecosystem structure and geographic coverage

The [Cabinet Office’s second-phase selection](https://www8.cao.go.jp/cstp/openinnovation/ecosystem/2ndconcept.html) provides a defensible roster of **13 policy hubs**, comprising eight global hubs and five NEXT global hubs:

| Category | Hubs |
| --- | --- |
| Global | Sapporo/Hokkaido; Sendai/Tohoku; Tokyo; Central Japan; Osaka/Kyoto/Hyogo-Kobe; Hiroshima; Kitakyushu; Fukuoka RAMEN TECH |
| NEXT global | Hokuriku; Nagano/Niigata; Setouchi; Kumamoto; Okinawa |

These are consortium geographies. Programme participation, a regional office and legal incorporation do not establish the same geographic fact. This batch is concentrated in Tokyo and selected industrial/deeptech companies; it cannot rank regional ecosystem strength from its company counts.

**Tokyo combines enterprise software, AI, finance and national corporate networks in this selected evidence.** [Tokyo Innovation Base](https://tib.metro.tokyo.lg.jp/en) provides demonstrations, mentoring, trial sales and corporate collaboration. Its [database](https://tib.metro.tokyo.lg.jp/en/database) covers companies contracting or collaborating with the metropolitan government, rather than all Tokyo-headquartered startups. Tsukuba is a useful adjacent research node, not a fourteenth Cabinet-selected hub: [Tsukuba Startup Park](https://tsukuba-stapa.jp/english/) connects technology entrepreneurs with researchers and investors, while the [university venture roster](https://www.sanrenhonbu.tsukuba.ac.jp/en/spin_offs/year/) distinguishes company establishment from university certification dates.

**Central Japan offers a structured industrial discovery path.** [STATION Ai’s operator](https://www.softbank.jp/corp/news/press/sbkk/2024/20241001_01/) records its Nagoya opening on 1 October 2024. The [regional directory](https://central-startup.jp/en/startups/) covers robotics, mobility, aerospace, materials, bio and digital businesses. Its undated selection counts require reconciliation with newer rounds before use. University certification, incubator membership and manufacturing partnerships should be retained as separate relationships.

**Kansai and Hokkaido have explicit sector priorities.** The [Kansai plan](https://www8.cao.go.jp/cstp/openinnovation/ecosystem/keihanshin_plan.pdf) prioritises life science, green technology and digital fields, including AI and quantum, and identifies KLSAP, KGAP+ and Nakanoshima Cross. The [Sapporo/Hokkaido plan](https://www8.cao.go.jp/cstp/openinnovation/ecosystem/sapporo_plan.pdf) emphasises space, primary industry/food, environment/energy, GX and AI. Future KPI figures in these plans remain targets. [Sendai/Tohoku](https://tohoku-startup-ecosystem.jp/) emphasises university-origin deeptech and impact ventures; [Fukuoka](https://www.city.fukuoka.lg.jp/keizai/r-support/sougyou/index.html) documents founder support and investor/corporate matching. Hiroshima, Kitakyushu and the five NEXT hubs need dedicated company-level research.

The company evidence supports several overlapping research themes: enterprise workflow AI; robotics and industrial automation; space infrastructure; materials and energy systems; and financial, health and labour-market services. These are researcher classifications, not market-share estimates. Kyoto Fusioneering’s Tokyo headquarters, EneCoat’s Kyoto facilities and Interstellar’s Hokkaido headquarters illustrate why names, university origins and operating locations require separate fields.

## Public support and accelerators

The historical [Startup Development Five-year Plan](https://www.cas.go.jp/jp/seisaku/atarashii_sihonsyugi/pdf/sdfyplan2022en.pdf) organises support around people/networks, finance/exits and open innovation. Its FY2027 investment goal and longer-term startup/unicorn ambitions are policy targets, not achieved population counts. The nine programme entries below are recorded in [ecosystem.json](ecosystem.json).

| Programme | Verified function and interpretation |
| --- | --- |
| [J-Startup](https://www.j-startup.go.jp/news/20250318.html) | Fifth selection supplies a fixed 31-company historical roster. [Sixth-round applications](https://www.j-startup.go.jp/news/jstartup-6th-koubo.html) closed 13 November 2026; selections were expected from February 2027. No future selections are inferred. |
| [J-StarX](https://www.jetro.go.jp/services/j-starx/) | Overseas entrepreneurship and expansion courses with course-specific eligibility and deadlines. A regional-course schedule inconsistency remains unresolved. |
| [NEDO DTSU/GX](https://www.nedo.go.jp/activities/ZZJP_100250.html) | R&D/commercialisation subsidies. The 5 October 2026 page reports 119 DTSU companies and 19 GX companies across specified rounds; repeated phases and overlaps prevent adding these as a unique union. |
| [NEDO international joint R&D](https://www.nedo.go.jp/english/activities/activities_ZZJP_100262.html) | Separate international partnership and R&D-location requirements; subsidy support, not an equity round. |
| [Tokyo Innovation Base](https://tib.metro.tokyo.lg.jp/en) | Demonstration, mentoring, procurement/collaboration and entrepreneurship support. Database inclusion does not establish Tokyo headquarters. |
| [STATION Ai](https://www.softbank.jp/corp/news/press/sbkk/2024/20241001_01/) | Nagoya incubation and corporate collaboration. Opening projections are not current membership counts. |
| [Osaka Fintech and Beyond Accelerator 2026](https://www.pref.osaka.lg.jp/o020060/kikaku/osaka-kokusaikinyu/accelerator.html) | Announced 17 November; applications through 2 December, up to four selections. Domestic and overseas applicants interested in Osaka are eligible; selection proves neither equity investment nor Japanese HQ. |
| [Incubate Camp](https://incubatefund.com/en/aboutus/) | Entrepreneur/VC accelerator and community. Participation needs its own relationship type. |
| [Fukuoka Growth Next and Startup Cafe](https://www.city.fukuoka.lg.jp/keizai/r-support/sougyou/index.html) | Founder support and finance, corporate and investor matching; no automatic funding attribution. |

Programme status can change independently of company history. The [1 May 2026 J-Startup removal notice](https://www.j-startup.go.jp/news/20260501.html) for Spiber follows a business transfer. Historical selection must not be carried into a successor’s current membership without evidence.

## Investor networks

Seven networks were examined as discovery and relationship sources. Their portfolios are not a national startup denominator, and portfolio membership is never sufficient evidence of a specific financing-round investment.

| Network | Role and attribution rule |
| --- | --- |
| [UTEC](https://www.ut-ec.co.jp/english/about_us/investment_policy/) | Science/technology investor active beyond one university and outside Japan. Verify each company’s HQ and financing event. |
| [JAFCO](https://www.jafco.co.jp/english/introduction/) | Venture and buyout activity; distinguish startup candidates from buyout holdings and exited companies. |
| [Global Brain](https://globalbrains.com/en/funds) | Venture and corporate-fund manager; preserve investing partnership, manager and corporate sponsor separately. |
| [Incubate Fund](https://incubatefund.com/en/aboutus/) | Seed investment and founder community; programme support and investment are separate claims. |
| [KYOTO-iCAP](https://www.kyoto-unicap.co.jp/en/company/) | University-owned manager supporting research commercialisation; identify the actual investing fund and university relationship. |
| [JIC](https://www.j-ic.co.jp/en/vc) | Institutional fund investor and group parent; LP exposure does not imply direct company investment. Distinguish JIC VGI. |
| [Plug and Play Japan](https://japan.plugandplaytechcenter.com/) | Accelerator and corporate network; separate accelerator, commercial-partner and event-specific investor roles. |

The [UTEC portfolio](https://www.ut-ec.co.jp/english/our_companies/) and [Global Brain portfolio](https://globalbrains.com/en/portfolio) include overseas and exited companies. [Incubate Fund](https://incubatefund.com/en/portfolio/) exposes 11-page navigation; later pages were not traversed and company labels were unavailable in the first extracted page. That is an extraction/pagination gap, not a zero-company result.

## Company decisions: all 30 reviewed candidates

Dates below retain **day (D)** or **month (M)** precision. They are company-reported establishment/origin dates unless qualified; none substitutes for an independently checked incorporation registry. “Unknown” is intentional. Sector labels summarise sourced products. Links identify official profile/status evidence; [companies.json](companies.json) and [sources.json](sources.json) preserve the complete claim-level sourcing and aliases.

| Company / official evidence | Geography and entity scope | Establishment/origin | Sector | Disposition |
| --- | --- | --- | --- | --- |
| [Astroscale](https://www.astroscale.com/en/company-overview) | Tokyo; holding company | 2018-11-15 D; group origin separately 2013 | Orbital servicing | Alumni: listed |
| [ASUENE](https://corp.asuene.com/news/1259/) | Tokyo | 2019-10 M | Emissions/ESG software | Accepted |
| [Axelspace](https://www.axelspacehd.com/company/) | Tokyo; holding company | 2020-03-02 D; operating company separately 2008 | Satellites/data | Alumni: listed |
| [CADDi](https://caddi.com/ja-jp/news/press/20250512/) | Tokyo; Japanese parent | 2017-11-09 D | Manufacturing AI | Accepted |
| [Elephantech](https://elephantech.com/en/company/) | Tokyo | 2014-01 M | Printed electronics/materials | Accepted |
| [EneCoat Technologies](https://www.enecoat.com/company/index_en.html) | Uji, Kyoto; new HQ/factory | 2018-01-11 D | Perovskite solar | Accepted |
| [GITAI](https://gitai.tech/2023/11/17/gitai-shifts-headquarters-and-parent-company-from-japan-to-the-united-states-as-leadership-secures-permanent-lawful-residency/) | Torrance, California; US parent | Unknown in this pass | Space robotics | Rejected: US HQ |
| [Interstellar Technologies](https://www.istellartech.com/about) | Taiki, Hokkaido | 2013-01 M; business commencement | Launch/satellite communications | Accepted |
| [ispace](https://www.ispace-inc.com/company/) | Tokyo; Japanese parent | 2010-09 M | Lunar transport | Alumni: listed |
| [Josys](https://www.josys.com/about) | Tokyo | 2022-02-01 D establishment; 2021 origin also reported | IT management | Accepted; date conflict |
| [Kyoto Fusioneering](https://kyotofusioneering.com/en/about/company) | Tokyo HQ; Kyoto R&D distinct | 2019-10-01 D | Fusion plant systems | Accepted |
| [LayerX](https://prtimes.jp/main/html/rd/p/000000262.000036528.html) | Tokyo | 2018-08-01 D | Enterprise AI/fintech | Accepted |
| [LegalOn Technologies](https://legalontech.jp/company/) | Tokyo parent; group Tokyo/San Francisco | 2017-04-21 D | Legal AI | Accepted |
| [Luup](https://luup.sc/company/) | Tokyo | 2018-07-30 D | Electric micromobility | Accepted |
| [Mujin](https://www.mujin.co.jp/about/profile/) | Tokyo; overseas entities distinct | 2011-07-06 D | Industrial robotics | Accepted |
| [Paidy](https://paidy.com/) | Japan market; HQ unverified here | Unknown | Deferred/instalment payments | Alumni: PayPal-acquired |
| [PowerX](https://power-x.jp/intl/newsroom/2025-12-19) | Tamano, Okayama | 2021-03-22 D | Battery storage/EV charging | Alumni: listed |
| [Preferred Networks](https://www.preferred.jp/en/company) | Tokyo | 2014-03-26 D | AI/processors/infrastructure | Accepted |
| [Sakana AI](https://sakana.ai/company-info/) | Tokyo | 2023-07 M | AI models/applications | Accepted |
| [SmartHR](https://smarthr.co.jp/en/company/) | Tokyo | 2013-01-23 D | HR/talent software | Accepted |
| [SmartNews](https://about.smartnews.com/en/about/company.html) | Tokyo; overseas offices distinct | 2012-06-15 D | News discovery/AI | Accepted |
| [Spiber](https://spiber.inc/en/news/new-spiber) | Tsuruoka, Yamagata; successor unresolved | Unknown for successor | Biomaterials | Held |
| [Synspective](https://www.synspective.com/company/) | Tokyo; Chuo from November 2026 | 2018-02-22 D | SAR satellites/analytics | Alumni: listed |
| [Telexistence](https://tx-inc.com/en/blog/2026/07/16/12644/) | Tokyo, Ota | 2017-01-23 D | Robotics/teleoperation | Accepted |
| [TIER IV](https://tier4.co.jp/en/about-us) | Tokyo | 2015-12 M | Autonomous-driving software | Alumni: listed |
| [Timee](https://corp.timee.co.jp/news/detail-3292/) | Tokyo | 2017-08 M | Short-shift work matching | Alumni: listed |
| [Tsubame BHB](https://tsubame-bhb.co.jp/en/company-en/) | Yokohama, Kanagawa | 2017-04-05 D | Ammonia systems/catalysts | Accepted |
| [Ubie](https://ubie.life/about_ubie) | Tokyo | 2017-05 M | Healthcare AI | Accepted |
| [WealthNavi](https://corp.wealthnavi.com/aboutus/history) | HQ unverified in this pass | 2015-04 M | Asset management | Alumni: MUFG-owned |
| [WOTA](https://wota.co.jp/en/company/) | Tokyo corporate location; HQ label unverified | 2014-10-24 D | Water reuse/control | Accepted |

The nine alumni remain in [alumni-records.json](alumni-records.json), separate from the 19 identities in [records.json](records.json). The table’s alumni decisions are supported by explicit listing or acquisition evidence in the canonical ledger, not an age cutoff. GITAI remains a Japan-origin cross-country handoff; its rejection does not deny its ecosystem connection.

## Financing semantics and identity conflicts

The 38 observations mix equity, debt, facilities, secondary transfers and revised/full-round totals. No combined national or batch funding total is defensible from this slice. Original reported currencies are retained; translated equivalents are not additional rounds. Production numeric amounts are suppressed where precision, overlap or instrument scope is unsuitable, while `amount_text` and notes preserve the evidence.

| Evidence case | Required treatment |
| --- | --- |
| [ASUENE Series D](https://corp.asuene.com/news/1259/) | JPY6.8bn primary equity is separate from the JPY13.5bn headline including secondary shares and borrowing. Do not calculate an undisclosed original-currency debt amount by subtraction. |
| [LegalOn Series E](https://legalontech.jp/9581/) | JPY7.14bn combines primary equity, secondary transfers and debt-like preferred shares. Banks subscribing for preferred shares are not automatically ordinary equity investors or loan providers. |
| [Ubie Series C](https://prtimes.jp/main/html/rd/p/000000044.000048083.html) | JPY3.5bn first close plus JPY2.76bn extension reconciles to JPY6.26bn. The extension mixes equity and loans; the total is not another event. Google's later amount/stage remain undisclosed. |
| [Preferred Networks](https://www.preferred.jp/ja/news/pr20250430) | December's JPY19bn and April's incremental JPY5bn mix equity/debt. JPY24bn is cumulative; June's further extension has no disclosed amount. |
| [Mujin Series D](https://mujin-corp.com/resources/news/seriesd-announcement-advancing-industrial-automation-intelligent-robotics) | USD133m equity and USD100m debt are distinct components. Proposed second-close investors and advisers do not become first-close investment edges. Exact issuing entity remains a qualification. |
| [Kyoto Fusioneering Series D](https://kyotofusioneering.com/en/news/2026/08/24/4350) | JPY16.72bn equity is separate from access to JPY9bn credit/loan facilities; access does not prove full drawdown. |
| [Interstellar Series F](https://www.istellartech.com/news/releases/11034) | JPY14.8bn equity and JPY5.3bn debt are full-round components that include earlier announcements. Secondary transfers are separately mentioned without an amount. |
| [Sakana AI Series B](https://sakana.ai/series-b/) | USD200m is a revised aggregate on a page originally published 17 November 2025 and updated 9 April 2026. The update date is not projected as a new funding announcement date. |
| [Luup](https://luup.sc/news/2025-11-27-fundraising/) and [WOTA](https://wota.co.jp/news-260417/) | Luup's JPY4.4bn mixes equity/debt without a disclosed stage. WOTA's ongoing Series C amount is unknown; placement intermediaries, preferred-share investors and lenders remain separate. |
| [Tsubame BHB](https://www.prnewswire.com/news-releases/tsubame-bhb-procures-5-3-billion-yen-through-series-c-302066121.html) and [PowerX](https://power-x.jp/intl/newsroom/2025-03-07) | Tsubame's approximate full-round total includes earlier convertible-equity warrants. PowerX's incremental agreements overlap a separately reported round total; neither is treated as new IPO proceeds. |

Other precision safeguards include approximate Toyota/PFN, Axelspace and Elephantech amounts; SmartHR/CADDi definitive agreements without an independently established cash-closing date; and English/Japanese announcement dates that refer to one financing. A current CEO is not automatically a founder. WOTA and Interstellar founder gaps remain open, and historical founder lists do not establish complete rosters.

Entity resolution has several consequential cases. [Josys's own release](https://prtimes.jp/main/html/rd/p/000000036.000099889.html) contains both a 2021 origin and 2022-02-01 establishment. Astroscale's 2018 holding-company date differs from its 2013 group origin; Axelspace's 2020 holding company differs from its 2008 operating company. [EneCoat's facilities](https://www.enecoat.com/access/index_en.html) distinguish the new Uji HQ/factory from a July 2026 Japanese registered-office statement in Kumiyama. CADDi's Chicago US entity and LegalOn's group dual headquarters do not replace their Japanese-parent geography.

[Spiber's April 2026 transfer announcement](https://spiber.xsrv.jp/api/wp-content/uploads/2026/04/Announcing-the-Launch-of-a-New-Spiber-and-New-Leadership-Structure_260401_Eng.pdf) establishes new operations with specified exceptions; later brand history repeats 2007 origins. Until legal continuity and successor identifiers are resolved, former founders, historical financing and programme status cannot be assigned automatically to the successor. Its historical “more than JPY10bn” financing remains a lower bound and is not projected.

## Files, validation and promotion gates

The complete deliverable is staged in this directory:

| Files | Purpose |
| --- | --- |
| [companies.json](companies.json), [sources.json](sources.json), [claims.json](claims.json) | Canonical evidence, registry, and flattened claim–source assertions; retrieval dates, uncertainty and conflicts retained. |
| [records.json](records.json), [alumni-records.json](alumni-records.json) | Existing-schema projections: 19 accepted identities and nine separate alumni. |
| [projection-map.json](projection-map.json), [projection_rules.mjs](projection_rules.mjs) | Reproducible field-to-claim bindings and conservative projection decisions. |
| [coverage.json](coverage.json), [deduplication.json](deduplication.json), [next-source-queue.json](next-source-queue.json), [ecosystem.json](ecosystem.json) | Counts, identity comparisons, resumable work and ecosystem findings. |
| [captures-manifest.json](captures-manifest.json), [captures-01.json](captures-01.json), [captures-02.json](captures-02.json), [captures-03.json](captures-03.json) | 112 capture documents split into bounded chunks of 39/37/36, retaining all 703 assertions. No jobs submitted. |
| [test_packet.py](test_packet.py), [validate_records.mjs](validate_records.mjs), [claims-validation-final.json](claims-validation-final.json), [graph-validation.json](graph-validation.json) | Validation implementation and observed results. |

**Observed validation:** 26 Python tests passed; the Node validator accepted all **28 records and 1,168 field bindings** against the unchanged authoritative schema. Checks cover normalization, aliases/deduplication, missing/null values, provenance, participant/event relationships, amount semantics and resumable coverage. The enrichment validator accepted **703 assertions**. The initial confidence-enum failure was corrected and retained in [validation-history/claims-validation-initial.json](validation-history/claims-validation-initial.json). Splitting the capture documents resolves the oversized single-capture packaging issue without submitting ingestion work.

An in-memory graph check produced **620 entities, 74 startups, 310 edges and 62 rounds**, compared with a baseline of **555/46/273/25**. This is a hypothetical integration result with **zero production writes**, not a published Atlas count. Deduplication reports no existing company match in the reviewed base snapshot; future promotion still needs a refreshed comparison with concurrent main and collection changes.

**The founding-year issue found during research is resolved by the existing implementation lane.** [PR #179](https://github.com/castlemilk/startup-atlas/pull/179), merged as [ff4d51cf729d6a654787e9a1db63967b292df8c9](https://github.com/castlemilk/startup-atlas/commit/ff4d51cf729d6a654787e9a1db63967b292df8c9), removed the graph generator's missing-year-to-zero fallback. The refreshed country check confirms that `founded_year` stays absent for **Josys, Interstellar Technologies, Astroscale, Axelspace and Paidy**. Their dates remain ambiguous, differently scoped, or unreviewed; no guessed year was inserted. The earlier failed production behavior is preserved in the historical receipt. [PR #181](https://github.com/castlemilk/startup-atlas/pull/181) also guards funding updates against relabelling inherited claims with a replacement source. Neither implementation is duplicated here. Production promotion still requires owner review of eligibility, entity scope, current evidence and alumni treatment.

From the repository root, the packet checks can be repeated with:

```bash
python3 -m unittest discover -s research/countries/japan/2026-11-18-batch-001 -p test_packet.py
node research/countries/japan/2026-11-18-batch-001/validate_records.mjs
```

Structural success verifies consistency and schema conformance; it does not make every source assertion current registry truth. Incorporation jurisdictions, complete cap tables, exhaustive founder rosters and full financing histories remain unverified. Evidence consists of short factual paraphrases from public company, investor and programme pages. Access failures were retained without bypass; no proprietary bulk data, personal contacts or image assets were collected.

## Resuming bounded coverage

The [fifth J-Startup selection](https://www.j-startup.go.jp/news/20250318.html) contains **31 names**. Sakana AI is the single matched overlap with this reviewed batch, leaving **30 unreviewed roster candidates**. Thus the selected 30 plus fixed 31, minus one overlap, form a **bounded union of 60 candidates**. This is neither all search discoveries nor a national denominator. The queue preserves original Japanese names and the resolved overlap; resume from unresolved entries rather than repeating Sakana.

Next priorities are the remaining fixed-roster companies, NEDO selection tables with phase/year deduplication, Tsukuba and Hokkaido university/venture rosters, and company-specific investor announcements. Subsequent geographic batches should cover the underrepresented hubs. Preserve each source/filter snapshot, page cursor, reviewed identity and stopping condition. Incubate Fund's ten later pages remain unvisited; the Tokyo exploration route timed out; Central Japan's extracted directory lacks company names; a Tohoku roster release was blocked. These gaps require permitted source alternatives, not inferred completeness.

The queue also retains incorporation, current ownership/listing eligibility, incomplete investor lists, financing-component amounts, founder evidence and IMF dataset verification. Before any promotion, owners should refresh deduplication, preserve the five missing-year cases, decide the alumni scope and confirm capture/seed permissions. Merge and release coordination stays with the existing collection and crawler owners; exact publication receipts belong in the PR and canonical Space.
