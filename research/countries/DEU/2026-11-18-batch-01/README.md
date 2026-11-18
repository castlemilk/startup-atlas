# Germany — GDP cohort 3/30, research batch 01

**Research cutoff:** 18 November 2026. **State:** reviewed staging, with production promotion held. **Repository base:** `f4bcbf7030d741772bb750deee584efa3ee17749`. **Branch:** `research/gdp-03-germany-2026-11-18`.

This packet accepts **29 Germany-related startup and scaleup organizations**, with a separate queue of **nine named discovery candidates**. It contains company identities, public professional founder observations, selected financing events, claim-level provenance, source-access outcomes, ecosystem analysis and an exact-input restart checkpoint. Acceptance means the bounded evidence packet passed review; it does not mean production publication, a complete profile, current global headquarters verification, or an exhausted national population.

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains implementation and source approval. [Planner #177](https://github.com/castlemilk/startup-atlas/pull/177) remains the offline inventory boundary. [Replay #178](https://github.com/castlemilk/startup-atlas/pull/178) remains synthetic-only and was not used on these real-company records. Investor-round, record/schema and release ownership remain with their existing owners; acknowledgement is pending. The canonical coordination location is the [Startup Atlas Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).

## Counts and what they measure

| Measure | Count / status |
| --- | ---: |
| Individually retained company candidates discovered | 38 |
| Companies reviewed | 29 |
| Accepted for staging | 29 |
| Companies rejected | 0 |
| Named company leads awaiting review | 9 |
| Exact existing company identity/domain matches | 0 |
| Public professional founder observations | 86 |
| Financing events, including one separate public commitment | 39 |
| Funding rows representable in the unchanged startup-record schema | 38 |
| Explicit event-participant observations | 230 |
| Claim ledger entries | 778 |
| Reviewed staged / conflict / searched unknown / rejected claims | 760 / 2 / 9 / 7 |
| Registered unique source URLs | 163 |
| Accessed / partial / unavailable or gated sources | 147 / 3 / 13 |
| Queue tasks, including company leads | 76; one resolved |
| Production records written / new crawler seeds approved | 0 / 0 |
| National eligible startup population | Unknown (`null`) |

These counts are reproducible from [coverage.json](coverage.json). The 760 reviewed entries include 24 normalized event summaries that link their underlying atomic observations; they are not 760 independent sources. The 230 participant observations describe named involvement in events, not 230 distinct investors or verified canonical investor nodes. The 163 URLs count retained source attempts, including failures, rather than every search result or HTTP request. Rejected readings of evidence are separate from rejecting a company.

## Cohort and company definition

The cohort position **3/30** and the **IMF October 2026 WEO, 2026 nominal GDP estimate** convention are supplied by the user. Aggregates are excluded and Taiwan follows the IMF separately reported economy convention. The [requested NGDPD API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) was unavailable through the research reader; the [WEO page](https://www.imf.org/external/datamapper/datasets/WEO) exposed a client-side shell without the country values. Germany’s precise GDP value remains `null`, and this packet does not claim to have independently recomputed the ranking. Estimates are not final actuals.

The research population includes German headquarters, German founding origin, or a substantive German research/operating nexus supported by primary evidence. It includes mature scaleups and multinational groups. This differs from a strict under-ten-year startup definition. Country packets must reconcile the same organization across countries before their counts are summed. A German imprint proves a disclosed local entity, not necessarily the group’s financing issuer, original incorporation country, or sole global headquarters.

## Ecosystem findings

Germany is best researched as a network of specialized regional systems. The official [Digital Hub Initiative directory](https://www.de-hub.de/en/the-hubs/) lists 25 thematic hubs. This supplies a defensible hub-programme denominator, not a denominator for German startups. The following geographic groupings organize the next research passes; they are not a ranking by company count, investment, or quality.

| Geography | Themes in the official hub directory | Relevant operators / continuation points |
| --- | --- | --- |
| Berlin/Potsdam | FinTech, DeepTech, MediaTech | House of Finance & Tech; MotionLab; MediaTech Hub Potsdam |
| Munich/Garching | Mobility, InsurTech, Security & Defense | UnternehmerTUM; InsurTech Hub Munich; BaseD |
| Hamburg | Logistics, Commerce | Digital Hub Logistics; IFB Innovationsstarter / Startup City Hamburg |
| Cologne/Düsseldorf/Dortmund | InsurTech, GreenTech, Logistics | InsurLab Germany; digihub; Digital.Hub Logistics |
| Frankfurt/Darmstadt | FinTech, Cybersecurity | TechQuartier; ATHENE Digital Hub Cybersecurity |
| Stuttgart/Karlsruhe | Future Industries, Artificial Intelligence | CODE_n; DIZ Karlsruhe |
| Mannheim/Ludwigshafen | Chemistry, Health | 5-HT / Digital Hub Rhein-Neckar |
| Leipzig/Dresden | Smart Infrastructure, Smart Systems | SpinLab; Smart Systems Hub |
| Halle/Jena | Life Science, Bioeconomy, Photonics, Digital Experiences | Weinberg Campus; Jena Digital |
| Nuremberg/Erlangen | Health | ZOLLHOF; Medical Valley |
| Bremen/Osnabrück/Hannover | Smart Manufacturing, AgriFood | Digital Hub Industry; Seedhouse |
| Saarbrücken | Artificial Intelligence | Digital Hub Artificial Intelligence |
| Rostock/Greifswald | GreenTech | Digital Hub GreenTech |
| Lübeck | Renewable Energy | Digital Hub Renewable Energy |

The [Deutscher Startup Monitor 2026 release](https://startupverband.de/presse/pressemitteilungen/dsm-2026-%E2%80%93-startups-trotzen-konjunktur-28-09-2026/) reports 1,803 survey respondents, collected from 15 June to 31 August. It reports AI as central for 53% and university/research support for 51%. These are survey observations, not a census or causal estimate of programme impact. They support making research-transfer networks and AI product companies important discovery routes while retaining a separate geographic and sector-balancing queue.

The [Berlin ecosystem report release](https://www.berlin-partner.de/en/news/detail/berlin-startup-ecosystem-report-2025) highlights enterprise software, climate technology and fintech, with university/public support and foreign capital important to its account. Its venture-backed-company totals are scoped to Berlin and cannot supply this packet’s nationwide denominator. The present company batch strongly reflects funded software and deep tech; its selection should not be used to infer German sector shares.

### Accelerators and public programmes

| Programme | Research relevance | Boundary to retain |
| --- | --- | --- |
| [EXIST Gründungsstipendium](https://exist.de/programme/) | Research-linked venture formation before incorporation | Individual and institution eligibility require programme-specific review |
| [EXIST Forschungstransfer](https://exist.de/programme/) | Technically risky commercialization of research | Separate phases and grants from venture equity |
| [EXIST Women](https://exist.de/programme/) | Entrepreneurial development and qualification | Support conditions vary; no individual eligibility asserted |
| [EXIST Startup Factories](https://exist.de/programme/) | Regional research-to-venture infrastructure | Ecosystem support does not establish a particular company grant |
| [UnternehmerTUM](https://www.unternehmertum.de/en/offering/startups-scaleups/) | Deep-tech venture development, market entry and investor access | Incubation, acceleration and investment are distinct activities |
| [SpinLab](https://www.spinlab.co/faq) | Leipzig/HHL-linked acceleration and corporate access | Programme states no equity/fees; selection and participation requirements remain |
| [German Accelerator](https://www.germanaccelerator.com/about-us/faq) | Internationalization of German-incorporated businesses | Founder nationality does not establish eligibility; legal/SME requirements apply |
| [SPRIND](https://www.sprind.org/en/faq) | High-risk breakthrough innovation | Contracts, equity, mezzanine financing and grants are different instruments |
| [Startup City Hamburg / IFB Innovationsstarter](https://startupcity.hamburg/news-events/news/a-new-chapter-begins-for-startup-city-hamburg) | Hamburg support and financing navigation | Operator transfer took effect in 2026; product terms need separate review |

The [UnternehmerTUM accelerator page](https://accelerator.unternehmertum.de/) currently distinguishes the 2026 cohort from the next application window. Its alumni links yielded the nine named next-batch candidates. The [SpinLab roster](https://www.spinlab.co/startups) is only partially inspectable through its filters; its cumulative supported-team marketing number is international and is not a German-company count. No directory or cohort archive was declared exhausted.

### Investor and financing networks

| Network | Relevant coverage route | Interpretation |
| --- | --- | --- |
| [High-Tech Gründerfonds](https://www.htgf.de/) | Young technology companies with a German nexus | Company-specific round evidence is still required |
| [DeepTech & Climate Fonds](https://dtcf.de/about-us/) | Capital-intensive deep-tech and climate companies | Public-backed venture investor; distinct from a blanket grant programme |
| [UVC Partners](https://www.uvcpartners.com/) | European B2B companies and Munich/Berlin networks | Portfolio membership supports discovery, not a dated funding edge |
| [Project A](https://www.project-a.vc/approach) | Early-stage European businesses and operational support | An investor quote alone is not event participation |
| [Business Angels Deutschland](https://www.business-angels.de/en/association/) | Angel networks and professionalization | Umbrella association, not a single fund |
| [KfW / WIN](https://www.kfw.de/%C3%9Cber-die-KfW/Newsroom/Aktuelles/Pressemitteilungen-Details_907328.html) | Institutional capital mobilization | Target commitments and deployed capital are different measures |

**Collection inference:** research-transfer organizations, specialist industrial networks, regional public providers and explicit investor announcements form complementary discovery routes. This is a collection strategy derived from their stated roles, not a claim that the programmes caused funding or startup success. Subsequent batches should broaden life sciences, agrifood, cybersecurity, northern/eastern seed cohorts and companies with less press coverage.

## Accepted company enumeration

The table is an index into [entities.json](entities.json) and [claims.json](claims.json), where each field retains its own source, precision and date. Company/domain links identify the canonical website; they do not by themselves evidence every cell. Source-reported founding observations are distinct from legal incorporation dates. Unknown global headquarters remain unknown even when an operating base is established.

| Company and canonical domain | Founding observation | Germany / international scope | Product description source |
| --- | --- | --- | --- |
| **1KOMMA5°** · [1komma5.com](https://1komma5.com/) | 2021 | Hamburg; group incorporation unresolved | [Residential electrification company combining solar, storage, heat pumps and charging with the Heartbeat AI energy-management platform.](https://1komma5.com/en/press/press-releases/1komma5-raises-pre-ipo-round-of-150-million-euro/) |
| **ARX Robotics** · [arx-robotics.com](https://arx-robotics.com/) | 2022 | Munich HQ; separate Oberding registered office | [Develops autonomous ground vehicles and AI software for defence and other operational applications.](https://www.arx-robotics.com/article/arx-robotics-raises-eu31m-series-a) |
| **Aignostics** · [aignostics.com](https://aignostics.com/) | 2018 research origin; 2020 spinout | Berlin/New York operations; global HQ unresolved | [Aignostics develops AI systems that analyze pathology and multimodal tissue data for biopharma and precision-medicine research.](https://www.aignostics.com/news/aignostics-secures-34-million-series-b-to-enhance-precision-medicine-with-ai) |
| **Aleph Alpha** · [aleph-alpha.com](https://aleph-alpha.com/) | 2019 | Heidelberg; conditional Cohere combination | [Develops specialized language models and sovereign AI software for enterprises and public-sector institutions.](https://aleph-alpha.com/en/news/) |
| **Billie** · [billie.io](https://billie.io/) | 2016 | Berlin operating base; global HQ unresolved | [Billie provides business-to-business payments and buy-now-pay-later services.](https://www.billie.io/en/about-us) |
| **Black Forest Labs** · [bfl.ai](https://bfl.ai/) | 2024 | Freiburg and San Francisco HQ | [Builds FLUX generative visual models and infrastructure for image generation, editing and visual intelligence.](https://bfl.ai/about) |
| **Black Semiconductor** · [blacksemi.com](https://blacksemi.com/) | 2020 | FabONE HQ site; Aachen registered address | [Develops graphene-based photonic connections between semiconductor chips.](https://www.blacksemi.com/newsroom/we-secured-eur-254-4-million-in-funding) |
| **DeepL** · [deepl.com](https://www.deepl.com/) | 2017 | Cologne HQ; earlier legal/brand history unresolved | [Language AI software for translation, writing and multilingual business communication.](https://www.deepl.com/en/about-us) |
| **Enpal** · [enpal.de](https://www.enpal.de/) | 2017 | Berlin management in FY2023; Dutch parent | [Provides residential solar, batteries, heat pumps, charging and connected energy services with rental, purchase and financing options.](https://www.lobbyregister.bundestag.de/media/02/00/624397/FY23_Enpal_Financial-statements_filing.pdf) |
| **Helsing** · [helsing.ai](https://helsing.ai/) | 2021 | Munich, Paris and London in FY2024 statement | [Develops artificial intelligence software and software-defined systems for defence.](https://helsing.ai/company) |
| **Isar Aerospace** · [isaraerospace.com](https://isaraerospace.com/) | 2018 | Vaterstetten-Parsdorf in current legal notice | [Develops launch vehicles and launch services for small and medium satellites.](https://isaraerospace.com/about) |
| **Marvel Fusion** · [marvelfusion.com](https://marvelfusion.com/) | 2019 | Munich HQ | [Develops laser-driven inertial fusion energy technology.](https://www.marvelfusion.com/about-us) |
| **Moss** · [getmoss.com](https://getmoss.com/) | 2019 | Berlin HQ in January 2022 statement | [Moss provides spend-management software covering company cards, invoices, reimbursements and accounting workflows.](https://www.getmoss.com/magazine/moss-series-c) |
| **N26** · [n26.com](https://n26.com/) | 2013-02 | Berlin HQ; distinct group and bank entities | [N26 provides mobile banking services to retail customers.](https://n26.com/en-de/press/press-release/n26-announces-landmark-series-e-funding-round/) |
| **NEURA Robotics** · [neura-robotics.com](https://neura-robotics.com/) | 2019 | Metzingen HQ | [Develops cognitive robots, including humanoid and industrial robotic systems.](https://neura-robotics.com/about-us/) |
| **Nelly** · [getnelly.de](https://getnelly.de/) | 2021 | Berlin operating base; global HQ unresolved | [Nelly provides medical-practice administration and financial workflows including patient intake, payments and factoring.](https://www.getnelly.de/en/blog/nelly-series-b) |
| **Parloa** · [parloa.com](https://parloa.com/) | 2018 | German origin; New York U.S. HQ, global HQ unresolved | [Parloa provides enterprise software for managing AI agents in customer-service interactions.](https://www.parloa.com/company/about/) |
| **Proxima Fusion** · [proximafusion.com](https://proximafusion.com/) | 2023-04 | Munich HQ; Oxford and Zurich sites | [Develops stellarator fusion technology using high-temperature superconducting magnets.](https://www.proximafusion.com/about) |
| **Quantum Systems** · [quantum-systems.com](https://quantum-systems.com/) | 2015 | Oberpfaffenhofen HQ site in May 2025 release | [Develops electric vertical-takeoff aerial systems and AI-enabled aerial intelligence for civilian and government users.](https://quantum-systems.com/au/news/quantum-systems-raises-euro160m/) |
| **Raisin** · [raisin.com](https://raisin.com/) | 2012 | Berlin HQ; Raisin SE and bank distinct | [Raisin operates marketplaces for savings and investment products.](https://www.raisin.com/en/corporate/press/Raisin-Announces-60M-Funding/) |
| **Tacto** · [tacto.ai](https://www.tacto.ai/) | 2020 | Munich HQ | [Procurement and supply-chain software using AI to support industrial companies with supplier management, compliance and purchasing decisions.](https://www.tacto.ai/en/resources-posts/tacto-secures-50-million-to-build-future-proof-supply-chains-for-the-mid-market) |
| **Taxfix** · [taxfix.de](https://taxfix.de/) | 2016 | Berlin HQ in April 2020 investor statement | [Taxfix provides digital tax-return preparation and filing services.](https://taxfix.de/en/about-us/) |
| **The Exploration Company** · [exploration.space](https://exploration.space/) | 2021 | German parent; French/Italian subsidiaries; HQ unresolved | [Develops reusable space capsules and rocket engines, including Nyx and Storm.](https://www.exploration.space/about) |
| **Trade Republic** · [traderepublic.com](https://traderepublic.com/) | 2015 | Berlin operating base; global HQ unresolved | [Trade Republic provides mobile brokerage, investment and savings services.](https://sequoiacap.com/companies/trade-republic) |
| **Wandelbots** · [wandelbots.com](https://www.wandelbots.com/) | 2017 | Dresden and Chicago HQ in April 2026 release | [Industrial robotics software for vendor-independent programming, orchestration and deployment of robot applications.](https://www.wandelbots.com/news/platform-based-automation-solution-for-industrial-robotics-by-gessmann) |
| **n8n** · [n8n.io](https://n8n.io/) | 2019 | Berlin HQ | [Workflow and AI orchestration software connecting applications, models and automated business processes.](https://n8n.io/press/) |
| **osapiens** · [osapiens.com](https://osapiens.com/) | 2018-07 | Mannheim HQ | [Enterprise software for supply-chain transparency, regulatory compliance, sustainability reporting and operational efficiency.](https://osapiens.com/de/resources/company-news/2026/osapiens-sichert-sich-finanzierung-in-hoehe-von-100-mio.-us-dollar-und-erreicht-unicorn-bewertung-investition-von-decarbonization-partners) |
| **planqc** · [planqc.eu](https://planqc.eu/) | 2022 | Garching bei München HQ | [Develops neutral-atom quantum computers and associated software.](https://planqc.eu/company/about-planqc) |
| **vialytics** · [vialytics.de](https://www.vialytics.de/) | 2018 | Stuttgart HQ | [AI-assisted municipal road-management software that analyzes road imagery and supports maintenance and budget planning.](https://www.vialytics.de/grounding) |

All 86 founder observations retain the professional name, source and available role/date context; completeness is not asserted. Only public professional information was collected. Personal contact details, private profiles and images were not harvested. Founder and investor canonical identities remain unresolved; a shared name does not authorize a join. Eighty-six distinct founder slugs were checked against the existing graph and within the batch without a collision.

### Material evidence decisions

1. **Black Semiconductor:** the [company breakdown](https://www.blacksemi.com/newsroom/we-secured-eur-254-4-million-in-funding) separates EUR 25.7 million of equity from EUR 228.7 million committed to a seven-year public project. Only the equity is projected as a funding round. The public commitment remains a separate staged event; it is not treated as cash received or venture investment.
2. **planqc:** its [EUR 50 million announcement](https://planqc.eu/news/planqc-raises-50-million-euro-series-a) includes a non-dilutive BMBF grant without a component allocation. Numeric equity proceeds are unknown; the record retains amount text and the mixed financing description.
3. **Aleph Alpha:** the 2023 headline combines investment, research and commercial commitments. Separately owned research financing is not added to the company’s equity. The [April 2026 proposed combination](https://aleph-alpha.com/en/news/cohere-aleph-alpha-global-ai-powerhouse/) identifies the Schwarz EUR 500 million commitment with Cohere’s upcoming Series E. The [September definitive agreement](https://aleph-alpha.com/en/news/cohere-agreement-transatlantic-sovereign-ai/) still requires regulatory approval. No completed merger or standalone Aleph Alpha EUR 500 million round is asserted.
4. **N26:** the amount remains greater than USD 900 million and the valuation greater than USD 9 billion. A firsthand transaction-adviser account resolves USD; neither lower bound becomes an exact numeric value. Goldman Sachs’ placement-agent role is not an investor edge.
5. **Isar Aerospace, Marvel Fusion and 1KOMMA5°:** extensions are kept distinct from cumulative round-family totals. Isar’s extension is a lower bound, Marvel’s EUR 50 million is incremental, and the July 2025 1KOMMA5° extension amount is undisclosed rather than another EUR 150 million.
6. **osapiens:** the 2024 Series B remains dated 29 July 2024 despite a2026 display date on a republished English page. The2026 Series C retains its approval condition. Decarbonization Partners is the named investor; its BlackRock/Temasek parents are not separately asserted as direct participants.
7. **The Exploration Company and n8n:** dollar symbols with no explicit ISO currency remain unresolved. n8n’s May2026 strategic investment retains month precision and an undisclosed amount. No first-of-month day is invented.
8. **vialytics:** a reported closing date is not silently reused as an announcement date. **Wandelbots:** exact versus “over” USD 84 million wording remains a conflict expressed in amount text.
9. **Aignostics and Trade Republic:** Aignostics’ 2018 research origin and 2020 spinout stay separate; no scalar founding year is projected. Trade Republic’s accepted 2015 observation and inaccessible competing press-kit discovery remain an explicit follow-up.
10. **Headquarters versus legal entities:** Parloa’s U.S. HQ does not establish its sole global HQ; Black Forest Labs and Wandelbots retain multiple headquarters. Enpal’s FY2023 Berlin management and Dutch parent remain distinct. The Exploration Company’s German parent and French/Italian subsidiaries are not collapsed into a sole-country legal claim.

The complete event list and named participants are in [funding-evidence.json](funding-evidence.json). No aggregate funding total is supplied: the observations mix currencies, equity, commitments, packages, extensions, bounds and unknowns. Named investor observations come from explicit event announcements, never portfolio membership alone.

## Sources, uncertainty and access gaps

[source-registry.json](source-registry.json) records canonical source URLs, publisher/type, publication date where known, retrieval/review checkpoints, actual access outcome and short factual paraphrases. Retrieval timestamps are review-session checkpoints where the provider did not expose an exact fetch time; that limitation is stated. German-language originals were used where they clarified currency, dates or legal facts.

The thirteen unsuccessful or gated attempts include the IMF API, inaccessible Trade Republic legal/press material, a gated N26 currency corroboration page, and obsolete or unavailable company routes. Failed sources remain visible but cannot support accepted claims. Partial reads are explicitly distinguished; none is used to turn a missing company fact into an accepted value. Sources use short researcher paraphrases; page bodies, proprietary bulk listings and contact lists were not copied. No robots.txt requests, direct crawler activation, paid access, new credentials or permission changes occurred.

`null`, omission, `unsearched`, `searched_unknown`, `conflict` and `rejected` have separate meanings. The production-shaped projection omits unavailable scalars because the existing schema does not allow nulls there; the richer staging data retains the reason. Announced dates and closing dates are separate. Historical professional roles and headquarters statements do not become current claims merely because their page was retrieved today.

## Repository integration and validation

The committed graph at the pinned main has 537 entities, 46 startups and 17 funding rows. Rebuilding current inputs in memory yields 555 entities, 46 startups and 25 funding rows; the overlay itself contains 45 companies. Deduplication uses the rebuilt current-input snapshot and all entity kinds, not the stale generated graph or the empty live keyword search. [baseline-identities.json](baseline-identities.json) pins source files and schema/planner hashes. [deduplication.json](deduplication.json) records each company result. Normalized names, evidenced aliases, domains and repository slugs generated no exact collisions; legal/cross-country identity reconciliation remains a review step.

**Staging validation passes; production promotion is held.** [validation-results.json](validation-results.json) records 10 Node packet tests, 7 Python restart tests and 16 existing planner regression tests, plus 29 existing-schema record checks, claim-ledger validation and internal-reference checks. Tests cover domain/alias normalization, null-versus-missing handling, source-access requirements, corrupted provenance, date/currency precision, orphan/cross-company participants, portfolio-derived relationships, altered amounts, missing projected events, duplicate IDs and cursor invalidation after input/revision/batch-size changes.

[planner-pages.json](planner-pages.json) is a saved 10/10/9 traversal of the 29-record staged input. All 29 remain `seed_review_required` and `collection_state=not_assessed`. The existing production allowlist is byte-for-byte unchanged. Inventory exhaustion means these input bytes were paginated, not that web sources or Germany’s ecosystem were exhausted. Saved cursors are tied to exact overlay/seed bytes, batch size and the supplied revision; the planner itself does not prove those staging bytes existed in that main commit.

The read-only [graph integration audit](graph-integration-audit.json) builds a prospective graph of 670 entities, 75 startups and 63 funding events without writing it. It finds no founder/round-ID collisions, but the existing `scripts/make-graph.py` converts omitted `founded_year` fields to `0` for 19 staged profiles. Some of these years are known in separately sourced facts; omission avoids false inherited provenance. **Zero must not become a factual founding year.** The existing graph/record owners must resolve this representation before production import. This packet does not alter their shared schema, builder, API or deployment.

### Reproduce the checks

Run from the repository root on the country branch, with Node and Python available:

```sh
node research/countries/DEU/2026-11-18-batch-01/validate.mjs
node --test research/countries/DEU/2026-11-18-batch-01/packet.test.mjs
python research/countries/DEU/2026-11-18-batch-01/test_packet.py
python -m unittest discover -s tests -p test_company_profile_plan.py
python research/countries/DEU/2026-11-18-batch-01/audit_graph.py
```

To verify the frozen packet, change into its directory and run `sha256sum -c checksums.sha256`. The manifest hashes every payload file; the checksum list also hashes the manifest and excludes only itself. Git’s commit provides the outer version binding. No full application build, live crawler, release, UI verification or hosted-MCP deployment is claimed by these focused checks.

### Owner handoff and future import

1. Review and merge the country packet independently of production activation. The PR changes only this directory. Re-read latest main and other country packets before resolving entities; a later country may introduce overlapping multinational companies.
2. Resolve the graph’s omitted-year-to-zero gate through the existing graph/record owner. Preserve claim-specific founding sources. Do not add new country, alias, investor or incorporation keys to the production schema as an incidental import step.
3. For each approved company, use `records.json.startups[]` as the existing-schema proposal and `entities.json`/`claims.json` as evidence. Reconfirm canonical name, slug, official domains, existing record identity and source access at the future write revision. Use the established collection/record owner’s write path; do not overwrite or concatenate the shared overlay blindly.
4. Retain the richer staging data for fields the current schema cannot represent. Resolve investors and people before creating canonical relationships. No automatic inference from name similarity, logos, quotes or portfolio lists is authorized.
5. Treat `seed-review.csv` as a review manifest: every approval cell is blank. Only the existing source-approval workflow may amend the production allowlist. Preserve throttles and access controls. The real company packet must not be fed to #178’s synthetic replay contract.
6. Run the existing release gates only after owner-approved production changes. Record exact commit, PR, tests, merge/deploy state and readback separately in the canonical Space. This research PR is not an instruction to release or deploy MCP.

## Resumable next-source queue

[queue.json](queue.json) preserves 76 individually identified tasks, source references, null cursors and next actions; one currency task is resolved. The next pass should be selected as a bounded source slice, with a fresh checkpoint and unchanged rights/access rules.

| Priority | Next work | Explicit gap |
| --- | --- | --- |
| 1 | Review the nine named UnternehmerTUM alumni leads below | Only discovery evidence accepted so far |
| 2 | Enumerate selected HTGF, de:hub and regional provider company lists | No full directory pagination or eligible denominator |
| 3 | Expand SpinLab and Hamburg/IFB cohorts | Filtered roster and northern/eastern coverage gaps |
| 4 | Add life-science, agrifood and cybersecurity source slices | Initial batch skews toward funded software/deep tech |
| 5 | Resolve pending HQ/issuer, founder chronology and currency fields | Historical/conditional facts must not become current exact values |
| 6 | Recheck Aleph Alpha transaction completion and selected 2026 news | A definitive agreement is not proof of completion |
| 7 | Retry an accessible official IMF data representation | Exact cohort value/rank verification remains unavailable |

The nine retained discovery leads are **Orbem, DeepDrive, Reverion, Atmen, deepc, Quantum Diamonds, Fernride, TWAICE and air up**. Their candidate domains and the official alumni link that exposed each are in the queue. They are not added to the 29 accepted records and have no crawler approval.

## File map

| File | Role |
| --- | --- |
| [records.json](records.json) | 29 existing-schema company proposals; no production write |
| [entities.json](entities.json) | Uniform identity envelope plus lossless typed research and field dispositions |
| [claims.json](claims.json) | Claim-level source/date/evidence/confidence/status ledger |
| [source-registry.json](source-registry.json) | 163 retained source URLs and access outcomes |
| [funding-evidence.json](funding-evidence.json) | 39 events, 230 explicit participant observations and financing boundaries |
| [ecosystem.json](ecosystem.json) | Country/cohort, hubs, programmes and investor networks |
| [coverage.json](coverage.json) and [queue.json](queue.json) | Counts, explicit unknown denominators and continuation work |
| [baseline-identities.json](baseline-identities.json) and [deduplication.json](deduplication.json) | Pinned existing inputs and matching results |
| [projection-decisions.json](projection-decisions.json) | Source-inheritance and unsupported-field decisions |
| [review-corrections.json](review-corrections.json) and [rejected-interpretations.json](rejected-interpretations.json) | Independent-review corrections and rejected readings |
| [search-log.json](search-log.json) | Retained search/read summaries, not an exhaustive search transcript |
| [seed-review.csv](seed-review.csv) and [planner-pages.json](planner-pages.json) | Unapproved seed proposals and exact-input inventory pages |
| [validate.mjs](validate.mjs), [packet.test.mjs](packet.test.mjs), [test_packet.py](test_packet.py) | Offline schema, provenance, relationship and restart checks |
| [audit_graph.py](audit_graph.py) and [graph-integration-audit.json](graph-integration-audit.json) | Reproducible prospective graph probe and owner gate |
| [validation-results.json](validation-results.json) | Actual command results and review scope |
| [manifest.json](manifest.json) and [checksums.sha256](checksums.sha256) | Staging boundaries, input pins and payload integrity |
