# CI toolchain contract and npm download cache

Issue #147 (Q6/Q7). This document is the repo side of the toolchain
qualification contract: it states which tool versions the intended CI
execution image / toolcache is expected to provision, how workflows react
when the provisioned tools already match (skip the download) or drift
(fail in a controlled way), and how the narrowly scoped npm download cache
is keyed and trusted.

## Toolchain contract — `ci/toolchain.json`

| Tool   | Contract      | Match       | Source of truth                          |
| ------ | ------------- | ----------- | ---------------------------------------- |
| Go     | 1.25.0        | exact       | `go.mod` (`go-version-file: go.mod`)     |
| Node   | 26.13.1       | exact       | `.nvmrc`                                 |
| Python | 3.12          | major.minor | workflow `setup-python` `python-version` |
| Chrome | stable channel | present    | runner image; workflows set `CHROME_BIN=google-chrome` |

The versions are a recorded baseline, not a freeze: bump them in
`ci/toolchain.json` together with the source pin (go.mod or the workflow).
`tests/test_toolchain_contract.py` fails if the contract and the pins drift
apart. Chrome is a moving stable channel, so the contract pins the binary
name and presence and records the found version rather than an exact build.

### Probe, skip, verify

Every job that installs a toolchain now runs, right after checkout:

```yaml
- name: Probe provisioned toolchain
  id: toolchain
  run: python3 scripts/toolchain.py probe >> "$GITHUB_OUTPUT"
```

`scripts/toolchain.py probe` never fails; it emits `<tool>_ready=true|false`
and `<tool>_version=<found|missing>`. The `setup-go` / `setup-node` steps are
gated on the probe (`steps.toolchain.outputs.<tool>_ready != 'true'`), so a
warm intended-rig job whose image already provides the contracted version
does not download the toolchain again — the observed baseline cost was
~6.5 s acquiring Go on a run whose dependency caches otherwise hit. On a rig
without the provisioned versions the probe reports not-ready and the setup
action runs exactly as before, so GitHub-hosted behaviour is unchanged.

After setup, each job runs `scripts/toolchain.py check --only <tools>` for
the tools it uses. `check` prints the recorded versions and exits 1 on any
drift (wrong version or missing tool), naming expected vs found — a
controlled failure that tells the operator to refresh the provisioned
image/toolcache or update the contract, instead of tests silently running
on an unqualified toolchain.

Provisioning expectation for the intended-rig image: pre-install the
contract versions into the image/toolcache (Go 1.25.0, Node 26.13.1,
Python 3.12.x, google-chrome stable). Clean per-job isolation is unchanged —
jobs still run in fresh checkouts and `npm ci` still builds `node_modules`
from the lockfiles; only the toolchain acquisition is shared.

Rollback for Q6: if provisioning proves unreliable on the intended
executor, remove the probe gates (the `steps.toolchain.outputs.*`
conditions) and the setup actions return to verified per-job installation;
`check` can stay as a recording/verification step.

## npm download cache (Q7)

The three workflows that run `npm ci` (`pages.yml`, `deep-atlas-checks.yml`,
`signal-motion.yml`) restore a cache of the npm **download cache only**
(`~/.npm`) before installing, and save it afterwards under this key:

```
atlas-npm-<runner.os>-<runner.arch>-node22-npm<npm version>-<hash of the three lockfiles>
```

with the hash taken over `package-lock.json`, `backend/mcp/package-lock.json`
and `backend/hosted/package-lock.json`, and a restore-keys prefix fallback of
`atlas-npm-<os>-<arch>-node22-`.

Properties, per the issue's acceptance criteria:

- **Downloads only.** The cached path is `~/.npm`; `node_modules` and build
  output are never cached. Installs remain the three exact commands
  `npm ci --ignore-scripts`, `npm ci --prefix backend/mcp --ignore-scripts`,
  `npm ci --prefix backend/hosted --ignore-scripts`.
- **Changed lockfiles miss correctly.** Any change to any of the three
  lockfiles changes the key; the prefix fallback can only restore tarballs
  for packages the lockfile still pins, and `npm ci` verifies integrity
  against the lockfile before use.
- **PR data cannot poison trusted caches.** Pull-request runs restore but
  never save: the save step is gated on `github.event_name != 'pull_request'`.
  Only pushes to main and maintainer-dispatched runs write the cache.
  Restored caches are still treated as untrusted input — they only ever
  feed `npm ci`, which re-verifies every tarball against the lockfile hash.
- **No credentials enter the cache.** The repo has no `.npmrc`; the cache
  holds registry tarballs and metadata only.
- The existing Go module/build cache behaviour is untouched; no second Go
  cache was added.

### Benchmark (local, matched commands, 25 Nov 2026)

Measured on this repo with the three exact `npm ci` commands, an isolated
`--cache` directory, Node v24.22.1 / npm 10.9.4 (local workstation, not the
intended rig — treat as directional):

| Install (`npm ci --ignore-scripts`) | Cold (empty cache) | Warm 1 | Warm 2 |
| ----------------------------------- | ------------------ | ------ | ------ |
| root                                | 97.7 s             | 89.3 s | 86.9 s |
| `backend/mcp`                       | 46.2 s             | 57.2 s | 48.8 s |
| `backend/hosted`                    | 9.9 s              | 14.2 s | 17.8 s |
| **Total**                           | **153.8 s**        | **160.7 s** | **153.6 s** |

Download-cache size after the cold pass: 47 MB. All cold and warm installs
succeeded; warm installs re-verified every tarball against the lockfiles.

**Reading of the result:** on this workstation the samples are
noise-dominated (shared CPU; run-to-run variance exceeds any cache effect).
The root install — the only one whose downloads are a large share — improved
~10 % warm, while the two small installs are dominated by fixed npm overhead
and did not. So the local benchmark shows **no demonstrated net benefit**,
matching the issue's "low/uncertain" expectation; it does not show a net
harm either (warm totals within ±5 % of cold, before counting CI
restore/save time). The deciding measurement is the restore/save vs install
step timings on the intended rig once this lands; if those show net time or
storage worsening, apply the rollback below. The cache is safe to carry
meanwhile: restore is best-effort, installs fall back to the network on any
miss, and PR runs never write it.

Rollback for Q7: if restore/save overhead or storage outweighs the saving
on the intended rig, delete the restore/save steps (and the `npmver` step)
from the three workflows; installs fall back to cold downloads unchanged.
`tests/test_toolchain_contract.py` asserts the cache steps exist and stay
scoped, so removing them means removing those assertions in the same change.
