# Spain startup ecosystem — bounded research batch 001

**Research date:** 18 November 2026. **Repository:** castlemilk/startup-atlas. **Cohort label:** GDP 15/30, supplied by the user. **Scope:** country research, claim review and staged records; publication and release status belong to the integration receipt below.

This packet reviews **25 companies for staged inclusion and retains Zeleros as a historical exclusion**. Selection spans Madrid, Barcelona/Catalonia, the Valencian Community and the Basque Country, with additional regional source discovery. It is a partial, evidence-led sample within the requested initial ceiling of 50 companies. It does not enumerate every startup, every investor, every founder or every financing event.

## Cohort and measurement basis

The requested cohort uses **2026 nominal GDP estimates from the October 2026 IMF World Economic Outlook**, excluding aggregates and retaining Taiwan under the IMF's separately reported economy convention. These are estimates from that edition, not final actual GDP. The [IMF WEO dataset page](https://data.imf.org/datasets/WEO) identifies the edition. However, the [requested NGDPD/2026 API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) returned a tool access error, and the [legacy dataset page](https://www.imf.org/external/datamapper/datasets/WEO) and Spain indicator rendered without usable numeric observations. Spain's GDP value remains null; position 15 is the user's cohort label and was not independently recomputed.

Startup population estimates also require explicit scope. The following observations are preserved separately in [ecosystem-claims.json](ecosystem-claims.json); none supplies an Atlas completeness denominator.

| Observation | Period and population | Interpretation |
|---|---|---|
| Approximately **5,000** | Spain in 2025, in the ministry's Startup Law evaluation | A national policy-report population with its own methodology |
| More than **12,000** | ICEX's undated national technology-entrepreneurship page, observed during this pass | A broader ecosystem statement whose population was not reconciled with the ministry's |
| **2,403** | Catalonia, 2025 | ACCIÓ's regional population, generally limited to ten-year-old companies, twelve for biotechnology |
| **1,852** | Valencian Community, September 2026 | Startups within an observatory containing **2,376 ecosystem entities**, including other organisation types |
| **2,100** | ENISA-certified emerging enterprises through March 2026 | An administrative certification population, distinct from all startups |

Sources are the [ministry's June 2026 evaluation](https://digital.gob.es/comunicacion/notas-prensa/secretaria-digitalizacion-e-inteligencia-artificial/2026/06/el-ecosistema-de-startups-en-espana-se-consolida--crece-casi-un-), [ICEX Invest in Spain](https://www.investinspain.org/en/startups), [ACCIÓ's 2025 results](https://catalonia.com/w/the-number-of-startups-in-catalonia-hits-2403-in-2025-5-2-over-the-previous-year-and-the-highest-figure-on-record) and [Startup Valencia's October 2026 publication](https://startupvalencia.org/es/inversion-startups-comunidad-valenciana-2026/). The differences in geography, observation date, age limits, eligibility and entity type prevent direct comparison or addition. They do not establish a contradiction that this packet can resolve.

Capital statistics have similar boundaries. [ENISA's summary of the Dealroom 2026 report](https://www.enisa.es/sala-de-prensa/notas-de-prensa/nota-de-prensa/?slug=el-ecosistema-tecnologico-espanol-alcanza-los-125000-millones-de-euros-de-valoracion-siendo-el-segu) reports **EUR 3.1 billion venture capital in 2025**, with Madrid at EUR 1.2 billion and Barcelona at EUR 1.1 billion. This is an attributed published aggregate, not a reproduced proprietary transaction database. ACCIÓ reports EUR 1.131 billion for Catalonia in 2025; Startup Valencia reports more than EUR 234 million for January–September 2026. Different regional boundaries, periods and collection methods preclude treating these as directly comparable totals.

## Hubs, sectors and institutional connections

### Madrid and Barcelona

The national financing observations support prioritising Madrid and Barcelona for discovery, while the selected companies show different business models within each city. Madrid-linked coverage includes mobility and transport services, staffing, treasury software, insurance assessment, contextual advertising, property transactions and cardiology software. [Job&Talent](https://www.jobandtalent.com/about-us), [Embat](https://www.embat.io/about-us) and [Bdeo](https://bdeo.io/nosotros/) provide concrete examples of enterprise applications. [Idoven](https://www.idoven.ai/about-us) adds medical AI. These observations describe this sample, not estimated sector shares.

Barcelona-linked coverage combines business software with research-intensive technology: [Factorial](https://factorial.com/), [Seqera](https://seqera.io/about/), quantum systems at [Qilimanjaro](https://qilimanjaro.tech/qilimanjaro-quantum-tech-the-spin-off-of-ub-bsc-and-ifae-pioneers-quantum-computing-in-europe/), cooling infrastructure at [Submer](https://submer.com/about-us/), and neurotechnology at [INBRAIN](https://www.imec-int.com/en/press/inbrain-neuroelectronics-raises-50m-series-b-advance-graphene-based-brain-computer-interface). ACCIÓ separately identifies **374 deep-tech startups** in its regional 2025 population. That institutional category should not be assigned automatically to every technology company in Atlas.

Internationalisation makes geography especially consequential. [Perk's November 2025 rebrand announcement](https://www.perk.com/press-release/travelperk-rebrands-to-perk-the-intelligent-platform-powering-real-work/) identifies Boston and London headquarters; Barcelona founding is retained as origin. [INBRAIN's host science park](https://www.pcb.ub.edu/en/inbrain-neuroelectronics-inaugurates-u-s-office-and-announces-collaboration-with-mayo-clinic-to-advance-its-brain-computer-interface/) instead describes a US office while retaining Barcelona headquarters. These are different geographic relationships.

### Valencian Community and Basque Country

The regional sample connects scientific institutions to commercial development. [Universitat Politècnica de València](https://www.upv.es/noticias-upv/noticia-16018-ronda-de-inver-en.html) documents iPronics' photonics origins. [Universitat de València's ICMol](https://www.icmol.es/new.php?lan=eng&menu=news&pas=1255) describes Matteco's materials research and industrialisation. [Universidad Miguel Hernández's science-park account](https://comunicacion.umh.es/2026/03/05/la-firma-pld-space-del-pcumh-cierra-una-ronda-de-financiacion-serie-c-de-180-millones-de-euros-para-acelerar-el-acceso-al-espacio/) places PLD Space within Elche's institutional network. The same regional packet includes HR software, medical imaging and audio tools, so the industrial examples should not define the whole ecosystem.

In the Basque Country, [H2SITE's history](https://h2site.eu/es/historia/) identifies TECNALIA and Eindhoven technology origins. [Cocoon's Derio plant announcement](https://cocoonbio.com/resources/cocoon-opens-first-industrial-recombinant-protein-plant-using-living-bioreactors/) documents biomanufacturing facilities. [SPRI's interview with Román Orús](https://www.spri.eus/es/blog/inteligencia-artificial/roman-orus-multiverse-computing-ha-sabido-trasladar-tecnologias-complejas-como-la-computacion-cuantica-o-la-ia-a-entornos-reales/) and [Bullhound's investment announcement](https://bullhoundcapital.com/articles/bullhound-capital-leads-189m-investment-in-multiverse-computing/) support a narrower independent record for Multiverse Computing. An inference from these cases is that research institutions, specialist capital and industrial customers provide useful discovery paths alongside general accelerators; this is not a measured causal claim.

Coverage outside these hubs remains thin. [Unirisco](https://www.unirisco.com/) provides a Galicia research-commercialisation investment route. [Andalucía Emprende](https://www.andaluciaemprende.es/) exposes CADE support and accelerator discovery. These sources identify the next regional work; they do not establish that Galicia or Andalusia is absent from the national ecosystem.

## Public programmes, accelerators and investor networks

The ecosystem includes grants, participating loans, equity capital, acceleration and customer contracts. Atlas must preserve these distinctions.

| Actor or programme | Source-backed function | Research implication |
|---|---|---|
| [ENISA financing](https://www.enisa.es/servicios/financiacion/) | Participating loans from EUR 25,000 to EUR 1.5 million; no ownership stake | Record debt separately; eligibility includes Spanish registered office/principal activity and sufficient own funds |
| [NEOTEC 2026](https://www.ciencia.gob.es/Convocatorias/2026/NEOTEC2026.html) | Grants for companies developing their own technology | The 14 April–14 May application window is closed |
| [CDTI's October NEOTEC amendment](https://www.cdti.es/noticias/cdti-innovacion-ampliacion-3-millones-euros-neotec-2026) | Updated call budget of EUR 43.38 million | Supersedes the original summary budget; does not reopen applications or award that amount to a company |
| [Rising UP in Spain](https://www.investinspain.org/en/rising-up-in-spain-old) | Legal and acceleration support for foreign startups establishing in Spain | Official linked page describes a 2026 capacity of 50; remaining places were not established |
| [Lanzadera](https://lanzadera.es/programa/) | Valencia acceleration requiring full-time founder commitment and regular presence | Programme participation is separate from an investment; language and attendance requirements matter |
| [SeedRocket](https://www.seedrocket.com/) | Early-stage mentoring, training and investor connections | Do not infer a standard cheque, equity term or founder relationship from participation |
| [BIND](https://bind.spri.eus/faq/) | Corporate/SME and public-sector venture-client collaboration | A paid pilot or commercial contract is not equity financing |
| [Wayra](https://wayra.com/) | Telefónica corporate venture capital and commercial collaboration | Distinguish investor, customer and corporate affiliation relationships |

Programme terms are observations as of this research date, not assurances that applications remain open. Stale budget summaries and revised calls should remain traceable instead of being silently overwritten. Matteco illustrates another boundary: ICMol reports an EIC blended-finance recommendation with company-specific support undisclosed and investment subject to assessment/formalisation. Programme selection is not proof of a completed equity round.

For investor discovery, [SpainCap](https://www.spaincap.org/quienes-somos/presentacion) represents venture capital and private equity, while [K Fund](https://www.kfund.vc/) and [Seaya](https://seaya.vc/) expose portfolios and distinct investment vehicles. A manager, its fund, a corporate investor and a programme are separate entities. For example, a source may identify COFIDES acting through FOCO or GP Bullhound Fund VI as a round participant. Preserve that vehicle/manager relationship rather than merging names solely because they share branding.

Portfolio membership supplies an investor relationship at most. It does not establish participation in a particular round, leadership, cheque size or date. [K Fund's Leadwind announcement](https://www.kfund.vc/blog/leadwinds-first-5-investments-and-final-closing-contributing-to-a-new-chapter-for-enabling-tech-scale-ups-in-southern-europe-and-latam) names investments including Voicemod and Quibim; its fund size must not become either company's funding amount.

## Company coverage and geographic qualification

The 25 staged company records below include Spanish headquarters, Spanish operations and Spanish-origin companies with international structures. They must not be summed as 25 currently Spain-headquartered companies. Dates and field-level provenance are in [companies.json](companies.json) and [claims.json](claims.json).

| Company and source | Geographic qualification | Focus / retained boundary |
|---|---|---|
| [Cabify](https://seaya.vc/portfolio/cabify/) | Source uses Madrid and Latin America | Mobility; operating entity and parent remain distinct |
| [Job&Talent](https://www.jobandtalent.com/news/series-f) | Madrid, dated 2025 evidence | Workforce platform |
| [Seedtag](https://www.seedtag.com/contact) | Spain origin; Madrid and US HQ scopes unresolved | Contextual advertising; no sole global-HQ conclusion |
| [Clikalia](https://clikalia.es/en/sobre-nosotros) | Madrid reported base; explicit HQ unconfirmed | Residential property technology |
| [Idoven](https://www.idoven.ai/about-us) | Madrid reported base; explicit HQ unconfirmed | AI cardiology |
| [Embat](https://www.embat.io/about-us) | Madrid headquarters | Treasury software |
| [Payflow](https://www.ycombinator.com/companies/payflow) | Spain operations; foreign incorporation | Earned-wage access; secondary proceeds distinguished |
| [Bdeo](https://bdeo.io/nosotros/) | Madrid headquarters | Insurance visual intelligence |
| [Factorial](https://factorial.com/) | Barcelona headquarters | HR, finance and IT software |
| [Perk / TravelPerk](https://www.perk.com/press-release/travelperk-rebrands-to-perk-the-intelligent-platform-powering-real-work/) | Barcelona origin; Boston/London HQ | Business travel and spending |
| [Seqera](https://seqera.io/about/) | Barcelona headquarters | Scientific workflows and bioinformatics |
| [Qilimanjaro Quantum Tech](https://qilimanjaro.tech/qilimanjaro-quantum-tech-the-spin-off-of-ub-bsc-and-ifae-pioneers-quantum-computing-in-europe/) | Barcelona headquarters | Quantum computing |
| [Submer](https://submer.com/about-us/) | Barcelona-region global HQ | Cooling/data centres; parent jurisdiction unresolved |
| [Sateliot](https://www.eib.org/en/press/all/2024-486-eib-finances-with-eur30-million-sateliot-s-satellite-network-rollout-to-provide-iot-connectivity-in-low-coverage-areas) | Barcelona base in 2024 lender evidence | Satellite IoT; explicit global HQ unconfirmed |
| [Mitiga Solutions](https://www.mitigasolutions.com/press/mitiga-solutions-raises-13m-in-series-a) | Barcelona HQ evidence dated 2023 | Climate-risk analytics; location refresh queued |
| [INBRAIN Neuroelectronics](https://www.pcb.ub.edu/en/inbrain-neuroelectronics-inaugurates-u-s-office-and-announces-collaboration-with-mayo-clinic-to-advance-its-brain-computer-interface/) | Barcelona HQ retained in 2025 | Graphene neurotechnology |
| [PLD Space](https://cofides.es/noticias/notas-de-prensa/cofides-invierte-50-millones-euros-pld-space-para-acelerar-acceso-espacio) | Elche headquarters | Launch vehicles and services |
| [H2SITE](https://www.hy24partners.com/assets/eaec3685-9f13-4072-993a-4e7ca99a55d5.pdf) | Historical Bilbao HQ; Loiu registered office | Hydrogen membranes; city precision retained |
| [Multiverse Computing](https://bullhoundcapital.com/articles/bullhound-capital-leads-189m-investment-in-multiverse-computing/) | Donostia/San Sebastián, investor evidence | AI compression; narrowed alternative-source record |
| [Sesame HR](https://bullhoundcapital.com/articles/gp-bullhound-fund-vi-leads-e23-million-funding-round-in-sesame/) | Valencia headquarters | HR software |
| [Quibim](https://quibim.ai/contact/) | Valencia explicitly labelled HQ | Imaging AI; founding year conflicted |
| [Matteco](https://www.icmol.es/new.php?lan=eng&menu=news&pas=1255) | Paterna registered office/industrial facilities | Hydrogen materials; explicit HQ unknown |
| [iPronics](https://www.upv.es/noticias-upv/noticia-16018-ronda-de-inver-en.html) | Valencia headquarters | Photonics; independent institutional/adviser evidence |
| [Cocoon Bioscience](https://cocoonbio.com/resources/cocoon-opens-first-industrial-recombinant-protein-plant-using-living-bioreactors/) | Derio registered office; Bizkaia operations | Biomanufacturing; explicit HQ unknown |
| [Voicemod](https://www.voicemod.com/our-story) | Valencia operations; Delaware redomiciliation | Audio/creator technology |
| [Zeleros — historical exclusion](https://www.grupoamper.com/en/news/amper-acquires-zeleros-assets-and-technological-capabilities-and-strengthens-its-position-in-dual-use-energy-storage-and-high-power-electromagnetic-systems-for-military-applications/) | Historical Valencia operations | Amper asset acquisition during insolvency; excluded active |

Zeleros' asset transaction does not establish corporate dissolution. Voicemod's [BORME notice](https://www.boe.es/diario_borme/txt.php?id=BORME-C-2023-5670) establishes a different boundary: Delaware redomiciliation effective 1 September 2023, alongside retained Spanish operations.

## Claim precision and financing interpretation

Unknown is not zero. A missing founder, amount, incorporation date or headquarters field means the bounded sources did not establish it. Founder lists are sourced subsets; executive status alone does not establish founding. Registry addresses establish legal presence, not necessarily operational headquarters. A year-only event never receives an invented 1 January date.

Some disagreements require explicit conflict records. [Adara](https://www.adara.vc/stories/quibim) dates Quibim's founding to 2012, while [GoHub](https://gohub.vc/founder/quibim/) says 2015; the projected year remains absent. H2SITE's 2019 incorporation and 2020 founding describe separate events. Cocoon sources agree on 2022 but differ at month/quarter precision. INBRAIN's institutional founding and company operational milestones likewise remain distinct.

Financing review separates equity, debt, grants, secondary transactions, facilities and targets. Relevant safeguards include:

- [Cabify's EUR 40 million EIB financing](https://www.eib.org/en/press/all/2022-547-cabify-receives-eur-40-million-eib-loan-to-finance-a-zero-emission-fleet-of-electric-vehicles-in-spain) is a loan. Sateliot's lender component also remains debt.
- [Idoven's EUR 18.5 million report](https://www.eit.europa.eu/news-events/news/eit-health-supported-start-idoven-raises-eur-185m) includes different financing components; its grant/equity split is not silently filled.
- [Payflow's up-to-EUR 20 million BBVA agreement](https://www.bbva.com/es/innovacion/bbva-spark-y-payflow-cierran-un-acuerdo-de-financiacion-de-hasta-20-millones-para-impulsar-su-crecimiento-internacional/) and [Sesame's up-to-EUR 50 million agreement](https://www.sesamehr.es/blog/noticias/sesame-bbva-spark-financiacion/) are caps, not proof of full drawdown.
- A “nearly” amount or “over” threshold remains qualified. Unspecified dollar symbols do not become USD. This affects selected Quibim, Seqera and INBRAIN observations.
- PLD's initial EUR 180 million Series C and reported EUR 108 million extension to EUR 288 million total must not be counted as EUR 180 million plus EUR 288 million. The extension remains held pending primary corroboration.
- Publication date, announcement date and close date are separate. Reposted Factorial announcements do not create multiple rounds; projected iPronics chronology uses only independently supported precision.

No total funding raised across this sample is calculated: histories are partial, instruments differ, currency precision varies and some observations overlap.

Identity resolution precedes enrichment. Canonical company names and domains are checked alongside aliases, historical brands and legal operators. A rebrand such as TravelPerk to Perk remains one company record; a legal operator is not automatically the ultimate parent. Shared addresses, investors or programme memberships do not justify merging companies. Person and investor names remain unresolved identifiers until their exact Atlas identities are established. These choices prevent a superficially richer graph from manufacturing relationships.

Evidence quality is also field-specific. A dated financing release can establish an announcement and participating investors without establishing current headquarters or incorporation. An undated team page may support an observed professional role while leaving its effective date unknown. Later web edits can change branding or publication timestamps; the packet retains the source chronology and reported precision instead of replacing every historical claim with the most recently retrieved page. Accepted company records therefore contain deliberately incomplete founder and financing lists.

## Rights, access and reproducibility

The final source registry contains **163 unique URL observations: 147 read, seven partial and nine blocked**. These are selected source observations, not all search results or a count of every HTTP transaction.

Research discovery does not approve a crawler seed. Existing allowlists, throttling, response limits and access controls remain authoritative; no robots.txt request, challenge bypass, asset harvesting or outreach forms part of this packet. Records retain source URLs, publication/retrieval information, access outcomes and uncertainty. Retrieval timestamps documented as review-checkpoint upper bounds are not represented as exact origin-server fetch times.

Direct Multiverse and iPronics company pages disclosed reuse restrictions. Their original observations remain candidates excluded from projection. Multiverse's accepted subset instead uses Bullhound and SPRI; iPronics uses UPV and [Latham's transaction-adviser account](https://www.lw.com/en/news/2026/09/latham-advises-on-ai-infra-photonics-leader-ipronics-funding). Narrower alternate-source records do not clear the original source restrictions. Investor-hosted press language is identified as such and is not described as independent journalism.

Access failures remain visible. Sateliot company pages returned 403; PLD requests returned 502/timeouts; selected Zeleros pages timed out; a Clikalia financing page returned 404. The IMF API failure prevents numeric cohort verification. BigBan, Nauta and BIC Euronova pages were inaccessible. Andalucía Emprende's linked accelerator PDF exceeded the tool's document-size limit. Successful reads of other sources do not change those failed retrieval outcomes.

## Coverage gaps and next-source queue

The [Catalonia directory](https://startupshub.catalonia.com/list-of-startups), [Lanzadera project directory](https://lanzadera.es/proyectos/) and [Valencia directory](https://startupvalencia.org/es/directorio/) were not paginated to a verified terminal state. Results may mix historical alumni, current participants, corporates and service providers; repeated display names require identity review. Unirisco's portfolio controls rendered without a complete inventory. Neither a rendered counter nor a first page establishes an enumerated denominator.

[Next-source-queue.json](next-source-queue.json) preserves resumable work. Priorities include regional expansion into Galicia and Andalusia, completing directory pagination with permitted access, resolving Quibim founding/currency conflicts, refreshing historical HQ observations, and verifying blocked financing components. Additional founders and complete financing histories remain unfinished. These gaps reflect the batch boundary and access outcomes, not evidence of absent companies or absent funding.

## Integration files and owner receipt

[Companies](companies.json) retain richer geography, identity and financial observations. [Claims](claims.json) and the [source registry](source-registry.json) preserve provenance, conflicts and access/reuse dispositions. [Startups](startups.json) is the narrower projection for the existing schema; structured sidecars do not silently expand the application API. [Coverage](coverage.json) and [verification](verification.json) are authoritative for final discovered/reviewed/accepted/rejected counts and actually executed checks. [Baseline](baseline.json) records the inspected revision and starting state.

Integration must retain name/domain/alias deduplication, null and date precision, source referential integrity, event-specific participants, instrument distinctions, held claims and resumable queue state. Existing collection ownership and [crawler planner PR #177](https://github.com/castlemilk/startup-atlas/pull/177) remain intact. A research branch or PR is distinct from merged production data, Pages publication and MCP deployment.

**Current validation baseline:** the packet was rechecked against main revision [ff4d51cf729d6a654787e9a1db63967b292df8c9](https://github.com/castlemilk/startup-atlas/commit/ff4d51cf729d6a654787e9a1db63967b292df8c9), recorded in [validation-baseline.json](validation-baseline.json). [Current verification](verification.json) records **45 passing packet checks and no runtime integration holds**. The initial preview had exposed an omitted-founding-year-to-zero behaviour for Quibim and INBRAIN; [existing-owner PR #179](https://github.com/castlemilk/startup-atlas/pull/179) resolved it before this final check. [Initial-base verification](verification-initial-base.json) retains that historical finding. The current graph preview preserves the omitted years, and production input bytes remain unchanged by this packet.

Missing announcement days can still produce empty dates on automatically created funding articles; the ledger retains source publication dates separately, without inventing an announcement day. [Draft funding-source-inheritance PR #181](https://github.com/castlemilk/startup-atlas/pull/181) remains with its existing owner and is not a blocker for these individually sourced new-company records.

**Validated bounded checkpoint:** 46 named discoveries; 26 companies reviewed; 25 accepted into the staging projection; one current-company rejection retained historically; 20 unreviewed leads queued. The packet contains 599 claim/disposition records, 55 projected founder relationships and 34 financing observations, of which 28 are projected (20 numeric amounts and eight qualified text amounts). Six observations remain sidecar-only. No defensible national denominator is claimed.

Validation passed 45 packet checks, all 25 current-schema records, seven invalid-input fixtures, the existing 16 planner tests and the existing ten graph tests. The existing enrichment helper validated all 599 entries. All 25 staged seeds remain unapproved. [Verification](verification.json), [external test receipts](test-receipts.json), [evidence validation](evidence-validation.json), [manifest](manifest.json) and [SHA256SUMS](SHA256SUMS) provide the exact machine-readable receipt. The country branch is `research/es-gdp15-batch001-20261118`, based on `ff4d51cf729d6a654787e9a1db63967b292df8c9`. The final commit and PR are recorded in the canonical Space and planner handoff; this packet contains no merge or release assertion.

The canonical coordination location is the [Startup Atlas Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a), with the [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2). The integration receipt must supply exact file/commit/PR links, actual verification outcomes and remaining holds without implying an unperformed merge or release.
