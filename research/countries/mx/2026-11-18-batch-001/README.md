# Mexico startup ecosystem: bounded research checkpoint

**Research retrieval date: 18 November 2026.** This report accompanies the Mexico research and staging packet for `castlemilk/startup-atlas`. It proposes 23 company records for collection-owner review. Acceptance here means that a bounded set of company facts has been reviewed for staging; it does not mean production acceptance, a verified current independent-company status, or complete coverage of the company’s history.

**Checkpoint:** 23 proposed startup records, 53 public professional founder entries, 401 company claims, 14 ecosystem assertions and 141 registered source URLs. The existing production record validator accepts all 23 proposals. The packet records 26 financing observations, of which 24 become proposed legacy funding rows and two remain held. All files live under `research/countries/mx/2026-11-18-batch-001/`; production data, schemas and source approvals are unchanged. Delivery links and integration instructions are below.

## 1. Scope, cohort and what this checkpoint establishes

Mexico is the user-supplied **GDP 13/30** session in a cohort based on the IMF October 2026 WEO’s 2026 nominal-GDP estimates, excluding aggregates and treating Taiwan under the IMF’s separately reported economy convention. These are estimates, not final actuals. The requested [NGDPD 2026 API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) returned a disabled-access response, while the accessed [WEO dataset page](https://www.imf.org/external/datamapper/datasets/WEO) exposed an HTML template shell. The exact vintage, Mexico GDP value and rank were therefore **not independently verified**. A rounded search-result value is not used as accepted data.

The company scope deliberately distinguishes Mexico origin, headquarters, incorporation, operating presence and historical ecosystem participation. In particular, Apli is retained as an acquired company, Yalo as a company with verified Mexican operations and a reported US headquarters, and Merama with historical dual-headquarters evidence. These distinctions must survive integration. A country research packet can document those relationships without converting all of them into a current Mexican-headquarters assertion.

The reconciled candidate accounting is:

| Disposition | Count | Meaning |
|---|---:|---|
| Discovered | 37 | Distinct candidates encountered in the bounded research queues |
| Reviewed | 27 | Candidates examined sufficiently to make a staging, deferral or scope decision |
| Accepted for proposed staging | 23 | Reviewed identities with field-specific evidence, nulls and qualifications |
| Deferred | 2 | Biofase and Cargamos require additional accessible primary evidence |
| Rejected from this first-batch scope | 2 | Cabify and Nubity have different country labels in the accessed portfolio source |
| Queued, not yet reviewed | 10 | Explicit next-source candidate list |
| Published by this research work | 0 | No production or crawler-source approval |

The arithmetic is 37 discovered = 27 reviewed + 10 queued, and 27 reviewed = 23 proposed + 2 deferred + 2 scope exclusions. This is a denominator for the work queue, not for Mexico’s startup population. The 23 proposals fit within the requested initial up-to-50 checkpoint without lowering the evidence threshold to reach a round number.

## 2. Geographic structure: three hubs, different evidence

### Mexico City: finance, enterprise services and commercial platforms

Mexico City is prominent in the selected evidence: Kaszek explicitly identifies it as the headquarters of [Konfío](https://kaszek.com/company/konfio/), [Bitso](https://kaszek.com/company/bitso/) and [Kavak](https://www.kaszek.com/company/kavak/). Klar’s [company careers page](https://www.klar.mx/bolsa-de-trabajo) identifies its central office in Polanco. These are source-specific assertions; undated investor profiles do not establish when a headquarters was last reconfirmed.

The reviewed companies suggest a practical research cluster around merchant payments, business credit, consumer financial services, commerce and enterprise software. That is an interpretation of this selected batch, not a measured ranking of Mexican cities. The distinction matters because several apparently relevant CDMX addresses are only legal domiciles, contact locations or announcement datelines. For example, Mendel’s [YC profile](https://www.ycombinator.com/companies/mendel) gives a Mexico City location, while [2025 reporting](https://www.contxto.com/en/funding/mendel-expands-to-other-countries-will-use-more-ai-after-raising-us35-million/) calls the business Argentina-based. Its current group headquarters remains unresolved.

### Monterrey: industrial connections, logistics and research commercialisation

Endeavor’s [2026 Monterrey mapping article](https://mexico.endeavor.org/scan-monterrey-2026/), dated 28 September, reports **153 technology startups founded in Monterrey since 2015** and a separate survey of **49 founders**. The article highlights access to capital and corporate-procurement friction. Those two counts describe different research populations; neither measures all active startups in Monterrey or Mexico. The linked DocSend report was not accessed, so its full roster and methodology remain a next-source task.

The institutional evidence supports researching corporate adoption and university-linked ventures alongside fundraising. Tec’s account of [incMTY in March 2026](https://conecta.tec.mx/es/noticias/nacional/emprendedores/claves-para-emprender-y-obtener-capital-en-2026-asi-arranca-incmty) describes participation from universities, government, investors and entrepreneurs. A [25 May TecScience article](https://tecscience.tec.mx/es/humano-social/hub-innovacion-emprendimiento-tec-startups-monterrey/) describes a hub within the Monterrey Innovation District and an opening planned for 26 May, with laboratories and spaces connecting scientific ventures, applied research and industry. This is evidence of announced infrastructure, not evidence that any named tenant received investment.

Company geography needs equal care. [Nowports](https://nowports.com/en/nosotros) lists both Mexico City and Monterrey offices without assigning global headquarters. [YC lists Skydropx in Monterrey](https://www.ycombinator.com/companies/skydropx), while [2021 financing counsel](https://www.lowenstein.com/news-insights/firm-news/lowenstein-represents-645-ventures-in-series-a-investment-in-logistics-management-platform-skydropx) described it as Mexico City-based. The packet preserves both observations and leaves current headquarters null.

### Guadalajara and Zapopan: financial technology, angels and municipal support

Kueski’s [company anniversary account](https://www.kueski.com/blog/kueski-celebra-decimo-aniversario) places its beginnings in Guadalajara in late 2012. Its operating entity’s later legal domicile does not by itself settle current group headquarters, particularly when historical financing counsel used a different city description. This is a useful regional origin signal without overstating present corporate geography.

The public-programme route is better evidenced than a complete company denominator. The accessed [PLAi listing for Reto Zapopan’s fifteenth generation](https://conectar.plai.mx/convocatoria-detalle/Reto%20Zapopan%2015va%20Generaci%C3%B3n) describes a technology-venture programme with mentoring, training, networking and possible financing subject to evaluation. It specifies a team of at least two and direct or indirect impact in Zapopan. The listing gives a 6 June 2026 deadline; a conflicting search-snippet date was not promoted into accepted evidence, and the programme is not presented as currently open.

[Angel Ventures’ network page](https://www.angelventures.vc/avnetwork) describes a Guadalajara network active since 2014, alongside investor education and investment support. Its older metrics should not be recycled as current membership or deal counts. Together, these sources justify a next batch focused on local programme participants and company-origin evidence, with fresh checks for the relevant application cycle.

## 3. Sector coverage and what remains underrepresented

The selected companies span several overlapping product groups. The categories are editorial mappings from sourced activities, not an exhaustive sector taxonomy or a measure of market share.

| Research cluster | Companies in this checkpoint | What the evidence supports |
|---|---|---|
| Payments, lending and financial services | Clip, Konfío, Bitso, Kueski, Stori, Klar, Conekta, albo | Merchant acceptance, business finance, consumer finance, digital assets and payment infrastructure |
| Commerce and logistics | Kavak, Nowports, Merama, Skydropx, 99minutos, Jüsto, Zubale | Vehicle commerce, freight forwarding, online brands, shipping software, fulfilment and grocery commerce |
| Enterprise, employment and benefits software | Yalo, Apli, minu, Mendel | Conversational sales, recruitment automation, employee benefits and corporate spend management |
| Health and insurance | Sofía | Health insurance combined with digital coordination of care |
| Food, environment and community travel | microTERRA, Toroto, Rutopía | Lemna-based ingredients, ecosystem restoration and customised travel involving rural and Indigenous providers |

Company-level sources for these classifications appear in the enumeration below and in the claim ledger. Categories overlap: Kavak combines commerce and financing; minu combines benefits and financial services; Mendel combines enterprise software and payments. Counting a company separately in each category would inflate a total.

The [24 February 2026 Finnosummit announcement](https://www.finnosummit.com/en/mexicos-fintech-ecosystem-enters-a-new-phase-ai-and-stablecoins-will-redefine-payments-in-2026/) reports **795 Mexican fintech startups**, comparing that figure with an adjusted prior baseline of **781**. It is useful evidence of a publisher-defined sector population, but its roster was not extracted and matched against Atlas. It cannot serve as the denominator for this 23-company cross-sector batch, nor justify a completeness percentage.

The heavy representation of finance and commerce reflects the bounded candidate queues and availability of financing announcements. It is not proof that other sectors are small. The next regional source work should broaden industrial and scientific ventures, agriculture, biotechnology, water and climate companies, starting with institutional rosters and then verifying individual companies through their own and their investors’ publications.

## 4. Accelerators, public programmes and capital networks

These organisations offer different kinds of ecosystem evidence. Programme participation, fund portfolio membership and attendance at an event must remain distinct from investment in a particular financing round.

| Organisation or programme | Reviewed role | Research and currentness limits |
|---|---|---|
| [Startup México](https://startupmexico.com/aceleracion/) | Describes a three-month acceleration programme with mentoring, investor pitching and commercial/digital strategy | A published programme description; current application availability, fees and deadlines were not established |
| [Reto Zapopan / PLAi](https://conectar.plai.mx/convocatoria-detalle/Reto%20Zapopan%2015va%20Generaci%C3%B3n) | Municipal support route for technology ventures with a Zapopan impact connection | The accessed 2026 deadline has passed; potential evaluated financing is not a funding award |
| [incMTY](https://conecta.tec.mx/es/noticias/nacional/emprendedores/claves-para-emprender-y-obtener-capital-en-2026-asi-arranca-incmty) | Convening platform linking founders, investors, academia and government | March 2026 event evidence, not an open accelerator cohort |
| [Tec’s innovation hub](https://tecscience.tec.mx/es/humano-social/hub-innovacion-emprendimiento-tec-startups-monterrey/) | Announced scientific-venture and industry collaboration infrastructure in Monterrey | Tenant, programme and investment rosters need separate verification |
| [NAFIN capital-emprendedor vehicle](https://nafin.com/portalnf/content/banca-de-inversion/capital/capital_emprendedor.html) | Trust investing in private-capital funds with impact in Mexico | The accessed page explicitly says it currently lacks resources to commit; it is not represented as an available direct startup grant |
| [CMIC / Fondo de Fondos](https://www.nafin.com/portalnf/content/banca-de-inversion/capital/fondo_fondos.html) | Federal fund-of-funds architecture involving Nafin, Bancomext, Banobras and Focir | Legacy wording is retained as institutional context, not proof of current product availability |
| [AMEXCAP](https://amexcap.com/amexcap-renueva-su-consejo-directivo-jose-maria-zertuche-asume-la-presidencia-con-foco-en-fondeo-internacional-y-nacional-y-en-la-excelencia-en-profesionalizacion-de-la-industria/) | Private-capital industry association covering venture capital and other strategies | A route to managers and publications; conflicting investment totals were not normalised into a national statistic |
| [500 Global LATAM / Luchadores](https://500.co/latam-companies) | Regional venture network and company-discovery directory | Visible page has repeated carousel entries and 15 pagination controls; its figures carry a 30 September 2022 reference date |
| [Angel Ventures](https://www.angelventures.vc/avnetwork) | Angel network, education and investment-support activities | Undated page includes older metrics; dynamic portfolio extraction did not establish a full company list |
| [Dalus Capital](https://www.daluscapital.com/about) | Describes investment from seed through Series A and B in Latin America | Bare-dollar ticket text is not converted to USD; image-heavy portfolio did not yield a complete roster |
| [Wollef](https://www.wollefvc.com/) | Targets pre-seed, seed and Series A, with examples across finance, commerce, SaaS and marketplaces | “Partnered” years are not assumed to be financing-announcement dates |
| [DILA Capital](https://www.dilacapital.com/) | Targets Spanish-speaking founders in Latin America and US businesses serving Hispanic markets; lists Mexico City and Miami offices | Office locations do not establish fund incorporation; regional portfolio totals do not measure Mexican startups |

Round announcements add an international capital dimension to this network map. For example, [Nowports’ 2021 Series A](https://www.mourocapital.com/mouro-capital-leads-16m-usd-funding-round-in-digital-freight-forwarder-nowports/) names Mouro Capital as lead, and [99minutos’ 2022 Series C](https://www.oakhcft.com/news/99minutos-raises-82-million-series-c-round-led-by-oak-hc-ft) names Oak HC/FT as lead alongside Kaszek and Prosus Ventures. Such statements support event-specific relationships; a fund’s general company page supports only a broader relationship unless it identifies the transaction.

## 5. The 23 proposed company records

The table gives canonical public-facing names and domains, a short activity description, and the qualification most likely to matter during integration. Founders, aliases, individual claims and additional sources remain in the machine-readable records. “Unknown” means the selected sources did not establish the field; it does not mean zero, no founders, no funding or no incorporation.

| Company and canonical website | Activity | Country, history or lifecycle qualification |
|---|---|---|
| [Clip](https://www.clip.mx/) | Merchant payments and business services | [Company history](https://www.payclip.com/about-us/our-story-copy) gives 2012 founding/incorporation milestones and a 2019 Mexico City HQ move; original jurisdiction remains unknown |
| [Konfío](https://konfio.mx/) | Finance and tools for businesses | [Kaszek](https://kaszek.com/company/konfio/) gives Mexico City HQ and 2013 founding; operations began in 2014; official homepage access was restricted |
| [Bitso](https://bitso.com/) | Digital-asset services and cross-border payments | [Kaszek](https://kaszek.com/company/bitso/) gives Mexico City HQ and 2014 founding; international operating entities do not settle group incorporation |
| [Kueski](https://www.kueski.com/) | Consumer credit and payment products | [Company history](https://www.kueski.com/blog/kueski-celebra-decimo-aniversario) places its origin in Guadalajara in late 2012; current group HQ remains null |
| [Stori](https://www.storicard.com/) | Consumer financial services | [Company announcement](https://www.storicard.com/somos-stori/nuevo-unicornio) supports Mexican identity and 2018 founding; current HQ city and full founder roster are unresolved |
| [Klar](https://www.klar.mx/) | Consumer financial services | [Company careers page](https://www.klar.mx/bolsa-de-trabajo) supports 2019 founding and a CDMX central office; financing-date conflict remains visible |
| [Conekta](https://www.conekta.com/) | Digital payment infrastructure | [Company history](https://www.conekta.com/about-us) begins with a 2011 project; [legal terms](https://www.conekta.com/legal/tos) date the named Mexican operating entity’s incorporation to 8 October 2012 |
| [Kavak](https://www.kavak.com/) | Used-vehicle buying, selling, financing and servicing | [Kaszek](https://www.kaszek.com/company/kavak/) gives 2016 founding and Mexico City HQ; legal incorporation is unverified |
| [Nowports](https://nowports.com/) | Digital freight forwarding | [Investor announcement](https://www.mourocapital.com/mouro-capital-leads-16m-usd-funding-round-in-digital-freight-forwarder-nowports/) specifies December 2018 founding; its Mexico City and Monterrey offices are not automatically HQ |
| [Merama](https://www.merama.io/) | Operation and investment in online consumer brands | [Issuer release](https://business.times-online.com/times-online/article/bizwire-2021-9-28-e-commerce-brand-builder-merama-closes-us225-million-series-b-financing-co-led-by-advent-international-and-softbank) supports December 2020 founding and historical Mexico City/São Paulo dual HQ; direct website reads failed |
| [Skydropx](https://www.skydropx.com/) | Shipping and logistics automation software | [Company](https://www.skydropx.com/quienes-somos/) and [YC](https://www.ycombinator.com/companies/skydropx) support identity and 2015 founding; Monterrey versus historical CDMX labels remain scoped |
| [99minutos](https://www.99minutos.com/) | Freight, fulfilment and last-mile logistics | [Kaszek](https://www.kaszek.com/company/99-minutos/) supports 2014 founding; Mexico City origin does not establish current HQ |
| [Jüsto](https://justo.mx/) | Online grocery retail | [2026 acquirer announcement](https://www.einpresswire.com/article/883070867/omni-and-general-atlantic-agreement-restores-j-sto-s-operations) describes acquisition and relaunch plans; current ownership and legal completion require reconciliation |
| [Yalo](https://www.yalo.ai/) | AI-enabled sales and conversational commerce | Mexican operations retained; [company-maintained LinkedIn](https://www.linkedin.com/company/yalo) reports San Francisco HQ; 2015/2016 founding conflict remains unresolved |
| [Apli](https://www.apli.jobs/) | Recruitment automation | [iCIMS announced acquisition on 11 September 2025](https://www.icims.com/company/newsroom/apliacquisition/); retained as an acquired historical Mexican ecosystem company, not an independent startup claim |
| [Sofía](https://www.sofiasalud.com/) | Health insurance and digitally coordinated care | [Company founder biography](https://www.sofiasalud.com/nosotros-sebastian-jimenez) supports 2018 founding; HQ and incorporation remain distinct from operating domicile |
| [minu](https://www.minu.mx/) | Employee compensation, benefits and earned-wage access | [Company profile material](https://www.minu.mx/opiniones) supports 2019 founding and founders; company datelines do not establish HQ |
| [albo](https://www.albo.com/) | Personal accounts and business financial tools | [Partner account](https://www.paymentology.com/es/client-story-albo) supports 2016 founding; contact address and named operating entity do not settle legal formation |
| [Mendel](https://mendel.com/) | Corporate expense, payment and travel management | [YC profile](https://www.ycombinator.com/companies/mendel) supports 2021 founding and Mexico City location; Argentina-based reporting is retained alongside it |
| [Zubale](https://www.zubale.com/) | Retail e-commerce software and fulfilment | [Company history](https://www.zubale.com/mx/sobre-zubale/) supports 2018 founding and Mexico operating origin; current HQ remains unknown |
| [microTERRA](https://www.microterra.com/) | Functional food ingredients from lemna | [The Yield Lab](https://theyieldlablatam.com/companies/microterra/) and the company support identity and Mexico nexus; no accepted founding date or dated funding event |
| [Toroto](https://www.toroto.com/) | Ecosystem restoration, carbon and water projects | [Company origin narrative](https://www.toroto.com/nosotros) describes an idea in 2019; that is not promoted to incorporation or a definitive founding year |
| [Rutopía](https://rutopia.com/) | Customised travel with rural and Indigenous providers | [Company narrative](https://rutopia.com/en/) and [investor announcement](https://www.attaimpact.capital/atta-invest-in-rutopia) give different 2017/2019 origin/founding accounts; no single year selected |

Apli illustrates why incorporation must be a separate field. Its [terms](https://www.apli.jobs/en/legal/terms-and-conditions) identify Apli Inc. as registered in Delaware and also name Mexican entities; they do not establish a formation date or complete parent hierarchy. Its historical [MIT Solve profile](https://solve.mit.edu/solutions/3312) gives Mexico City geography. These claims can coexist without rewriting the company as exclusively incorporated or headquartered in one country at all times.

## 6. Financing evidence: preserve the transaction actually described

The packet does not sum the reviewed events into “Mexico funding” or “total funding” for a company. Histories are incomplete; some statements concern debt capacity, secondary sales, cumulative figures or planned injections. Dates retain their original precision, and announcement, report, update and legal-close dates are separate concepts.

The integration review identifies **26 financing observations**, **24 proposed rows in the existing funding schema** and **two withheld observations**: Konfío’s disputed extension and Sofía’s possible duplicate. These are review and projection counts, not a national transaction denominator; separately represented components and unresolved observations prevent interpreting them as 26 distinct completed fundraising rounds. Source-document group identifiers keep Jüsto’s two financing components together; the same company-history source can also describe different transactions, as with Clip. Group IDs therefore do not assert economic-event uniqueness.

### Mixed financing and conditional announcements

- **Kueski:** the [December 2021 company announcement](https://www.kueski.com/blog/kueski-closes-200million-in-financing) reports US$202 million of equity and debt. [Transaction counsel](https://www.gunder.com/print/v2/content/2291/kueski-announces-202m-equity-and-debt-financing.pdf?lang=en) identifies primary and secondary equity and a $100 million debt component. The full total is not recorded as primary equity, and no equity allocation is manufactured by subtraction.
- **Stori:** its [July 2022 announcement](https://www.storicard.com/somos-stori/nuevo-unicornio) separates 50 million equity from a 100 million debt facility. [Explicit US-dollar corroboration](https://contxto.com/en/news/stori-a-mexican-fintech-known-for-its-digital-credit-card-is-latams-new-unicorn/) is retained separately. The combined US$150 million is not an equity-only round or evidence that all facility capacity was drawn.
- **Klar:** the [company release](https://www.klar.mx/press/klar-recauda-190-millones) and [transaction counsel](https://www.careyolsen.com/news/carey-olsen-advises-klar-us190-million-series-c-funding-round) support US$170 million equity and US$20 million venture debt. The company page’s 2026 header conflicts with its 2025 dateline; dated counsel corroborates 2025. Regulatory conditions remain relevant, and a valuation above US$800 million is retained as a lower bound.
- **Jüsto:** the [October 2024 issuer release](https://www.streetinsider.com/Business%2BWire/J%C3%BCsto%2BSecures%2BUSD%2B$70%2BMillion%2Bin%2BEquity%2Band%2BDebt%2BFinancing%2Bfrom%2BGeneral%2BAtlantic,%2BHSBC,%2Band%2BOthers%2Bto%2BAccelerate%2BGrowth/23846813.html) separates US$50 million equity and approximately US$20 million debt. General Atlantic’s lead role is tied to equity; HSBC México’s arranger role is kept distinct. The separate [2026 acquisition/relaunch announcement](https://www.einpresswire.com/article/883070867/omni-and-general-atlantic-agreement-restores-j-sto-s-operations) describes a planned first-year injection, not a completed funding disbursement. [Later reporting](https://expansion.mx/empresas/2026/01/21/justo-ya-no-se-va-mexico-pero-si-su-fundador) creates an unresolved current-ownership question.
- **Kavak:** its [17 February 2026 Series F announcement](https://news-room.kavak.com/kavak-announces-usd300-million-series-f-led-by-andreessen-horowitz-to-expand-access-trust-and-financing-across-latin-america) states US$300 million and remaining closing conditions. The announcement is not upgraded to a verified completed close.

### Conflicts, unknown amounts and misleading totals

**Konfío’s September 2021 extension is withheld from the proposed round projection.** The [company release](https://cdn.uc.assets.prezly.com/bdc36e1c-a3ab-4750-b7bf-f314e418f086/-/inline/no/Konfi%CC%81o-Completa%20Ronda%20de%20Inversio%CC%81n.pdf) reports 110 million dollars, while [VEF’s issuer announcement](https://www.marketscreener.com/quote/stock/VEF-AB-39436239/news/VEF-Konf-o-announces-USD-100-mln-Series-E2-financing-round-VEF-invests-an-additional-USD-9-3-ml-36548046/) reports USD100 million and describes QED’s role differently. Both assertions remain visible. The separately verified [June USD125 million Series E](https://storage.mfn.se/616a8525-accb-4b6b-9ee4-6f41572fa7dc/konfio-announces-usd-125-mln-series-e-financing-round-vef-invests-an-additional-usd-20-mln.pdf) is not added again through the company’s combined fundraising total.

**Currency remains unknown when the supporting page only supplies a dollar sign or “dollars.”** This affects the selected Skydropx event, [Zubale’s company funding post](https://www.linkedin.com/posts/zubale_zubale-secures-25m-funding-led-by-qed-investors-activity-7136011564398108673-x-Uc), and [minu’s 2023 mixed financing](https://www.minu.mx/blog/minu-la-plataforma-de-beneficios-de-bienestar-para-empleados-recauda-30-mdd-en-ronda-de-financiamiento). Their amount text survives; an ISO currency is not guessed. Where an accessed corroborating source explicitly supplies US dollars, the ledger links that separate currency claim rather than pretending a single source proved every part of the event.

**Publication metadata does not automatically date an event.** Minu’s [Series B page](https://www.minu.mx/blog/minu-la-plataforma-lider-de-compensacion-y-beneficios-en-mexico-recauda-30-millones-de-dolares-para-continuar-con-su-mision-de-mejorar-la-salud-financiera-de-millones-de-colaboradores) carries a 2024 body dateline and later CMS metadata. Conekta’s [March 2019 reporting](https://expansion.mx/emprendedores/2019/03/28/la-fintech-conekta-levanta-13-mdd-para-lanzar-un-nuevo-producto) supports a mid-March close at month precision, not an invented exact day or series label.

**Sofía’s two pages may describe the same transaction.** The [page with a December 2024 update](https://www.sofiasalud.com/blog/sofia-cierra-nueva-ronda-de-inversion-y-da-un-paso-mas-en-su-mision-de-transformar-la-salud-en-mexico) and the [page with a May 2026 update](https://www.sofiasalud.com/blog/sofia-cierra-una-nueva-ronda) cannot be separated into distinct financing rounds solely from CMS dates. The latter reports US$21 million, but that amount remains a source observation: it is neither automatically assigned to the earlier record nor projected as a second round. Participant lists are not merged. The potential duplicate stays withheld until event identity is resolved through an explicit dated issuer or investor statement.

**Undisclosed is not zero.** [Rutopía’s seed announcement](https://www.attaimpact.capital/atta-invest-in-rutopia) identifies the round and participants without an amount. Its US$20 million community-income objective is a future impact target, not funding raised. The reviewed microTERRA and Toroto pages do not establish dated financing events. Their empty event lists describe research coverage, not lifetime fundraising.

Historical company backers also remain distinct from round participants. Unnamed investor descriptions in Clip and Conekta announcements are stored as observations with no canonical investor identity. Apli’s acquisition consideration is unknown, and albo’s separate acquisition spending is not entered as startup financing. Clip’s facility providers, Stori’s Davidson Kempner credit-facility-provider role, Kueski’s VPC debt-lead role and Klar’s WTI venture-debt role preserve their instrument and source-stated relationship; they cannot become generic equity-investor edges. A direct Spanish-source recheck corrected an earlier overly specific “arranger” description for Davidson Kempner: the announcement says it provided the credit line. Jüsto’s separately sourced HSBC arranger role remains distinct.

## 7. Provenance, access and validation boundaries

All linked research sources in this report were retrieved or attempted on **2026-11-18**. The machine-readable registry carries the actual recorded retrieval precision: some reads have exact tool-completion timestamps, some have declared session-bounded intervals, and the software/health lane records day precision. Publication and effective dates remain separate. An old announcement accessed in November 2026 is still historical evidence.

The source hierarchy favours company pages, issuer releases, investor announcements, official programmes and legal notices. Company-issued press releases reproduced by syndication hosts are identified as issuer material; multiple copies do not become multiple events or independent corroboration. Transaction-counsel announcements retain their publisher role even where the existing source-kind enum requires a broader category. Secondary reporting is used for specific corroboration or conflict observations, with that role visible.

The first-party preference is not a licence to accept every company assertion without qualification. Company-maintained social profiles can be undated, websites can preserve stale roles, and announcement pages can have contradictory CMS dates. Founders are public professional identities only. Founder and investor rosters remain explicitly incomplete; a person labelled COO is not silently promoted to founder, and spelling discrepancies are not new entities.

Access gaps are part of the result. LAVCA and Yahoo Finance returned HTTP 429 in this batch and became shared host stops. Restricted or failed pages for Konfío, parts of Jüsto and Sofía, Merama, Biofase and Cargamos were not bypassed. The Clip SEC XML lead could not be read through the available page tool. Search-only statements were not accepted to fill those gaps. Failed access is not evidence of company closure.

No source directory was exhausted. In particular, the 500 LATAM page’s pagination and repeated entries, dynamic Angel Ventures and Dalus pages, the selective IGNIA and Kfund reads, and the inaccessible full Monterrey report prevent roster-completeness claims. Search results are discovery aids, not a reproducible national universe.

Integration must preserve the reviewed distinctions when normalising names and domains, resolving aliases, matching existing Atlas records, assigning founding precision, handling nulls and mapping funding relationships. The claim ledger is needed alongside the schema-valid projection because the production record does not express every conflict, component or multi-source attribution. The final manifest and validation receipts record the accepted, deferred, excluded and held membership. Of 141 unique registered URLs, 121 were accessed and 20 unavailable. Access includes partial pages and shells; it does not imply that every URL supports an accepted claim. The 401 company claims cite 91 unique source URLs.

## 8. Resumable next-source queue

The next batch should begin with a finite queue, retain its source position and record each accepted or rejected decision. Discovery remains separate from crawler-seed approval.

| Priority | Queue | Next concrete evidence task |
|---|---|---|
| 1 | Konfío, Klar, Jüsto, Sofía | Reconcile the extension amount/roles, financing year/closing conditions, current ownership/lifecycle and possible duplicate financing respectively through dated issuer or investor material |
| 1 | Yalo, Mendel, Apli | Resolve country/HQ scope and historical founding conflicts; retain Apli’s acquisition and distinguish legal entities |
| 1 | Biofase and Cargamos | Obtain accessible primary identity and lifecycle evidence; resolve Cargamos’ cumulative-versus-incremental financing before accepting an event |
| 2 | Baubap, Graviti, Plerk, Deporprivé, Flat / Clau | Review the five [500 LATAM](https://500.co/latam-companies) discovery leads individually, including aliases, current domain and legal/operating geography |
| 2 | Aviva, Ben & Frank, Kleva, MiChamba, Sarelly | Review the five [Wollef](https://www.wollefvc.com/) leads; portfolio membership alone does not establish a round |
| 2 | Sofía, Stori, Kueski, Clip, Bitso, Zubale, minu | Complete the specific event, currency, founder, incorporation and current-geography gaps recorded in each fragment |
| 3 | Monterrey science ventures and Guadalajara/Zapopan programmes | Inspect permitted institutional rosters and pagination, then open company and investor sources for individual candidates |
| 3 | IMF cohort verification | Obtain the exact permitted October 2026 vintage and nominal-GDP values before asserting an independently verified rank |

Cabify and Nubity were deprioritised from this initial batch because the accessed [500 LATAM portfolio](https://500.co/latam-companies) labels them Spain and Argentina respectively and no Mexican nexus was investigated for them. The candidate register preserves those local rejection decisions; they are not findings of ineligibility for the wider Mexico ecosystem. By contrast, Yalo and Mendel received specific Mexican operating-location review. A later batch can investigate Cabify or Nubity operating presence under the same broader country-nexus policy.

## 9. Ownership and integration handoff

The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) and [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) remain the coordination points. The integration owner’s repository inspection reports planner work #177 as merged with an offline scope and #178 as synthetic replay. This country packet does not replace either owner, duplicate crawler implementation or expand its permissions.

Initial research inspected `f4bcbf7030d741772bb750deee584efa3ee17749`, where graph construction projected an unknown founding year as `0`. During finalisation the owners merged [PR #179, “Preserve unknown founding years through graph and SQLite projection”](https://github.com/castlemilk/startup-atlas/pull/179), and [PR #181, the legacy funding-source inheritance guard](https://github.com/castlemilk/startup-atlas/pull/181). The packet was then revalidated against main `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`. Unknown founding years now remain absent in the in-memory graph check. Both initial and final baseline receipts are retained; no owner implementation is duplicated in this country PR. The source-data identity inventory, production record schema and existing planner did not change.

The report consolidates four bounded research fragments, whose SHA-256 input receipts and methods are retained in `fragment-methodology.json`. Production collections, API/schema definitions, allowlists, throttling and access controls remain under their existing owners. No new crawler seed approval, production release or MCP deployment is implied by a researched URL.

## 10. Integration packet, validation and exact handoff

**Repository path:** `research/countries/mx/2026-11-18-batch-001/`

**Branch:** `research/mexico-gdp13-20261118`

**Initial research main:** [`f4bcbf7030d741772bb750deee584efa3ee17749`](https://github.com/castlemilk/startup-atlas/commit/f4bcbf7030d741772bb750deee584efa3ee17749)

**Final validation and branch base:** [`988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`](https://github.com/castlemilk/startup-atlas/commit/988a4ddcc4dbbc853da0c7f7899b6d6e7579f840)

**Review entry point:** [Mexico branch](https://github.com/castlemilk/startup-atlas/tree/research/mexico-gdp13-20261118/research/countries/mx/2026-11-18-batch-001) and [branch pull-request comparison](https://github.com/castlemilk/startup-atlas/compare/main...research/mexico-gdp13-20261118). The PR description and canonical Space carry the exact published packet commit and PR number, avoiding a self-referential commit hash inside the committed manifest.

| File | Integration purpose |
|---|---|
| [companies.research.json](companies.research.json) | 24 full research records: 23 accepted for staging, deferred Cargamos retained; nulls, geography, founding precision, aliases and conflicts |
| [startups.staged.json](startups.staged.json) | Existing-schema `{startups:[...]}` proposal with 23 records, 53 founder entries, 24 funding rows and 475 sourced profile facts |
| [projection-notes.json](projection-notes.json) | Explicit field and event decisions; 9 typed amount/currency pairs, other amounts retained as qualified text, 2 observations held |
| [claim-ledger.json](claim-ledger.json) | 401 claims, stable research identifiers, evidence, source URLs, date precision, retrieval windows, confidence and review state |
| [source-registry.json](source-registry.json) | 141 unique URLs with publisher/type, access outcome, dates, partial coverage and no automatic crawler approval |
| [funding-observations.json](funding-observations.json) | 26 selected financing observations with mixed components, conditional closing, source-document groups and possible-duplicate/conflict holds |
| [funding-relationships.json](funding-relationships.json) | 126 event-specific equity, debt-provider and arranger assertions; every canonical investor ID remains unresolved |
| [ecosystem.json](ecosystem.json) | 14 sourced hub, programme and network assertions |
| [candidate-register.json](candidate-register.json), [coverage.json](coverage.json), [next-source-queue.json](next-source-queue.json), [search-log.json](search-log.json) | Reconciled membership, source/pagination gaps and finite resumption queue |
| [baseline.json](baseline.json), [baseline-current.json](baseline-current.json), [baseline-current-field-presence.json](baseline-current-field-presence.json), [deduplication.json](deduplication.json) | Initial and final pinned input hashes; unchanged 555-entity rebuilt identity inventory; candidate matching against all existing identities |
| [planner-pages.json](planner-pages.json), [unapproved-sources.csv](unapproved-sources.csv) | Three existing-planner pages of 10, 10 and 3 records; all 23 need seed review, zero approved seeds |
| [captures/index.json](captures/index.json) | Optional bounded paraphrase bridge, split into four batches below the collector’s 100-document bound; never sent to the crawler |
| [packet-schema.json](packet-schema.json), [validate_packet.py](validate_packet.py), [validate_legacy.mjs](validate_legacy.mjs), [validation/](validation/) | Packet-local research schema, actual production-validator check, focused tests and independent review receipts |
| [manifest.json](manifest.json), [SHA256SUMS](SHA256SUMS) | Staging membership, exact integration constraints and file integrity |

The current committed graph contains **537 entities and 17 funding rows**; rebuilding from pinned current source files yields **555 entities and 25 funding rows**. These are different snapshots, recorded separately. The 45-row research overlay and all 555 rebuilt identities produced **zero candidate name/domain matches** for the researched companies. Accent folding and exact normalised hosts only generate match candidates; they do not authorise merging legal entities, investor funds or people. A live “Mexico” keyword search returning zero is recorded as a query result, not used as proof of country absence.

The focused validation has **14 passing tests** covering schema, alias/domain handling, reconciled counts, unknown/null values, provenance, orphan funding relationships, event identity, instrument roles, unchanged production inputs, capture bounds and planner resumption. The actual repository validator additionally rejects eight deliberately invalid null/year/date/provenance/amount-currency specimens. Existing planner pages are deterministic and bound to the exact staged overlay, unapproved CSV, batch size and base revision; changes to any binding invalidate the old cursor. The planner’s exhausted flag means this 23-row inventory ended, not that a crawl or country enumeration completed.

An in-memory graph dry run with these proposals is deterministic and yields **631 entities, 69 startups, 49 funding rows and 326 edges**. No generated graph is written. After incorporating the owners’ merged main changes, the check confirms that unknown founding years remain absent. Two targeted existing tests for the newly merged funding-source guard also pass: source replacement cannot inherit unreviewed omitted claims, while same-source partial upserts retain their documented semantics. Typed investor edges are not added. These tests verify structural and relationship safeguards; they do not prove every real-world assertion or source currentness.

### Reproduce the checks

From a checkout containing this packet and its pinned base contracts (Python with `jsonschema`, plus Node):

```bash
python research/countries/mx/2026-11-18-batch-001/validate_packet.py
node research/countries/mx/2026-11-18-batch-001/validate_legacy.mjs
cd research/countries/mx/2026-11-18-batch-001
sha256sum -c SHA256SUMS
```

The validator is read-only by default. `--write-results` refreshes only packet-local receipts and therefore requires recomputing the manifest/checksums. It never approves seeds or writes production data.

### Owner integration sequence

1. Review this country branch against main and recheck the base/schema and identity inventory if other country work or record changes have landed. Keep the full sidecars and held observations with the projection.
2. Decide the accepted country taxonomy and historical-company policy, specifically Yalo, Mendel, Apli and Merama. Resolve the two held financing observations before any second-event or amount assignment; do not manufacture investor IDs from display names.
3. Coordinate the existing record/collection owners. PR #179 and #181 are included in the final validation base; verify deployed capabilities separately. Use the existing reviewed-record proposal path for deliberately selected records; `startups.staged.json` is input for that review, not permission to overwrite `data/startup-research.json` wholesale. Omitted fields in an upsert do not delete old values, and replacing an existing funding source requires explicitly reviewing/resubmitting inherited claims.
4. The collection owner independently reviews each source for the existing allowlist and transport controls. The packet CSV has blank approvals. Use planner #177’s input-bound pagination; #178’s synthetic replay is not evidence of live collection activation or permission to submit real observations through a new path.
5. Owners coordinate merge and release, then verify production revision and readback separately. This research task makes no production-publication claim and requests no schema/API expansion or MCP deployment.
