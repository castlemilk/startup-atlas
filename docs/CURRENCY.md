# Currency normalisation

Amounts in the crawl and catalogue mix currencies freely — A$, US$, bare `$`,
€, £, ¥ — so they cannot be compared or totalled as written. This document
records the decisions behind `scripts/currency.py`, the single place that
understands money in this repo.

## Base currency: USD

USD is the standard reporting currency. It is the global VC lingua franca,
and most fund announcements already quote a USD equivalent alongside the
local figure. No other base was a serious contender: the catalogue is global,
its readers compare funds across regions, and AUD (the largest single
source currency) would still leave most of the world unconverted.

## The original is never overwritten

Every converted amount keeps its original figure and currency next to the
USD figure, plus the FX rate used, the rate date and the rate source. A
reviewed description keeps the original wording — for example,
"Fund VI closed Aug 2026 at A$1.05B (~US$695M)" — and the structured
`amounts` record on a partner entry carries the same facts in machine form:

```json
{"original": "A$1.05B", "currency": "AUD", "value": 1050000000,
 "qualifier": null, "assumption": null, "usd": 695000000,
 "usd_display": "US$695M", "rate": 0.662, "rate_date": "2026-11-21",
 "rate_source": "fallback-table", "status": "converted"}
```

## Ambiguity rules

| Situation | Rule |
|---|---|
| Explicit marker (`A$`, `US$`, `€`, `£`, `¥`, `USD`, `EUR`, …) | That currency. No guessing. |
| Bare `$` with a known HQ country | Resolved from the country — AU → AUD, NZ → NZD, SG → SGD, CA → CAD, US → USD — and recorded as `status: assumed` with the assumption written on the record. |
| Bare `$` with no context | `status: ambiguous`, left unconverted. Never guessed silently. |
| Qualifiers (`~`, `about`, `over`, `up to`, …) | Preserved as `qualifier`: `approximate`, `minimum` or `maximum`. The USD figure inherits it. |
| Ranges (`$250K–$5M`, `between $250K and $5M`) | Kept as a low/high pair; both ends converted. |
| Magnitudes (`K`, `M`, `B`, `thousand`, `million`, `billion`) | Normalised to units. |
| Currency known, no rate available | `status: unconverted`, no USD figure. |
| No amount in the text | `status: unparsed`. |

The crawl itself does not yet know a page's HQ country, so bare `$` in crawl
output stays `ambiguous` until a reviewer supplies context. Threading HQ
country (from the partner profile or Wikidata) into the crawler is a
follow-up; the normaliser already accepts it as `context_country`.

## FX rates: live first, committed fallback, always stamped

- **Live:** Frankfurter (`https://api.frankfurter.dev/v1/latest?base=USD`,
  with `api.frankfurter.app` as a second attempt) — free, no key, ECB
  reference rates. Fetched at most once per crawl process (5s timeout).
- **Fallback:** the committed table `data/fx-rates.json`, stamped with its
  date (currently 2026-11-21 mid-market reference rates). Used whenever the
  live fetch fails — including local runs on this VM, where crawled hosts are
  DNS-blocked. Update the date and the rates together when refreshing the
  snapshot; never silently reuse a stale table.
- Every normalised amount records `rate`, `rate_date` and `rate_source`
  (`frankfurter-live` or `fallback-table`), so any USD figure can be traced
  back to the rate that produced it. Rates are never fetched per mention and
  a rates failure never fails a crawl.

## Where it is wired in

- **Crawl:** `extract_amount_mentions()` in `scripts/crawl.py` adds a
  `normalised` record to every amount mention (partners, news and captures
  modes share that function). The raw `mention` string is kept verbatim.
- **Review / validate:** `atlas_validate_partner` / `atlas_upsert_partner`
  accept an optional `amounts` array on the partner record (see
  `backend/mcp/partners.mjs` for the validation rules). Build the array with
  `python3 scripts/currency.py "A$1.05B" --country AU`, which prints the
  normalised records as JSON. Amounts in a reviewed description should still
  carry the USD equivalent in parentheses, e.g. `A$1.05B (~US$695M)`.
- **Not yet covered:** opportunity `value` fields in `data/catalogue.json`
  ("US$1,000 to start") stay free text for now; the same normaliser can be
  applied when those are next reviewed.

## Tests

`tests/test_currency.py` pins its rates (no network) and covers parsing,
ambiguity, ranges, qualifiers, conversion maths, the fallback table and the
live-fetch path (mocked). It also checks the real crawled examples from the
21 Nov 2026 batch — Blackbird A$1.05B, Partech €300M, USV $900M — against
pinned rates.
