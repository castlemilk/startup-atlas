# Company metadata review queue

Run saved evidence through the queue to track field coverage within an exact Startup Atlas inventory. Use the reviewed startup overlay and approved-seed CSV from one exact Git revision. Keep the resulting JSON and SQLite checkpoint alongside the saved inputs. This command works offline and writes only the specified local ledger.

```sh
python3 scripts/plan_company_profiles.py \
  --overlay data/startup-research.json --approved data/company-profile-seeds.csv \
  --revision "$ATLAS_REVISION" --limit 100 > "$ATLAS_BATCH_DIR/plan.json"

python3 scripts/review_company_metadata.py \
  --overlay data/startup-research.json --approved data/company-profile-seeds.csv \
  --revision "$ATLAS_REVISION" --batch "$ATLAS_BATCH_DIR/batch.json" \
  --ledger "$ATLAS_BATCH_DIR/coverage.sqlite" --limit 1
```

The saved batch has version `1`, the exact 40-character `revision`, `plan_id` from the planner, a UTC `as_of` timestamp in `YYYY-MM-DDTHH:MM:SSZ` form, a `reviewer` label, and `evidence` and `decisions` arrays. Each evidence entry has an `id`, the exact company `name` from its inventory, a `kind`, a relative JSON `path`, and the file's `sha256`. Include the original `source_url` when there is one. Keep acquisition details, source dates, predicates and excerpts in the original saved artifacts. The revision label describes the review inventory. The operator must take the overlay and graph inputs from that revision.

A batch containing a `published_readback` also supplies `identity_snapshot` with a relative graph JSON `path`, `sha256`, and `snapshot_kind` of `built` or `published`. Save the trusted graph at the same embedded `source_revision`, using the exact Pages artifact or a clean build with `ATLAS_SOURCE_REVISION`. The snapshot supplies the canonical startup ID. Its exact name and website must match the reviewed overlay. A different name or website in the hosted readback requires one cited official alias receipt, and the canonical ID still has to match. Ambiguous identities stay out of published coverage.

### Staging an unpublished company

A batch can also supply `candidate_inventory` with a relative JSON `path` and `sha256`. That file has `version: 1`, the same `revision`, and one to twenty `records`. Each record supplies a stable `candidate:` ID in `id`, the exact `name`, its reviewed official `website`, `identity_source`, UTC `reviewed_at`, and an `identity_note` explaining the match. Prefer an authoritative registry or equivalent primary evidence and keep the original saved review.

The batch uses an exact `identity_snapshot` for deduplication against the overlay and graph, including graph entries outside the overlay. Name and official-host collisions require review before staging. Staged companies support saved review, completed search and hold receipts. Their queue rows use `staged_unpublished` and their field counts use the separate `staged_candidates` cohort. Publishing and approving crawl seeds require their existing workflows.

### Evidence and decisions

| Evidence kind | Saved artifact |
| --- | --- |
| `company_profile_packet` | One ready company's saved crawler packet. The existing replay validates page scope and timestamps. Supported observations stage candidates and preserve references to the original packet. |
| `early_investment_manifest` | A manifest for the existing SEC and attributed-observation adapter with its original digest-bound captures. The startup ID must match the current hosted readback for that company. |
| `published_readback` | The current hosted startup-tool response with both revisions matching the batch, including the exact startup and its relationships, related entities, funding rows and articles. Capture it separately from the graph identity snapshot. |
| `identity_alias` | One reviewed alternate name and website for the same canonical ID. Supply `version`, `name`, `revision`, `startup_id`, `alias_name`, `alias_website`, `source_url`, `retrieved_at`, and `support`. Use an official source that attests the names and any alternate website. |
| `publication_claim` | A typed receipt tying an interpreted hosted value to its exact field and cited subject. |
| `review` | Saved source-backed review, including conflicting observations, source attribution or specific reasons a field is inapplicable. |
| `search_log` | A typed, completed search receipt for the company and field. |
| `blocked_receipt` | Saved transport, source-access or permission hold and its reason. Keep image permissions and logo holds distinct from discovery. |

Each explicit decision has a company `name`, `dimension`, `disposition`, a list of same-company `evidence` IDs, and a bounded `note`. A `published` decision includes `public_path`, an array of exact object keys and zero-based list indices into the saved readback. For example, `["startup", "id"]` can substantiate identity and `["funding_rounds", 0]` can substantiate the presence of a sourced round. A published biography, founder role, headcount or round participant also needs one `publication_claim` for that same path and source. The receipt has `version: 1`, `revision`, `name`, `dimension`, `public_path`, `subject_id`, `source_url`, UTC `retrieved_at`, `support`, and a field-specific `value`.

- A founder biography cites the linked person-specific page, the founder ID, and `value` with `bio_url` and `title`. The support identifies that person from the page.
- A founder role cites the founder ID and `value.role` with the wording that attributes the role to the person in the exact public profile fact.
- A headcount cites the startup ID and `value` with the observed day `as_of`, `scope`, `measure` such as `people`, and the quantity `as_stated`, preserving qualifiers and ranges. The exact fact supports each part.
- A round participant cites the round ID, the name as stated and `lead` or `participant` as `value.name` and `value.role`. Quote the exact round's explicit participation clause. Unstructured notes about another transaction remain review evidence.

A `searched_unknown` decision cites a `search_log` with `version: 1`, `name`, `revision`, `dimension`, and one to twenty bounded `attempts`. Each attempt has the checked HTTPS `url`, the company-specific `query` or page inspection scope, UTC `retrieved_at`, `outcome: "no_supported_value"`, and `evidence` describing the accessed content and the gap. Record transport, access and rights failures using the appropriate hold receipt.

These checks bind reviewed receipts to the selected data and preserve the review provenance. They validate saved inputs offline. The reviewer supplies the archive and verifies its source context.

The queue lists dispositions per company and field, plus counts for the full supplied overlay and the approved-ready subset. Each field in each cohort has the cohort's company count as its denominator. The 19 fields cover company identity, aliases, description, sectors, geography, founding, news, milestones, dated headcount, founders, founder roles, bios, professional socials, portrait candidates, portrait rights, investors, rounds, round participants and early financing.

| Disposition | Meaning for this batch |
| --- | --- |
| `unsearched` | The checkpoint has no committed decision for this cell. |
| `candidate` | A saved observation can be reviewed. Candidate sources remain linked when a separate explicit decision is available for the same field. |
| `reviewed` | An explicit source-backed review has been recorded. |
| `published` | The indicated value was observed in the exact saved hosted revision. |
| `searched_unknown` | A saved bounded search did not yield a supported claim. |
| `conflict` | The saved review records competing or unresolved claims. |
| `blocked` | A saved receipt explains the access or rights hold. |
| `not_applicable` | The saved review explains why the field does not apply. |

Resume with the same revision, input bytes and batch. Each invocation commits at most four companies, one by default. Approved-ready companies come first, followed by the rest of the overlay and the staged cohort, ordered by exact name within each. Company field decisions are committed together. `next_company` is the next uncommitted company with saved decisions in this batch. A changed bundle or revision takes a new ledger. Keep the prior ledger and input bundle for comparison. The queue requires a complete overlay of at most 100 entries and accepts at most 100 evidence files, 16 MiB of direct evidence bytes, an optional identity snapshot up to 8 MiB, and eight replay or financing manifests. The existing saved-source adapters also enforce their own limits.

### Combine completed and partial checkpoints

Read up to 20 saved bundles and their SQLite journals on one exact revision. The rollup revalidates the original evidence and reads the checkpoints without writing to them. It counts each company and field once within a cohort and leaves the receipt for each contributing observation.

```sh
python3 scripts/rollup_company_metadata.py \
  --overlay data/startup-research.json --approved data/company-profile-seeds.csv \
  --revision "$ATLAS_REVISION" \
  --batch "$ATLAS_BATCH_DIR/company-one/batch.json" "$ATLAS_BATCH_DIR/company-one/coverage.sqlite" \
  --batch "$ATLAS_BATCH_DIR/company-two/batch.json" "$ATLAS_BATCH_DIR/company-two/coverage.sqlite"
```

- Keep the exact overlay, seed file and graph snapshot bytes. Every bundle that uses a graph identity snapshot must use the same copy. Staged company IDs, names and official sites must agree across batches. A case-insensitive name collision or shared official host under different IDs requires identity review.
- An unchanged bundle and checkpoint contributes once. When saved copies of the checkpoint differ, the one with the largest complete set of committed decisions takes precedence. Its sequence and remaining companies tell the operator where to resume the original batch. Two different bundles that committed the same field at the same review time need reconciliation.
- For each field, reviewed, published, conflict and not applicable decisions take precedence over candidates. Candidate evidence takes precedence over a blocked or searched-unknown attempt. Within a group, the latest review wins. The ordered history keeps earlier decisions and later access failures. Pending or absent decisions remain unsearched unless another batch committed that field.
- A published decision is evidence of the indicated value at the revision in the report. Start a separate rollup after the revision changes. Revalidate prior excerpts and identity evidence against the new inputs and use a fresh exact-revision hosted readback for any published decisions. Retain previous observations in their original bundle and rollup.

A field disposition describes the cited observations. Later sources can reveal additional history, finer dates or conflicts. The external source denominator remains unknown after the batch finishes. A Form D can stage an early-financing candidate without creating a named round or investor relationship. Keep source-reported transaction scope and amendment lineage in the financing manifest. A portrait candidate leaves rights for the established image review. Source onboarding and enabled collection continue through the existing scoped collection runbook and review gates.

### Prioritise earlier financing from saved research

Add `--funding-review funding-sources.json` to the rollup command to plan a
targeted funding-history pass for up to four reviewed companies. This uses the
existing checkpoints and keeps their coverage dispositions. An unsearched early
history gets a search hint even when a later round has been reviewed. A financing
conflict gets a reconciliation task.

The input is a JSON object with `version: 1`, the exact rollup `revision` and
`plan_id`, and a `companies` array. Each entry names the exact `name` in the
rollup and has a `captures` array of up to 32 already saved observations, which
can be empty. Each observation has an HTTPS `url`, a bounded `excerpt`,
`retrieved_on` (YYYY-MM-DD), and `acquisition` of `page_excerpt`,
`reviewer_paraphrase` or `search_result`. Use explicitly sourced `dates` from a
saved page or its paraphrase, keyed by `published`, `announced` or `closed`, with year, month or day
precision. Keep an unknown date absent. The report retains distinct assertions
when it groups repeated URLs.

For a former name, add up to four `former_names` entries with `name` and the
`evidence_id` cited by the committed alias decision. Use the issuer's saved
evidence of the name change. The report links that exact evidence digest and
prioritises issuer pages with explicit early-stage financing language. A lead
needs wording that ties the round to the company. Keep phrasing that leaves the
issuer or purpose unclear available for source review. Grants,
contracts, valuations and portfolio backing can be useful context. A mixed
release stays flagged for review and a snippet can only supply a lead.
An announced planned round stays prospective until completion is stated, and an
investment in another company is not attributed to the announcing issuer.
A distinct round alongside a grant remains a mixed financing lead; a seed-funding
grant remains context. The report retains observations for claim review. Check the original source for
event scope, amounts, stage, dates and investor attribution. Use the existing
source approval process before adding a suggested document to the crawl scope.

An explicitly attributed receipt of strategic investment can carry
`strategic_investment` in the existing review signals. A separately stated
annual recurring revenue milestone carries `annual_recurring_revenue`.
Both stay as review context, even when one announcement uses a shared subject.
The original excerpt preserves the backer and the scope of the revenue figure.
Use the source's publication date for `published`. A funding round, amount
or investor role needs separate evidence tying it to the investment.

In saved CHIPS and Science Act excerpts, `public_support_letter_of_intent`
marks a named recipient's planned funding within a contiguous Commerce cohort
excerpt or an explicit statement that the recipient signed or secured a letter
of intent from Commerce for the CHIPS programme. Questions interrupt the cohort
sequence, and intervening prose requires manual association. A later issuer
mention can corroborate the same letter. Keep both source observations for
review of their shared event. `public_support_signed_award` marks directly
attributed, asserted Commerce signing language with an explicit upper limit.
These signals accompany `grant_or_public_support` in the existing review output. Keep the
recipient words and amount qualifiers in the source excerpt. Use `published`
when the release date includes a supported year. A later signed observation
can be reviewed alongside the earlier plan. Both remain source observations
and carry no payment date, disbursement total or private-round amount.
