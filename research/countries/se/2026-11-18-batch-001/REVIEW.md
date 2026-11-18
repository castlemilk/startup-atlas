# Independent review and resolutions

Three parallel research lanes prepared company evidence; the root assembled the country projection. Separate read-only reviews examined the root fintech/ecosystem evidence and the resulting production-schema projection. These reviews are source checks and data-contract checks, not owner approval for production adoption.

## Corrections applied before publication

| Finding | Resolution |
| --- | --- |
| Vinnova condition wording was too broad | Qualified dividends to the latest financial year; employees to annual FTE; age to Bolagsverket registration; turnover/balance sheet to latest financial year and applicable group scope. |
| Brite privacy notice update date was treated as effective/publication date | Set those dates to null and retained 8 January 2026 explicitly as document-update metadata. |
| Syre USD normalization depended on another source | Legacy event retains its original dollar-text observation; the explicit USD corroboration has its own sourced profile fact and ledger mapping. |
| Syre corroborating source had month-only event precision | Currency fact now says May 2024 with month precision; exact announcement day appears only with the original announcement source. |
| Mynt/Visa disclosure could appear backdated | One December2024 financing event; independently sourced Visa fact uses its April2025 disclosure and links to the prior round without inventing the original day from that later source. |
| Tandem and Mentimeter alternative currency observations appeared under the original event's source | Removed cross-source amounts from those event notes and added separate sourced facts; no FX or duplicate-round inference. |
| Text-projected debt/mixed/conditional events were also counted as wholly research-only | Made distinct claim categories disjoint; typed limitations are recorded within mapped text entries. |
| Bare dollar amounts lacked explicit ISO currency | Numeric amounts/currencies are null in research events and omitted from legacy rows; symbols/numbers remain in text. |
| Alight historical source paths failed | Preserved failed attempts; used the company's currently linked canonical article for accepted claims. |
| Founding-year sentinel in initial main | Existing owner merged #179 while research continued. Adopted refreshed main and verified unknown-year omission; no duplicate implementation. |
| Funding-source inheritance guard changed upstream | Adopted owner-merged #181 and retained existing update semantics; this packet introduces only new staged identities. |

## Independent checks confirmed

The reviewed 19 projections pass the actual repository validator. The in-memory merge preserves pre-existing entities, edges, rounds and articles and introduces no founder slug collisions. All 176 participant observations refer to an existing researched event for the same company. No adviser, portfolio listing or fund manager is silently converted to an investor edge.

The source review confirmed the bounded SSE cohort, SISP's programme-only statistical scope, Energy Agency programme conditions, KTH/SmiLe support models, Brite's explicit USD evidence, Mynt's Swedish legal identity and same-event Visa update, Capitainer's conditional investment, and the important Voi/Alight financing distinctions. Source-level decisions and narrower independent-review scope remain visible in the claim ledger and projection notes.

## Remaining owner decisions

Review held company geography/legal continuity, current private/independent status where unknown, unresolved incorporation and founder/date conflicts, unnormalized currencies, full financing histories, and canonical investor identities. The full set of field dispositions is in `decisions.json`; the 48-item queue gives the next source/action. No owner acknowledgement, merger completion, registry fact or publication state is presumed.
