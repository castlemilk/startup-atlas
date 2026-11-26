# Person identity — reconciliation via LinkedIn URL

People are the one entity kind the Atlas cannot key on a website.
Partners and startups join on their normalised website host; a person
joins on nothing, so the graph scopes them per partner
(`person:<slug>--<partner>`) and the same human at two firms is two
nodes with two partial histories. Issue #366 is about closing that
gap with the one durable, public identifier people in this dataset
actually carry: their LinkedIn profile URL.

This document records the design. It extends §1 of
`docs/KG-CONNECTIVE-TISSUE.md` (the identity design the registry was
built to) rather than replacing it: canonical IDs, thresholds and the
registry format are unchanged. The implementing module is
`scripts/entity_resolution.py`; the registry is `data/identity.json`.

## Where things stand

Measured on main `6ca9961` (25 Nov 2026); counts will drift as the
crawl and review proceed, the machinery is data-agnostic.

- The identity machinery already understands LinkedIn:
  `normalise_linkedin()` derives the key, the registry seeds a
  canonical person for a profile person whose `socials` carry a
  LinkedIn URL and merges the scoped entry into it, and the graph
  builder resolves registry merges — so a reconciled person already
  renders as one node.
- 8 of 139 person entities carry a `linkedin-url` identity key: the
  4 LinkedIn-carrying profile people (of 19 in
  `data/partner-profiles.json`) and 4 founders (of 118 in
  `data/startup-research.json`). The other 131 people are name-only
  or scoped.
- The founders' keys are incidental, not recorded: 3 come from a
  `profile_url` that happens to be a LinkedIn URL and 1 from a
  `socials` entry. **No person row in either reviewed file has a
  `linkedin` field.** If a `profile_url` is ever corrected to a bio
  page, the identity key silently disappears with it.
- The crawl emits LinkedIn URLs at volume (profiles-mode people rows
  carry them as `candidate_url`; ~232 per run per the #366 survey),
  and `scripts/build-review-queue.py` already groups those rows by
  LinkedIn key across firms (the KG-10 producer). At filing time
  nothing recorded an approved URL onto the reviewed person rows;
  slice 4's promotion tool (`scripts/promote_profile_person.py`)
  now carries it as part of the review motion. An exact-key match
  found by that producer was treated as "auto-merge, not queued"
  even though no path applies merges from unreviewed crawl rows —
  slice 3 made those pairs queue as proposals instead.
- Dependency #355 (derive profile company names from URL slugs when
  link text is a CTA or badge) has landed. It concerned *company*
  names; person names in the reviewed files remain human-reviewed
  names, which is what this design assumes — it never keys on a name
  or a name slug.

## Decision 1: record a first-class `linkedin` field on person rows

Person rows in both reviewed files gain an optional `linkedin`
field:

- `data/partner-profiles.json` → `people[]` entries;
- `data/startup-research.json` → `startups[].founders[]` entries.

```json
{"name": "Jane Example", "role": "Partner",
 "source": "https://example.vc/team",
 "linkedin": "https://au.linkedin.com/in/jane-example"}
```

The value is the URL **as published by the source**, recorded during
review alongside the row's existing `source`. It is evidence, not a
key: the raw value is never overwritten with its normalised form
(the same principle as `docs/CURRENCY.md` — the original is never
overwritten), and normalisation lives in exactly one place,
`entity_resolution.normalise_linkedin()`, so the derivation stays
testable and every consumer derives the identical key.

Recording happens only through review — a human or the agent-review
loop verifying the URL against a primary source (the firm's team
page, the company's own site). The crawl proposes; it never writes
reviewed data. The starting population is the people review already
has URLs for: the 4 profile people (today carried in `socials`) and
founders whose LinkedIn surfaces in review, per the issue.

## Decision 2: normalisation rules (one place, already implemented)

`normalise_linkedin()` maps a recorded URL to its identity key:

- scheme optional; host lowercased, `www.` stripped;
- locale subdomains collapse (`au.linkedin.com`, `uk.linkedin.com`,
  … → `linkedin.com`) — they are the same profile;
- the path must be exactly `/in/<slug>`; the slug is lowercased and
  must match `[a-z0-9][a-z0-9-]*`;
- query string, fragment and trailing slash are stripped
  (`?trk=public-profile` and friends are tracking noise);
- anything else is **not** an identity key and normalises to `''`:
  company pages (`/company/…`), legacy `/pub/…` URLs, post/activity
  URLs, and non-LinkedIn hosts. A `source` field that merely *is* a
  LinkedIn post URL (three Strongroom AI founders today) is
  provenance, not identity, and yields no key.

The result is the key form stored in the registry:
`linkedin.com/in/<slug>`.

One known duplication, retired in slice 3:
`build-review-queue.py` re-implemented a subset of this with a regex
over `candidate_url`. It now calls `normalise_linkedin()` (via its
`linkedin_key()` helper, which keeps the regex only as an
import-failure fallback) so crawl rows and reviewed rows can never
derive different keys for the same URL.

## Decision 3: how the registry builder uses the field

`entity_resolution._person_linkedin()` reads a person row's LinkedIn
URL with a fixed precedence — the first source that normalises to a
valid key wins:

1. **`linkedin` field** — the reviewed identity assertion; it wins
   because a reviewer verified *this* URL is *this* person, whereas
   the other sources are incidental.
2. **`socials`** — a LinkedIn entry among the row's socials (the
   pre-field recording; the 4 current profile people key this way).
3. **`profile_url`** — only when it is itself a LinkedIn profile URL
   (legacy: the 3 founders keyed this way before the field existed;
   kept so their keys survive, and harmless because a bio-page
   `profile_url` normalises to `''`).

A present-but-invalid value never masks a valid later source.

Registry behaviour is then exactly the established §1 behaviour —
this design adds a recording, not a merge class:

- A founder with a key is seeded as the canonical
  `person:<slug(name)>` with `identity_key` set and
  `identity_basis: "linkedin-url"`.
- A profile person with a key gets the canonical entry plus the
  scoped `person:<slug>--<partner>` entry, and the scoped entry is
  merged into the canonical one as a seed merge
  (`basis: "linkedin-url"`, `decided_by: "seed:reviewed-data"`).
- A profile person without a key stays scoped and name-only,
  untouched.
- Two *canonical* people who share a key (the same person under two
  name spellings, e.g. a founder row and a profile row) are **not**
  seed-merged. They are exactly what `match_candidates()` returns at
  score 1.0 with `auto_merge: true`, and they reconcile through the
  governed queue path below, where the merge is recorded with a
  decider and a note — never silently by the seed.

## Decision 4: reconciliation proceeds gradually, through review

There is no bulk re-identification. Keys accumulate one reviewed row
at a time:

1. **Record.** When review surfaces a person's LinkedIn URL — from a
   profiles-crawl people row, a team page, a founder profile — the
   reviewer records it on the row (Decision 1). Regenerating the
   registry picks it up deterministically.
2. **Propose.** The review queue's KG-10 producer keeps grouping
   crawl people rows by LinkedIn key across firms. A later slice
   makes it also surface same-key/different-name pairs already in
   the registry as merge proposals (today an exact-key match is
   skipped as "auto-merge, not queued", which is only correct once
   a governed auto path exists for it — until then it must queue).
3. **Decide.** Person merges are decided like partner merges:
   approved queue decisions are applied by the write path and
   replayed by `build_registry()` on every regeneration
   (`replay_queue_decisions()`), so they survive rebuilds. The
   review-gating config already treats a LinkedIn basis as an
   identity key (`IDENTITY_KEY_MARKERS` in `scripts/review_gating.py`),
   so an identity-key person merge can pass the same confidence gate
   as a partner merge; a name-similarity person merge cannot
   auto-proceed.
4. **Render.** The graph builder already resolves `merged_from`
   IDs to their canonical winner, so a reconciled person's team and
   founder edges land on one node with no graph-side change.

## Guardrails

- **Never merge on name alone.** Enforced in code, not convention:
  name similarity is capped at 0.89 (`NAME_ONLY_SCORE_CAP`), below
  the 0.90 auto-merge threshold, and name-only entities have
  `identity_key: null`, so they can never produce an identity-key
  match. Two different people who share a name stay two nodes until
  a key says otherwise.
- **Merges only from reviewed data or a recorded decision.** The
  seed merges solely on keys found in the reviewed files; crawl rows
  propose, they never merge (KG §1's rule, unchanged).
- **Reversible, like partner merges.** Every merge is recorded in
  both `entities[to].merged_from` and the top-level `merges[]` with
  basis, decider and timestamp. Queue decisions reverse through the
  admin panel / MCP undo. A seed merge reverses by correcting or
  removing the recorded `linkedin` on the row and regenerating — the
  scoped entity reappears, because the registry is generated and is
  never hand-edited.
- **A wrong URL is a data error at the row.** If a recorded LinkedIn
  turns out to belong to someone else, fix the row; the registry and
  graph follow on regeneration. There is no registry-side override
  list to drift out of sync.
- **Key changes are ordinary.** If a person changes their LinkedIn
  slug, updating the recorded URL changes the key on the next
  regeneration; merges that were queue decisions replay by ID and
  are unaffected, and seed merges re-derive from the new key.
- **One field, one meaning.** `linkedin` is the person's own
  profile. A firm's LinkedIn company page belongs on the partner
  record, never on a person row — and would normalise to `''` here
  anyway.

## Slices

1. **Builder support for the recorded field** (this change):
   `_person_linkedin()` precedence in `build_registry()` for
   founders and profile people, with tests. No data changes and no
   behaviour change on current data — no reviewed row carries the
   field yet, and the seeded-registry equality test proves the
   rebuilt registry is byte-identical.
2. **Record the known URLs**: add `linkedin` to the rows review
   already has URLs for (the 3 `profile_url` founders explicitly;
   optionally mirror the 4 socials-carried profile people) —
   data-only, verified by the registry diff showing keys unchanged,
   now field-sourced.
3. **Queue producer alignment** (landed): `build-review-queue.py`
   reuses `normalise_linkedin()`; same-key person pairs surface as
   proposals instead of being dropped — both cross-firm crawl pairs
   whose exact key matches a registry person under another name
   spelling, and unmerged same-key pairs already in the registry.
   Pairs the seed or a recorded decision already merged are skipped,
   so current data produces no new proposals.
4. **Promotion path** (landed): `scripts/promote_profile_person.py`
   is the reviewer's write hand for this motion — given a profiles
   artifact, a partner and a person, it writes the reviewed row
   into `partner-profiles.json` carrying the verified LinkedIn URL
   (from the people row's `candidate_url` or a same-person social
   row, normalised only via `normalise_linkedin()`, recorded as
   published). Conflicting keys — in the crawl, or against a
   `linkedin` already on the row — refuse the promotion, and a new
   person requires an explicit `--role`, so recording is part of
   the normal review motion rather than a special pass.
