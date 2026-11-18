# Independent review: France fintech and climate contribution

## Reviewed input and scope

File: `/workspace/scratch/6c5b4e6b9c24/research-notes/fintech-climate.json`.

Initial SHA-256: `a76cc3d1df0d6afea8e9ea1c354296002dbf24fc83541594390633708050d013`.

Final SHA-256: `6e7847210bef8cdcc19a47f98f1b3958c378ad42dc868456f34fc4fbc7b14090`.

Review date: 18 November 2026 UTC. Input changed during review from the initial hash to the final hash above. The reviewer rechecked every changed field: the contributor changes add spaces/formatting to prose and do not alter accepted numeric values, source URLs, participant relationships or the Qonto issue. No contributor edits were made by this reviewer. Local initial and final snapshots are retained solely for hash/change comparison.

All eight records were read for country inclusion, founding precision, legal-entity scope, role currentness and round/participant relationships. Ten primary-source pages were independently reopened, prioritizing Pennylane, Qonto, Electra and Vestiaire Collective; follow-up reads checked geography and legal-entity wording for Swan, PayFit and Back Market. This is a bounded evidence review, not a certification of every claim or a new completeness claim. Alan's record received a desk review of the supplied claims and sources; its pages were not independently reopened in this review.

## Verdict

**One required factual qualification before promotion: Qonto's founding-versus-launch statement.** No unsupported financing amount or round participation was found in the independently checked priority announcements. All eight records have a France nexus supported in the supplied evidence; independently reopened pages corroborated France presence or a French entity for seven records. The current packet can remain staged while the root integration corrects the Qonto wording and retains the legal-entity and temporal qualifications below.

## Required correction

### R1 — Qonto: the packet over-resolves the 2016/2017 distinction

Affected paths: `companies[slug=qonto].gaps[0]`, `companies[slug=qonto].conflicts`, founding normalization, the supplied about-page source paraphrase and the Qonto next-source-queue wording. The 2017 launch claim evidence should also preserve the source’s founding heading. Existing claim `fr-qonto-founding` is explicitly supported as a 2016 founding assertion about Olinda, the legal operator; it need not be deleted.

The [company About page](https://qonto.com/en/about) labels 2017 **Founded in France**, immediately followed by launch wording. The [Olinda article](https://qonto.com/fr/blog/tendances/nouveautes/olinda) says Olinda was founded in 2016 and describes the same legal entity's 29 January 2026 rename. Therefore, the gap's categorical statement that 2017 is a launch year and not a founding year is stronger than the sources allow.

Correction: retain the 2016 legal-operator assertion and add a separately sourced 2017 brand/company founding-and-launch observation, with unresolved semantic scope. Replace the categorical gap wording with that qualification; populate the conflict record. Do not silently replace either date or infer an incorporation day. Evidence refs: `turn145275920view0` (About, lines 189–192), `turn233780073view2` (Olinda, line 345), `turn233780073view3` (rename, line 382).

## Integration constraints, not new schema requirements

### R2 — Back Market: keep Jung SAS at the demonstrated entity scope

Affected paths: `companies[slug=back-market].aliases`, `alias_records`, `incorporation`; claim `fr-back-market-aliases`.

The [legal notice](https://pro.backmarket.fr/pages/mentions-legales) identifies Jung SAS as operator on the Back Market Pro site, with a French registered office. The contributor correctly preserves that scope in `alias_records` and `incorporation.entity_scope`; its bare `aliases: ["Jung SAS"]` must not override those qualifications during projection. Keep a scoped legal-operator relationship or omit the bare alias from automatic company-name matching until entity reconciliation. No replacement source is needed. Evidence ref: `turn145275920view1`, lines 50–60 and 69.

Qonto's legal aliases differ: its opened source expressly states that Olinda/Qonto refer to the same legal entity and documents the rename. Preserve its typed legal-name history rather than flattening it into untimed brand aliases.

### R3 — Founder executive titles remain source observations

Sophie Hersan's Fashion Director title is explicitly on the undated company editorial page, but that is not evidence of uninterrupted current employment. Fanny Moizant's public first-person post explicitly confirms co-founding in 2009 and departure; it exposes only a relative timestamp. The packet correctly leaves her departure date null and marks the founder list partial. Keep the currentness uncertainty when normalizing titles, including Alan's undated leadership-page titles. PayFit's Firmin Zocchetto CEO role is explicitly historical January 2022 in the packet and must retain that effective date. No new current-CEO assertion is approved by this review.

## Confirmed priority findings

| Record | Independent source check | Disposition |
|---|---|---|
| Pennylane | Investor page explicitly lists EUR 175m in January 2026, EUR 75m Series D in April 2025, seven founders and September 2019 origins; careers page explicitly says founded 2020. | Existing separated origin/founding claims and month-only 2026 event are defensible. No stage, exact day, legal close or round participants should be inferred for the January event. |
| Qonto | Legal-operator founding 2016 and rename on 29 January 2026 are explicit; About page also calls 2017 founding and launch. | Apply R1. Legal-name history is supported; no regulatory-status assertion is approved here. |
| Electra | January 2024 company release explicitly states EUR 304m entirely in equity; PGGM Infrastructure Fund lead; Bpifrance Large Venture, Eurazeo, RIVE Private Investment, SNCF via 574 Invest, Serena participate. | Amount, instrument and six named relationships match. The near-EUR 600m cumulative amount and other general backers must remain outside this round. |
| Vestiaire Collective | Company editorial identifies Sophie Hersan as co-founder/Fashion Director; Fanny Moizant's first-person public departure statement confirms co-founding in 2009. Editorial also mentions Paris HQ. | Both founder links and France inclusion supported; currentness and partial coverage caveats retained. |
| Swan | FAQ explicitly names 2019 creation and three founders; footer expressly labels Paris headquarters and French SAS/registry. | Supported. The word headquarters is present in the source; geography is not inferred solely from a registry city. |
| PayFit | Privacy notice expressly identifies PayFit SAS, French registry and Paris headquarters, updated 10 September 2026. | Supported at the scope/date of that notice. London contact footer is a separate regional address and does not invalidate the explicit French entity/HQ statement. |
| Back Market | Back Market Pro legal notice establishes French Jung SAS operator. | France nexus supported; preserve R2 group/entity boundary. |
| Alan | Supplied investor HQ/founding source and current French legal footer are distinct in the packet; 2024 event not claimed latest. | No contradiction found in desk review; pages not reopened, so no independent source-read approval for its individual round edges. |

## Tested evidence URLs and web references

All links below were actually opened and relevant text read on the review date. No discovery snippet was used as claim proof. Ref IDs are retrieval identifiers for root follow-up; the URLs are the durable provenance targets.

| Page | URL | Retrieved reference / relevant location |
|---|---|---|
| Pennylane investors | https://www.pennylane.com/fr/investisseurs | `turn349809151view0`, lines 32–35 |
| Pennylane careers | https://www.pennylane.com/fr/careers | `turn233780073view0`, line 40 |
| Qonto legal-name article | https://qonto.com/fr/blog/tendances/nouveautes/olinda | `turn349809151view1`; relevant finds `turn233780073view2` and `turn233780073view3` |
| Qonto About | https://qonto.com/en/about | `turn145275920view0`, lines 189–192 |
| Electra 2024 equity announcement | https://www.go-electra.com/en/newsroom/electra-raises-euro304-million-of-capital-to-accelerate-the-switch-towards-electric-mobility-in-europe/ | `turn349809151view2`, lines 24–31 |
| Sophie Hersan company profile | https://us.vestiairecollective.com/journal/community-edit-sophie-hersan/ | `turn349809151view3`, line 41 |
| Fanny Moizant professional departure statement | https://www.linkedin.com/posts/fanny-moizant-40665322_after-16-years-its-time-for-me-to-say-activity-7413987665278156800-E-0M | `turn233780073view1`, lines 19–20; relative date only |
| Back Market Pro legal notice | https://pro.backmarket.fr/pages/mentions-legales | `turn145275920view1`, lines 50–60 |
| Swan FAQ | https://www.swan.io/faq | `turn145275920view2`; footer passage `turn740001975view1`, line 181 |
| PayFit privacy notice | https://payfit.com/candidates-global-privacy-notice/ | `turn145275920view3`; passage `turn740001975view3`, lines 139, 147, 153 |

## Limits and root action

No production eligibility claim, investor canonical-ID match, new crawler-seed approval or comprehensive round history is supplied by this review. Existing null legal incorporation dates, partial founder coverage and event date precision should survive normalization. Keep the source-bound assertions and conflicts even when the current production schema can only accept a smaller projection.

Root should record R1 as resolved in its normalized sidecar before validation/promotion and ensure R2/R3 qualifications survive projection. The contributor file was not edited.
