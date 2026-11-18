# Independent review and corrections

Three research lanes supplied the company observations, with separate ecosystem and integration review. Reviews were read-only against their input packets; the country integrator applied corrections to the final files.

## Evidence corrections applied

- The official TWSE new-listings table supplements aetherAI and TMYTEK with the respective 20 May and 22 September 2026 **Taiwan Innovation Board** dates. Historical emerging-stock/new-listing observations remain source-specific. A later root timeout does not erase the independent successful read.
- Chunghwa Telecom's iKala release establishes an explicit USD **strict lower bound** above 20.8 million. The production record retains amount text; exact numeric amount/currency remain omitted. Its participant has both company and investor source joins. Prior investor names were not converted to participants in the new round.
- KDAN's planned February 2025 emerging-stock registration is recorded with future-tense qualification. The blocked TPEx notice is not treated as completion evidence or a current main-market listing.
- TeamT5's Series A investment year is sourced separately from its undated event announcement. No partial year is placed in `announced_on`; the 2014/2017 founding conflict remains unresolved.
- KKday's source-registry paraphrase was corrected to **March 2016** for the Japan office. Its Taiwan founding remains May 2014. Mixed investment/credit-facility financing stays approximate and currency-qualified.
- KryptoGO's English and Chinese funding headlines now have separate source-bearing profile facts. No conflicting headline was promoted to an accepted funding event.
- FunNow's group-brand name is a related-name observation rather than a legal merge alias. The planned investee spelling **FunNow Ltd.** is preserved. Hotai's planned USD 10 million contribution is not a completed round or total round amount. The final projection retains a profile fact, with the full event only in staging. A failed independent brand-story recheck is preserved separately from the earlier successful read.
- 91APP and XREX founding dates remain in separately sourced profile facts, because their top-level projection sources did not support those inherited scalar fields. Numbers Protocol's 2019 date is a **project-origin** fact, with no implied legal-company founding year.

## Structural and integration checks

Twenty current-schema records validate. Thirty-three projected public professional founder references have distinct nonempty slugs and no collision with the source-rebuilt baseline's 119 people. Company IDs, normalized names, explicit aliases and domains were checked against all 555 rebuilt baseline entities. All eighteen projected event IDs are distinct and survive the in-memory graph build; no event ID overlaps the baseline's twenty-five.

The committed graph contains 537 entities; a source rebuild yields 555. These are separate snapshot types, not inconsistent claimed live counts. The initial source revision was f4bcbf7; final validation uses ff4d51c, after the existing owner merged #179. The unknown-year defect identified during review is resolved upstream and all eleven omitted years remain absent in the final combined graph. The country PR does not include the owner's implementation changes as its own diff.

The final combined in-memory graph has 608 entities and 43 financing/investment entries. It is a validation result, not a published graph. Same-URL funding article deduplication remains a presentation limitation: Jmem Tek 3 events/1 article; JelloX 2/1; CancerFree 2/1.

The packet's deterministic validator checks claim/source joins, publication state, null/amount pairing, date precision, participant-to-event/company relationships, no canonical investor promotion, bounded counts and resumability. Ten negative probes reject missing provenance, zero placeholders, unpaired amounts, padded dates, exact treatment of lower bounds, orphan/cross-company participants, duplicate domains and stale checkpoints/cursors. Fifty existing repository tests cover planner, startup edits and graph behaviour. These checks establish shape and integration consistency; source truth still rests on the reviewed page evidence.

## Limits retained

No current country-wide denominator, completed directory pagination, direct legal-registry coverage for every company, comprehensive funding history or complete founder roster is asserted. Source IDs represent observations: repeated URLs can have different successful/blocked outcomes. Review timestamps are research checkpoints; exact source-fetch seconds are not claimed. The three held companies and one exclusion stay outside schema projections.

Owner acknowledgement, production selection, seed approval, merge and release remain pending separately from the completed research packet.
