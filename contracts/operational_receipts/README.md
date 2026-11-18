# Atlas operational receipts

An isolated, offline report for improvement 6. It keeps source-ready, merged,
deployed and verified claims separate, with exact revisions and preserved
history. It adds no runtime route, API, workflow, scheduled job or release action.

## Run locally

From the repository root, with Python 3.10 or later and no third-party packages:

```sh
python3 -B contracts/operational_receipts/report.py \
  contracts/operational_receipts/examples/current-main-20261118.json \
  --as-of 2026-11-18T07:20:16Z --format markdown

python3 -B contracts/operational_receipts/report.py \
  contracts/operational_receipts/examples/current-main-20261118.json \
  --as-of 2026-11-18T07:20:16Z --format json

python3 -B -m unittest discover \
  -s contracts/operational_receipts -p 'test_report.py' -v
```

The first two commands read the saved observations and write stdout. They do
not refresh GitHub, Pages or MCP. `--as-of` is mandatory; the report never renews
an observation timestamp. Exit 0 means a valid report was produced, including
blocked, stale or partial reports. Exit 2 means invalid/unreadable input. Neither
exit code authorizes a release.

The [v1 contract](CONTRACT.md) defines inputs, validation, milestone semantics,
partial outcomes and the capability consumer seam. Core tests use synthetic data;
the files under `examples/` are explicitly dated read-only observations,
not synthetic current-state claims.

## Consume the actual capability contract

Lane 4's reviewed [dependency packet](https://chatgpt.com/library?file_id=libfile_fde3_f-d3df055d3a30819181f7bddb1d98a0ca_99a50d6404588191819a3b7a2e0f2ae3&account_id=personal)
is pinned at `6f76913b45f2b56ffdc3c14e15877319e155a52e`. Its archive is 132,525
bytes with SHA-256 `b56af9d614486ff24eb38603905f61c16666c156b4865494341e0bd518b7773a`.
The Git patch contains no copy or modification of its 12 files. The delivery
archive includes that exact dependency ZIP separately for reproducibility.

After unpacking it alongside the repository, run the optional bridge with
Node.js 22.13 or later:

```sh
capability_contract_dir=../atlas-capability-manifest-v1/contracts/capability_manifest
python3 -B contracts/operational_receipts/with_capabilities.py \
  contracts/operational_receipts/examples/current-main-with-capabilities-20261118.json \
  --manifest "$capability_contract_dir/source-baseline.json" \
  --validator "$capability_contract_dir/validator.mjs" \
  --as-of 2026-11-18T07:30:00Z --format markdown

python3 -B contracts/operational_receipts/test_capability_bridge.py \
  --contract-root "$capability_contract_dir" --verbose
```

This executes only the pinned owner's `parseStrictJson` and `assessManifest` in
a bounded local subprocess. Its public assessment is retained unchanged in JSON.
The Markdown table presents those outcomes without recomputing them. The source
manifest and implementation digests are distinct. A hash match establishes byte
identity, not evidence authenticity or an adoption agreement.

At that dated assessment, lane 4's baseline contains **17 source tool definitions**
and **13 limited client-registry name observations**, made at `07:07:20Z` with an
`08:07:20Z` expiry. This is not fresh server `tools/list` or known cache age.
Runtime identities, authorization and real read/write verification remain
unknown. The four strict record tools remain not observed; missing registry
names do not prove server absence. Re-evaluation at expiry returns the owner's
stale outcomes without refreshing timestamps. The initial no-manifest example
is retained as the earlier dependency state.

## Verification scope

The focused core suite has 55 synthetic tests; the separate actual-contract
integration suite has 12 tests. Run the integration command explicitly with the
dependency: missing dependency is not a passed integration check. Coverage
includes stale/unknown states, wrong review and CI heads, synthetic PR checkout
binding, failed attempts, skipped jobs, target-branch mismatches, deployment
partial success, superseded verification, input history preservation, malformed
timestamps and canonical capability rejection/expiry. Independent source review
identified the wrong-branch, contradictory-checkout and superseded-verification
cases; their fixes have dedicated regressions. Exact final-head results belong
in the delivery receipt, not a claim about remote CI.

No root test command, workflow or package file is changed. These focused offline
checks establish no browser/native acceptance, hosted authorization or release.

## Evidence-backed baseline

At **18 November 2026, 18:20:16 AEDT** (`07:20:16Z`), read-only GitHub inspection
returned main `d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f`, tree
`f8b66ea9bb4ca63ef5d52343cbda0cb96ff39e0a`. The branch was rechecked after the
initial clone. [PR 171](https://github.com/castlemilk/startup-atlas/pull/171)
merged head `26a0d771c72fa143240b4ba4c8208c8b5b6a9c3f` into that main revision.
Active PRs **107, 135, 160, 162 and 163** retain their owners and holds.

| Evidence | Exact observation | Limit |
| --- | --- | --- |
| Source-only review | No full exact-main review head established by this bounded inspection. PR 171 formal reviews returned an empty array; its prose names an abbreviated local peer-review commit. | Absence of a formal review is not proof no peer review occurred. Do not expand an abbreviated hash or infer that main itself was approved. |
| CI | [Run 44254107775](https://github.com/castlemilk/startup-atlas/actions/runs/44254107775), attempt 1, head and checkout `d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f`, completed successfully at `06:51:20Z`. | Existing run read only. Build checkout was verified from its `git log -1 --format=%H` output. |
| Pages deployment | [Deploy job 134632357026](https://github.com/castlemilk/startup-atlas/actions/runs/44254107775/job/134632357026) records the exact revision/deployment ID; deployment step succeeded at `06:51:02Z`. | A recorded deployment event, not proof of private MCP publication or a new live check by this lane. |
| Publication verification | The same job explicitly verified graph/SQLite and design assets at that revision at `06:51:17Z`. | Retained as `recorded_ci`; original timestamp and scope stay visible. The example's one-hour freshness policy is illustrative and awaits owner agreement. |
| Hosted MCP | No new service-code revision, tool discovery, authorization or read/write verification established. | Credential hold remains. Graph-data revision cannot substitute for service-code revision. |
| External preview activity | GitHub's Vercel status reports a completed deployment at `06:48:56Z`. | This proves recorded external activity, not provider settings, compiler provenance or a deployment-free branch path. |

The exact saved input is [current-main-20261118.json](examples/current-main-20261118.json).
The supporting compact observation record is
[github-observations-20261118.json](examples/github-observations-20261118.json).
Its source URLs and selected log lines can be rechecked by an authorized owner.
No historical receipt in the canonical Space was deleted, relabelled as a fresh
test, or promoted into a claim about this patch.

## Why this is a patch-ready packet

The inspected [Pages workflow](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/.github/workflows/pages.yml)
runs Chrome suites for pull requests. Pages deployment is separately gated;
skipping that job does not make a PR a browser-free execution path. External
Vercel activity is also recorded. Therefore no branch/ref/PR publication, push,
merge, CI dispatch, workflow edit or deployment accompanies this packet.

The [runbook](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/docs/AGENT-RUNBOOK.md),
[index-refresh guide](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/docs/INDEX-REFRESH.md)
and [hosted service README](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/backend/hosted/README.md)
separate public data publication from private MCP code deployment. Hosted
repository reads can renew OAuth credentials; this report uses only offline
observations and does not call MCP to refresh them.

## Ownership and handoff

The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
contains the six-lane ownership reconciliation. This is a bounded contribution
to existing [OPS-04 / issue 90](https://github.com/castlemilk/startup-atlas/issues/90),
with source/release identity concerns already tracked under
[issue 69](https://github.com/castlemilk/startup-atlas/issues/69) and external
provenance under [issue 143](https://github.com/castlemilk/startup-atlas/issues/143).
It does not close those broader issues.

| Next owner | Concrete next step | Evidence still needed |
| --- | --- | --- |
| [Capability manifest lane](https://chatgpt.com/c/6afd4d25-b898-83ec-88f1-65ef63a9113e) and receipts owner | Review the completed adapter to the exact delivered v1 validator and its preserved public projection. | Owner adoption agreement and agreed freshness windows; no acknowledgement is implied by source inspection or passing tests. |
| Existing release owner | Review the milestone meanings, merge target, surfaces, verification scopes and freshness policy. | Explicit adoption decision and permitted publication path; all current holds remain. |
| Source reviewer | Review the final patch/tree and focused test log. | Exact-head source review; this is not human GitHub approval or browser acceptance. |

Reserved sibling files, factual records, public assets, runtime semantics,
credentials, permissions, workflows and release controls are unchanged. No
robots.txt request, live crawl, spending or user-data mutation is performed.
