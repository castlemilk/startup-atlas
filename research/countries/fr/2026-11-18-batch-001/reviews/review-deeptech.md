# Independent review: France deeptech contribution

## Input and review scope

Reviewed file: `/workspace/scratch/6c5b4e6b9c24/research-notes/deeptech.json`.

Initial SHA-256: `c13c9c5938b9e54b649b1b14ab325ec65a06cac016d5be8d8e0d85bdfe88317e`.

Final reviewed SHA-256: `a68967a0b8aa35bba3960f1e7f7aed8f3f2cebd154956ad4beb623fbc1fe6a0e`.

Review date: 18 November 2026 UTC. All eight dossiers received desk review. Nine primary pages were independently opened/read for the five requested risk areas and an Exotrail participation check. C12 and Latitude received desk review only; their individual source claims are not independently re-approved by this receipt.

The contributor updated the file during review. Changed fields were rechecked: the changes add `claim_id` equal to each existing `id` and correct source-count metadata to 33 claim-source URLs, 35 registry URLs and two context-only sources. After removing the added `claim_id` field, all company records are identical to the initial snapshot; no other content changed. The reviewer did not edit contributor files, production, git or Space.

## Verdict

**No material funding amount, transaction-status or founding-conflict error found in the priority checks.** The seven private-company candidates may remain staged; Pasqal's separate listed-alumnus disposition is supported. Preserve all non-exact amounts, funding-component relationships and temporal qualifications during root normalization.

One minor naming qualification is needed if the Verkor vehicle label is carried into the normalized output: its exact English fund name has not been established by the cited French text. An additional source improvement below removes an unnecessary company-only dependency for Verkor's founding date. Neither requires changing a financing amount or rejecting the company.

## Priority source decisions

| Company / risk | Reopened evidence | Review decision |
|---|---|---|
| Pasqal: announced versus completed listing | Issuer release dated 27 August 2026 says business combination completed that day, identifies Pasqal Holding SA and describes trading on 28 August as expected. Current investor FAQ states ordinary shares are listed on Nasdaq under PSQL and gives Palaiseau headquarters. | Listed-alumnus disposition supported. Keep actual first trading date unverified; do not convert the expected date to an observed trading event or the operating subsidiary's French registration to the holding issuer's jurisdiction. |
| Quandela: headline versus equity | Company release says over EUR 50m from investors, France 2030 and banking partners. Six named investors enter the company's capital; component amounts are not disclosed. | Strict lower bound and mixed-package treatment correct. Keep amount null for an exact-total field; preserve equity participant component tags and unknown public/bank instruments. |
| Verkor: package versus component funding | Bpifrance announcement distinguishes Series C estimated at least EUR 850m subject to usual approvals; EUR 600m approved bank-financing support; approximately EUR 650m subsidies conditional on Commission approval. | Existing bounds, approval states and components supported. Regional EUR 60m and EUR 30m subsidies are included within the subsidy component. No package/component double-counting or assumption of disbursement. |
| Alice & Bob: extension amount and chronology | Dated release announces NVentures investment on 22 May 2026, expanding the earlier EUR 100m Series B; financial details expressly undisclosed. Company timeline places NVentures investment in June 2026. | Extension amount/currency null and parent-round link are correct. Preserve announcement day and separate conflicting event month. Do not assign the original amount to the extension or infer an amount from cumulative totals. |
| Greenerwave: founding year | Company history says 2015; Bpifrance's company boilerplate says founded in 2016. | Null normalized founding year plus both source observations is appropriate. Do not invent an incorporation-versus-launch explanation. |

## Specific corrections and integration qualifications

### D1 — Verkor fund-vehicle wording: descriptive translation, not a verified formal name

Affected participant: `companies[slug=verkor].funding_events[0].components[0].participants[name=Macquarie Asset Management].vehicle`; claim `fr-deeptech-verkor-participant-staging-fr-funding-verkor-2023-series-c-macquarie-asset-management`.

The French announcement describes a fund dedicated to energy-transition solutions; it does not supply the exact capitalized English label `Energy Transition Solutions Fund`. Keep Macquarie Asset Management as supported lead. Treat the vehicle string as a descriptive translation, or omit the exact-name field until direct fund-name verification. Do not resolve a canonical fund entity from this wording alone. Source: [Bpifrance Verkor release](https://presse.bpifrance.fr/verkor-securise-plus-de-2-milliards-deuros-pour-construire-sa-gigafactory-en-france-et-accelerer-le-futur-de-la-mobilite-durable/?lang=fra), `turn360152165view2`, line 51.

### D2 — Verkor founding has an already-opened independent primary source

Claim `fr-deeptech-verkor-founding` can additionally cite the Bpifrance release above: its company description explicitly dates founding to July 2020 (`turn360152165view2`, line 113). This supports `2020-07` without relying solely on the company careers page marked for reuse review. The same passage supports a Grenoble base, not independently an operational-HQ designation. No change to date value/precision is required.

### D3 — Preserve already-correct entity and temporal boundaries

- Pasqal's holding issuer, former SPAC and French operating entity remain distinct. Its March private round, related convertible commitment, expected combined financing and cash at closing are not additional interchangeable funding events.
- Quandela and Verkor have valid known EUR denomination with unknown exact totals. A null exact amount does not make the lower bound or approximate component zero. Root's projection should retain these facts in staging even if production accepts fewer fields.
- Alice & Bob's March 2020 company-formation timeline and November 2021 Paris-HQ observation are directly supported. Boston is a later branch in that chronology; the 2026 release describes Paris/Boston bases. Retain the historical qualifier on the HQ claim rather than asserting unique current HQ from the dateline.
- Greenerwave's defence fund, Bpifrance manager and AID sponsor are not three separate investors. Current research correctly retains one fund relationship.
- Latitude's publisher-name variant and separate legal creation/RNE registration dates must retain their existing scope. This review did not reopen its registry record and does not authorize an automatic untyped alias merge.
- Founder executive titles remain dated source observations or announced transitions. In particular, Verkor's announced supervisory-board transition is not an independently observed effective appointment.

## Remaining companies and France inclusion

| Record | Desk and source-review result |
|---|---|
| C12 | Supplied packet distinguishes French legal entity, Paris operating context and unresolved HQ; no investor relationship is inferred from its EIC portfolio entry. Formal funding stage remains unknown. No desk-level contradiction found; source pages not reopened here. |
| Exotrail | Independently opened Bpifrance release supports EUR 54m Series B, Bpifrance lead through SPI/FID, and all ten other staged participants, including the named banks. It calls Exotrail a French company based at Massy and Toulouse. The record appropriately does not assert an exact equity/debt split or duplicate the dollar presentation. |
| Latitude | Supplied registry and company-base evidence support France inclusion with null operational HQ. The March legal-creation day and April RNE registration day remain different events; founder coverage is expressly partial. No desk-level contradiction found; sources not reopened here. |

The reopened sources independently establish France nexus for Pasqal, Quandela, Alice & Bob, Verkor, Greenerwave and Exotrail. C12 and Latitude's France inclusion was assessed from their supplied primary-source claims, not independently re-read. No national denominator or full-history coverage is implied.

## Opened source URLs and retrieval identifiers

Each page below was actually opened and relevant text read on the review date. No search-discovery snippet was accepted as proof; no fresh broad discovery was performed.

| Source | Durable URL | Web reference |
|---|---|---|
| Pasqal completed combination | https://investors.pasqal.com/news-releases/news-release-details/pasqal-and-bleichroeder-acquisition-corp-ii-complete-business | `turn385924768view0`; relevant passage `turn918910170view1`, lines 19–29 |
| Pasqal current listing/HQ FAQ | https://investors.pasqal.com/ir-resources/investor-faqs | `turn385924768view1`, lines 18–26 |
| Quandela mixed financing | https://www.quandela.com/ko/about-us/newsroom/quandela-secures-e50-million-to-support-international-expansion/ | `turn385924768view2`, lines 106–118 |
| Verkor package and components | https://presse.bpifrance.fr/verkor-securise-plus-de-2-milliards-deuros-pour-construire-sa-gigafactory-en-france-et-accelerer-le-futur-de-la-mobilite-durable/?lang=fra | `turn636063334view0`; `turn360152165view2`, lines 40–74 and 113 |
| Alice & Bob extension | https://alice-bob.com/newsroom/alice-bob-announces-series-b-extension/ | `turn636063334view1`, lines 45–48 |
| Alice & Bob chronology | https://alice-bob.com/thats-us/ | `turn809523753view0`, lines 124–151, 178–183, 217–224 |
| Greenerwave company history | https://www.greenerwave.com/about/company/ | `turn636063334view2`, lines 52 and 83 |
| Greenerwave investor release | https://presse.bpifrance.fr/greenerwave-leve-15-millions-deuros-pour-revolutionner-le-futur-de-la-connectivite/?lang=fra | `turn636063334view3`, lines 40, 61 and 108 |
| Exotrail investor release | https://presse.bpifrance.fr/exotrail-leve-54meur-en-serie-b-pour-accelerer-sa-croissance-et-industrialiser-ses-produits-de-mobilite-spatiale-a-linternational/?lang=fra | `turn360152165view0`, lines 35–47 |

## Limits

This receipt is an independent bounded evidence review, not a replacement for root-catalogue deduplication, source-rights decisions, schema validation or final production review. It neither changes crawler approval nor authorizes production publication. The contributor's seven accepted-staged candidates, one deferred listed alumnus and selected-event coverage remain the applicable counts.
