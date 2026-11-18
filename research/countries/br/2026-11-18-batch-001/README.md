# Brazil — GDP 10/30 — batch 001

**Status: validated research staging; production publication and crawler approvals remain zero.** Retrieved 18 November 2026. This country packet contains 22 reviewed company dossiers and a separate regional ecosystem report. It owns only `research/countries/br/2026-11-18-batch-001/`.

Research began against `f4bcbf7030d741772bb750deee584efa3ee17749`. The branch was fast-forwarded to main `ff4d51cf729d6a654787e9a1db63967b292df8c9` after PR #179 merged, and identity/schema/planner inputs were checked again. That concurrent change preserves missing founding years in generated graph/SQLite data. No shared implementation or production files are changed by this packet. Before publication, main advanced again to `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840` through PR #181; the branch includes that change too. All six pinned data/schema/planner input hashes are unchanged, and there is no Brazil-path overlap. The validation snapshot remains `ff4d51c`; the separate publication parent and read-only live-name checks are recorded in evidence.

The cohort label is the requested **IMF October 2026 WEO 2026 nominal GDP estimate** cohort, excluding aggregates. Exact GDP and independently recomputed rank are null because the supplied API route failed and dataset/profile routes exposed templates. The label 10/30 is retained as user-specified metadata, not independently verified statistical rank. See [ecosystem-report.md](ecosystem-report.md).

## Checkpoint counts and definitions

| Measure | Result |
| --- | ---: |
| Company leads explicitly checkpointed | 34 |
| Companies reviewed | 22 |
| Accepted into research staging | 22 |
| Companies rejected after review | 0 |
| Discovery-only directory leads deferred | 12 |
| Matches against current committed startup identities | 0 |
| Funding events reviewed | 25 |
| Events with resolved amount and currency | 23 |
| Events whose amount is held | 2 |
| Explicit participant-to-event assertions | 98 |
| Public professional founder assertions | 48 |
| Unique registered source URLs | 125 |
| Registered URLs readable / unreadable | 115 / 10 |
| Reviewed ecosystem findings | 25 |
| Prioritized ecosystem continuation routes | 15 |
| Production records written / crawler seeds approved | 0 / 0 |

“Accepted” means a sourced dossier plus a candidate projection validated against the existing record contract. It does not mean every field is known, an independent private company, a current funding history, or an accepted canonical Atlas entity. New identity IDs are `unresolved:br:<slug>`; expected future `startup:<slug>` IDs remain candidates. Conta Azul is explicitly an acquired Visma subsidiary. Dock preserves predecessor and brand history. Both remain startup-origin businesses within this research scope.

The 34 lead count covers only names explicitly recorded in this checkpoint: 22 reviewed companies and 12 BNDES observations. It excludes incidental names in search results or untraversed directories. Zero rejected companies does not imply zero conflicting claims: disputed scalar fields remain held. National eligible denominator, national coverage percentage, complete funding histories and full founder rosters are unknown.

## Reviewed companies and selected financing events

Amounts below are original stated currency units converted to millions for display only. These are selected historical events, not latest-round claims or lifetime totals. Companion sources, investor roles and uncertainty are in the machine-readable dossiers.

| Canonical company and official website | Founding history / precision | Selected financing events | Company-description evidence |
| --- | --- | --- | --- |
| [Alice](https://alice.com.br/) | 2019 | Series C, 2021, USD 127m | [h-alice-manifesto](https://alice.com.br/alice-manifesto) |
| [Asaas](https://www.asaas.com/) | 2010 project / 2013 company | Series C, 2024-10-08, BRL 820m | [fin-asaas-about](https://www.asaas.com/sobre-nos) |
| [Beep Saúde](https://beepsaude.com.br/) | 2016 | Series C-1, 2024-09-12, amount held | [h-beep-about](https://beepsaude.com.br/a-beep/) |
| [CloudWalk](https://www.cloudwalk.io/) | 2013-05 | Series B, 2021-05-11, USD 190m | [fin-cloudwalk-b](https://markets.financialcontent.com/bpas/article/bizwire-2021-5-11-cloudwalk-announces-us190m-series-b-financing-round-led-by-coatue) |
| [Conta Azul](https://contaazul.com/) | Unresolved | Funding round (stage unspecified), 2018, BRL 100m | [br-platform-conta-about](https://contaazul.com/sobre/) |
| [Cora](https://www.cora.com.br/) | 2019 | Series A, 2021-04-05, USD 26.7m; Series B, 2021-08-24, USD 116m | [fin-cora-a](https://www.cora.com.br/blog/cora-atrai-nova-rodada-de-investimentos/) |
| [Creditas](https://www.creditas.com/) | 2012 | Series F, 2022-01-25, USD 260m | [fin-creditas-f](https://www.creditas.com/ir/non-regulatory/creditas-announces-usd260-million-series-f-fundraising-round/) |
| [Cromai](https://www.cromai.com/) | 2017 | Series A extension, 2024-02, amount held | [h-cromai-about](https://www.cromai.com/a-cromai/) |
| [Dock](https://dock.tech/) | 1999 predecessor / 2018 business / 2021 brand | Growth capital, 2022-05-12, USD 110m | [fin-dock-growth](https://dock.tech/en/fluid/blog/press_releases/dock-raises-US$110-million-and-increases-its-valuation-to-over-US$15-billion/) |
| [EBANX](https://business.ebanx.com/) | 2012 | Funding round (stage unspecified), 2021-06-15, USD 400m | [br-platform-ebanx-ten-years](https://business.ebanx.com/en/press-room/press-releases/ebanx-celebrates-10-year-anniversary-with-nearly-one-billion-total-payments-processed) |
| [Loft](https://loft.com.br/) | 2018-08-01 | Series D extension, 2021-04-22, USD 100m | [br-platform-loft-history](https://portal.loft.com.br/loft-tecnologia-com-metodo-para-transformar-um-mercado-que-move-vidas/) |
| [Loggi](https://www.loggi.com/) | 2013 | Series F, 2021-02-28, BRL 1150m | [br-platform-loggi-about](https://www.loggi.com/conheca-a-loggi/) |
| [MadeiraMadeira](https://www.madeiramadeira.com.br/) | 2009 | Series E, 2021-01-07, USD 190m | [br-platform-madeira-group](https://www.madeiramadeira.com.br/landing/grupo-madeiramadeira) |
| [Mombak](https://www.mombak.com/) | 2021 | Series A, 2025-04-29, USD 30m | [h-mombak-counsel](https://www.gunder.com/en/news-insights/client-news/brazilian-carbon-capture-company-mombak-announces-dollar30m-financing) |
| [Nilo Saúde](https://www.nilosaude.com.br/) | 2020 | Series A, 2022-01-28, BRL 55m | [h-nilo-home](https://www.nilosaude.com.br/) |
| [Nomad](https://www.nomadglobal.com/) | 2019 | Series B, 2023-08-22, USD 61m | [fin-nomad-about](https://www.nomadglobal.com/quem-somos) |
| [Olist](https://olist.com/) | 2015 | Series C, 2019, BRL 190m | [br-platform-olist-faq](https://olist.com/faq/) |
| [Omie](https://www.omie.com.br/) | 2013 | Series C, 2021-08, BRL 580m; Series D, 2025-09-11, USD 150m | [br-platform-omie-about](https://www.omie.com.br/quem-somos/) |
| [QI Tech](https://qitech.com.br/) | 2018 | Series B, 2023-10-31, USD 200m; Series B extension, 2025-07, USD 63m | [fin-qi-ga](https://www.generalatlantic.com/media-article/licensed-fintech-qi-tech-raises-200m-series-b-led-by-general-atlantic-with-participation-from-across-capital/) |
| [QuintoAndar](https://www.quintoandar.com.br/) | Unresolved | Series C, 2018-11-27, BRL 250m | [br-platform-quinto-about](https://www.quintoandar.com.br/newsroom/sobre/) |
| [RecargaPay](https://recargapay.com.br/) | 2010 | Series C, 2021-02-24, USD 70m | [fin-recarga-c-en](https://blog.recargapay.com.br/brazilian-fintech-recargapay-raises-70m-series-c-round/) |
| [Solinftec](https://www.solinftec.com/) | 2007 | Growth investment, 2022-05-02, USD 60m | [h-solinftec-about](https://www.solinftec.com/en-us/about/) |

## Material evidence decisions

- **HQ, offices and incorporation:** Creditas has sourced São Paulo group HQ and a Cayman holding-company incorporation dated 30 March 2015; those are distinct entities/facts. Solinftec lists Brazilian HQ in Araçatuba and US HQ in West Lafayette. Other operating-entity seats and offices do not become global HQ or incorporation claims. Unknown jurisdictions and legal dates stay null with reasons in dossiers, and absent in the strict projection.
- **Founding dates:** QuintoAndar's 2012/2013 and Conta Azul's 2007/2011/2012 histories remain unresolved. Dock's 1999 predecessor, 2018 business and 2021 rebrand are preserved. Asaas's 2010 project is distinct from 2013 company formation. Exact, month and year founding facts retain their precision; a supported year scalar is emitted only when its enclosing top-level source supports it.
- **Date precision:** QI Tech's July 2025 extension has month precision because the company newsroom and wire differ by a day. Alice's 2021 Series C has year precision because page metadata and the founder letter conflict. No partial funding date is padded to January 1 or the first of a month.
- **Disputed amounts:** Beep's investor release gives $16.6m in the heading and $15m in the body; amount and currency are held. Cromai's BRL 12m wording has ambiguous contribution-versus-extension scope, while another report gives BRL 17m for the extension; BRL 30m is cumulative. Its accepted incremental amount remains null.
- **Transaction boundaries:** EBANX records USD 400m and excludes a USD 30m future IPO commitment. Loft records the incremental USD 100m extension, not the combined USD 525m Series D. Omie's USD 150m 2025 transaction includes secondary sales; primary-company proceeds are unknown. Solinftec's USD 60m event is convertible debt. Mombak's USD 100m project fund is excluded from its USD 30m company financing.
- **Founder and investor identities:** Historical founders remain present even when a later profile lists fewer people. Role dates are historical or observed-on dates, never silently current. Portfolio membership alone never creates a round participant. All 98 event participant assertions retain event-specific sources, stated roles and unresolved canonical investor IDs. Circularis is excluded from Solinftec's reviewed event because the release calls it an existing investor, without asserting participation in that round.
- **Publication semantics:** Single-source production records retain companion evidence URLs in funding notes where dates, currencies or other fields rely on another source. Explicit article entries preserve source publication dates separately from funding announcement dates, overriding the existing synthetic-article fallback. Typed participants stay in a research sidecar because the current runtime record contract does not support them. No schema extension is proposed.

Exact evidence URLs and retrieval dates are retained per claim in [claims.json](claims.json), per field in [dossiers.json](dossiers.json), and in [source-registry.json](source-registry.json). Company-support sources were reopened with actual timezone-aware web-tool completion timestamps. Some ecosystem observations retain honest day-level retrieval precision. Tool completion is not an assertion of an uncached HTTP fetch instant.

## Files

| File | Purpose |
| --- | --- |
| [ecosystem-report.md](ecosystem-report.md) | Hubs, sectors, public programmes, accelerators, investors, denominators and regional sampling strategy |
| [ecosystem.json](ecosystem.json) | 25 structured ecosystem findings, access log and original ecosystem checkpoint |
| [dossiers.json](dossiers.json) | All 22 company identities, aliases, scoped geography, dates, founders, events, conflicts and null reasons |
| [source-registry.json](source-registry.json) | 125 exact source URLs, source kind, access outcome, retrieval/publication metadata and caveats |
| [startup-records.staged.json](startup-records.staged.json) | Existing-schema candidate overlay; no production file replacement |
| [claims.json](claims.json) | Atomic reviewed/disposition ledger with provisional identities and no publication claims |
| [event-participants.json](event-participants.json) | 98 explicit funding-event relationships, all pending canonical investor resolution |
| [projection-map.json](projection-map.json) | Projected factual fields mapped to claim IDs; research-only semantics remain separate |
| [manifest.json](manifest.json) | Counts, base revision, ownership, definitions, holds and denominator nulls |
| [next-source-queue.json](next-source-queue.json) | 15 prioritized source routes, pagination boundaries, 12 discovery-only leads and company follow-ups |
| [research-queries.json](research-queries.json) | Recorded discovery query logs and disclosed log/coverage gaps |
| [evidence/](evidence/) | Initial/final inventory, dedup baseline, independent audits and actual validation receipts |
| [validate.mjs](validate.mjs), [packet.test.mjs](packet.test.mjs), [test_planner.py](test_planner.py), [test_graph_projection.py](test_graph_projection.py) | Offline schema/provenance, semantic safeguards, existing-planner resumability and graph/SQLite checks |
| [SHA256SUMS](SHA256SUMS) | Content checksums for all packet files except the checksum file itself |

The files are research data contracts local to this packet. They do not add fields to the production API. The synthetic-only investor contract is not populated with real company data.

## Verification

**Completed: 24 tests passed (12 packet, 6 planner, 6 graph/SQLite), 22 whole-record validations and 529 ledger-entry validations.** Exact commands, timestamps and input hashes are recorded in [validation.json](validation.json) and its linked receipts.

Run from the repository root on the stated base or a reviewed descendant. The validator deliberately fails when pinned production input bytes change; refresh dedup evidence before declaring compatibility with a newer snapshot.

```bash
node research/countries/br/2026-11-18-batch-001/validate.mjs
node --test research/countries/br/2026-11-18-batch-001/packet.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 research/countries/br/2026-11-18-batch-001/test_planner.py -v
PYTHONDONTWRITEBYTECODE=1 python3 research/countries/br/2026-11-18-batch-001/test_graph_projection.py -v
```

The JavaScript regression suite tests schema validation, Unicode/host normalization, aliases and existing-domain collisions, missing/null amounts, date precision, inaccessible/discovery sources, provenance mapping, event-specific participants, transaction scopes, acquired-company status and geographic/founding distinctions. The planner tests reuse `scripts/plan_company_profiles.py`: 22 exact names page as 7/7/7/1, with no overlap, reproducible resume, stale-cursor rejection after input/revision/limit changes, zero approved seeds and no network or production-file mutation. Input exhaustion describes these 22 supplied records only. Temporary graph/SQLite integration checks verify that omitted founding years stay absent, round values/notes survive, article publication dates stay distinct, and staged participant assertions do not become production edges.

The current enrichment skill's `enrichment.py validate` also checks the company ledger. The packet carries its actual receipt without copying the skill into this repository. Structural validation does not replace source review; separate independent source and integration audits are included.

Verify transferred content from inside this packet directory:

```bash
sha256sum -c SHA256SUMS
```

## Integration and ownership handoff

1. Review this country's PR and the exact files under this directory. Retain the [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [record-contract owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51) and [planner #177](https://github.com/castlemilk/startup-atlas/pull/177). Acknowledgement remains pending until an owner responds.
2. Before an import, fetch current main and current live Atlas revision. Re-run exact-name, alias, canonical-host and candidate-ID matching against the then-current startup overlay and generated graph. This checkpoint compared 45 overlay rows and 46 committed graph startups; it found zero matches. The committed graph's 537 entities and 17 rounds are not live-build counts. Preserve concurrent country work and flag ambiguous identities for review.
3. Resolve any admission questions about acquired/startup-origin companies and any held fields. Use `projection-map.json` and the exact claim URLs to review evidence. Keep unknown values absent; never promote a directory link to a canonical company domain.
4. Treat `startup-records.staged.json` as **candidate additions**, not a replacement for `data/startup-research.json`. The existing edit-only proposal API must not be assumed to create new entities. The collection owner should select the established add-record path, apply additions on a fresh branch, and re-run current schema/graph tests. This PR itself does not import data.
5. Resolve investor/fund/vehicle identities separately with the record-contract owner. The participant sidecar is not a production graph or approved schema. Do not infer missing leads, investor amounts or complete participant sets; distinguish two SoftBank funds when the source does.
6. Crawler approval remains an independent review. The production seed CSV, allowlists, throttles and access controls stay unchanged. A directory page or source discovered in research does not authorize collection. Use #177's existing planner and preserve its exact source-name boundaries.
7. Existing owners decide merge/release and live readback. No deployment, MCP publication or runtime schema change is authorized by this packet. Record the merge SHA, release revision and actual readback separately from this staged PR in the [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).

## Next bounded continuation

Start with the 12 BNDES directory observations and priority-1 operator routes: Porto Digital, COPPE/UFRJ, San Pedro Valley, Unicamp, Corredores Digitais, Jornada Amazônia and InovAtiva. Verify official identity and geographic eligibility before accepting a company. BNDES displays 398 results, but only 12 cards precede the untraversed load-more boundary; 398 is not an eligible denominator.

Then review selected monashees, Kaszek, Canary, Latitud and WOW sources, retaining country, active/exit and cohort filters. Their accessible extracts do not establish complete portfolios. Source failures include an IMF API route, dynamic or empty directories, a Gênesis 502, QI Tech's historical 404 and Mombak's blocked homepage. Olist's old funding URL redirects to a generic blog, and an Omie funding link redirects to an unrelated acquisition article; those routes supply no accepted historical detail.

Company follow-ups include later funding for Creditas, CloudWalk and Alice; QI Tech's April 2024 extension and July day conflict; RecargaPay's IDB extension/debt distinction; legal entity and HQ gaps; and current ownership/status refreshes. No latest-round or exhaustive-history assertion is made for the 22 dossiers.
