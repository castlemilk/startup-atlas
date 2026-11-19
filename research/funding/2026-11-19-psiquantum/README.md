# Early investment evidence review

This packet stages PsiQuantum’s early financing evidence against Atlas revision `40a0bd78b03d68f4f4d35806f4f2b2a27f315979`. It covers one saved SEC filing and five attributed observations from four public sources. The population of relevant filings and investments remains unknown.

```sh
python3 scripts/stage_early_investments.py \
  --manifest research/funding/2026-11-19-psiquantum/manifest.json \
  > /tmp/atlas-psiquantum-early-investments.json
```

## Input and output

- Resolve the legal entities first. The manifest records exact registry IDs, reviewed names and aliases, jurisdictions, permitted roles and identity evidence. A filing needs a matching primary CIK and registry name or alias. The archive CIK must agree. A name-only match supplies a lead. Co-issued and pooled fund offerings, declared vehicles and uncertain issuers stay outside the operating company's offering group.
- Save each source beside the manifest and bind its original saved bytes with SHA-256. Use `sec_form_d_xml` for saved SEC primary XML and `sec_form_d_json` for saved structured records or reviewed excerpts. Record the acquisition type and day, exact URL and catalogue revision. SEC entries also require the accession, filing day and matching official filing index. An excerpt's digest identifies the saved excerpt. The original XML needs its own digest when acquired.
- Use `round_observations_json` for saved investor, founder, interview or institutional evidence. Each item carries its source-stated stage and participants when available, its review state and a note. Dates preserve year, month or day precision. The issuer offering and attributed observations remain separate review entries.
- Keep the filed instrument, first sale and filing day distinct from announcement and closing dates. The report preserves offered and sold separately. An XML amount without a currency field retains unknown currency. The report identifies the last statement in a single saved amendment chain by accession. Missing, cyclic or conflicting branches stay visible for review. The adapter never totals reported-to-date amounts or links an offering to a named round by similarity.

The [SEC specification](https://www.sec.gov/files/info/edgar/specifications/form-d-xml-tech-specs.htm) and [original issuer filing index](https://www.sec.gov/Archives/edgar/data/2070804/000199636625000006/0001996366-25-000006-index.html) identify the type of saved XML this adapter consumes. The PsiQuantum capture transcribes selected fields from the official rendered Form D. XML parser edge cases use synthetic documents.

## PsiQuantum acceptance

- Resolve `0002070804` to the Delaware operating company. Companies House number `10255737` identifies a separate UK legal entity and lists Psiquantum Corporation as its active party with significant control. The owner-supplied fund-vehicle CIK `0002107443` is excluded from issuer attribution. Its direct SEC lookup was unavailable here, so the packet leaves its exact name and jurisdiction open. [U.S. issuer](https://www.sec.gov/Archives/edgar/data/2070804/000199636625000006/0001996366-25-000006-index.html) · [UK control record](https://find-and-update.company-information.service.gov.uk/company/10255737/persons-with-significant-control)
- The 30 May 2025 Form D reports first sale on 15 May and US$22,000,008 sold as filed, with equity as the security type. A named round and participants remain unknown. [Rendered Form D](https://www.sec.gov/Archives/edgar/data/2070804/000199636625000006/xslFormDX01/primary_doc.xml)
- Playground's representative attributes the lead in 2016 Series A to Playground. The amount and exact close remain open. Imperial separately describes July 2016 seed investment. Keep the possible overlap open. The 2017 Series B label remains an unresolved interview-summary lead. [Playground interview announcement](https://prwire.com.au/pr/115807/interview-us-based-aussie-peter-barrett-in-australia-talking-about-playground-and-the-940m-australian-govt-partnership) · [Imperial case study](https://results2021.ref.ac.uk/impact/e8ed3395-c149-4fb0-9b3c-93d23be5cc0e/pdf) · [Interview notes](https://www.sourcery.vc/p/breaking-psiquantums-1b-series-e)
- Preserve Imperial's November 2019 Series C completion observation and M12's April 2020 announcement observation. M12 reports its own participation. Earlier cumulative capital figures stay separate from the unresolved Series C amount. [Imperial](https://results2021.ref.ac.uk/impact/e8ed3395-c149-4fb0-9b3c-93d23be5cc0e/pdf#page=3) · [M12](https://m12.vc/news/psiquantum-series-d-marks-important-technology-achievements/)

## Next review

Add saved records only after verifying the precise legal issuer and document accession. Obtain the vehicle's original filing and review the complete amendment chain when the collection owner confirms an approved source and route. Review contemporaneous investor or founder records for the Seed and Series A scope and the Series B lead. Keep unfamiliar instruments, uncertain dates, investor aliases and partial filing coverage visible.

Promotion requires field-level source review, a fresh Atlas overlay and live-graph deduplication, and the accepted record validator and proposal process. Keep uncertain amounts and dates in evidence when the published schema cannot express them. This command reads local files and emits a review packet to standard output.
