# Independent review and resolutions

This review concerns the country research/staging representation. It does not authorize production ingestion, merge, crawler access or release.

## Review performed

A separate reviewer examined the packet validator and reproduced gaps with in-memory synthetic fixtures. The requested fixes were confined to this directory and tested with 67 adversarial cases. A second reviewer inspected all 24 projected financing events' selected-source field mappings, then reviewed the eight fintech/commerce/mobility records in detail. Its final readback found no remaining financial scope or selected-source inheritance blockers in that lane.

The ecosystem reviewer separately examined institutional descriptions, programme deadlines, source denominators and geography semantics. Its corrections are reflected in normalized data, while original contributions are retained.

## Evidence and normalization corrections

| Finding | Resolution |
| --- | --- |
| Spyke's statutory “Şirket Merkezi” was treated as HQ | Moved to registered office; current global HQ is null |
| IFC last-updated dates for ikas/Tarfin were used as HQ effective dates | Retained as source-last-updated observations; effective dates null |
| Getir/Marti/Peak source dates could imply when HQ became effective | Retained as source-reported dates, not HQ establishment dates |
| iyzico note included an unverified earlier USD13m tranche | Removed from normalized narrative; accepted USD15m extension-total retained |
| Sipay note conflated company-post publication date and government source | Scope clarified; projected notes no longer inherit mixed-source narratives |
| Getir projected narrative contained a companion-source valuation | Removed; round amount and valuation remain distinct |
| iyzico historical acquisition source was labelled current parentage verification | Renamed to historical-acquisition source recheck |
| One Getir source recheck followed its original review timestamp | Root review time follows retrieval; original review timestamp retained |
| Source objects used inconsistent aliases and former-domain structures | Names/search variants and historical domain observations separated |
| An empty Marti ordinary-round list carried a reviewed-complete disposition | Changed to searched-unknown; debt facilities retain separate accepted claims |
| Colon-containing staged event IDs could not pass the existing record schema | Deterministic slug IDs mapped consistently across events and claims; originals retained |

## Validator corrections

The validator rejects unsupported event kinds in financing projections, unknown/invented stages, missing event evidence, role disagreements, undeclared claim subjects, mismatched source kinds, unregistered evidence sources, invalid closing dates, stale checkpoints and reviews preceding source retrieval. Selected-source stage, date, amount/currency, raw amount and valuation assertions are checked independently. A valid source URL alone is not sufficient evidence.

The graph builder is pinned and compared before import. The combined graph is built in memory. Its 67 startup nodes are an integration exercise, not a live publication or an assertion that unknown values survived.

## Owner fixes and remaining adoption gate

The initial builder at `f4bcbf7` turned an omitted founding year into zero for six new projections. Five have known years in separately sourced profile facts; Param's canonical founding remains unknown. That reproduction is retained in `validation/initial-packet.json`.

The final fetch incorporated the existing owner's merged [PR 179](https://github.com/castlemilk/startup-atlas/pull/179) and [PR 181](https://github.com/castlemilk/startup-atlas/pull/181). The branch fast-forwarded to `988a4dd` before its country commit; no parallel implementation change was made. Fresh graph validation preserves all six omitted years and all known years, with no identified downstream semantic blocker. `production_import_ready: false` now denotes the remaining owner-review, fresh-target and live-publication gates, not an unresolved zero-year bug. Hosted runtime deployment was not verified or performed.

## Evidence that remains incomplete

Reengen is held because the accessed Faradai policy identifies a subsidiary, not an interchangeable brand. Eight conflict claims and one founder candidate are retained without promotion to accepted facts. Numeric currency is not inferred from a dollar symbol. Portfolio membership and programme attendance do not prove a particular investment. Founder, investor, event and source lists are bounded.

No independent reviewer asserted national completeness, current private status for every company, owner acknowledgement, merged fixes or live publication. Exact executed results and checksums are in `validation/` and `SHA256SUMS`.
