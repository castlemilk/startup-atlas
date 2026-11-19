# Scoped document approval proposal

**Draft implementation, linked to #213. The collection owner agrees with the intended bounded contract but requested corrections at dcdf90c; corrected code and execution-route proposal require re-review. No source approval or runtime activation.** Existing source-use restrictions remain unresolved. This implementation narrows an existing `approved=yes` seed; it does not establish permission, identity, publication rights or an asset licence.

## Opt-in CSV contract

Optional `crawl_scope` contains JSON (use a CSV writer to quote it):

```json
{"version":1,"allowed_urls":["https://example.com/","https://example.com/team"],"denied_urls":[],"max_follow":1}
```

- No column or blank cell preserves the existing reviewed seed behavior. It is **legacy host approval**, not a new default rights grant. No checked-in seed is changed by this proposal.
- CSV headers must be exact lowercase snake_case. Duplicate/semantic-duplicate headers, whitespace/case variants (including `crawl_scope `), and short/extra rows fail closed in both collector and planner. A correctly spelled, explicitly blank scope cell remains legacy-compatible.
- Nonblank scope must be a version-1 object with a nonempty allowlist, an integer `max_follow` from 0 through 20, and optionally a denylist. Unknown/duplicate keys and malformed values fail closed before collection or planning. Each list holds at most 100 URLs; the serialized cell is at most 65,536 characters and each URL at most 4,096.
- Exact HTTPS document URLs only, on the official seed's exact host. No wildcard, directory-prefix, subdomain, cross-host redirect or query stripping. Hostname case and explicit HTTPS port 443 canonicalize to lowercase host without port; an empty root path canonicalizes to `/`. The same identity is used for allowed/denied URLs and every guard, so these equivalents cannot evade denial. Query bytes/order are exact; `/team`, `/team/`, and `/team?lang=en` are distinct. Fragment URLs are rejected. Encoded paths, dot/trailing-dot segments, repeated slashes, backslashes and path parameters are rejected rather than interpreted. If a real grant needs these forms, keep it held pending an explicitly reviewed contract extension.
- Denials override allowances; the seed itself must be allowed and not denied. Nothing unlisted is permitted in scoped mode. A deny is exact-document, not a prefix; descendants are nevertheless denied unless separately listed.
- `max_follow` caps the existing CLI follow limit; it does not increase it or schedule additional URLs. Existing link selection remains bounded. Denied discoveries are visible as skipped pages without network requests; they may consume a follow slot, so the result is not proof all allowed pages were fetched.
- The guard runs before transport, on **every redirect destination**, and on returned final URL. Existing same-host, public-address, throttle, byte/time/redirect and 429 protections remain. No robots requests or inspection.
- Scope applies to CSV-seeded `sites`, `profiles`, `company-profiles`, and therefore the page-collection part of `logos`. Asset downloads for scoped rows are always denied, including same-host images and listed CDN hosts. Image/social URLs can remain unverified page observations. Scoped approval does not apply to independent curated registries/Wikidata or retroactively authorize captures.

## Packets and offline compatibility

The existing packet envelope remains version 1. Scoped result rows add the normalized `crawl_scope` object (scope contract version 1); absent scope remains absent in legacy packets. The planner carries the same object, with the existing seed-byte hash binding the policy. Policy-sensitive site caches never reuse a broader successful observation for a narrower row.

Saved-packet replay strictly parses the saved row policy (booleans/floats are not integers) before requiring it to equal the current pinned seed policy, limits saved pages by its follow cap, and checks successful requested/final URLs. Skipped out-of-scope discoveries remain failure observations. Replay is synthetic saved-evidence analysis: it does not prove intermediate HTTP hops or fresh source permission. It never runs a crawl or promotes facts.

**Do not pass scoped CSVs to older collector/planner/replay versions:** older tools may ignore the new column. Rollout requires a reviewed version-pinned execution path and collection-owner agreement. This proposal does not migrate any existing seed, alter workflow triggers, or settle checkpoint/recovery policy. A separately reviewed source-evidence patch is required before opting any real source in. Purpose restrictions must be reviewed separately; this version enforces URLs/follow count/text-page versus asset downloads, not semantic downstream use.

## Proposed implementation-pinned execution route

`run_scoped_collection.py` is a separate **not-yet-adopted** launcher proposal. It does not add a scheduled or manual workflow, make source approvals, or authorize a crawl.

Use a trusted reviewed launcher under `python3 -I`, with an externally retained, independently approved SHA-256 digest. The digest covers exact bytes of `crawl.py`, `plan_company_profiles.py`, `replay_company_profiles.py`, and the launcher. These three modules constitute the entire project-local import closure in this reviewed version; other imports are Python standard library. The interpreter, standard library, OS and trusted launcher distribution are deployment trust assumptions, not attested by this digest. Any new local dependency requires an expanded manifest and review.

The launcher does not consume an attacker-supplied manifest. `--expected-implementation-sha256` must be the independent review/release pin, never a hash automatically computed from the same untrusted checkout immediately before execution. A SHA matching arbitrary bytes is not approval. Fixed source filenames are opened relative to directory descriptors, rejecting symlinks/nonregular/oversized files, and all bytes are verified before project code executes. Verified modules execute the already-hashed memory buffers rather than reopening paths; a changed file after verification cannot substitute different code. The trusted launcher must match the pinned launcher bytes. The route refuses an older/mixed/modified closure before importing any of its code, even with a new caller-supplied input `--revision`.

For offline planning after independent route approval:

```text
python3 -I /trusted/reviewed/run_scoped_collection.py \
  --checkout /reviewed/atlas \
  --expected-implementation-sha256 INDEPENDENTLY_REVIEWED_64_HEX_DIGEST \
  plan -- --overlay /inputs/startup-research.json --approved /inputs/seeds.csv \
  --revision INPUT_REVISION_SHA
```

`replay` routes to the saved-packet CLI. `crawl` requires an explicit `--approved` CSV and is restricted to page modes; `sites`/`logos` additionally require `--partners-only`, excluding mixed curated registry sources but remains subject to all separate runtime/source gates; no live execution was done for this proposal. New direct CLIs reject nonblank scoped inputs without this route. Older CLIs cannot be retroactively repaired; they must not be invoked directly with scoped inputs. The version-pinned route's negative historical-version test demonstrates rejection, not that historical binaries have learned scope enforcement.

Verified execution emits the implementation digest and per-file hashes separately from source/input revisions. Planner IDs bind this receipt and the scoped contract version; collector snapshots and replay CLI results also retain it. A direct library call has no verified implementation receipt and must not be presented as executing the pinned route. Saved packet receipts remain claims from their producer, not proof of historical intermediate HTTP hops or trusted execution. Runtime adoption still requires collection-owner re-review and a trusted release/execution configuration holding the independently approved pin.

## Offline tests

`python3 -m unittest discover -s tests -p 'test_crawl_scope.py'` covers exact host/path/query boundaries, explicit denial, malformed policies, legacy compatibility, redirect chains, pre-request/final guards, follow caps, policy-sensitive caches, asset denial, planner and replay. HTTP/DNS are mocked; no live crawl occurs. Run existing collector, planner and replay suites as well.

`test_scoped_implementation.py` verifies all closure-member mutations, missing/untrusted pins, symlink rejection, execution from captured verified bytes, isolated offline planning, direct-CLI rejection, and rejection of exact historical source bytes from main `99647c4`. The historical fixture retains source revision and byte hashes and requires no Git/network history in CI.
