# Brazil startup ecosystem — bounded research report, 18 November 2026

This report supports the Brazil GDP 10/30 research lane, with final integration base `ff4d51cf729d6a654787e9a1db63967b292df8c9`. The accompanying manifest and company dossier contain **22 accepted companies in this bounded batch**. This count establishes neither a national denominator nor a coverage percentage. The company list and integration instructions are in the batch README.

The ecosystem research is a separate sidecar: `ecosystem.json` contains 25 reviewed findings, their source registry, query history, access outcomes, 12 discovery-only company leads and 15 resumable source routes. It makes no catalogue changes or crawler-seed approvals. Source identifiers below resolve to exact URLs, acquisition metadata and limitations in that file.

## Cohort and denominator

The requested cohort is **IMF October 2026 WEO, 2026 nominal GDP estimates**, excluding aggregates. The requested [NGDPD API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) (`ecobr-imf-api`) failed to return data through this route. The [WEO dataset](https://www.imf.org/external/datamapper/datasets/WEO) (`ecobr-imf-dataset`) and [Brazil profile](https://www.imf.org/external/datamapper/profile/BRA) (`ecobr-imf-profile`) opened as dynamic templates. An official indexed search result displayed a rounded GDP lead, but its supporting page did not expose the value. **Exact GDP and independently recomputed rank remain null**; “10/30” is the user's cohort designation.

Brazil has several useful mapping exercises with different populations:

| Source and period | Reported universe | Correct use |
| --- | --- | --- |
| [Sebrae Startups Report Brasil 2025, described by its publisher](https://agenciasebrae.com.br/inovacao-e-tecnologia/inteligencia-artificial-ja-esta-em-metade-das-startups-brasileiras/) (`ecobr-sebrae-2025`) | 22,869 mapped startups through December 2025 | Context and geographic sampling; not a census |
| [ABStartups 2025 mapping](https://abstartups.com.br/wp-content/uploads/Mapeamento-do-Ecossistema-de-Startups-2025.pdf) (`ecobr-abstartups-2025`) | 3,650 active self-declared respondents; collection July–September 2025; 424 cities | A separately defined survey population |
| [Inova Unicamp 2026 mapping](https://www.unicamp.br/noticias/2026/11/12/empresas-filhas-da-unicamp-ja-geraram-quase-58-mil-empregos-diretos/) (`ecobr-unicamp`) | 2,055 cumulative registered firms, 1,624 active | Voluntary university-affiliated population, including firms beyond Campinas and Brazil |

These counts must not be combined, subtracted or used interchangeably. The national eligible-startup denominator remains **unknown**. Corporate age/status, a Brazilian founder, Brazilian operations, headquarters and incorporation are separate admission facts.

## Geography and sector coverage

The Sebrae municipal table orders its mapped population as São Paulo, Florianópolis, Rio de Janeiro, Recife, Fortaleza, Brasília, Belo Horizonte, Curitiba, Porto Alegre and Teresina. The initial venture-backed company batch should be followed by regional operator cohorts to reduce capital-announcement and Southeast/South bias. This is a sampling recommendation, not an inference about every city's startup quality.

| Hub or regional route | Evidence-backed ecosystem anchor | Collection implication |
| --- | --- | --- |
| São Paulo / Campinas | [PIPE](https://fapesp.br/pipe/normas/) (`ecobr-fapesp-rules`) supports company innovation research in São Paulo; [Inova Unicamp](https://www.unicamp.br/noticias/2026/11/12/empresas-filhas-da-unicamp-ja-geraram-quase-58-mil-empregos-diretos/) (`ecobr-unicamp`) maps university-connected businesses | Separate research-location eligibility, company HQ and university affiliation |
| Rio de Janeiro | [COPPE/UFRJ](https://incubadora.coppe.ufrj.br/portfolio-de-empresas) (`ecobr-coppe`) identifies biotech/health, sustainability, energy, smart cities, oil/gas and manufacturing domains | Follow dated incubation cohorts; image-only portfolio entries need identity verification |
| Belo Horizonte | [San Pedro Valley](https://sanpedrovalley.org.br/) (`ecobr-spv`) is a founder-created community with a startup directory | Treat self-submitted profiles as leads; corroborate official domains and dates |
| Curitiba | [Vale do Pinhão / municipal retrospective](https://www.curitiba.pr.gov.br/noticias/curitiba-fortalece-ecossistema-vale-do-pinhao-e-ganha-o-oscar-mundial-da-inovacao/81087) (`ecobr-curitiba`) connects Worktiba, Pinhão Hub and funding actors | The municipal 670-startup figure differs from Sebrae's 481; retain source universes |
| Florianópolis and wider Santa Catarina | [ACATE](https://www.acate.com.br/blog-da-acate/empresas-tecnologia-sc-2025/) (`ecobr-acate`) describes regional poles and the MIDIHUB/MIDITEC incubation network | Broader technology-firm statistics are not startup counts |
| Porto Alegre | [Tecnopuc](https://tecnopuc.pucrs.br/) (`ecobr-tecnopuc`) has agrifood, education, finance, AI, mobility and health hubs | Read individual programme cohorts; rendered “+0” counters are unknown, not zero |
| Recife / Pernambuco | [Porto Digital](https://portodigital.org/sobre-o-porto-digital/) (`ecobr-porto-digital`) combines IT, automation, AI, digital communication and creative industries | Its 541 firms include large organisations; residents require startup eligibility review |
| Fortaleza / Ceará | [Corredores Digitais](https://www.sct.ce.gov.br/2026/05/18/secitece-lanca-edital-do-corredores-digitais-para-novos-projetos-inovadores-e-startups-em-crescimento/) (`ecobr-ceara`) supports both early ideas and operating startups | Fix the selected cohort and date; the May 2026 call's June deadline is historical |
| Amazônia | [CERTI's Jornada Amazônia](https://certi.org.br/plataforma-jornada-amazonia/) (`ecobr-amazon`) connects bioeconomy ventures to technical support, markets and investment | Include North-region companies while verifying Brazilian HQ/incorporation separately |

Sebrae describes a predominance of B2B and SaaS and reports 51.8% AI adoption in its mapped 2025 universe. Alongside fintech, commercial software, marketplaces and logistics in venture portfolios, the operator routes above justify deliberate coverage of health, industrial technology, agrifood, energy, climate and bioeconomy companies. These are research priorities, not estimates of sector market shares.

## Public programmes and acceleration

| Programme | Verified scope or status at checkpoint | Important qualification |
| --- | --- | --- |
| [BNDES Garagem](https://garagem.bndes.gov.br/inscreva-se/) (`ecobr-bndes-call`) | The 2026 page states October 28–November 30 intake and up to 100 selections, with creation and traction modules | Socioenvironmental impact focus; review the full edital before interpreting individual eligibility |
| [FAPESP PIPE](https://fapesp.br/pipe/normas/) (`ecobr-fapesp-rules`) | Non-repayable innovation-research support; rules effective September 15, 2026 | At most 250 employees; a real São Paulo headquarters or research unit is required |
| [Embrapii–Sebrae](https://embrapii.org.br/sebrae/) (`ecobr-embrapii-sebrae`) | Technical and financial R&D support; advertised coverage up to 90% under programme conditions | A project funding maximum is neither guaranteed support nor unrestricted company financing |
| [Finep opportunities](https://www.finep.gov.br/oportunidades/) (`ecobr-finep-opportunities`) | Separate routes for credit, non-repayable support and indirect investment | The [Finep Startup page](https://legacy.finep.gov.br/finepstartup) (`ecobr-finep-suspension`) states continuous intake suspended from June 30, 2025 |
| [InovAtiva de Impacto 2026](https://www.gov.br/mdic/pt-br/assuntos/noticias/2026/junho/mdic-divulga-selecao-do-inovativa-de-impacto-2026) (`ecobr-inovativa-2026`) | Reports 72 selected ventures in Alagoas, Ceará, Espírito Santo, Pará, Pernambuco and Rio Grande do Norte | The displayed October publication date conflicts with a “next June 15” start in the text; the event date remains unresolved |
| [WOW](https://www.wow.ac/) (`ecobr-wow`) | National, remote-compatible acceleration with an angel network; Batch 36 banner observed | Closing date not independently verified; membership is not event-level investment proof |
| [ACE Digital Acceleration, Turma 14](https://aceventures.com.br/aceleracao-turma14/) (`ecobr-ace`) | Espírito Santo-focused, online programme; October 17, 2026 deadline | Historical call by the checkpoint; retained “open” copy must not be treated as current availability |

A programme's location does not establish company headquarters; a grant, acceleration service, equity round, loan and secondary share sale must remain distinct transaction types. Founders and investors should be matched only after explicit company or event evidence is reviewed.

## Investor and angel networks

[Kaszek's portfolio](https://kaszek.com/companies/) (`ecobr-kaszek`) provides HQ, sector and active/exit filters. [monashees](https://www.monashees.com/portfolio) (`ecobr-monashees`) exposes headquarters and initial-investment labels but mixes countries and lifecycle states and repeats cards in the text extraction. [Canary](https://www.canary.com.br/portfolio/) (`ecobr-canary`) exposes selected financing announcements; [Latitud](https://latitud.com/portfolio) (`ecobr-latitud`) exposes sector and market controls. None of the accessible extracts establishes an exhaustive Brazil portfolio.

[Anjos do Brasil's June 2026 publication](https://anjosdobrasil.net/pesquisa-anual-investimento-anjo-2026-anjos-do-brasil/) (`ecobr-angels`) reports a 2025 angel-investment estimate of BRL 919 million and 8,044 investors. [ABVCAP/TTR's 2025 report](https://abvcap.com.br/wp-content/uploads/2026/02/report-abvcap-ttr-data-4q2025.pdf) (`ecobr-abvcap`) defines a different VC transaction universe: Brazilian investees, transactions initiated during the period and completed or ongoing, non-confidential values for amount totals, excluding angel investment. These datasets are contextual evidence; underlying proprietary transaction tables were not copied or converted into Atlas events.

## Prioritized next-source queue

The next pass should combine regional programme cohorts with investor routes, correcting the initial sample's reliance on public financing announcements. Priority 1 addresses regional and sector breadth; priority 2 adds investor and report routes; priority 3 is an unavailable route to revisit only when accessible. These are research priorities, not automatic crawler admission.

| Queue ID / priority | Exact source route | Resume boundary and next action |
| --- | --- | --- |
| `ecobr-q01` / 1 | [BNDES Garagem](https://garagem.bndes.gov.br/startups/) (`ecobr-bndes-directory`) | Twelve cards precede “Carregar mais”; verify visible identities, retain filters, then record the next pagination boundary. |
| `ecobr-q02` / 1 | [Porto Digital resident directory](https://embarcadas.portodigital.org/) (`ecobr-porto-directory`) | Empty readable extraction; use permitted official company profiles and assess startup eligibility individually. |
| `ecobr-q03` / 1 | [COPPE/UFRJ portfolio](https://incubadora.coppe.ufrj.br/portfolio-de-empresas) (`ecobr-coppe`) | Expanded material largely exposes image labels; follow dated cohorts and official company sites. |
| `ecobr-q04` / 1 | [San Pedro Valley directory](https://sanpedrovalley.org.br/startups/) (`ecobr-spv-directory`) | Partial text, termination unestablished; corroborate names and domains without retaining personal contacts. |
| `ecobr-q05` / 1 | [Unicamp mapping](https://www.unicamp.br/noticias/2026/11/12/empresas-filhas-da-unicamp-ja-geraram-quase-58-mil-empregos-diretos/) (`ecobr-unicamp`) | Article only; inspect linked registry methodology and define an eligible subset before enumeration. |
| `ecobr-q06` / 1 | [Corredores Digitais](https://www.sct.ce.gov.br/2026/05/18/secitece-lanca-edital-do-corredores-digitais-para-novos-projetos-inovadores-e-startups-em-crescimento/) (`ecobr-ceara`) | Historical call read; selected lists untraversed and refresh timed out. Preserve the exact edition. |
| `ecobr-q07` / 1 | [Jornada Amazônia](https://certi.org.br/plataforma-jornada-amazonia/) (`ecobr-amazon`) | Programme overview only; inspect public cohorts and verify company geography separately. |
| `ecobr-q08` / 1 | [InovAtiva de Impacto](https://www.gov.br/mdic/pt-br/assuntos/noticias/2026/junho/mdic-divulga-selecao-do-inovativa-de-impacto-2026) (`ecobr-inovativa-2026`) | Selected-list link untraversed; resolve the date conflict and check the six-state cohort. |
| `ecobr-q09` / 2 | [monashees](https://www.monashees.com/portfolio) (`ecobr-monashees`) | Repeated, partial cards; deduplicate observations and confirm country, lifecycle and funding-event evidence. |
| `ecobr-q10` / 2 | [Kaszek](https://kaszek.com/companies/) (`ecobr-kaszek`) | Filters visible, rows incomplete; examine explicit Brazil/HQ and active/exit subsets. |
| `ecobr-q11` / 2 | [Canary](https://www.canary.com.br/portfolio/) (`ecobr-canary`) | Selected news cards only; follow individual announcements and resolve dates and currencies. |
| `ecobr-q12` / 2 | [Latitud](https://latitud.com/portfolio) (`ecobr-latitud`) | Filters visible without readable rows; use individual primary sources and explicit geographic admission. |
| `ecobr-q13` / 2 | [WOW](https://www.wow.ac/) (`ecobr-wow`) | Homepage only; follow dated portfolio cohorts, distinguish participation from investment, verify deadlines separately. |
| `ecobr-q14` / 2 | [Sebrae report catalogue](https://observatorio.sebraestartups.com.br/pt-br/estudo) (`ecobr-sebrae-observatory`) | Linked reports unexamined; inspect public methodologies, access conditions and regional populations. |
| `ecobr-q15` / 3 | [Gênesis PUC-Rio](https://www.genesis.puc-rio.br/startups/) (`ecobr-genesis-directory`) | Directory returned 502; revisit through a permitted accessible source, without bypassing restrictions. |

BNDES displays **398 results**, but that number is neither an eligible denominator nor a verified-company count. The 12 visible leads are **2Finance, 4 Habitos, 4FEEDSTOCK, AçaíMaps, AERORIVER, AFREEKTECH, Afro Academy, AFROCENTRADOS CONCEITO, AFROSAÚDE, AGROFORESTREE, AICURY and Alpha D**. All retain `discovery_only` status. Ten directory target links are recorded; two domains remain null. No target domain was established as canonical by this directory observation.

Every route retains `eligible_denominator: null`, a pagination status, an explicit next action and `crawler_seed_approved: false`. A useful continuation receipt records source/filter, visible-card boundary, newly discovered names, reviewed identities, duplicates, accepted and rejected candidates, and unresolved claims. A directory's displayed total cannot substitute for pagination termination or eligibility review.

## Interpretation and integration rules

Funding announcements, portfolios and programme lists answer different questions. A portfolio establishes a relationship only within its wording and date; it does not establish that an investor participated in a specific funding round. Record explicit participant statements separately from company-level investor relationships. Keep announced dates, reported dates and closing dates distinct, and preserve year/month precision where an exact day is unavailable.

Geography needs the same discipline. A São Paulo office, an Amazon restoration project, university affiliation, Brazilian founders and an overseas holding company describe different facts. An incubator's city or a programme's eligibility rule must not populate headquarters or incorporation fields automatically. Missing jurisdiction, founding date, amount, currency or current status remains unknown.

For subsequent batches, deduplicate canonical domains and names against the current Atlas snapshot, then examine aliases and legal entities where an apparent match is ambiguous. Preserve competing evidence instead of selecting the newest page by default: publication date, event date, source scope and company lifecycle may differ. Rejected or held candidates should retain a reason so the next researcher can resume without repeating a failed inference.

The source registry's institutional and programme source kinds are research-sidecar classifications. They do not add production API fields or expand an approved crawler allowlist. Source discovery, reviewed identity, validated staged records and production release remain separate checkpoints.

## Access and freshness receipt

This subpacket attempted **36 unique source URLs**: **29 yielded readable content**, **7 were blocked or empty**, and one successful Ceará source subsequently timed out on recheck. There are **25 reviewed ecosystem findings**, **32 recorded search queries**, **15 queued source routes**, and **12 unverified company leads**. Company acceptance and production-write counts for this ecosystem subpacket are zero. The separate company dossier contains 22 accepted companies; neither count supports a national-completeness claim.

Final evidence rechecks completed at **2026-11-18T09:46:54.357Z** and **2026-11-18T09:47:03.205Z**. Earlier sources without captured per-page seconds retain their actual retrieval date and run window; no exact timestamps were invented. A readable historical page does not establish present programme eligibility or company status.

Open gaps are exact IMF cohort recomputation, source-specific pagination termination, legal incorporation and current-company eligibility, non-Southeast representation, programme date conflicts, dynamic-directory extraction, and event-level investor resolution. No crawler allowlist, throttling, access control, production schema or release ownership was changed.
