# France startup ecosystem — GDP 7/30, initial research checkpoint

**Research date:** 18 November 2026. **Validated repository baseline:** `ff4d51cf729d6a654787e9a1db63967b292df8c9`. **Status:** country research and staged data. The France branch owns only this packet; the existing collection owner retains ingestion, source admission and merge/release coordination.

The validated checkpoint contains **24 reviewed company dossiers: 23 startup candidates and one listed-company alumnus, Pasqal**. It records **32 selected top-level financing events**, including extensions and mixed packages, rather than complete company funding histories. Another **16 named companies remain discovery leads**. These are bounded research counts; they are not a national startup denominator or a claim that these companies are the only eligible French startups. The refreshed source-built graph contains 46 startups and 332 organization identities; normalized names, reviewed aliases and domains produced no existing company matches. Nothing in this packet has been published to production.

## Validated packet receipt

| Measure | Count |
|---|---:|
| Recorded discovery leads | 40 |
| Reviewed dossiers | 24 |
| Accepted for staging | 23 |
| Deferred listed alumnus | 1 |
| Rejected companies | 0 |
| Production records published | 0 |
| Unreviewed named leads remaining | 16 |
| Atomic claims | 561 |
| Claim-cited source URLs | 93 |
| Source-registry URLs | 131 |
| Selected top-level financing events | 32 |
| Package components, not additional rounds | 6 |
| Named event participations | 187 |
| Typed lender/grantor observations | 2 |
| Public professional founder assertions | 63 |

The source registry contains 120 URLs with an access observation and 11 without accepted page evidence; access can be partial or context-only. The claims comprise 550 reviewed staged assertions, eight conflict assertions and three searched-unknown dispositions. There are 22 schema-compatible round projections for the 23 staged companies. Eight additional selected events for those companies remain in rich evidence and source-qualified profile facts because their stage or package structure cannot be faithfully represented in the existing round schema. The two Pasqal events are research-only alumni history.

All 55 automated test cases passed: 23 packet regressions, six existing-schema projection checks, 16 existing planner checks and ten graph/SQLite tests. The evidence helper validated all 561 claims. A read-only graph dry run preserved every existing entity, edge and round and verified that all 23 omitted founding years remain absent. The branch consumes the existing owner’s [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) fix; it does not duplicate that implementation. See [validation receipts](validation/test-results.json), [integration check](integration-check.json), [coverage](coverage.json) and [integration instructions](README.md).

## Cohort basis and country context

“GDP 7/30” preserves the user's cohort label. The intended measure is **2026 nominal GDP estimates from the October 2026 IMF World Economic Outlook**, excluding aggregates, with Taiwan treated under the IMF's separately reported economy convention. The [IMF dataset page](https://data.imf.org/en/datasets/IMF.RES:WEO?indicator_id=D) confirmed the requested vintage, but the [requested DataMapper API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) was unavailable through the retrieval route and the [WEO DataMapper page](https://www.imf.org/external/datamapper/datasets/WEO) returned a dynamic interface. France's GDP value therefore remains **null** and rank 7 was **not independently recomputed**.

France's ecosystem combines software and AI businesses with research-based ventures and capital-intensive industrial projects. That description is an interpretation of the companies and programmes reviewed here, not a measured sector-share estimate. The initial companies span enterprise AI, clinical and insurance software, quantum computing, satellites and launch vehicles, batteries, financial software, charging infrastructure and resale marketplaces.

The [Ministry of Economy's regional overview](https://www.economie.gouv.fr/bercy-decode/les-entreprises-tech-francaises-sont-elles-presentes-seulement-paris) reports more than 18,000 active startups for 2025 and says 56% are outside Île-de-France. These are attributed national estimates; this packet has neither the underlying enumerated population nor a compatible company-by-company classification. They nevertheless establish why a prominent-company sample concentrated around Paris is a poor substitute for national coverage.

## Hubs, research transfer and regional discovery routes

The following map identifies **reviewed institutional entry points**. Themes indicate what those sources support; they do not rank regions or establish every local company's eligibility.

| Place or network | Reviewed entry point | Research value for subsequent batches |
|---|---|---|
| Paris | [STATION F programmes](https://stationf.co/programs/in-house) | Separate F/ai, Fighters and Founders pathways from Landing Zone access; inspect each programme's audience and terms. |
| Paris-Saclay | [IncubAlliance](https://www.incuballiance.fr/en/programmes-accompagnement) | Research-linked pre-incubation, incubation and acceleration across digital deeptech, health, environment and space. |
| Grenoble | [Linksium](https://www.linksium.fr/profil-entrepreneur) | Public-research transfer, founder-team formation and venture creation; pre-company projects need separate treatment. |
| Lille, Roubaix and Hauts-de-France | [EuraTechnologies](https://www.euratechnologies.com/en/incubation-acceleration-explained) | Distinguishes incubation from acceleration for revenue-generating regional startups. |
| Lyon | [H7](https://h-7.eu/en/programs/) | Community and thematic acceleration, including digital inclusion, sustainable food and Web3. |
| Bordeaux area | [Unitec](https://unitec.fr/notre-offre/filieres-incubateurs/) | Digital, health, engineering, energy/environmental transition and wine-related company discovery. |
| Nantes and Pays de la Loire | [Atlanpole Deeptech Factory](https://www.atlanpole.fr/parcours-pre-incubation/deeptech-factory/) | Research-linked venture preparation within the Nantes Université/PREDICT environment. |
| Space ecosystem | [Connect by CNES incubation](https://www.connectbycnes.fr/incubation) | ESA BIC pathways supplying technical and business support; incubation itself is not a funding round. |

Geography needs more than a city label. Exotrail's [investor announcement](https://presse.bpifrance.fr/exotrail-leve-54meur-en-serie-b-pour-accelerer-sa-croissance-et-industrialiser-ses-produits-de-mobilite-spatiale-a-linternational/?lang=fra) describes Massy and Toulouse operations. Verkor's [financing announcement](https://presse.bpifrance.fr/verkor-securise-plus-de-2-milliards-deuros-pour-construire-sa-gigafactory-en-france-et-accelerer-le-futur-de-la-mobilite-durable/?lang=fra) concerns a Dunkirk gigafactory; its dossier separately records Grenoble headquarters. Latitude [reports a Reims base](https://www.latitude.eu/company/), while its [registry record](https://annuaire-entreprises.data.gouv.fr/entreprise/latitude-latitude-850181918) supplies legal registration. Manufacturing sites, laboratories, operating bases and registered offices are different relationships.

The [2026–2028 French Tech network](https://lafrenchtech.gouv.fr/fr/labellisation-2026-2028-des-capitales-et-communautes-french-tech/) lists 19 Capitals, 28 French communities and 78 international communities. It provides a territorial search structure, not a ready-made startup inventory. International community membership also cannot establish that a company is headquartered or incorporated in France.

## Public programmes and acceleration

| Programme | Reviewed scope | Data implication |
|---|---|---|
| [French Tech Next40/120](https://lafrenchtech.gouv.fr/fr/programme/french-tech-next-40-120/) | 2026 selection of 120 scaleups; eligibility includes French registered office, creation from 2006 and unlisted status at selection. | A dated cohort denominator; private status must be checked again at research time. |
| [French Tech 2030](https://lafrenchtech.gouv.fr/fr/programme/french-tech-2030/) | Third cohort of 80 startups across strategic technology themes. | A useful bounded discovery source; membership alone proves neither a round nor an investment amount. |
| [French Tech Tremplin](https://lafrenchtech.gouv.fr/fr/programme/french-tech-tremplin/) | Support for underrepresented founders; fifth incubation cohort lists 102 companies, including overseas territories. | A route beyond highly visible venture-backed businesses; linked cohort material remains unenumerated here. |
| [France 2030](https://www.info.gouv.fr/grand-dossier/france-2030/comprendre-france-2030) | €54 billion investment plan spanning companies, schools, universities and research bodies. | Not a startup-only venture-capital total or an entitlement for a named company. |
| [i-PhD, i-Lab and i-Nov](https://www.entreprises.gouv.fr/la-dge/actualites/france-2030-147-laureats-recompenses-pour-leurs-innovations-davenir) | Reviewed 2024–2025 innovation cohorts covering research valorization, creation and growth. | Historical award evidence; current application eligibility needs a fresh programme-specific check. |

The [June 2026 Deeptech plan update](https://www.entreprises.gouv.fr/la-dge/actualites/actualisation-du-plan-deeptech-relever-le-defi-du-passage-lechelle) emphasizes research transfer, scale-up financing and industrial commercialization. Its €30 billion financing requirement through 2030 is a stated need, not a measured sum already raised. The analytical implication is to collect financing instruments and commercialization stages explicitly: a grant, repayable advance, equity subscription and project debt can support the same venture without becoming one venture round.

## Initial 24-company cohort

Each company name below links to a reviewed financing source. Dates identify selected announcements or reported funding periods. **Bare dollar figures remain source wording with unresolved ISO currency**; they have not been converted to USD. These are selected historical events, not “latest funding” assertions.

| Company | Business focus | Selected financing observations |
|---|---|---|
| [Mistral AI](https://mistral.ai/news/mistral-ai-raises-1-7-b-to-accelerate-technological-progress-with-ai/) | Foundation AI and enterprise tools | September 2025 Series C, €1.7bn. |
| [Dust](https://dust.tt/blog/announcing-our-seed-round) | Enterprise AI agents | June 2023 seed, €5m; [May 2026 Series B](https://dust.tt/blog/series-b-multiplayer-ai), $40m, currency unresolved. |
| [Photoroom](https://www.prnewswire.com/news-releases/photoroom-secures-43m-in-series-b-funding-launches-next-generation-ai-photo-editing-features-for-businesses-302071832.html) | AI commercial imagery | February 2024 Series B, $43m, currency unresolved. |
| [Pigment](https://www.pigment.com/newsroom/pigment-announces-145m-series-d) | Enterprise planning | April 2024 Series D, $145m; [October 2026 Series E](https://www.pigment.com/newsroom/pigment-raises-250m-series-e), $250m; currencies unresolved. |
| [H Company](https://presse.bpifrance.fr/the-h-company-hcompanyai-realise-une-levee-de-fonds-de-220-millions-de-dollars-pour-sa-vision-de-lintelligence-artificielle-generale-agi/?lang=fra) | Computer-operating AI agents | May 2024 seed, 220m dollars; currency and instrument details unresolved. |
| [Nabla](https://nabla.com/press-release/nabla-raises-24m-in-series-b-to-fuel-expansion-of-its-ambient-ai-assistant-to-transform-care-delivery) | Clinical AI workflows | January 2024 Series B, $24m; [June 2025 Series C](https://nabla.com/press-release/nabla-raises-70m-series-c-to-deliver-agentic-ai-to-the-heart-of-clinical-workflows-bringing-total-funding-to-120m), $70m; currencies unresolved. |
| [Aqemia](https://www.goodwinlaw.com/en/news-and-events/news/2024/01/announcements-otherindustries-aqemia-extends-series-a) | AI/physics drug discovery | January 2024 Series A extension, €30m; [December financing](https://cathayinnovation.com/aqemia-hits-100-million-funding-milestone-paving-way-to-clinical-trials-and-global-expansion-starting-with-london-uk/), $38m, currency/stage unresolved. |
| [Qantev](https://www.qantev.com/news/qantev-raise-30-million-euros-from-blossom-capital) | Insurance AI | October 2024, €30m; stage unspecified. |
| [Quandela](https://www.quandela.com/ko/about-us/newsroom/quandela-secures-e50-million-to-support-international-expansion/) | Photonic quantum computing | November 2023 mixed package, **over €50m**. |
| [Alice & Bob](https://alice-bob.com/newsroom/alice-bob-100m-series-b-fundraising-press-release/) | Cat-qubit quantum computing | January 2025 Series B, €100m; [May 2026 extension](https://alice-bob.com/newsroom/alice-bob-announces-series-b-extension/), undisclosed. |
| [C12](https://presse.bpifrance.fr/c12-leve-18-millions-deuros-pour-accelerer-le-developpement-de-lordinateur-quantique-avec-son-approche-unique-au-monde/?lang=fra) | Carbon-nanotube quantum processors | June 2024, €18m; stage unspecified in reviewed release. |
| [Verkor](https://presse.bpifrance.fr/verkor-securise-plus-de-2-milliards-deuros-pour-construire-sa-gigafactory-en-france-et-accelerer-le-futur-de-la-mobilite-durable/?lang=fra) | Battery manufacturing | September 2023 package **over €2bn**, with qualified components below. |
| [Exotrail](https://presse.bpifrance.fr/exotrail-leve-54meur-en-serie-b-pour-accelerer-sa-croissance-et-industrialiser-ses-produits-de-mobilite-spatiale-a-linternational/?lang=fra) | Satellite mobility and logistics | February 2023 Series B, €54m; instrument split unresolved. |
| [Latitude](https://presse.bpifrance.fr/latitude-leve-27-millions-deuros-en-serie-b/?lang=fra) | Small launch vehicles | January 2024 Series B, €27m. |
| [Greenerwave](https://www.greenerwave.com/greenerwave-successfully-closes-series-a-funding-round/) | Antennas and reconfigurable surfaces | February 2024 Series A equity, €15m. |
| [Pennylane](https://www.pennylane.com/fr/blog/pennylane-news/annonce-levee-facturation-electronique) | Accounting and financial management | April 2025 Series D, €75m; [January 2026](https://www.pennylane.com/fr/investisseurs), €175m, month precision. |
| [Qonto](https://www.kkr.com/content/dam/kkr/country-sites/fr/press-release/20220111-cp-qonto-seriesd-fr-version.pdf) | Business finance platform | January 2022 Series D, €486m. |
| [Alan](https://alan.com/en/blog/discover-alan/a/alan-and-belfius-a-strategic-partnership-to-transform-the-healthcare-sector) | Health insurance and care | September 2024 Series F, €173m. |
| [Swan](https://www.swan.io/fr/blog-posts/swan-secures-eu42m-to-lead-embedded-banking-in-europe) | Embedded banking | January 2025 Series B extension, €42m. |
| [PayFit](https://www.generalatlantic.com/media-article/payfit-raises-e254m-to-continue-transforming-hr-technology/) | Payroll and HR software | January 2022 Series E, €254m. |
| [Back Market](https://sprints.com/articles/sprints-invests-in-back-market) | Refurbished electronics marketplace | January 2022 Series E, €450m; alternate dollar presentation is the same event. |
| [Vestiaire Collective](https://www.generationim.com/our-thinking/news/vestiaire-collective-continues-accelerating-and-announces-a-new-178-million-us-210-million-fundraising-backed-by-softbank-vision-fund-2-and-generation-investment-management/) | Fashion resale | September 2021 financing, €178m; stage unspecified. |
| [Electra](https://www.go-electra.com/en/newsroom/electra-raises-euro304-million-of-capital-to-accelerate-the-switch-towards-electric-mobility-in-europe/) | EV charging infrastructure | January 2024 equity, €304m; [June 2021 seed](https://www.go-electra.com/en/newsroom/news/electra-expands-its-top-management/), €15m, month precision. |
| [Pasqal — alumni](https://www.pasqal.com/ar/newsroom/pasqal-raises-e100-million-series-b-funding-to-advance-neutral-atoms-quantum-computing/) | Neutral-atom quantum computing | January 2023 Series B, €100m; [March 2026 private financing](https://www.pasqal.com/newsroom/pasqal-is-entering-a-new-phase-of-development-with-new-financing-expected-of-at-least-e340-million-in-anticipation-of-its-public-listing/), €170m completed. Excluded from startup acceptance count. |

Verkor's package separates **at least €850m Series C equity**, **€600m approved EIB debt support**, and **approximately €650m subsidies subject to final European Commission approval**. Regional subsidies sit inside the public-support component. Quandela's package combines capital, France 2030 support and banks without disclosing each amount. Neither headline becomes exact equity in the machine records. Alice & Bob's NVentures extension remains undisclosed; its original €100m is not reused as the extension amount.

Pasqal requires a lifecycle change: the [27 August 2026 completion announcement](https://investors.pasqal.com/news-releases/news-release-details/pasqal-and-bleichroeder-acquisition-corp-ii-complete-business) identifies **Pasqal Holding SA** as surviving issuer, and its [current investor FAQ](https://investors.pasqal.com/ir-resources/investor-faqs) confirms Nasdaq PSQL listing. The operating website publisher, PASQAL SAS, is a separate legal entity. Announced trading expectations and actual listing confirmation remain different dates.

## Investor networks and financing structure

The reviewed events show several overlapping investor channels. Software rounds include [Sequoia at Dust](https://dust.tt/blog/announcing-our-seed-round), [ICONIQ Growth at Pigment](https://www.pigment.com/newsroom/pigment-announces-145m-series-d), [Blossom Capital at Qantev](https://www.qantev.com/news/qantev-raise-30-million-euros-from-blossom-capital) and [General Atlantic at PayFit](https://www.generalatlantic.com/media-article/payfit-raises-e254m-to-continue-transforming-hr-technology/). [Mistral's ASML-led financing](https://mistral.ai/news/mistral-ai-raises-1-7-b-to-accelerate-technological-progress-with-ai/) shows an industrial strategic investor participating in an AI company. These observations describe selected transactions; they are not investor market-share rankings.

Quantum funding connects specialist investors with public-capital vehicles: [Quandela's capital increase](https://www.quandela.com/ko/about-us/newsroom/quandela-secures-e50-million-to-support-international-expansion/) explicitly names Serena, Crédit Mutuel Innovation and EIC Fund as new subscribers. Bpifrance, OMNES and Quantonation are historical-investor context; no fresh subscription by them is asserted. [C12's announcement](https://presse.bpifrance.fr/c12-leve-18-millions-deuros-pour-accelerer-le-developpement-de-lordinateur-quantique-avec-son-approche-unique-au-monde/?lang=fra) names Varsity, EIC Fund, Verve Ventures, 360 Capital, Bpifrance and BNP Paribas Développement. Industrial scaling introduces different capital structures, illustrated by Macquarie-led equity alongside EIB debt and public support at Verkor, and PGGM-led equity at Electra. This is an analytical distinction based on the selected announcements, not a rule that every company in a sector follows the same path.

Identity resolution must preserve the vehicle. For example, the [Greenerwave investor release](https://presse.bpifrance.fr/greenerwave-leve-15-millions-deuros-pour-revolutionner-le-futur-de-la-connectivite/?lang=fra) identifies Fonds Innovation Défense, managed by Bpifrance and subscribed by AID. Those are fund, manager and sponsor roles, not three independently proven round investments. A portfolio listing, programme affiliation or continuing shareholder statement is likewise insufficient to create a new round-participant edge.

For broader discovery, [France Angels](https://www.franceangels.org/vous-etes-un-entrepreneur/) describes regional and thematic angel networks, while [France Digitale](https://francedigitale.org/association) connects entrepreneurs and venture investors. [France Invest's public member index](https://www.franceinvest.eu/annuaire-des-membres/) was reviewed only at its freely accessible level; paid profiles and contact lists were not collected.

## Evidence limits and resumable coverage

Company packets preserve canonical domains, aliases, public founder evidence, legal versus operational geography, date precision, financing types and participant sources. Unknown fields remain null. A legal creation date does not automatically replace a founder's reported launch date; a historical CEO title does not become a current appointment.

Qonto's [legal-operator history](https://qonto.com/fr/blog/tendances/nouveautes/olinda) dates Olinda to 2016, while its [About timeline](https://qonto.com/en/about) labels 2017 as founding and launch. The canonical founding value remains null; the two semantic scopes are not silently reconciled.

Material unresolved cases include Greenerwave's [2015 company history](https://www.greenerwave.com/about/company/) versus its [2016 investor description](https://presse.bpifrance.fr/greenerwave-leve-15-millions-deuros-pour-revolutionner-le-futur-de-la-connectivite/?lang=fra); Pennylane's [September 2019 beginnings](https://www.pennylane.com/fr/investisseurs) versus [2020 founding](https://www.pennylane.com/fr/careers); Electra's [2020 company profile](https://www.linkedin.com/company/electra-charge/) versus [2021 co-founding account](https://www.go-electra.com/en/newsroom/news/electra-expands-its-top-management/); and Alice & Bob's [May announcement](https://alice-bob.com/newsroom/alice-bob-announces-series-b-extension/) versus [June timeline](https://alice-bob.com/thats-us/). Several operational headquarters remain unknown despite Paris offices or registrations. C12, Verkor and Greenerwave registry requests returned 403, other slices encountered inaccessible press materials, and large PDFs exceeded retrieval limits. These outcomes do not prove absence. Company-site reuse restrictions remain explicit; no assets, personal-contact lists, proprietary bulk directory or crawler seeds were approved.

The 40 discovery leads count identities deliberately recorded in the saved review queue; incidental names on opened pages were not all enrolled. The 24-company pass is deliberately biased toward visible financing announcements and Paris-linked businesses. National geography, overseas territories, less-funded founders, research projects becoming companies and sectors outside this first selection require separate work. Programme directories and archive pagination were not exhausted. Source discovery and researcher review remain distinct from owner-approved ingestion, publication or release.

## Next-source queue

Twelve next leads come from the reviewed **80-company French Tech 2030 cohort**: **Entalpic, Cailabs, HyPrSpace, Leanspace, DIAMFAB, SteerLight, Inbolt, NIRYO, NETRI, SeqOne, YesWeHack and Welinq**. Four come from **Next40/120**: **Agicap, Deepki, Sweep and Akur8**. Their names and candidate domains are discovery records only; individual identity, geography, status, founders and financing still require primary-company or investor review.

After these 16 leads, regional passes should proceed through EuraTechnologies, Linksium, Unitec, Atlanpole and H7, with IncubAlliance for research-transfer cases and Tremplin for a broader founder and territory mix. Each source queue records whether only a programme page was read, whether a linked cohort document remains unopened, and whether a population denominator is known. Resume from those checkpoints, reconcile overlap with the current Atlas graph, and retain failed or deferred items rather than silently dropping them.
