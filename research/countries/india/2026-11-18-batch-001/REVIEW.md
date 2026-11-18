# Independent review and resolution log

Research review occurred on 18 November 2026 before the first India commit. Two independent research passes inspected the root/deeptech and software contributions; root integration then ran the consolidated checks. This is a recorded research review, not a claim of maintainer approval or production verification.

| Finding | Resolution |
|---|---|
| Euler website claim pointed at a filing without the website link | Retargeted to Blume's explicit company website link. |
| Ninjacart founding year had less direct source wording | Retargeted to company history explicitly stating founding in 2015. |
| DeHaat/Euler profile facts mixed assertions from different publishers | Shortened each fact to its own cited source; conflicts remain separately sourced in the ledger. |
| Ati US association combined incorporation and HQ under one SEC source | Narrowed the association to incorporation; historical HQ retains its separate company source. |
| Digantara branded CDN release lacked authenticated official linkage | Eight release-dependent observations marked candidate; event and participants excluded from accepted projections. |
| Agnikul page date was an update date | Original announcement date remains unknown; update and contextual inference remain in sidecar. |
| Deeptech event sidecar duplicated known dates as unknown aliases | Normalized aliases consistently; regression assertions compare both representations and legacy projection. |
| Sarvam description needed its specific product source | Description/sector claims retargeted to company launch announcement. |
| Sarvam identity lost founding month precision | Restored 2023-08/month, with legacy year 2023 preserved. |
| Profile-fact provenance inherited unrelated claims sharing a URL | Replaced source-only matching with direct field mappings; regression prevents funding claims from substantiating profile facts. |
| Digantara attributed 2018 fact used a conflict while map referenced a geography claim | Removed the founding observation from the legacy fact; retained explicit Indian-startup association and full founding uncertainty in the ledger. |
| Dhruva Graz base lacked its own atomic geography claim | Added a source-specific operating-location claim; no event participant inferred from it. |
| Ecosystem subtask filenames/counts did not match final packet | Corrected paths, 13-of-38 queue scope and consolidated IITM detail-page counter to one. |
| Committed graph differs from fresh source build | Retained both inventories; verified equal 46-startup ID sets, with 537 versus 555 entity counts explicitly scoped. |
| Existing graph builder maps missing founding year to zero | Documented production hold for three records; no code/schema change or invented founding date. |

Focused re-reads confirmed the Euler March/May filings, Yulu later cofounder designation and financing scope, Bellatrix's explicit USD20m and lead roles, Dhruva's aggregate/debt components, Ati historical geography, and cross-border distinctions. Whole-company current-status and full funding histories are not claimed.

All 21 projections passed the actual runtime validator. Source references, projection claim identities, event participant joins, candidate exclusion, null handling and manifest accounting were checked. Final details are in `validation-receipt.json`; raw factual provenance remains in `claim-ledger.json` and `source-registry.json`.
