# Combined source review, 18 November 2026

The coordinator combines the unchanged capability packet at original commit
`6f76913b45f2b56ffdc3c14e15877319e155a52e` and receipts packet at
`a6bb1c18fb231211ede343601004aea8d866141c` on main
`be1678d428c359411e6d37ca1458f5fd0f16e9e8`.
Original archive identities and historical observations in each README remain
unchanged; their initial unpublished status describes that earlier handoff.

The source-only consumer is now available beside its pinned dependency:

```sh
python3 -B contracts/operational_receipts/with_capabilities.py \
  contracts/operational_receipts/examples/current-main-with-capabilities-20261118.json \
  --manifest contracts/capability_manifest/source-baseline.json \
  --validator contracts/capability_manifest/validator.mjs \
  --as-of 2026-11-18T08:10:00Z --format markdown
```

This intentionally assesses historical evidence as expired. It does not
refresh evidence or report the current deployment. The capability validator's
exact bytes and pin are unchanged. An additive receipt guard rejects Atlas v1
capabilities attached to a different repository, before executing the consumer.
Standalone receipts remain generic. The public projection remains unchanged.

`tests/operational-contracts.test.js` joins normal test discovery and executes
the 49 capability, 55 receipt and 13 bridge tests. It checks test counts and
rejects failures or skips; Python gates do not rely on removable `assert`
statements. It adds no workflow, dependency, runtime route or data mutation.

Independent combined review found and corrected the cross-repository binding
gap and optimization-sensitive test gates. Local root tests remain subject to
the managed temporary-directory staging guard; exact-head hosted CI is required
and must be recorded separately, not inferred from focused passes.

Publication is coordinator-authorized through the existing PR/hosted CI path;
this does not lift local browser permissions or the separate hosted MCP
credential/deployment hold. Operational adoption, trustworthy acquisition,
freshness policy and release decisions remain with their existing owners.
No observation is authority to execute an action.
