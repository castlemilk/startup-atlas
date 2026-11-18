# India: ecosystem research for GDP 6/30, first bounded packet

Research date: 18 November 2026. Source access occurred within the observed UTC interval 09:40:39–09:43:18. This is a staged research contribution, not a production update, crawler run or crawler-seed approval. The parent inspected repository main `f4bcbf7030d741772bb750deee584efa3ee17749` before delegation. Collection implementation and source-approval ownership remain with the existing collection owner and planner #177.

## Population and cohort boundaries

India's startup ecosystem should be researched as overlapping populations: DPIIT-recognised entities, incubator residents and alumni, investor portfolios, programme awardees, and independently verified companies. These sets are neither disjoint nor interchangeable.

The [PIB note published 9 November 2026](https://www.pib.gov.in/PressNoteDetails.aspx?ModuleId=3&NoteId=160746&id=160746&lang=1&reg=5) reports **more than 262,000 DPIIT-recognised startups as of November 2026**. That is an administrative, date-scoped lower bound. It is not a verified count of all operating Indian startups and does not supply a public company-by-company enumeration for this batch. The **all-startup denominator remains unknown**.

The GDP cohort definition is the user's IMF October 2026 WEO / nominal 2026 GDP estimate convention. The specified [NGDPD API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) returned a disabled-fetch error; [WEO metadata](https://www.imf.org/external/datamapper/datasets/WEO) and the India profile rendered shells. Search discovery mentioned the October edition and a rounded India value, but this subtask did not accept an exact GDP value or independently recompute rank 6. An edition-pinned accessible official export is the remaining cohort-verification gate.

## Where to focus regional coverage

The [17 April 2026 government release](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2253019&lang=1&reg=1) supplies comparable state recognition counts as of **31 March 2026**. These are state/territory counts, not metropolitan startup counts.

| State / territory | Recognised startups reported, lower bound |
|---|---:|
| Maharashtra | 38,660+ |
| Karnataka | 22,600+ |
| Uttar Pradesh | 21,960+ |
| Delhi | 21,120+ |
| Gujarat | 19,270+ |
| Tamil Nadu | 14,830+ |
| Telangana | 12,520+ |
| Haryana | 11,620+ |
| Kerala | 8,620+ |
| Rajasthan | 8,100+ |

The following institutional routes give a defensible starting map. They are research priorities derived from official institutional scope, not a statistical ranking of city sector shares.

| Hub / regional route | Evidence-backed institutional anchor | Research emphasis |
|---|---|---|
| Bengaluru | [C-CAMP](https://www.ccamp.res.in/), part of the Bangalore Life Science Cluster | Biotechnology, diagnostics, medtech, agritech and research commercialisation |
| Chennai | [IIT Madras Research Park directory](https://respark.iitm.ac.in/startup-directory) | Space, semiconductors, robotics, industrial technology and healthcare |
| Hyderabad | [T-Hub](https://www.t-hub.co/startups) | AI, enterprise software, life sciences, mobility, space and semiconductors |
| Mumbai / IIT Bombay | [DST PRAYAS 2.0](https://nidhi.dst.gov.in/prayas2-0/) identifies SINE as its programme management unit | Prototype and deep-technology translation; separately verify individual incubatees |
| Ahmedabad / Gujarat | [IIMA Ventures](https://ahmedabad.iimaventures.com/) and [iCreate](https://icreate.org.in/about-us/) | Early-stage company formation and hardware, EV, energy and industrial innovation |
| Kerala statewide | [Kerala Startup Mission](https://www.startupmission.kerala.gov.in/about) | State-supported technology and incubation cohorts beyond the largest metros |
| Tamil Nadu regional nodes | [iTNT Hub](https://itnthub.tn.gov.in/aboutus.html) names Trichy, Madurai and Coimbatore | Emerging technology and research-to-market ventures outside Chennai |
| Delhi NCR | FITT IIT Delhi remains a next-source priority | Current-directory request returned 502 and legacy incubation page timed out; snippets are not reviewed claims |

T-Hub explicitly accepts international association. Accel Atoms also accepts Indian-origin founders living abroad. A company appearing in either network therefore does not establish Indian headquarters, incorporation or founder nationality. Use separately sourced legal-entity and operating-location claims.

## Public programmes and the relationships they can support

| Programme / system | Verified mechanism | Atlas modelling implication |
|---|---|---|
| [Startup India / FFS / SISFS](https://www.pib.gov.in/PressNoteDetails.aspx?ModuleId=3&NoteId=160746&id=160746&lang=1&reg=5) | FFS capital flows through AIFs; SISFS support flows through incubators. Investor Connect is a matching portal. | An AIF commitment, incubator allocation and startup award are different transactions. None alone establishes a company funding round. |
| [NIDHI–PRAYAS 2.0](https://nidhi.dst.gov.in/prayas2-0/) | Prototype support through ordinary and advanced PRAYAS centres, with stated ceilings of INR 20 lakh and INR 40 lakh. | Record programme version and grant/support type. Actual award amount remains null without an award-specific source. |
| [BIRAC BIG](https://birac.nic.in/big.php) | Biotechnology proof-of-concept grant support up to INR 50 lakh for up to 18 months; named call awardee lists are linked. | A grant should not become a venture round. A programme maximum is not the amount received by an awardee. |
| [Atal Incubation Centres](https://www.aim.gov.in/atal-incubation-centres.php) | Infrastructure, mentoring, planning, access to capital and industry relationships through an incubator network. | Institutional support and an investment must remain separate relationships. |

**Version and freshness findings:** the [original PRAYAS page](https://nidhi.dst.gov.in/schemes-programmes/nidhiprayas/) still describes a INR 10 lakh maximum, whereas PRAYAS 2.0 describes different limits. Preserve the historical source and version; do not silently blend terms. AIC's page has an older update label, so programme-directory discovery is supported while current benefit eligibility needs a separate check. No application was submitted and no open application window is assumed.

## Private capital and accelerator discovery

[Blume's portfolio](https://blume.vc/startups) is particularly useful for bounded sector/location research: it distinguishes founding years from partnership years and has active/exited and India/overseas filters. Preserve those distinctions. Its taxonomy includes overlapping labels, so normalize categories locally without treating text-label equality as a company identity match.

[Accel Atoms](https://atoms.accel.com/faqs) provides a route into early AI and other technology ventures but explicitly includes the diaspora. [Peak XV Surge](https://surge.peakxv.com/how-we-invest) provides a broader seed network and explicitly allows co-investors. Surge's page still identifies September 2026 as its next cohort; that phrase is stale at retrieval and is not evidence of a future intake. Neither programme's generic funding range proves a specific participant's financing.

[Indian Angel Network's portfolio](https://www.indianangelnetwork.com/portfolios) is another discovery route, but the rendered page is largely logo labels. Resolve each selected label to an official company domain before acceptance. No round date, amount, investor role or legal fund identity should be inferred from that page.

## Measurable next-source queue

The current [IITM directory](https://respark.iitm.ac.in/startup-directory) reported **213 companies**, with only **10** displayed in the retrieved default page and a load-more state. That is a useful source-specific denominator candidate; it has not been independently counted. The [IIT Madras release of 27 April 2026](https://www.iitm.ac.in/happenings/press-releases-and-coverages/iit-madras-achieves-startup-shatam-second-year-row-and) reports **567 cumulative incubations**, including listed/acquired companies. The different values describe different populations and dates; they are not automatically conflicting counts.

The visible IITM discovery leads were Agnikul Cosmos, CeraTattva InnoTech, Daloft Aerospace, Detect Technologies, The ePlane Company, Folium Sensing, Inbound Aerospace, InCore Semiconductors, Mindgrove Technologies and Vaan Megam Networks. This ecosystem subtask reviewed no company detail pages and accepted no company records. The parent can merge these leads into its company queue and deduplicate against its own research.

Next bounded sequence:

1. Review a selected IITM subset against company sites and primary financing announcements; establish the permitted load-more/pagination path before claiming directory exhaustion.
2. Select an India-focused Blume sector/location subset; resolve company domain, legal identity, founder evidence and dated funding separately.
3. Review one named BIRAC BIG awardee call, recording its actual cohort denominator and distinguishing grants from equity.
4. Inspect C-CAMP, Kerala and iTNT public cohorts to expand biotech and non-metro coverage.
5. Revisit FITT's unavailable directory in a later bounded window and add Ahmedabad/Gujarat hardware cohorts.

The ecosystem contribution supplies 13 of the consolidated machine-readable queue’s 38 tasks, with null denominators where no defensible one was observed. Every task remains unapproved for crawler seeding. No pagination token was fabricated.

## Evidence quality and coverage receipt

This contribution contains **15 core sources**, **7 supplementary contextual sources**, and **8 explicit unavailable/insufficient-content probes**. Those are unique registered URLs, not every search hit or every HTTP request. Twenty-two source URLs yielded supporting content; eight did not. Failed access does not establish absence of a company or programme.

The [Hindi October PIB release](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2328917&lang=2&reg=48) was read and agrees with its English counterpart on the reported recognition and programme counts. It is a translation of the same institutional assertion, not independent corroboration. The BIRAC Hindi homepage was also inspected; its mixed historical counters were excluded from numerical claims.

`source-registry.json` retains source titles, publishers, dates or explicit nulls, source URLs, retrieval date/window, access outcomes, source references and caveats. `ecosystem-observations.json` preserves scoped observations. `next-source-queue.json` preserves the consolidated next actions and gaps. The deeptech subtask reviewed the Agnikul IITM profile; the other nine visible directory leads remain queued. The numeric API cohort check, current FITT directory, SISFS detail page, SINE ACE rendered content, directory pagination and unreviewed company identities remain open. Nothing here asserts completeness of India's startup population.
