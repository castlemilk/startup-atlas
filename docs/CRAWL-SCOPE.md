# Scoped document approval proposal

**Draft for collection-owner agreement, linked to #213. No source approval or runtime activation.** Existing source-use restrictions remain unresolved. This implementation narrows an existing `approved=yes` seed; it does not establish permission, identity, publication rights or an asset licence.

## Opt-in CSV contract

Optional `crawl_scope` contains JSON (use a CSV writer to quote it):

```json
{"version":1,"allowed_urls":["https://example.com/","https://example.com/team"],"denied_urls":[],"max_follow":1}
```

- No column or blank cell preserves the existing reviewed seed behavior. It is **legacy host approval**, not a new default rights grant. No checked-in seed is changed by this proposal.
- Nonblank scope must be a version-1 object with a nonempty allowlist, an integer `max_follow` from 0 through 20, and optionally a denylist. Unknown/duplicate keys and malformed values fail closed before collection or planning. Each list holds at most 100 URLs; the serialized cell is at most 65,536 characters and each URL at most 4,096.
- Exact HTTPS document URLs only, on the official seed's exact host. No wildcard, directory-prefix, subdomain, cross-host redirect or query stripping. Query bytes/order are exact; `/team`, `/team/`, and `/team?lang=en` are distinct. Fragment URLs are rejected. Encoded paths, dot/trailing-dot segments, repeated slashes, backslashes and path parameters are rejected rather than interpreted. If a real grant needs these forms, keep it held pending an explicitly reviewed contract extension.
- Denials override allowances; the seed itself must be allowed and not denied. Nothing unlisted is permitted in scoped mode. A deny is exact-document, not a prefix; descendants are nevertheless denied unless separately listed.
- `max_follow` caps the existing CLI follow limit; it does not increase it or schedule additional URLs. Existing link selection remains bounded. Denied discoveries are visible as skipped pages without network requests; they may consume a follow slot, so the result is not proof all allowed pages were fetched.
- The guard runs before transport, on **every redirect destination**, and on returned final URL. Existing same-host, public-address, throttle, byte/time/redirect and 429 protections remain. No robots requests or inspection.
- Scope applies to CSV-seeded `sites`, `profiles`, `company-profiles`, and therefore the page-collection part of `logos`. Asset downloads for scoped rows are always denied, including same-host images and listed CDN hosts. Image/social URLs can remain unverified page observations. Scoped approval does not apply to independent curated registries/Wikidata or retroactively authorize captures.

## Packets and offline compatibility

The existing packet envelope remains version 1. Scoped result rows add the normalized `crawl_scope` object (scope contract version 1); absent scope remains absent in legacy packets. The planner carries the same object, with the existing seed-byte hash binding the policy. Policy-sensitive site caches never reuse a broader successful observation for a narrower row.

Saved-packet replay requires the row policy to equal the current pinned seed policy, limits saved pages by its follow cap, and checks successful requested/final URLs. Skipped out-of-scope discoveries remain failure observations. Replay is synthetic saved-evidence analysis: it does not prove intermediate HTTP hops or fresh source permission. It never runs a crawl or promotes facts.

**Do not pass scoped CSVs to older collector/planner/replay versions:** older tools may ignore the new column. Rollout requires a reviewed version-pinned execution path and collection-owner agreement. This proposal does not migrate any existing seed, alter workflow triggers, or settle checkpoint/recovery policy. A separately reviewed source-evidence patch is required before opting any real source in. Purpose restrictions must be reviewed separately; this version enforces URLs/follow count/text-page versus asset downloads, not semantic downstream use.

## Offline tests

`python3 -m unittest discover -s tests -p 'test_crawl_scope.py'` covers exact host/path/query boundaries, explicit denial, malformed policies, legacy compatibility, redirect chains, pre-request/final guards, follow caps, policy-sensitive caches, asset denial, planner and replay. HTTP/DNS are mocked; no live crawl occurs. Run existing collector, planner and replay suites as well.
