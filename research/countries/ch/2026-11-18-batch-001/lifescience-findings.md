# Swiss life science company packet

Eight named company candidates were reviewed against 34 accessible primary and supporting pages. Six are recommended for the independent-company research batch. Memo Therapeutics and Araris Biotech belong in the historical ecosystem/exits packet because their acquirers confirm completed transactions.

The evidence ledger has 122 claims: 119 reviewed and staged, plus three unresolved conflicts. It contains 22 public founder identifications, eight selected financing events and 42 event-specific named participations. These are bounded observations, not exhaustive histories. No production record, crawler approval, canonical investor edge or publication was created.

## Company disposition

| Company | Canonical domain | Founded precision | Location evidence | Disposition |
| --- | --- | --- | --- | --- |
| HAYA Therapeutics | hayatx.com | 2019, year | Lausanne HQ in dated company release; Swiss street address in Epalinges | Candidate |
| Vandria | vandria.com | 2021, year | Based at EPFL Innovation Park, Lausanne | Candidate |
| Alentis Therapeutics | alentis.ch | 2019, year | Basel HQ | Candidate |
| Memo Therapeutics | memo-therapeutics.com | 2012, year | Schlieren head office | Acquired history |
| Engimmune Therapeutics | engimmune.com | August 2021, month | Allschwil company address | Candidate |
| TOLREMO therapeutics | tolremo.com | March 2017, month | Basel company address; historical Zurich HQ | Candidate |
| Araris Biotech | ararisbiotech.com | 2019, year | Au ZH company address | Acquired history |
| Scailyte | scailyte.com | 2017, year | Basel company address; historical Sursee head office | Candidate |

Each table field maps to an atomic claim and exact source in `claims.json`. Headquarters and incorporation are separate. Araris reports incorporation on 31 January 2019; registry jurisdiction and identifiers remain unsearched for all eight. US subsidiaries listed by HAYA and Memo are not aliases for their Swiss entities.

## Financing interpretation

The selected observations preserve these distinctions:

- [HAYA's Series A](https://www.hayatx.com/haya-therapeutics-raises-65-million/) is USD 65m, announced 8 May 2025; its [company timeline](https://www.hayatx.com/about/) explicitly establishes USD.
- [Vandria's second close](https://www.globenewswire.com/news-release/2024/08/21/2933277/0/en/Hevolution-Foundation-and-Dolby-Family-Ventures-join-Vandria-s-2nd-Series-A-closing-bringing-the-total-round-to-30-7M-CHF-28-3M-to-Progress-the-Mitophagy-Inducer-VNA-318-into-CNS-C.html) reports a CHF 28.3m total. It overlaps the first close and is not additional capital of that amount.
- [Alentis's Series D](https://alentis.ch/alentis-therapeutics-raises-181-4-million-in-an-oversubscribed-series-d-financing-to-advance-the-clinical-development-of-anti-claudin-1-adcs-in-solid-tumors/) is USD 181.4m, announced 12 November 2024. Transaction counsel supplies explicit currency corroboration.
- [Memo's May 2024 extension](https://memo-therapeutics.com/2024/05/07/memo-therapeutics-increase-series-c-financing-to-chf-45-million/) adds CHF 20m to a CHF 45m Series C total.
- [Engimmune's seed](https://www.prnewswire.co.uk/news-releases/engimmune-therapeutics-raises-chf-15-5-million-in-seed-financing-to-develop-novel-t-cell-receptor-therapeutics-834112774.html) reports CHF 15.5m. Reported currency equivalents are not separate funding.
- [TOLREMO's completed Series A](https://www.tolremo.com/press-releases/2018/9/23/tolremo-raises-chf-9million-fx8pb-9bj4x) totals USD 39m; the body date is September 2023 despite the URL's 2018 segments.
- [Araris's 2020 seed extension](https://www.ararisbiotech.com/docs/201022_press-release-seed-araris.pdf) adds CHF 12.7m to a CHF 15.2m total.
- [Scailyte's June 2020 pre-Series A](https://ventures.swisscom.com/scailyte-closes-pre-series-a-financing-round/) reports CHF 3.1m, with unnamed participants retained as an incompleteness flag.

Portfolio membership is never used to create event participation. Memo's earlier Series C investor list remains separate from its individually named extension investors.

## Conflicts and exclusions

Vandria's later December 2024 release gives different round totals. That observation is retained without inventing a currency conversion, new round or extra close. Engimmune's current page has a co-founder row with a mismatched displayed name and image label; no founder relation is accepted from that row. HAYA's current About page uses both CTO and CSO for Daniel Blessing; founder status is supported, current title is withheld.

[Memo's acquisition](https://www.ipsen.com/press-release/ipsen-completes-acquisition-of-memo-therapeutics-ag-adding-first-in-class-asset-to-ipsens-rare-disease-pipeline-3331074/) completed on 22 July 2026. [Taiho confirms Araris was acquired](https://www.taiho.co.jp/en/release/2026/20260428.html) in March 2025, with month precision. Neither acquisition is counted as a financing round.

## Integration and verification

Use `companies.json`, `claims.json` and `sources.json` as the evidence authority. `legacy-records.json` is a projection draft; `projection-notes.json` records inherited-source risks and preserves unsupported detail in the sidecar.

The existing enrichment validator passed with zero errors in `validation-r3.json`. `audit.json` passed source binding, entity/claim parity, event joins, unique identities, unknown/null preservation and absence of harvested contact emails. Parent validation against the current repository writer, deduplication and final review remain required.

`next-source-queue.json` contains seven resumable work items. There is no national startup denominator, and news archives, registries and investor portfolios were not exhausted. `access-log.json` distinguishes 34 unique pages from 93 open/click/find inspections, including cached source rechecks; it does not claim 93 HTTP downloads. `search-log.json` records 28 discovery queries.
