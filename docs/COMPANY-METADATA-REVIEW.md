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

The saved batch has version `1`, the exact 40-character `revision`, `plan_id` from the planner, a UTC `as_of` timestamp in `YYYY-MM-DDTHH:MM:SSZ` form, a `reviewer` label, and `evidence` and `decisions` arrays. Each evidence entry has an `id`, the exact overlay record `name`, a `kind`, a relative JSON `path`, and the file's `sha256`. Include the original `source_url` when there is one. Keep acquisition details, source dates, predicates and excerpts in the original saved artifacts. The revision label describes the review inventory. The operator must take the inputs from that revision.

A batch containing a `published_readback` also supplies `identity_snapshot` with a relative graph JSON `path`, `sha256`, and `snapshot_kind` of `built` or `published`. Save the trusted graph at the same embedded `source_revision`, using the exact Pages artifact or a clean build with `ATLAS_SOURCE_REVISION`. The snapshot supplies the canonical startup ID. Its exact name and website must match the reviewed overlay. A different name or website in the hosted readback requires one cited official alias receipt, and the canonical ID still has to match. Ambiguous identities stay out of published coverage.

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

Resume with the same revision, input bytes and batch. Each invocation commits at most four companies, one by default, in approved-ready order followed by exact name. Company field decisions are committed together. `next_company` is the next uncommitted company with saved decisions in this batch. A changed bundle or revision takes a new ledger. Keep the prior ledger and input bundle for comparison. The first implementation requires a complete overlay of at most 100 entries and accepts at most 100 evidence files, 16 MiB of direct evidence bytes, an optional identity snapshot up to 8 MiB, and eight replay or financing manifests. The existing saved-source adapters also enforce their own limits.

A field disposition describes the cited observations. Later sources can reveal additional history, finer dates or conflicts. The external source denominator remains unknown after the batch finishes. A Form D can stage an early-financing candidate without creating a named round or investor relationship. Keep source-reported transaction scope and amendment lineage in the financing manifest. A portrait candidate leaves rights for the established image review. Source onboarding and enabled collection continue through the existing scoped collection runbook and review gates.
