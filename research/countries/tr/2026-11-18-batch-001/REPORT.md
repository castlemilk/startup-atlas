# Türkiye startup ecosystem — first research checkpoint

**Startup Atlas · GDP cohort 16/30 · Batch 2026-11-18-batch-001**

**Evidence checked:** 18 November 2026 UTC

**Final repository baseline:** `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`

**Initial research baseline:** `f4bcbf7030d741772bb750deee584efa3ee17749`

**State:** reviewed research staging; no production publication or crawler-seed approval.

## Scope and measured progress

This checkpoint accepts **21 company identities** after bounded review of **22 profiles**. “Accepted” means that identity and selected claims have enough evidence for research staging. It does not certify a complete company history, current independent-startup status, or Turkish headquarters for every entry. Acquired businesses, public companies and companies with foreign headquarters remain explicitly scoped. Individual profiles and evidence dispositions are in [companies.json](companies.json); decisions and reproducible counts are in [review-decisions.json](review-decisions.json) and [coverage.json](coverage.json).

| Checkpoint measure | Result |
|---|---:|
| Deliberately enrolled company candidates | 34 |
| Additional domain-identity candidate | 1 |
| Fully reviewed company profiles | 22 |
| Accepted / held company identities | 21 / 1 |
| Rejected company collision / rejected domain | 1 / 1 |
| Pending discovery-only companies | 11 |
| Atomic claims: reviewed / conflict / candidate | 357 / 8 / 1 |
| Total atomic claims | 366 |
| Registered sources: accessed / partial / failed | 129 / 8 / 15 |
| Total registered sources | 152 |
| Company–founder assertions | 50 |
| Ecosystem findings / resumable queue tasks | 19 / 32 |

The 50 founder assertions are company–person relationships, not 50 independently resolved unique people. The 15 failed sources comprise 12 unavailable entries, one HTTP 429 block and two fetch errors. These are registered-source outcomes, not a count of every search or network request. Incidental names appearing in portfolios were not automatically enrolled. The national eligible-startup denominator remains unknown. [Coverage definitions](coverage.json); [source registry](sources.json).

The cohort follows the requested **IMF October 2026 WEO nominal GDP estimates for 2026**, excluding aggregates. The release metadata was verified, but the exact NGDPD API values and economy ranking could not be independently retrieved or recomputed. Rank 16 therefore remains the user-assigned cohort position; it is not presented as a newly validated ranking or final GDP actual. [IMF WEO dataset](https://data.imf.org/en/datasets/IMF.RES:WEO); [requested NGDPD API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026); [WEO DataMapper metadata](https://www.imf.org/external/datamapper/datasets/WEO).

## Financing context: transaction definitions matter

KPMG Türkiye and 212 report **360 transactions totaling USD 1.4 billion in 2025**, with acquisitions representing **64.3% of transaction value**. Their Q2 2026 report records **40 transactions and USD 559 million**, with acquisitions accounting for approximately **81.4% of value**. These are defined transaction populations containing acquisition consideration, rather than a census of startups or a pure venture-equity series. The annual and quarterly periods should not be compared as equivalent growth intervals. [2025 investment review](https://kpmg.com/tr/tr/insights/2026/03/turkiye-startup-yatirimlari-2025.html); [Q2 2026 investment review](https://kpmg.com/tr/tr/insights/2026/09/turkiye-startup-yatirimlari-q2-2026.html).

The packet similarly separates its **29 selected historical events** into **16 equity events, ten with unspecified instrument, two acquisitions and one mixed equity/secondary/debt transaction**. Two financing-facility claims and four separate corporate observations are retained separately; these observation counts are not additive measures of money raised. The existing record-shape projection contains 24 financing-round entries, only nine with numeric amounts. No aggregate equity total is calculated from these heterogeneous records. [Event and projection counts](coverage.json); [field-by-field projection map](projection-map.json).

## Regional structure and sector routes

**İstanbul** supplies several distinct collection routes. İTÜ Çekirdek combines incubation, year-round acceleration, Big Bang investor/corporate exposure and a subsequent Growth programme. Teknopark İstanbul’s Cube provides a deep-technology route with laboratories and prototyping infrastructure. BTM, established by the Istanbul Chamber of Commerce in 2017, adds training, mentoring and investor connections. These institutional functions are verified; relative city startup shares are not. [İTÜ Çekirdek](https://itucekirdek.com/en/homepage/); [Cube Incubation](https://www.teknoparkistanbul.com.tr/en/incubation-center); [BTM](https://btm.istanbul/en/about/).

BTM’s programme ladder distinguishes ideas and unique-value propositions, product/MVP development, ventures with first sales, and funded scaleups. This offers useful stage-based sampling for later batches. A featured company or accelerator participant is not thereby a funded portfolio company, and an investor introduction is not a round investment. [BTM programme stages](https://btm.istanbul/en/programs/).

**Ankara** is represented by ODTÜ TEKNOKENT’s university-commercialisation route. Its 20 October 2026 announcement says YFYİ, operating since 2005, continues as **GROWTH CIRCUIT**, supporting company formation, commercialisation and scaling through mentors and investor connections. The 25 October deadline had passed at retrieval. Bilkent CYBERPARK is an important next-source target, but attempted pages failed; current programme claims were not promoted from search snippets. [GROWTH CIRCUIT announcement](https://www.odtuteknokent.com.tr/tr/haber/growth-circuit-hizlandirma-programi-2026.php); [access outcomes](sources.json).

**İzmir** adds green and blue entrepreneurship. İzmir Development Agency says GreenTech, begun in 2018, and BlueTech, begun in 2021, came together under **Accelerate İzmir** in 2023 with İzmir Institute of Technology and Teknopark İzmir. Its Start in İzmir platform coordinates ecosystem information, while İzmir Games targets local developer and studio capabilities and investor connections. These are programme functions, not evidence of an open current intake or complete local company population. [İZKA: Yenilik Girişimcilik](https://izka.org.tr/yenilik-girisimcilik/).

**Gebze/Kocaeli** contributes an industrial technology route through Bilişim Vadisi’s Mobility Cluster: electric and autonomous vehicles, batteries and charging, AI/IoT/cybersecurity, and green technologies. The practical research implication is to sample specialist university and industrial networks alongside software-investor portfolios. Bursa, Konya, Gaziantep, Eskişehir, Adana and other regions have not yet received comparable review. [Bilişim Vadisi Mobility Cluster](https://bilisimvadisi.com.tr/en/programs/mobility-cluster/); [regional continuation queue](next-source-queue.json).

The selected company set covers financial services, mobile games, commerce infrastructure, enterprise software, cybersecurity, logistics and circular-economy technology. That diversity describes this deliberately constructed sample; it does not establish national sector market shares. Sector mappings and supporting claim IDs remain attached to each company. [Company sidecar](companies.json).

## Public support: instrument, stage and deadline

Current programme statements below are bounded to the notices read and the **18 November 2026** checkpoint.

| Programme | Verified support distinction | Application status at checkpoint |
|---|---|---|
| BiGG / 1812, 2026-2 | Stage 2 pre-seed investment: TRY 1.35 million for 3% equity following implementing-organisation acceleration; monitoring-stage follow-on requests possible | Applications ended 30 September; evaluation scheduled through 20 November; results scheduled 24–27 November |
| BiGG+, 2026/1 | Seed support for qualifying companies completing 1812 pre-seed or 1512 projects; up to TRY 8 million and maximum 10% equity, subject to review | Application window 5 October–20 November; preregistration documents were due 17 November |
| KOSGEB revised model | Separate establishment, business-development and interest/profit-share supports; business development is repayable | Third 2026 business-development call ran 12–31 October and is closed |
| ODTÜ GROWTH CIRCUIT | Acceleration and commercialisation support; an advertised prize is not a guaranteed investment | 25 October deadline has passed |

Sources for the table: [TÜBİTAK BiGG 2026-2](https://tubitak.gov.tr/tr/duyuru/turkiyenin-ilk-yatirim-tabanli-girisimcilik-destek-programi-olan-bigg-yatirim-programinin-2026-2-cagrisi-acildi); [TÜBİTAK BiGG+ 2026/1](https://tubitak.gov.tr/en/announcement/bigg-seed-investment-20261-call-open-applications); [KOSGEB October revision](https://www.kosgeb.gov.tr/site/tr/genel/detay/9499/girisimci-destek-programi-yenilendi-girisimcilere-yeni-destek-modeli); [ODTÜ 2026 notice](https://www.odtuteknokent.com.tr/tr/haber/growth-circuit-hizlandirma-programi-2026.php).

BiGG+’s still-open application window must be read with its already-elapsed preregistration deadline. The accessed notice also specifies Türkiye-established companies formed after 1 January 2016 within the qualifying prior-project population. These constraints do not establish blanket eligibility for every startup. KOSGEB’s business-development support is up to **TRY 2.25 million at an 80% support rate**, with an additional **TRY 250,000** for specified founder categories; it must not be represented as unrestricted non-repayable cash or venture equity. [BiGG+ conditions](https://tubitak.gov.tr/en/announcement/bigg-seed-investment-20261-call-open-applications); [KOSGEB support model](https://www.kosgeb.gov.tr/site/tr/genel/detay/9499/girisimci-destek-programi-yenilendi-girisimcilere-yeni-destek-modeli).

A live-page discrepancy is preserved: İTÜ Çekirdek’s undated English homepage still advertises BiGG support of **TRY 900,000 for 3%**, whereas the dated TÜBİTAK 2026-2 notice specifies **TRY 1.35 million for 3%**. The regulator’s call-specific notice is authoritative for that intake. Retrieval today does not make every underlying term current. [intermediary programme page](https://itucekirdek.com/en/homepage/); [dated TÜBİTAK notice](https://tubitak.gov.tr/tr/duyuru/turkiyenin-ilk-yatirim-tabanli-girisimcilik-destek-programi-olan-bigg-yatirim-programinin-2026-2-cagrisi-acildi).

The OECD’s September 2026 Türkiye chapter provides broader context for distinguishing BiGG/BiGG+ from SME R&D instruments and customer-linked innovation programmes, including 1501, 1507, 1707 and 1711. It does not substitute for each current call. Likewise, the Investment Office’s December 2022 Turcorn100 announcement documents policy ambitions and support plans; its 2030 targets are not observed startup or unicorn counts. [OECD programme overview](https://www.oecd.org/en/publications/financing-smes-and-entrepreneurs-2026_bb7fc5c4-en/turkiye_911fc51e-en.html); [Turcorn100 launch](https://www.invest.gov.tr/en/news/news-from-turkey/pages/turcorn-100-program-build-exemplary-entrepreneurial-ecosystem.aspx).

## Investor networks and international growth

The accessed investor mandates span different stages. **Collective Spark** describes pre-seed, seed and Series A technology investing. **Revo** emphasizes Series A/early Series B with a seed pocket. **212** separates a Series A+ Growth Fund, the pre-seed/seed Simya accelerator fund and seed/Series A 212NexT. These are firm-described mandates, not commitments to every named company or evidence that a particular fund joined a round. [Collective Spark](https://collectivespark.com/); [Revo](https://revo.vc/about/); [212](https://212.vc/).

**DCP** provides a specialist discovery route around substantive intellectual property and deep technologies, including biotechnology, agtech, materials, robotics and mechatronics. **Galata Business Angels** describes a nonprofit network for digital and innovative ventures, while **Boğaziçi Ventures** exposes sector-filtered portfolio profiles. DCP’s parsed portfolio yielded images rather than usable company names, and parts of GBA’s page contain broken template text; both limitations remain recorded. [DCP criteria](https://www.dcp.vc/investment-criteria); [DCP portfolio](https://www.dcp.vc/portfolio); [GBA](https://galatabusinessangels.com/en/about-us/); [Boğaziçi Ventures](https://bogaziciventures.com/en/portfolio).

**Endeavor Türkiye** describes a four-month ScaleUp programme with workshops, mentoring and local/global network access. **Startup Wise Guys Türkiye** identifies B2B SaaS, XR and cybersecurity programmes. **Bek Ventures** explicitly identifies itself as formerly Earlybird Digital East Fund; historical funding names remain event-scoped rather than merging all Earlybird-branded entities. Current admission windows and comprehensive portfolio denominators are not established by these undated mandate pages. [Endeavor ScaleUp](https://scaleup.endeavor.org.tr/); [Startup Wise Guys](https://startupwiseguys.com/location/turkiye/); [Bek identity statement](https://www.bekventures.com/article/bek-ventures-recognized-as-top-performing-vc-globally).

## Identity boundaries and unresolved evidence

**Reengen remains held.** Faradai’s privacy policy explicitly describes Reengen Enerji Teknolojileri A.Ş. as its Turkish subsidiary and identifies a separate UK Faradai Limited. This supports a parent/subsidiary relationship, not automatic alias equivalence. Faradai financing has therefore not been assigned to Reengen. [Faradai legal-entity disclosure](https://blog.faradai.ai/netzero/privacy-policy/).

**Akinon’s USD 20 million Series B** is dated 12 October 2021 in the contemporaneous company-issued release, supported by investor chronology, while its current company timeline places that round under 2022. The packet prefers the dated announcement and preserves the discrepancy as one event. [company-issued Series B release](https://via.tt.se/pressmeddelande/3308224/akinon-a-cloud-based-headless-commerce-platform-focused-on-major-retailers-and-consumer-brands-raised-usd-20m-in-a-series-b-funding-round-co-led-by-actera-group-and-revo-capital-with-participation-from-smartfin-capital-and-endeavor-catalyst?publisherId=259167); [Revo chronology](https://revo.vc/investment/akinon/); [company timeline](https://akinon.com/about-us/).

**Binalyze** has company-reported Tallinn headquarters and investor-described Estonia/Turkey association. Its company and investor profiles say 2018 founding, while the Estonian investment agency reports 2016. Molten’s contemporaneous Series A announcement reports `$19 million`, against `$20 million` in Bek’s later retrospective. These conflicts are retained; bare dollars remain currency-unresolved. Neither foreign headquarters nor an ecosystem association proves founder nationality. [Binalyze company history](https://binalyze.ai/about-binalyze/); [Bek company profile](https://www.bekventures.com/portfolio/binalyze); [Estonian agency account](https://investinestonia.com/estonian-cybersec-startup-binalyze-raises-19m-to-speed-up-digital-forensics/); [Molten announcement](https://www.moltenventures.com/news/molten-leads-19-million-series-a-in-binalyze); [Bek retrospective](https://www.bekventures.com/article/2023-year-in-review).

Other precision guards are material: OPLOG’s release prints **“XX September 2022”**, supporting a month rather than an invented day. IFC’s ikas investment amount is a contribution, not the total round. IFC’s Tarfin project is **on Hold** and describes proposed senior-secured SPV financing, so approval is not treated as completed equity or disbursement. Headquarters reporting dates are kept separate from unknown effective dates; incorporation and contact offices are distinct geography fields. [OPLOG release](https://www.esas.com/en/press-room/oplog-global-press-release); [IFC ikas disclosure](https://disclosures.ifc.org/project-detail/SII/49071/ikas); [IFC Tarfin disclosure](https://disclosures.ifc.org/project-detail/SII/50045/mfpbop-tarfin-abl); [normalized review decisions](review-decisions.json).

## Access gaps and bounded continuation

The next batch can resume from **11 explicitly enrolled leads**: Navlungo, İletmen, Co-Print, ForFarming, From Your Eyes, Acrome, Genz, Kavaken, Synnada, Yolda and Libra Softworks. Company/domain verification precedes acceptance; investor portfolio membership supplies discovery rather than financing evidence. The 32 queue tasks also cover legal identity, funding currencies and dates, corporate-event completion, regional sources and programme refreshes. [Resumable queue](next-source-queue.json); [review decisions](review-decisions.json).

Coverage remains limited by incomplete newsroom and portfolio pagination, failed Bilkent/Teknopark İzmir/Turcorn pages, DCP’s image-only cards and BTM profile links that failed or returned generic content. BTM’s 14 visible featured names are a subset, not a directory denominator. An ODTÜ company directory is not startup-only; İTÜ’s linked startup directory was not enumerated. A recorded HTTP 429 does not authorize repeated fetching or bypass. [Source outcomes and pagination notes](sources.json); [search log](search-log.json).

Startups.watch’s public FAQ describes its verification methodology, retrospective revisions and export/use restrictions. This packet does not redistribute its proprietary database. Only short attributed observations and public professional founder facts were retained. Research discovery grants no crawler-seed approval, and no source failure proves absence of a company, founder or financing event. [Startups.watch FAQ](https://startups.watch/faq); [integration boundary](INTEGRATION.md).

## Validation and production-import boundary

The normalized ledger passes structural validation for **366 claims**, with no errors. That check verifies evidence structure, not source truth or completeness. The existing-schema projections deliberately omit unsupported typed relationships and retain richer facts in the evidence sidecars; no schema or API expansion is introduced. [Ledger validation](validation/ledger.json); [projection map](projection-map.json); [integration instructions](INTEGRATION.md).

The initial in-memory preview on `f4bcbf7` reproduced an existing graph-semantic problem: six new projections with omitted founding years became zero, despite the records passing schema checks. That historical failure is preserved in the [initial validation receipt](validation/initial-packet.json). The existing owners subsequently merged [PR #179](https://github.com/castlemilk/startup-atlas/pull/179), preserving unknown founding years, and [PR #181](https://github.com/castlemilk/startup-atlas/pull/181), guarding source inheritance. The country branch was fast-forwarded to `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`; this packet did not duplicate either implementation. [Base-refresh receipt](validation/base-refresh.json).

**The fresh in-memory graph check passes on the final baseline.** Adding the 21 staged projections produces 67 startup nodes, 625 entities and 49 rounds, with no potential duplicate matches and no recorded downstream semantic blockers. All six omitted founding years remain absent, and known years remain unchanged. These are preview counts, not published country records. The earlier zero-year problem is therefore resolved in the checked source revision, rather than retained as a current import blocker. [Fresh packet validation](validation/packet.json); [baseline](baseline.json).

**Production adoption remains a separate owner-reviewed action.** The collection owner and [crawler planner #177](https://github.com/castlemilk/startup-atlas/pull/177) retain their responsibilities. A research PR does not publish company records, approve sources or deploy MCP. Later import still requires current target revisions, renewed deduplication, owner review and exact publication readback. Deployment of the merged fixes to the hosted/MCP runtime has not been verified. Accordingly, `production_import_ready` remains false for those adoption boundaries, not because the known zero-year defect persists. The checkpoint reports **zero production publications and zero crawler-seed approvals**. [Integration review path](INTEGRATION.md); [coverage receipt](coverage.json); [canonical coordination Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).
