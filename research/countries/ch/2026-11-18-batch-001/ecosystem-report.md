# Switzerland startup ecosystem — research checkpoint

**As of 18 November 2026.** This report supports a bounded Switzerland research packet. It describes ecosystem institutions, funding context and the next enumeration sources; it does not assert that any directory, portfolio, university cohort or accepted company batch covers all Swiss startups. All source reads are dated in `sources.json`; structured claims and qualifications are in `ecosystem-claims.json`. The research queue is separate from production and from crawler configuration.

## Cohort and funding context

The IMF October 2026 WEO edition is confirmed on the [official dataset portal](https://data.imf.org/en/datasets/IMF.RES:WEO?indicator_id=D). The country packet's `cohort-verification.json` records extraction from the [official October 2026 workbook](https://data.imf.org/-/media/iData/External-Storage/Documents/0FA3DC49A04D446E9D69DBEB29979E1C/en/WEOOct2026all.xlsx): Switzerland's 2026 NGDPD is **USD 1,135.739 billion**, ranking **20th among 191 economies with numeric observations**. The calculation uses only the Countries sheet, excludes Country Groups, preserves separately reported economies including Taiwan, and performs no currency conversion. Latest actual year for Switzerland is 2025: the 2026 value is an estimate/projection. Workbook SHA-256 is `2aa4f70a05931197b41ed7e0202dc56eee8d816858ac14521e4f8f5dbc38696c`.

| Reporting window | Verified aggregate | Interpretation |
|---|---|---|
| Full calendar 2025 | CHF 2.948 billion across 354 financing rounds, +23.9% in capital versus 2024 | Latest complete calendar-year report found. [SECA/Startupticker release, 3 February 2026](https://www.seca.ch/media/zvbni3yw/pressrelease-svcr-26-en.pdf). |
| First half of 2026 | CHF 1.25 billion across 123 investments, −15.5% in capital year on year | Newer partial-period evidence, published 14 July 2026. Do not annualise or compare 123 directly with the annual 354. [SECA venture-capital chapter](https://www.seca.ch/en/our-activities/seca-chapters/venture-capital/). |

Zurich led 2025 in rounds and capital; Vaud was second and Basel-Stadt third in capital. Basel-Stadt's approximately CHF 572 million was 95% biotech. This supports distinct digital/deep-technology and life-science research tracks, rather than treating a national startup list as a uniform sector sample. [Annual press release](https://www.seca.ch/media/zvbni3yw/pressrelease-svcr-26-en.pdf).

The [2026 annual report](https://www.seca.ch/media/dfom01dp/vcreport_2026_web.pdf) counts independent, commercially registered companies with Swiss legal headquarters and a Switzerland-based senior decision-maker. Its financing scope is for-profit equity VC of at least CHF 100,000; accelerator pre-seed equity and established-company buyouts/private equity are excluded. It includes 31 confidential rounds. An internal inconsistency remains: page 4 says 50 rounds have undisclosed amounts, while page 20 says 303 of 354 amounts are known, implying 51 unknown. Neither number is used as a public enumeration denominator. The figures measure qualifying funding activity, not the population of startups.

## Regional structure and research priorities

[Switzerland Innovation](https://www.switzerland-innovation.com/frequently-asked-questions) describes six main parks and sixteen locations. These are R&D environments also serving established companies, universities and foreign enterprises; tenant or partner status alone does not establish Swiss startup eligibility.

| Hub | Evidence-backed specialisms and institutions | Enumeration consequence |
|---|---|---|
| Zurich and the Zurich–Zug corridor | [Park Zurich](https://www.switzerland-innovation.com/locations/park-zurich) connects Zurich, Zug and Ticino and identifies robotics, mobility, aviation/space, advanced manufacturing, materials and life sciences. ETH provides a separate company-formation channel. | Start with ETH recognition and primary company pages. The park's regional remit is not evidence that an individual company is headquartered in Zug. Dedicated Zug fintech/crypto sources remain a gap. |
| Lausanne and Vaud | [Park West EPFL](https://www.switzerland-innovation.com/locations/park-west-epfl) links EPFL Innovation Park and Biopôle within a wider five-canton network, spanning AI/data, health, energy, robotics and micro/nanotechnology. | Separate university affiliation, current headquarters and legal domicile; follow company legal notices and dated funding announcements. |
| Geneva | The [regional programme map](https://www.switzerland-innovation.com/services-and-tech-platforms/incubation-and-acceleration) identifies FONGIT, the Wyss Center and Genilem; [FIF](https://www.fongit.ch/fif) has tech, digital and impact support tracks. | FONGIT membership and FIF award announcements provide discovery leads. Support instruments must be classified before inclusion in funding records. |
| Basel | [Park Basel Area](https://www.switzerland-innovation.com/locations/park-basel-area) centres on life sciences, with University of Basel, ETH and Novartis Campus links and BaseLaunch. | Prioritise therapeutic biotech and translational companies, while checking acquisitions, discontinued programmes and company status individually. |
| Bern and Biel/Bienne | [be-advanced's French site](https://be-advanced.ch/fr/) documents regional founder, startup and SME coaching. The [park programme map](https://www.switzerland-innovation.com/services-and-tech-platforms/incubation-and-acceleration) lists Swiss Smart Factory, Swiss Cobotics and sitem Startup Club. | Seek operator cohort pages for industrial automation and medtech. A coaching client may be an established SME rather than a startup. |
| Ticino | [Site Ticino](https://www.switzerland-innovation.com/locations/park-zurich/site-ticino) identifies life sciences, lifestyle technology and drones, including a Swiss Drone Competence Centre. | Add Italian-language institution and company sources in the next batch. Future site plans do not prove a current company location. |
| St Gallen and Buchs | [Park Ost](https://www.switzerland-innovation.com/locations/park-ost) emphasises sensors, MEM industries, medtech, automation, additive manufacturing and links with Startfeld, Empa, the University of St Gallen and OST. | Expand beyond the Zurich–Vaud–Basel concentration using regional programme and company evidence. |

Sion/Energypolis, Microcity/Neuchâtel and Bluefactory/Fribourg are also visible in the [West EPFL network](https://www.switzerland-innovation.com/locations/park-west-epfl). They are queued extensions, not fully researched regional samples at this checkpoint.

## University formation is a discovery layer

ETH reported **46 newly recognised ventures for 2025: 24 ETH Spin-offs and 22 ETH Start-ups**. Its recognition rules changed that year. Label dates must not become company founding dates, and the combined total is not directly comparable with earlier spin-off-only series. The report supplies leads including Mynerva, Soverli, Kalligo Medical and RoBoa. [ETH, 25 February 2026](https://ethz.ch/en/news-and-events/eth-news/news/2026/02/mm-more-new-companies-founded-new-regulations-new-accelerator.html).

EPFL reported **39 new startups and CHF 701 million raised by EPFL startups in 2025**. Its affiliation-based population can include companies now abroad; Cyberhaven is one explicit example. These amounts therefore cannot be added to or treated as a geographic subset of the national report without reconciling scope. [EPFL, 5 February 2026](https://actu.epfl.ch/news/epfl-startups-2025-a-record-cohort/).

The [EPFL directory](https://www.epfl.ch/innovation/startup/discover-our-startups/) describes more than 500 historical linked companies and distinguishes projects still in creation. Its linked interactive compass did not expose company rows or pagination in the page extraction. The [ETH spin-off directory](https://entrepreneurship.ethz.ch/startup-stories/explore-startup-portraits-and-success-stories/spinoff/uebersicht-eth-spin-offs.html) similarly returned column headers without entries. These are access/rendering gaps, not empty populations.

## Public support, accelerators and financing instruments

| Programme | Verified role or terms | Record treatment |
|---|---|---|
| Innosuisse startup innovation projects | Supports science-based projects before first market entry; Swiss headquarters and commercial registration required; covers up to 70% of direct project costs. [Programme terms](https://www.innosuisse.admin.ch/en/start-up-innovation-projects). | Project support with startup contribution; do not call it an equity round. |
| Innosuisse coaching | Initial, Core and Scale-up coaching vouchers have ceilings of CHF 10,000, CHF 50,000 and CHF 75,000 respectively. [Official coaching page](https://www.innosuisse.admin.ch/en/start-up-coaching-for-start-up). | Coaching voucher, not unrestricted cash investment. The [weekly updated dashboard](https://www.innosuisse.admin.ch/en/funded-innovation-projects-start-ups-and-companies) separates project recipients, coaching populations and certification. |
| FIT Tech | French terms specify a CHF 100,000 pre-company Tech Grant, CHF 100,000 Tech Seed loans and Tech Growth loans up to CHF 500,000. Geographic and maturity criteria differ between schemes. [FIT terms](https://www.fondation-fit.ch/fr/prets-et-bourses/nos-soutiens-aux-start-ups/fit-tech). | Keep grants and loans separate. Seed/Growth can include a conversion option, so “non-dilutive grant” is not a blanket classification. |
| Venture Kick | The annual report describes Stage I CHF 10,000 grants, Stage II CHF 40,000 convertible loans and Stage III CHF 100,000 convertible loans; Venturelab operates the initiative. [Annual report](https://www.venturekick.ch/demandit/files/M_BB941CC4DCEF687AD98/dms/File/JB_VK_25_web.pdf). | Record the awarded stage and instrument from an individual announcement. Adjacent 2025 actual and 2026 budget columns prevent unqualified use of ambiguous totals. |
| Venture Leaders | Venturelab's international programme and 2026 technology cohort are queued, but the relevant pages returned access errors. [Programme entry point](https://www.venturelab.swiss/venture-leaders). | No cohort count or participant accepted solely from search snippets. |
| FONGIT/FIF | Geneva awards are visible on a news feed with “Load more”; support spans tech, digital and impact. [FIF](https://www.fongit.ch/fif). | The archive was not exhausted. Verify award amount, instrument, recipient entity and announcement date separately. |
| Wyss Zurich | Joint ETH/University of Zurich translational accelerator in regenerative medicine, robotics, devices and bionics. [Pocket guide](https://www.wysszurich.ch/upload/documents/WY_PocketGuide_8s_26.pdf). | The document itself says May 2024 despite “26” in its filename. Use historical context only; affiliation is not a round investment. |

The [Switzerland Innovation programme map](https://www.switzerland-innovation.com/services-and-tech-platforms/incubation-and-acceleration) also supports discovery through Basel's BaseLaunch and DayOne, Biopôle's StartLab/Vanguard, Sion's The Ark and Ost's Startfeld. Current operator pages and company announcements are still needed for exact cohort dates or funding terms.

## Investor networks and entity resolution

| Investor or network | Evidence and research use | Required qualification |
|---|---|---|
| Redalpine | Its [portfolio](https://www.redalpine.com/portfolio) spans software/science and international companies, with active and exited labels. | Portfolio presence is not proof of participation in a specific round. Exited labels for names such as Araris, Lakera and Memo Therapeutics trigger status checks. |
| Verve Ventures | [Current site](https://www.verve.vc/) describes European deep tech across energy/resources, computing and health/bio. | Check current branding, legal entity and direct round releases; the attempted legacy portfolio route failed. |
| Swisscom Ventures | [About](https://ventures.swisscom.com/about/) documents the Swisscom AG venture arm and its sector/stage focus; the [portfolio](https://ventures.swisscom.com/portfolio/) offers country and active/exited filters. | International portfolio; Swiss affiliation does not establish Swiss headquarters. Use the current domain as observed. |
| BiomedVC | [Official site](https://biomedvc.com/) identifies a 2021 successor to BioMedPartners, founded in 2002, focused on therapeutic biotech and early-stage continental Europe. | Keep manager identity, historic BioMedPartners identity and individual Biomed Invest funds distinct. |
| SICTIC | The [network portfolio](https://www.sictic.ch/sictic-portfolio/) describes more than 300 historically community-funded Swiss startups. | The network itself must not be invented as the investing legal entity; participation may be by members. |
| Swisscanto / Zürcher Kantonalbank | [10 November 2026 announcement](https://www.swisscanto.com/ch/en/institutional/who-we-are/investor-information/2026/swiss-growth-fund-2.html), also read in [German](https://www.swisscanto.com/ch/de/institutionelle/wer-wir-sind/anlegerinformationen/2026/schweizer-wachstumsfonds-II.html), reports over CHF 205.4 million committed to the second Swiss growth fund. | This is fund-level fundraising. Identify the fund and ZKB asset manager separately; bilingual versions are the same underlying announcement. |
| Lakestar | [Official site](https://www.lakestar.com/) describes institutional venture funds alongside personal investments. | Separate fund, platform and individual investor identities; country and round participation need direct evidence. |
| Swiss Startup Capital | Search discovery produced potentially conflicting Swiss Startup Capital / Serpentine Ventures identity and status signals. No official register evidence was obtained. | **Unresolved**; do not represent it as a verified active manager. A bounded official company-register check is queued. |

## Resumable coverage and access constraints

The ecosystem subset of `queue.json` preserves 18 source tasks, including the now-completed IMF extraction. No company directory has been exhausted. Where rows, page numbers or continuation tokens were not observed, the cursor is `null`; an invented first-page cursor would conceal the access gap. Most directories are discovery aids whose denominator changes over time or includes historic, exited, foreign or pre-company entities.

The next efficient sequence is:

1. Resume ETH and EPFL cohorts/portraits using accessible official pages. Resolve domains and current legal/HQ geography before adding candidates to company review.
2. Review FONGIT/FIF award pages individually and preserve the last processed announcement URL. Do not infer a complete archive from the currently loaded portion.
3. Enumerate narrow active Swiss subsets from investor directories and reconcile every name/domain against Atlas and the country staging packet. Obtain funding participation from specific releases.
4. Cover Basel, Bern/Biel, Ticino and eastern Switzerland through regional operators, followed by primary company sources. Add Italian-language research and dedicated Zug sources.
5. Verify Swiss Startup Capital's legal identity/status through an official register before acceptance.

No source has been approved as a crawler seed. No crawler, robot-policy request, access-control change, contact collection or proprietary bulk extraction was performed. Reports and directories were used for concise factual paraphrases and discovery; source assets and full directories were not copied into this packet.

## Checkpoint counts and quality findings

This ecosystem subpacket attempted **46 distinct source URLs**. After the parent verified the IMF workbook, **34 contain substantively reviewed evidence**, **4 yielded dynamic shells**, **7 remained blocked or unsupported**, and **1 yielded metadata followed by a timeout**. The web portion comprised 30 search queries, 50 open/click operations and 5 in-page finds, with one additional bounded workbook download by the parent. These are research-operation counts, not population coverage.

There are **33 structured ecosystem claims: 32 reviewed/staged and 1 retained as a conflict**. Sixteen company names are preserved as **unreviewed discovery leads**: discovered 16, reviewed 0, accepted 0, rejected 0, queued 16. These must not be added to the parent company's accepted-batch count until reviewed and deduplicated. Accepted company counts and Atlas duplicate decisions belong to the integrated country manifest.

Specific observations rejected or qualified during review include unrendered zero-valued counters on the Switzerland Innovation page, book-genre tags on FONGIT company cards, the Wyss filename/date mismatch, Venture Kick budget/actual ambiguity and ETH's changed labels. The annual funding report's disclosure-count inconsistency remains unresolved. No defensible total-startup denominator was obtained, and no national completeness claim is made.
