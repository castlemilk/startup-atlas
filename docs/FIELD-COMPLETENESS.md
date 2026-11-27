# Field completeness and freshness

Generated 2026-11-27 from revision 171d28f by `npm run report:field-completeness` (scripts/field-completeness-report.mjs). Do not edit by hand.

Field-level completeness for #89 (OPS-01): per reviewed entity kind, the share of records carrying each field, counted against the records in the reviewed files (observed denominators). Freshness buckets each record's review stamp by age at the report date: fresh ≤ 7 days, recent 8–30 days, stale > 30 days.

## Startups (startup-research.json)

Records: 55

Freshness: 55 fresh, 0 recent, 0 stale, 0 undated.

| Field | Present | Total | % |
| --- | ---: | ---: | ---: |
| description | 55 | 55 | 100 |
| website | 54 | 55 | 98.2 |
| founded_year | 25 | 55 | 45.5 |
| hq_city | 51 | 55 | 92.7 |
| hq_country | 51 | 55 | 92.7 |
| source | 55 | 55 | 100 |
| founders (≥1) | 54 | 55 | 98.2 |
| funding_rounds (≥1) | 53 | 55 | 96.4 |
| profile_facts (≥1) | 55 | 55 | 100 |
| articles (≥1) | 33 | 55 | 60 |

## Founders (across startups)

Records: 123

| Field | Present | Total | % |
| --- | ---: | ---: | ---: |
| linkedin | 83 | 123 | 67.5 |
| photo_url | 67 | 123 | 54.5 |
| blurb | 123 | 123 | 100 |
| socials (≥1) | 117 | 123 | 95.1 |
| source | 123 | 123 | 100 |

## Partners (partners-reviewed.json)

Records: 207

Freshness: 207 fresh, 0 recent, 0 stale, 0 undated.

| Field | Present | Total | % |
| --- | ---: | ---: | ---: |
| description | 207 | 207 | 100 |
| website | 207 | 207 | 100 |
| source | 207 | 207 | 100 |
| aliases (≥1) | 51 | 207 | 24.6 |

## Partner-profile people (partner-profiles.json)

Records: 22

| Field | Present | Total | % |
| --- | ---: | ---: | ---: |
| role | 22 | 22 | 100 |
| source | 22 | 22 | 100 |
| photo | 10 | 22 | 45.5 |
| linkedin | 4 | 22 | 18.2 |

## Partner-profile companies (partner-profiles.json)

Records: 46

| Field | Present | Total | % |
| --- | ---: | ---: | ---: |
| source | 46 | 46 | 100 |
| logo | 11 | 46 | 23.9 |
| logo_source | 11 | 46 | 23.9 |

## Partner profiles (freshness by checked)

Records: 11

Freshness: 11 fresh, 0 recent, 0 stale, 0 undated.

| Field | Present | Total | % |
| --- | ---: | ---: | ---: |
| people (≥1) | 11 | 11 | 100 |
| companies (≥1) | 9 | 11 | 81.8 |
| geography | 11 | 11 | 100 |
| type | 11 | 11 | 100 |
