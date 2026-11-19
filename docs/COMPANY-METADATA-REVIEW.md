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

| Evidence kind | Saved artifact |
| --- | --- |
| `company_profile_packet` | One ready company's saved crawler packet. The existing replay validates page scope and timestamps. Supported observations stage candidates and preserve references to the original packet. |
| `early_investment_manifest` | A manifest for the existing SEC and attributed-observation adapter with its original digest-bound captures. The startup ID must match the current hosted readback for that company. |
| `published_readback` | The current hosted startup-tool response with both revisions matching the batch, including the exact startup and its relationships, related entities, funding rows and articles. Capture it separately before running the queue. |
| `review` | Saved source-backed review, including conflicting observations, source attribution or specific reasons a field is inapplicable. |
| `search_log` | Saved description of the searched source scope, when it was searched and why no supported claim was identified. |
| `blocked_receipt` | Saved transport, source-access or permission hold and its reason. Keep image permissions and logo holds distinct from discovery. |

Each explicit decision has a company `name`, `dimension`, `disposition`, a list of same-company `evidence` IDs, and a bounded `note`. A `published` decision includes `public_path`, an array of exact object keys and zero-based list indices into the saved readback. For example, `["startup", "id"]` can substantiate identity and `["funding_rounds", 0]` can substantiate the presence of a sourced round. A generic published profile fact or participant note needs separate review evidence explaining the specific claim it represents. The publication check covers explicit supported fields in the current graph contract.

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

Resume with the same revision, input bytes and batch. Each invocation commits at most four companies, one by default, in approved-ready order followed by exact name. Company field decisions are committed together. `next_company` is the next uncommitted company with saved decisions in this batch. A changed bundle or revision takes a new ledger. Keep the prior ledger and input bundle for comparison. The first implementation requires a complete overlay of at most 100 entries and accepts at most 100 evidence files, 16 MiB of direct evidence bytes and eight replay or financing manifests. The existing saved-source adapters also enforce their own limits.

A field disposition describes the cited observations. Later sources can reveal additional history, finer dates or conflicts. The external source denominator remains unknown after the batch finishes. A Form D can stage an early-financing candidate without creating a named round or investor relationship. Keep source-reported transaction scope and amendment lineage in the financing manifest. A portrait candidate leaves rights for the established image review. Source onboarding and enabled collection continue through the existing scoped collection runbook and review gates.
