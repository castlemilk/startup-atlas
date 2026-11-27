# Release rollback

How to return each published surface to its prior release, and how to prove
the rollback restored that release. This closes the last open slice of
issue #69: the builds are reproducible, atomic and manifest-stamped, and
the live index already kept prior versions — what was missing was the
documented, proven procedure for going back.

There are two published surfaces, with different rollback mechanics:

| Surface | What a release is | Rollback mechanism |
| --- | --- | --- |
| GitHub Pages site | The `dist/` tree built from one commit of `main` by the *Validate and deploy GitHub Pages* workflow | Re-run the last-good deploy run, or revert the bad commit on `main` |
| Live index (GCS) | An immutable `v1/<version>/` directory of Parquet tables plus a manifest, selected by the `latest.json` pointer | Rewrite the `latest.json` pointer to an earlier version |

## Evidence every release carries

- Every Pages build ends with `scripts/release-manifest.mjs`, which writes
  `dist/release-manifest.json`: `schema_version`, `source_revision` (the
  commit SHA, from `ATLAS_SOURCE_REVISION` in CI), file/byte counts, and a
  per-file `sha256` for the whole published tree. It is served with the
  site, so the live release can always be identified and inventoried:
  `https://castlemilk.github.io/startup-atlas/release-manifest.json`.
- Every live-index version is immutable and content-addressed
  (`<UTC>-<short sha>`); `latest.json` names the current version and its
  `v1/<version>/manifest.json`. Versions are retained, so the prior
  release is never overwritten by a newer one.

## Pages rollback

### 1. Identify the bad and last-good releases

```bash
curl -s https://castlemilk.github.io/startup-atlas/release-manifest.json \
  | python3 -c 'import json,sys; m=json.load(sys.stdin); print(m["source_revision"], m["counts"])'
```

The printed SHA is the commit the live site was built from. The last-good
release is the previous successful *Validate and deploy GitHub Pages* run
on `main` before that commit (Actions tab, or `gh run list --workflow
pages.yml`).

### 2a. Preferred: re-run the last-good deploy run

In Actions, open the last-good run and choose **Re-run all jobs**. A re-run
keeps the original run's commit SHA, and the workflow's build/deploy steps
are gated on `refs/heads/main`, so the re-run rebuilds and redeploys
exactly the prior release; the `pages-refs/heads/main` concurrency group
serialises it against any in-flight deploy. Nothing on `main` changes —
use this when the bad commit is being fixed forward separately and the
site simply needs to serve the prior release now.

### 2b. Alternative: revert the bad commit on `main`

```bash
git checkout main && git pull
git revert <bad-sha>   # one revert per bad commit, newest first
git push origin main
```

The push triggers the normal deploy. The content returns to the last-good
state, but the new manifest's `source_revision` is the revert commit, not
the original last-good SHA — prove content equivalence in step 3 instead
of comparing revisions. Use this route when the bad change must also leave
`main` (a re-run alone leaves the bad commit in place for the next deploy
to republish).

### 3. Prove the rollback

Fetch the live manifest again and check:

- Route 2a: `source_revision` equals the last-good SHA.
- Route 2b: every file entry in the live manifest matches the last-good
  release's manifest hash-for-hash. (Keep the last-good manifest from
  step 1's predecessor release; any entry that differs must be explained —
  e.g. an asset that embeds the build revision — before the rollback is
  declared equivalent.)

For a byte-level proof of a locally rebuilt tree against any saved
manifest, use the manifest tool's verify mode — it rebuilds the tree's
manifest in memory and diffs every entry, writing nothing:

```bash
node scripts/release-manifest.mjs --verify dist path/to/last-good-manifest.json
# → "Release verified: dist matches … — N files, B bytes, revision <sha>"
# → exit 1 with one line per missing / unexpected / size- / sha256-differing file
```

Omitting the manifest path verifies `dist` against its own
`dist/release-manifest.json`.

## Live-index rollback

Versions are immutable, so rollback is a pointer swap (see also
`docs/LIVE-INDEX.md`, “Rollback and failure modes”):

1. List the retained versions in the index bucket and pick the last-good
   one (each `v1/<version>/manifest.json` records its inputs and counts).
2. Rewrite `latest.json` in the bucket root to the same pointer shape the
   indexer writes, naming the earlier version and its
   `v1/<version>/manifest.json` path. Readers follow the pointer, so the
   swap takes effect as soon as the object is written; no table files are
   touched.
3. Verify: fetch the public `latest.json`, confirm it names the intended
   version, and load the query console — its provenance line shows the
   index version now being served.

The indexer keeps running on its 15-minute schedule; if the corpus still
contains the bad inputs it will publish the bad version again as a *new*
version and move the pointer forward. Fix or revert the corpus inputs
first, or the pointer swap is only a holding measure.

## Proof this procedure works

Exercised locally on the manifest tooling (the same code CI runs as the
final build step), and locked in by `tests/release-manifest.test.js`:

- A tree verified against its own manifest passes (`verifyReleaseManifest`
  returns `{ ok: true, problems: [] }`, CLI exits 0).
- Editing one file in the tree fails verification with a `sha256 differs`
  (or `size differs`) problem for exactly that path.
- Deleting a file and adding a stale one fails with `missing:` and
  `unexpected:` problems — the mixed-revision case a partial rollback
  would produce.
- A manifest whose counts disagree with its own entries is rejected
  before any file comparison.

So a rollback is “done” only when the live manifest (Pages) or pointer
(live index) names the intended prior release **and** the verify step
above passes against that release's manifest.
