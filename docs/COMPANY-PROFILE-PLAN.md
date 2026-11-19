# Company profile collection inventory

The offline planner makes the existing company collector's population and seed
approval bottleneck explicit before making network requests. It does not create
approvals, fetch sources, verify claims, publish records or activate the coverage
ledger. Its cursor resumes **inventory pagination**, not interrupted HTTP work.

```sh
python3 scripts/plan_company_profiles.py \
  --overlay data/startup-research.json \
  --approved data/company-profile-seeds.csv \
  --revision "$(git rev-parse HEAD)" --limit 10 > /tmp/company-plan.json
# Repeat with the exact same inputs and --cursor '<next_cursor>' for the next page.
```

The caller must ensure these files are from the supplied revision. The planner
labels them `input_files`, records both exact-byte SHA-256 hashes, and never calls
them a live snapshot. A changed byte, Git revision, batch size or planner version
invalidates the cursor. Regenerate the plan after reviewing changed inputs; do not
replay old approvals or silently carry completion into a new population.

Every source record is enumerated once in exact, case-sensitive Unicode name
order. Names remain source-record keys, **not generated graph IDs**. Duplicate
names fail closed; aliases and namesakes are never coalesced. Source record counts
are not the public graph startup count: graph-only/provider-derived startups are
outside this overlay's denominator and still require an explicit identity mapping.
An exhausted inventory page is not an exhausted collection pass.

`population.seed_states` partitions this exact input population:

- `approved_seed_ready`: an existing approved CSV row passes the collector's shared
  approval validation, matches its reviewed website host and passes URL source
  policy. This is readiness for a separate review/run, not authorization to bypass
  current identity, access, DNS/public-address, rate, byte or time checks.
- `seed_review_required`: no approved row. Unapproved rows remain unapproved.
- `missing_reviewed_website` / `invalid_reviewed_website`: repair/review identity
  evidence first. No website is guessed from a source URL or company name.
- `seed_host_mismatch` / `seed_url_blocked`: an existing approved seed no longer
  matches its source record or violates URL policy. The planner emits no executable
  `approved_url` for this row. Unknown/duplicate/structurally invalid approved rows
  fail the whole plan through the unchanged collector validator.

Field presence covers description, founding year, founders, funding rounds,
profile facts, socials and articles **in the overlay only**. Present means nonempty,
not valid, current, complete or verified. Absent does not mean the fact is absent in
reality. Presence totals are independent of source approval and collection status.
Every item has `collection_state: not_assessed`: this planner does not infer past
attempts or reviews from pre-existing metadata. Preserve Remi's domain quarantine,
PI.EXCHANGE's unapproved seed, and asset-use holds during any later source review.

## Resuming and actually collecting

Save each plan page with its input hashes/revision for an auditable research queue.
Reusing a cursor returns the same page for unchanged bytes; it does not record a
completed attempt. The token is a corruption/staleness check, not a signed authority.
The existing collector accepts `--partner` as a **substring** filter, not an exact
identity selector; inspect its selection before use. Do not turn planner names into
an unreviewed shell command or assume one name selects exactly one company.

Before new seeds are approved, inspect the primary website and exact identity, then
review the seed patch separately. Once a bounded source set is approved, use the
existing `company-profiles` mode and retain its output/evidence. No new workflow or
automatic crawl is added here. Source metadata, image candidates and social links
remain unverified candidates requiring normal review.

The [coverage ledger contract](COLLECTION-COVERAGE-CONTRACT.md) can later record
retrieval attempts and review state. Its owner gates still apply: exact population
and canonical identity mapping, output units, pagination termination, checkpoint
storage/retention and uncertain-worker recovery must be agreed before adapter
activation. This planner resolves only the input inventory and approval-gap slice;
it does not bypass those gates or pretend its cursor is that durable queue.

## Verification

```sh
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py' -v
python3 -m unittest discover -s tests -p 'test_crawl.py' -v
```

Fixtures exercise deterministic pages, replay, bound input drift, malformed/stale
cursors, duplicate identities, exact empty populations, separate field presence,
shared CSV validation, failed approval/host/URL guards, CLI failure and no DNS/HTTP
calls. Normal `npm test` discovers these Python regressions automatically.
