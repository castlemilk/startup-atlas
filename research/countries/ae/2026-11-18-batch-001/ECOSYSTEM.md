# United Arab Emirates: ecosystem research and startup batch 001

**Evidence checkpoint:** 18 November 2026
**Scope:** UAE country research packet for Startup Atlas; bounded company verification and ecosystem mapping.

**Current repository baseline:** `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`. The original research checkpoint used `f4bcbf7030d741772bb750deee584efa3ee17749`; the owner-fix refresh changes the integration baseline, not the company set or source-backed research findings.

The sources reviewed show three complementary institutional centres: Abu Dhabi connects founders with investment, government and regulated business infrastructure; Dubai combines financial technology, commercial platforms and incubators; Sharjah offers a staged entrepreneurship pathway. This is an interpretation of the institutions and companies examined, not a measured distribution of all UAE startups.

The cohort label **GDP 29/30** and the specification **IMF October 2026 WEO, 2026 nominal GDP estimates** are supplied by the user. The requested [IMF DataMapper API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) was unavailable in this run, so neither the ranking nor a GDP value was independently calculated. The [WEO dataset page](https://www.imf.org/external/datamapper/datasets/WEO) is the specified cohort reference. No estimate is presented as a final actual.

## 1. What this batch establishes

The finite discovery queue contains **32 named candidates**. **25 were reviewed**: **18 accepted for research staging**, **six deferred**, and **one excluded from the UAE batch**. **Seven remain unreviewed discovery leads**. These are workflow counts for this packet; there is no defensible national startup denominator and no claim of complete country coverage. The authoritative counters, access outcomes and field dispositions are in [coverage.json](coverage.json).

Acceptance means that sufficient identity and UAE-connection evidence exists to prepare a reviewable record. It does not mean every field is known, that every company currently has its sole global headquarters in the UAE, or that every financing transaction has been reconstructed. The accepted set includes mature venture-backed businesses as well as younger startups. Four accepted companies have no verified global-headquarters field, one has only historical country-level HQ evidence, and two have dual-country observations.

The [claim ledger](claims.json) retains source URLs, retrieval observations, date precision, conflicts and uncertainty. [Startup records](startup-records.json) contain the bounded schema-shaped projection; [projection-map.json](projection-map.json) connects projected fields to their evidence. Deferred observations remain in the research packet without entering that accepted projection. Proposed identifiers are provisional. Research discovery does not approve crawler seeds, and this packet does not change production data, crawler permissions, schema or API behaviour.

The original checkpoint exposed unknown founding years being coerced to zero. The existing owner's correction in [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) and separate funding-source inheritance fix in [PR #181](https://github.com/castlemilk/startup-atlas/pull/181) are now merged into the refreshed repository baseline. The source-level unknown-year defect is resolved by that owner work; current behaviour is documented in the refreshed [validation receipt](validation-results.json). All 18 projected records still omit the scalar founded_year field and preserve supported founding assertions as sourced facts. A fresh live-MCP graph readback reports current published data at the refreshed baseline; it does not establish separate hosted-runtime adoption of the funding-source guard or publication of this packet. Normal production review and release coordination remain pending.

## 2. Hubs, accelerators and public programmes

### Abu Dhabi: institutional connections and sector programmes

[Mubadala's Hub71 profile](https://www.mubadala.com/en/what-we-do/hub71) locates the ecosystem in Abu Dhabi Global Market and describes connections among startups, investors, corporates, regulators and government. This makes Hub71 a useful source for cohort discovery and evidence of ecosystem participation. Membership itself does not prove that a company moved its global headquarters, incorporated a particular holding company in ADGM, or received a specific investment.

Current Access Programme economics were not verified. Both attempted operator Access pages returned 403. Mubadala's broad description refers to equity-free support, while discovery excerpts for particular programmes describe equity-linked incentives. The packet preserves that unresolved programme/version distinction and does not advertise cash amounts or financial terms as current entitlements.

The [17 April 2025 ADIO, Department of Health and Hub71 announcement](https://www.mediaoffice.abudhabi/en/economy/abu-dhabi-investment-office-department-of-health-abu-dhabi-and-hub71-join-forces-to-enhance-abu-dhabis-position-as-global-epicentre-for-life-sciences-investment/) connects the HELM cluster with biotechnology, medical technology, digital health and venture-capital networks. It supports a sector-development observation. It is not an award to every company mentioned in the wider ecosystem, and announced future targets are not treated as achieved outcomes.

[Khalifa Fund's current funding-scheme page](https://www.khalifafund.ae/services/funding-scheme/) lists seven loan programmes, including a First-time Founders Loan for the establishment and launch stages, as well as AI and Robotics, Revolving, Small, Working Capital, Fixed Assets and Expansion loans. Its eligibility section describes 100% UAE-owned businesses in Abu Dhabi and owners or partners aged 18–65; operating-history requirements vary by product, with some supporting startups and others requiring at least a year of operations.

The separately accessible [FAQ](https://www.khalifafund.ae/faq/) still gives ages 21–60 and at least two years of operations for its funding answer, with three years for branch finance. These age and business-stage conditions conflict with the broader current scheme presentation. Both observations are retained with their source scope; no universal eligibility rule is published. A future opportunity record must identify the specific loan and reconcile its current terms. Finance criteria should also not be copied onto unrelated training or nonfinancial support.

### Dubai: financial innovation and commercial infrastructure

[DIFC Innovation Hub](https://www.difc.com/ecosystem/innovation-hub) identifies FinTech, InsurTech, RegTech and Islamic FinTech alongside licensing, workspace, acceleration and partner networks. Its community total includes technology businesses, laboratories, investors, regulators and educators. That heterogeneous total cannot be converted into a startup count or a national denominator. Current FinTech Hive programme names, application windows and cohort-specific terms still need separate reconciliation.

[in5's FAQ](https://infive.ae/faqs/) describes incubation across technology, media and design, while the site also links a Science offering. Applicants may be of any nationality, but accepted teams must be based in Dubai. in5 says it takes no startup equity and facilitates introductions to investors; investment terms are negotiated directly between investors and companies. Incubation therefore cannot be converted into a funding-round relationship. Detailed Science terms, current pricing and benefit entitlements remain outside this pass.

[Dubai Future District Fund](https://dfdf.vc/) is a separate capital platform: its stated model invests into venture funds and alongside them into companies, with DIFC and Dubai Future Foundation as anchors. Its AED 1 billion figure is labelled fund size, not capital deployed into startups. Direct-company and fund-manager portfolios must be enumerated separately. Dubai Future Accelerators remains an operator-source gap: the attempted endpoint was inaccessible, and historical cohorts were not used to infer a current open programme.

### Sharjah: staged founder development

[Sheraa's membership page](https://www.sheraa.ae/membership) sets out five stages—Ideate, Validate, Incubate, Accelerate and Scale—and welcomes applicants of all nationalities aged 18 or above. The first two stages are free, while later support is paid; later stages may also require Sharjah licensing and presence. General eligibility and the conditions attached to a particular stage are different facts.

Older S3 discovery pages expose differing credit amounts and 2025–26 cohort dates. They have not been reconciled with current membership terms. No current deadline, grant amount or open-cohort status is inferred. Sheraa's startup directory and the Sharjah Research, Technology and Innovation Park ecosystem remain priorities for a later bounded source pass.

### Federal innovation support and financing instruments

The Ministry's Arabic [Mohammed Bin Rashid Innovation Fund page](https://www.moet.gov.ae/mohammed-bin-rashid-innovation-fund) was read directly. It describes an innovation accelerator and a separate financing-guarantee scheme across technology, education, renewable energy, water, health, space and transport. The text is nationality-inclusive while describing financing for UAE-registered projects. A nationality rule, a registration condition and a location requirement must remain separate eligibility fields.

A guarantee is not an equity investment or an unconditional grant. The Arabic evidence supports the programme distinction and broad scope; current operator-level eligibility, application status and product terms remain queued. No deadline was inferred. Emirates Development Bank's startup product page timed out, and the ministry fallback did not expose the substantive section reliably enough to support product amounts or eligibility.

## 3. Investor networks and sector coverage

The investor sources provide complementary discovery routes:

| Network | Evidence supported in this pass | Enumeration implication |
|---|---|---|
| [BECO Capital](https://www.becocapital.com/) | The firm states a Gulf focus and a 2012 establishment year. Some dynamic counters rendered as zero. | Read portfolio companies individually; exclude broken AUM or exit counters. |
| [Shorooq](https://www.shorooq.com/) | The manager describes venture capital, private credit, private equity and real assets, with a global portfolio. | Separate instruments and geography; a MENA investor does not make every investee UAE-headquartered. |
| [VentureSouq](https://www.venturesouq.com/) | The manager describes a MENA base and global portfolio, with FinTech and Strategic Resilience themes; a ClimateTech section also remains. | Reconcile strategy vintages before classifying funds; inspect each company independently. |
| [Wamda Capital](https://wamdacapital.com/) | The portfolio distinguishes Fund I and Evergreen and presents country-labelled companies. | Labels are discovery aids. “Explore more” was not exhausted; portfolio membership proves neither HQ nor investment in a particular round. |
| [Dubai Future District Fund](https://dfdf.vc/) | Fund investment and company co-investment are both part of its model. | Keep fund managers separate from startup entities and preserve event-specific evidence. |
| Global Ventures | Its homepage and one company essay returned no useful body. Its role is nevertheless evidenced in dated releases, including [Immensa's 2026 investor announcement](https://dfdf.vc/press-releases/immensa-raises-growth-capital-from-dubai-future-district-fund-and-global-ventures-to-strengthen-global-advanced-manufacturing-and-supply-chain-resilience-from-dubai/). | Use accessible original announcements; do not reconstruct a complete portfolio from fragments. |

The accepted company sample is strongest in payments and embedded finance, business software, property technology and commerce. It also contains controlled-environment agriculture, health technology, industrial fleet software, digital manufacturing and optoelectronics. These sectors reflect this batch's source selection, not their national market shares.

Public support is similarly heterogeneous: licensing, workspace, introductions, loan guarantees, direct financing, and private investment have different consequences for founders. The packet records the instrument actually described. Programme attendance, a corporate partnership, a client relationship and a financing-round participant are not interchangeable relationships.

## 4. Accepted startup records

The following **18 companies** are accepted for the staged projection. The domain column identifies the canonical company website observed in this research. The geography column states the quality and scope of the available evidence; it is not an incorporation table.

| Company and canonical domain | Business | Headquarters or UAE-connection evidence |
|---|---|---|
| **Bayzat** — [bayzat.com](https://www.bayzat.com/) | HR, payroll, insurance and employee-benefits software. | Dubai HQ on the [public company profile](https://www.linkedin.com/company/bayzat/); effective date unspecified. Founding-year and founder-name conflicts remain. |
| **CAFU** — [cafu.com](https://www.cafu.com/) | On-demand fuel delivery and vehicle services. | UAE operating entities appear in [company terms](https://www.cafu.com/terms). Global HQ remains unknown; an operating address is not promoted to HQ. |
| **eyewa** — [eyewa.com](https://eyewa.com/) | Omnichannel eyewear retail. | Explicit **Dubai/Riyadh dual HQ** in the [27 November 2024 investor release](https://www.generalatlantic.com/media-article/eyewa-announces-100m-in-series-c-round-led-by-general-atlantic/). One company identity must serve both country packets. |
| **Grubtech** — [grubtech.com](https://grubtech.com/) | Restaurant and food-business software. | Dubai HQ stated in the [10 June 2024 company announcement](https://blog.grubtech.com/post/grubtech-partners-with-act-to-revolutionize-the-f-b-industry-with-its-dynamic-middleware-technology-for-micros). |
| **Huspy** — [huspy.com](https://www.huspy.com/) | Property transactions and mortgage technology. | Dubai HQ stated on the [company About page](https://www.huspy.com/about); no exact effective date supplied. |
| **Immensa** — [immensa.io](https://immensa.io/) | Digital inventory and advanced manufacturing. | UAE/Saudi dual-country HQ reported by the [investor-hosted company profile](https://jobs.global.vc/companies/immensa-2); medium-confidence, undated, with precise HQ cities unresolved. |
| **Kitopi** — [kitopi.com](https://www.kitopi.com/) | Technology-enabled restaurants and managed cloud kitchens. | Dubai head office in the [15 May 2023 company FAQ](https://www.kitopi.com/post/everything-you-want-to-know-about-kitopi); dated historical observation. |
| **Letswork** — [letswork.io](https://www.letswork.io/) | Flexible workspace, meeting-room and office booking. | Dubai HQ on the [current company About page](https://www.letswork.io/about); founding chronology and legal-name conflicts remain separate. |
| **Nabta Health** — [nabtahealth.com](https://nabtahealth.com/) | Preventive and women's health services combining digital and clinical care. | Dubai HQ on the [public company profile](https://www.linkedin.com/company/nabtahealth); a [2026 investor release](https://pvp-me.com/pvp-press/phoenix-venture-partners-leads-second-close-of-nabta-healths-3-million-pre-series-a-to-accelerate-go-to-market-and-strategic-partnerships/) corroborates company identity and activity. |
| **NymCard** — [nymcard.com](https://www.nymcard.com/) | Card issuance, payment processing and embedded finance. | Dubai HQ on [QED's company profile](https://www.qedinvestors.com/companies/nymcard); the [2021 company announcement](https://www.nymcard.com/company/newsroom/nymcard-moves-its-headquarters-to-abu-dhabi-to-tap-into-the-growing-mena-fintech-ecosystem) records Abu Dhabi HQ historically. Move chronology unresolved. |
| **Pure Harvest Smart Farms** — [pureharvestfarms.com](https://www.pureharvestfarms.com/) | Controlled-environment agriculture for arid climates. | UAE headquarters in the [company-issued 30 June 2022 announcement](https://en.antaranews.com/news/236989/pure-harvest-smart-farms-secures-usd-1805-million-from-global-investors-to-fund-expansion). Current city and current HQ status remain unverified. |
| **Pyypl** — [pyypl.com](https://www.pyypl.com/) | Prepaid accounts, payments and transfers. | Abu Dhabi HQ on the [company About page](https://www.pyypl.com/about-us); ADGM legal-entity information is recorded separately. |
| **Qashio** — [qashio.com](https://www.qashio.com/) | Corporate cards and spend-management software. | The [company's European About page](https://ie.qashio.com/about) distinguishes Dubai global HQ from Dublin European HQ. |
| **Sarwa** — [sarwa.co](https://www.sarwa.co/) | Digital investing and personal finance. | UAE service-entity incorporation is described in [company terms](https://cdn.sarwa.co/static/pdf/Sarwa_Gifting_Terms.pdf); global HQ remains unknown. A legal-name discrepancy is retained. |
| **SQUATWOLF** — [squatwolf.com](https://squatwolf.com/) | Gymwear sold through ecommerce and retail. | Dubai HQ on the [ASCA investment profile](https://ascacapital.com/); holding-company incorporation remains unknown. |
| **TENDERD** — [tenderd.com](https://tenderd.com/) | AI and IoT for fleets, heavy equipment and field operations. | [Y Combinator's profile](https://www.ycombinator.com/companies/tenderd) establishes a Dubai location; it is not upgraded to explicit global HQ. |
| **XPANCEO** — [xpanceo.com](https://www.xpanceo.com/) | Smart contact lenses, sensing and extended reality. | Dubai HQ on the [public company profile](https://www.linkedin.com/company/xpanceo); the [company's legal policy](https://www.xpanceo.com/legal/privacy.pdf) names a Dubai entity without establishing group incorporation history. |
| **Ziina** — [ziina.com](https://ziina.com/) | Consumer and business digital payments. | Dubai origin appears in the [company timeline](https://ziina.com/about); a UAE operating entity is documented separately. Global HQ remains unknown. |

Descriptions and sector labels are supported at claim level in the packet. A null founding year, HQ, incorporation date or funding amount means the field was not established in this pass; it does not mean zero, no operations, no founders or no financing.

## 5. Evidence distinctions that materially affect integration

### Financing amount, instrument and date

Several apparent headline funding figures require narrower interpretations:

| Observation | Evidence and retained interpretation |
|---|---|
| **Pure Harvest: USD 180.5 million** | The [company-issued June 2022 release](https://en.antaranews.com/news/236989/pure-harvest-smart-farms-secures-usd-1805-million-from-global-investors-to-fund-expansion) explicitly states the currency and describes convertible growth financing. Preserve the instrument rather than treating it as an ordinary priced equity round. |
| **Grubtech: combined financing** | The [Salica release](https://salicainvestments.com/grubtech-raises-15-million-series-b-led-by-jahez/) combines Series B and a Series A extension. Component amounts are unknown; named investors are attributed specifically to the B component. The page date is 28 May 2024, not independently established as the announcement or closing day. |
| **SQUATWOLF: an investment cap** | The [reproduced announcement](https://www.wamda.com/index.php/2023/05/squatwolf-raises-30-million-asca-capital) allows investment of up to $30 million over time. Amount funded at announcement is undisclosed. [ASCA](https://ascacapital.com/) separately supplies the structured-equity instrument, fund name and investment month. |
| **Nabta Health: second close** | The [19 October 2026 investor release](https://pvp-me.com/pvp-press/phoenix-venture-partners-leads-second-close-of-nabta-healths-3-million-pre-series-a-to-accelerate-go-to-market-and-strategic-partnerships/) concerns a second close within an ongoing $3 million round and includes primary and secondary capital. Neither the close amount nor the split is disclosed; the headline is not this-close proceeds. |
| **Qashio: mixed financing** | The [May 2025 reproduced announcement](https://www.wamda.com/index.php/en/2025/05/qashio-closes-19-8-million-round-accelerate-expansion-saudi-arabia) describes a $19.8 million financing with unresolved debt/equity split and currency. It is not counted as pure equity. |
| **Kitopi: migrated publication date** | The [company release](https://www.kitopi.com/post/kitopi-announces-415-million-series-c-funding-round) has a later displayed page date than its 1 July 2021 event dateline. [Transaction counsel](https://www.legal500.com/intelligence/global/finance-and-banking/walkers-fundamentals-white-paper-2021-%E2%80%93-regional-update-asia-&-mena) explicitly corroborates US$415 million. The counsel's BVI role does not itself prove Kitopi's incorporation jurisdiction. |
| **Immensa: stage conflict** | The [2023 report](https://www.wamda.com/en/2023/11/uae-immensa-raises-20-million-series-b-round) labels US$20 million Series B. The [2026 investor release](https://dfdf.vc/press-releases/immensa-raises-growth-capital-from-dubai-future-district-fund-and-global-ventures-to-strengthen-global-advanced-manufacturing-and-supply-chain-resilience-from-dubai/) describes new financing ahead of a planned Series B, with an 11 February dateline and 20 February page date. Both dated assertions remain; no stage is silently corrected. |

Where an accessed source uses only a dollar symbol, the text is preserved but a currency code is not guessed. That affects, among other observations, [XPANCEO's July 2025 announcement](https://www.xpanceo.com/newsroom/xpanceo-becomes-a-unicorn-with-250m-raise). USD amounts are retained where explicitly supported, including the adviser corroboration for Kitopi and the explicit US-dollar statement in Immensa's reproduced release. Unknown currencies and commitment caps prevent a defensible funding-total calculation for this sample.

Round participation has its own evidence requirement. An investor's portfolio, an “existing investors” paragraph, a programme's identity, or a historical shareholder list does not establish participation in a new round. Letswork's [retrospective company page](https://www.letswork.io/about) explicitly names 500 Global and Sanabil Investments as seed leaders; those source names are retained with unresolved legal-entity identities. Canonical investor edges are not inferred.

### Founders, founding and legal geography

Founder information is limited to public professional identities and source-supported roles. Lists may be incomplete, and a historical founder designation does not imply current employment. For example, [eyewa's investor release](https://www.generalatlantic.com/media-article/eyewa-announces-100m-in-series-c-round-led-by-general-atlantic/) identifies three co-founders, including Abdullah AlRugaib; a shorter familiar founder list would lose supported information.

Founding, launch, incorporation and a later pivot are distinct events. [Ziina's company timeline](https://ziina.com/about) supports 2020, while [JIMCO's profile](https://jimco.com/en/portfolio/ziina/) gives 2021. Bayzat's company-release chronology and [public company profile](https://www.linkedin.com/company/bayzat/) disagree on 2013 versus 2012, alongside an unresolved founder-name discrepancy. Letswork's [current About page](https://www.letswork.io/about) says 2019, whereas the [2020 Dubai Chamber interview timeline](https://www.dubaichamberdigital.com/documents/20119/0/Startup_Panorama_Ed11_2020.pdf/01791d20-b4c2-3390-a7a7-90fe7cb65a28?t=1722948720515) places founding in 2018. These disagreements stay visible rather than being collapsed into false day-level precision.

## 6. Deferred, excluded and unreviewed candidates

Six reviewed companies are deferred:

| Candidate | Reason for deferral and next evidence needed |
|---|---|
| **Stake** | Company-source use is on hold after restrictive terms were observed. The name also risks collision with the Australian brokerage. Independently published investor evidence may support later review, but it does not resolve identity or authorize further company-site extraction. |
| **Seez** | Company terms restricted systematic directory compilation, so company-site research stopped. Acquisition status and company identity require a permitted, independently published issuer or regulatory source. |
| **TruKKer** | A [2022 company release](https://www.trukker.com/TruKKer%20Sr%20C%20Press%20Release.pdf) describes a Saudi-based business, while its [2025 policy](https://www.trukker.com/privacy) supplies UAE HQ/entity language. Group and operating-company geography require reconciliation with the Saudi country owner. |
| **Maalexi** | The [2025 company release reproduced by Wamda](https://www.wamda.com/index.php/2025/01/maalexi-secures-3-million-debt-facility-citi) says US-headquartered; the [current site](https://www.maalexi.ai/aboutus) lists US, UAE and Saudi offices. UAE activity is retained without asserting current UAE global HQ. |
| **Derq** | The [company's 2017 archive](https://en.derq.com/press-coverage?offset=1512393240288) supports historical Dubai HQ. Current geography remains unresolved after the present site was inaccessible and newer discovery suggested Detroit. |
| **RemotePass** | [EBRD](https://www.ebrd.com/home/work-with-us/projects/psd/57002.html) verifies a UAE-incorporated holding vehicle and a Polish operating company. Current global HQ is unverified. EBRD's 2020 founding description conflicts with the [company's 2021 chronology](https://newsroom.remotepass.com/265841-remotepass-raises-17-4m-series-b-led-by-ebrd-venture-capital-as-global-employment-and-fintech-converge/). |

**Tabby is excluded from this UAE projection** because the [current company source](https://tabby.ai/en-AE/newsroom/wallet-licence?categoryId=blog-1756131374867-zcw1jq6) identifies Riyadh headquarters. Its Dubai origin remains historical context for cross-country deduplication. This decision does not reject Tabby as a startup or remove its UAE activity.

The seven unreviewed leads are **Holo, Ziwo, qeen.ai, ClearGrid, qlub, Wio and Zand**. The first four are bounded [Wamda Capital portfolio](https://wamdacapital.com/) discoveries; qlub remains a company-source verification task. Wio and Zand require a separate digital-bank classification review before any startup acceptance. RemotePass was encountered in the portfolio lane too, but is counted once after the boundary review.

## 7. Source access, pagination and the next bounded pass

The [source registry](source-registry.json) distinguishes accessed, partial, blocked and unopened URLs. Its initial research-pass counts are reflected in [coverage.json](coverage.json), while independent reopens are logged separately in [independent-reviews.json](independent-reviews.json); a registered URL is not automatically an attempted or successful read. Search excerpts served as leads, and claims were limited to material actually returned and read. Reproduced company releases are identified as such rather than presented as independently hosted company pages.

Material access gaps include Hub71 Access pages, EDB product detail, Dubai Future Accelerators, Global Ventures pages with empty bodies, Derq's current site, Nabta's unreadable homepage, a Pure Harvest founding source, and some original transaction announcements. The independent Kitopi review could read adviser evidence but encountered a timeout reopening the company release. Restrictions, challenges and rate limits were recorded without bypassing them. No further Stake or Seez domain access is proposed automatically.

No startup directory was fully paginated. Hub71 cohort lists, Sheraa's startup directory, in5's startup list and DFDF's fund/company portfolios remain unenumerated. Wamda's continuation was not exhausted; Derq's historical archive was inspected at one offset only. A fully inspected repository inventory is a denominator for existing records, not a denominator for UAE startups.

The resumable [next-source queue](next-source-queue.json) prioritizes:

1. **Resolve identity and cross-country boundaries.** Reconcile TruKKer, Maalexi, Derq and RemotePass geography; coordinate eyewa and Immensa dual-country observations; resolve the Stake name collision through permitted independent evidence.
2. **Repair consequential field conflicts.** Address Bayzat founder identity and founding year, Ziina chronology and Series A close timing, Letswork launch/founding/legal names, and Immensa's stage terminology.
3. **Enumerate one operator source at a time.** Begin with an accessible official Hub71 cohort release or Sheraa/in5 directory page; retain cohort date, page/cursor and reviewed identities before proceeding.
4. **Verify named leads before widening discovery.** Open permitted company and original investor sources for Holo, Ziwo, qeen.ai, ClearGrid and qlub. Keep bank-classification work for Wio and Zand explicit.
5. **Complete financing and programme evidence.** Resolve currencies, component allocations, commitment disbursements and earlier rounds; obtain current EDB, Dubai Future Accelerators and programme-specific terms through permitted sources.

Each continuation should preserve the existing collection owner and crawler planner's responsibilities. Source discovery remains a manual research queue until the existing owner approves any crawler use. Publication, merge and release decisions remain outside this research report.
