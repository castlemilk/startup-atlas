# Russia: ecosystem research and source frontier

Research checkpoint: **18 November 2026 UTC**. Scope: the Russia ecosystem sidecar for Startup Atlas GDP 8/30. This document supplies institutional context and a bounded discovery frontier. Country inclusion follows a **verified Russian operating-business connection**; it does not assert current Russian headquarters. HQ remains unknown where evidence establishes only a legal or contact office. The parent country manifest owns company acceptance, existing-record deduplication and schema validation. Source IDs below resolve to exact URLs and access observations in `sources.json`; `ecosystem-facts.json` contains per-claim source URLs.

## Cohort verification

The requested **October 2026 WEO** vintage was verified from the [IMF dataset page](https://data.imf.org/datasets/WEO) and its linked [official workbook](https://data.imf.org/-/media/iData/External-Storage/Documents/0FA3DC49A04D446E9D69DBEB29979E1C/en/WEOOct2026all.xlsx). Restricting the workbook to the `Countries` sheet, indicator `NGDPD`, and the 2026 column gives Russia **USD 2,861.156 billion and rank 8**. There are 197 economy rows: 191 numeric estimates and six nulls. Aggregate sheets were excluded; Taiwan remained a separately reported economy. Russia’s latest-actual field is 2025, so its 2026 value is an estimate. [Sources ru-eco-003–004]

The supplied DataMapper API was disabled to the web tool, and its dataset page returned an unrendered template. These gaps did not require substituting another WEO vintage. One ordinary public download of the exact October workbook succeeded; read-only parsing and the ranking calculation are recorded in `imf-download-receipt.json` and `imf-rank-receipt.json`. The raw 5,480,592-byte workbook is temporary input, not a repository deliverable. Its SHA-256 is `2aa4f70a05931197b41ed7e0202dc56eee8d816858ac14521e4f8f5dbc38696c`.

## Institutional structure and hubs

The reviewed primary sources show several distinct routes into company discovery: university venture building, technopark or SEZ residency, public grants and loans, corporate acceleration, and investment funds. This is an analytical description of the institutions reviewed, not a claim about the proportion of Russian startups using each route. Membership records require separate company-level checks for current headquarters, incorporation and operating status.

| Hub | Verified institutional channel | Evidence and interpretation |
|---|---|---|
| Moscow and Skolkovo | Skolkovo; IIDF/FRII; Sber500; Moscow Venture Fund and innovation-cluster infrastructure | [Skolkovo](https://sk.ru/) offers grants, acceleration and commercialisation support. [IIDF](https://invest.iidf.ru/) describes investment in Russian-registered IT companies. [Moscow Venture Fund](https://moscow.vc/programs/) separates grants and lending programmes. These different instruments must remain distinct in Atlas. |
| Kazan, Innopolis and wider Tatarstan | Innopolis SEZ; Innopolis University startup studio; IT Park incubation | [SEZ infrastructure](https://sezinnopolis.ru/), [university company building](https://innopolis.university/startupstudio/) and [IT Park incubation](https://itpark.tech/for-startups/business-incubator/) are complementary discovery channels. Resident, partner, startup, student team and established subsidiary are different categories. |
| Saint Petersburg | ITMO acceleration; Ingria incubation | [ITMO](https://accel.itmo.ru/accelerator) provides university-focused venture support. [Ingria](https://en.ingria-startup.ru/programms/) describes workspace, training and investor/business networks. Old resident lists may include businesses whose headquarters have subsequently changed. |
| Novosibirsk | Akadempark and HealthNet-linked A:START | A [dated operator report](https://healthnet.academpark.com/events/25-sentyabrya-sostoyalos-otkrytie-osennego-astart-2026/) confirms the autumn 2026 accelerator opened on September 25. Its programme coverage includes software, instrumentation and life sciences/materials. |
| Ekaterinburg | Ural Federal University and corporate accelerator tracks | The [URFU programme page](https://inno.urfu.ru/project/%D0%B0%D0%BA%D1%81%D0%B5%D0%BB%D0%B5%D1%80%D0%B0%D1%82%D0%BE%D1%80/) identifies industrial/corporate tracks. The observed twentieth-season intake is closed. |
| Tomsk | Tomsk Polytechnic University and INDUSTRIX-linked corporate programmes | [TPU’s April 2026 announcement](https://news.tpu.ru/news/industrix-praktikum-priem-zayavok-na-intensiv-tpu-i-gazprom-nefti-prodlen-do-30-aprelya/) describes engineering, automation, materials and energy work with Gazprom Neft. The announced application deadline and May event are historical. |

These sources support further research into enterprise software and AI, industrial technology and robotics, cybersecurity, medical/life-science technology and university-origin engineering. They establish operator priorities, not a measured national sector distribution. Consumer and retail businesses appear in some investor portfolios and require a technology/startup eligibility review before inclusion.

## Programmes and dates that need careful handling

[Sber500](https://sberbank-500.ru/) explicitly marks **2026 selection complete**. Its GenAI/DeepTech emphasis and twelve visible alumni links are useful discovery evidence. The visible subset is smaller than its self-reported historical alumni population, and neither participation nor readiness to operate in Russia establishes investment, incorporation or present headquarters. [ru-eco-013]

[Sprint 2.0’s dated announcement](https://sprint.iidf.ru/media/ads/frii-zapuskaet-tretiy-v-2026-godu-otbor-v-akselerator-sprint-2-0/) describes a free three-month programme with regional remote participation. Its September 24, 2026 application deadline has passed; the January 2027 start was planned at publication. [ru-eco-012]

[A:START’s landing page](https://astart.academpark.com/) mixes a March–April 2027 schedule with a November 2025 application-opening line. The [IT Park incubator page](https://itpark.tech/for-startups/business-incubator/) retains a selection window ending January 2026. Neither is recorded as currently open. Skolkovo’s displayed financial metrics explicitly concern **2024**, despite current news elsewhere on the homepage. [ru-eco-005, 024, 031]

FASIE/Innovation Promotion Foundation remains a significant **source gap**, rather than an accepted set of programme facts in this lane. The official programme directory returned 403; its application page was unreadable; an official ministry announcement redirected to maintenance; an official university notice PDF was inaccessible. Search snippets are retained only as leads. No current deadline or grant amount from those snippets is accepted here. [ru-eco-007–010]

## Investor and public-finance networks

| Institution | Classification supported by its own source | Collection consequence |
|---|---|---|
| [IIDF / FRII](https://invest.iidf.ru/) | IT investor and acceleration organisation | Generic investment checks are investment policy, not company rounds. |
| [Moscow Venture Fund](https://moscow.vc/investors/) | City-backed finance programmes and accredited investor network | Its stated 100+ investor network is undated and not individually enumerated. Grants and loans remain separate from equity. |
| [Voskhod](https://voskhod.vc/) | Deep-technology investor | Electronics, materials, agrifood, medical technology and robotics are stated focus areas; the full portfolio was not enumerated. |
| [KAMA FLOW](https://www.kamaflow.com/ru/) | Private investment company spanning IT, industry and life sciences | Cross-border activity requires company-specific geography checks. Its dynamic portfolio was not readable as a named roster. |
| [Sk Capital](https://skcap.ru/) | Venture/growth and private-equity investment company | Historic Skolkovo Ventures names and legal entities require evidence before consolidation; future milestones are not completed events. |
| [TealTech Capital](https://www.tealtechcapital.ru/) | Investor in healthcare and consumer businesses | “Leader” labels and “start of cooperation” years are insufficient evidence for founders or closed funding dates. |
| [Softline Venture Partners](https://softlinevp.ru/) | Corporate technology investor with a Russian-origin/international-growth mandate | Russian origin does not establish current Russian HQ; its 25-company headline combines active and exited categories. |

IZBA’s official page timed out, so its classification and portfolio stay pending. Across these sources, portfolio membership supports a relationship only. Event-level amount, currency, participants and date need a dated announcement or equivalent primary evidence.

## Market context and the limits of denominators

The [Moscow Venture Fund’s H1 2026 announcement](https://moscow.vc/news/75/) reports **54 venture deals totalling RUB 4.6 billion**, with a median check of RUB 24.6 million. Its [methodology](https://moscow.vc/static/assets/images/repository/editor/05/ef/Issledovanie_1p_2026_1.pdf) includes some confidential company/investor disclosures and permits Russian classification through domestic operations even where incorporation is foreign. Age limits are ten years, or sixteen for long-cycle science. It includes convertible and mixed equity/debt finance while excluding grants, ordinary loans, exits and control acquisitions above 49%. These figures are useful publisher-defined context; they are not a strict current-HQ denominator or a fully reproducible public-round corpus. [ru-eco-019–020]

No national count of startups is asserted. Resident-directory totals, programme alumni, fund portfolios and market deal counts measure different populations and time periods.

## Bounded enumeration observations and resume points

| Source | Observed bounded slice | Outstanding work |
|---|---|---|
| [Sber500](https://sberbank-500.ru/) | 12 visible named alumni cards and official company links | Verify these companies against current sites and existing Atlas records; broader alumni list unreviewed. |
| [Innopolis directory](https://sezinnopolis.ru/res/) | Page 1: 24 named cards; pagination through page 12 | Startup filter not applied; eleven further pages unreviewed. Mixed mature firms and subsidiaries prevent blanket startup acceptance. |
| [IT Park catalogue](https://itpark.tech/residency/catalog/) | Page 1: 20 cards; pagination through page 10 | Page 2 attempted but unreadable; nine pages remain. Resolve CARGO.RUN/CARGORUN before entity acceptance. |
| [Ingria residents](https://en.ingria-startup.ru/residents/) | 81 displayed labels; 80 exact-label uniques; repeated Dioram | Currentness and entity resolution unknown. Five selected leads remain queued; ROBBO is already accepted. Historical residency is not current HQ proof. |
| [Skolkovo navigator](https://navigator.sk.ru/) | Linked by official homepage; 502 response | Roster, filters and pagination unknown. |
| [ITMO portfolio](https://accel.itmo.ru/portfolio) | Accessible shell; no readable company roster | Prefer dated official Demo Day reports; do not submit a contact-request form. |

Multiplying first-page size by total pages would produce an unsupported denominator. Exact-label deduplication also does not resolve subsidiaries, product aliases, rebrands or international legal entities.

The frontier records **18 selected company labels**, comprising Sber500’s twelve visible alumni and six Ingria leads. These were discovery-only observations at the institutional checkpoint. Country integration now reconciles ROBBO to its accepted profile;17 other labels remain unreviewed with geography and funding null. The institutional observations alone accept no company records and perform no production mutation.

## Integrated checkpoint

The country packet merges this ecosystem frontier with three company-research segments. Its exact unique-URL registry, candidate decisions and deduplicated queue are in `sources.json`, `coverage.json` and `next-source-queue.json`. The 18 selected labels produce17 new discovery-only candidates; ROBBO already has an accepted profile and is not counted twice. See the country README for integrated counts, validation and owner handoff.
