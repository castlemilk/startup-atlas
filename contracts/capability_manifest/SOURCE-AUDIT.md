# Source audit and ownership

Inspected on 18 November 2026. This is source and connector-catalogue evidence,
not a hosted MCP acceptance report. No live MCP request, credential operation,
browser test, deployment, record write or public asset change was performed.

## Pinned input

- Repository: `castlemilk/startup-atlas`.
- Main inspected through the GitHub branch API:
  `d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f`.
- Main tree: `f8b66ea9bb4ca63ef5d52343cbda0cb96ff39e0a`.
- The independent local checkout matched that exact commit before edits.
- Open PRs inspected: 107 (`1e7d7e467c48360f2087b20d5d973dd1ee275181`),
  135 (`1752c7ed257ef8d24da523eca20e0292064d77ba`),
  160 (`ce3956359ccd2f60f7bbe85bf162ee483e326fe1`),
  162 (`0bc9af119d093b93da069a691abab9f96e040bb0`) and
  163 (`208ef3762914765f3f828e1dd6dab3f4131d567b`).
  Their existing ownership and holds are preserved.
- Existing [Pages run 44254107775](https://github.com/castlemilk/startup-atlas/actions/runs/44254107775)
  is reported `completed/success` at the same main SHA, updated
  `2026-11-18T06:51:20Z`. This read of an existing run did not launch it. Its
  result establishes neither this packet's acceptance nor private MCP deployment.
- [Canonical coordination page](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
  and its open coordination threads were read before implementation.

`evidence/source-files.json` lists the exact SHA-256 of each inspected source,
contract, runbook and workflow file. `evidence/source-catalogue.json` is the
hosted `tools` export from the pinned source. Extraction imported the inspected
module with `globalThis.fetch` replaced by a throwing function and never called
its request handler. No tool invocation or runtime availability is implied.

## Authorities and limitations

| Concern | Existing authority | Meaning for this contract |
| --- | --- | --- |
| Hosted catalogue | `backend/hosted/src/worker.mjs`, exported `tools` | 17 source definitions; full descriptors and schemas can be hashed without executing requests. |
| Local catalogue | `backend/mcp/server.mjs` | 13 local definitions, with different names and effects. No hosted/local count equivalence or automatic alias mapping is allowed. |
| Record semantics | `backend/hosted/src/startup-edit.mjs`, `startup-record.mjs`; `docs/MCP-RECORD-EDITS.md` | The strict edit schema is `startup-edit-v1`; this packet imports no new writer API and introduces no accepted writer fields. |
| Hosted protocol version | `backend/hosted/src/worker.mjs` | Advertised `serverInfo.version` is `2.0.0`; the package version is `1.0.0`. Neither is an exact build or deployment identity. |
| Published graph | `backend/hosted/src/github.mjs` | `revision`, `mainRevision` and `indexStatus` describe data publication versus source records, never deployed private MCP code. |
| Local snapshot | `backend/mcp/startups.mjs` | SHA-256 of four raw input strings, not a Git commit SHA. |
| Record digest | `backend/hosted/src/startup-edit.mjs` | Canonical `{id, record}` digest; not a schema, catalogue, runtime or permission digest. |
| Independent releases | `docs/AGENT-RUNBOOK.md`, `docs/MCP.md`, `docs/MCP-RECORD-EDITS.md`, `backend/hosted/README.md` | Pages publication and private MCP publication have separate evidence requirements. |

The connected tool registry available to this conversation exposed 13 Atlas
tool names when inspected. Those names are preserved in
`evidence/connector-registry.json`. The four strict record tool names present
in hosted source were not in that registry: `atlas_get_startup_record`,
`atlas_validate_startup_edit`, `atlas_propose_startup_edit` and
`atlas_get_startup_edit_proposal`. This is a client-registry observation with
unknown cache age, not a fresh wire `tools/list` capture. It does not prove
those tools are absent from the server. The registry supplied no independently
bound runtime build identity or raw discovery-schema digest. No such value
is filled from source, graph data or historical Space receipts.

## A read-only annotation does not promise no credential mutation

`worker.mjs` dispatches every repository tool through
`connectedOAuth().access(user)`. `oauth.mjs` may renew an expired access token,
claim a database lease, exchange a refresh token, update encrypted state, or
invalidate an uncertain connection. Therefore a graph search can change
credential state despite its read-only business operation.

`atlas_get_connection` takes a different path, but its stored expiry and
connection flag do not constitute a new repository-permission check. It is
not called by this packet. `tools/list`, `initialize` and `server/discover`
appear before repository access in the inspected handler; whether an existing
deployment has that exact behavior remains a separate evidence question.

The supplied diagnostics only read local JSON and calculate results. They do
not follow evidence references, contact a Site or GitHub, inspect credentials,
start stdio servers, call validation/proposal tools, refresh OAuth or create
test records. Even a future authenticated read requires the release owner's
review of credential side effects under the then-current authorization.

## Publication constraint

The pinned `.github/workflows/pages.yml` runs on all pull requests targeting
main, without a path filter, and invokes Chrome suites. Main pushes and the
scheduled/manual main path can also publish Pages. Skipping the PR deployment
job would not skip its browser tests. `signal-motion.yml` is another browser
workflow for selected paths; `partner-research.yml` is manual collection.

The canonical Space records independent Vercel preview activity on existing
held heads. The repository configuration does not establish a deployment-free
push route. This lane therefore provides an exact local commit, patch and Git
bundle. It creates no remote ref, PR, workflow run or deployment and changes
no workflow to evade these holds. Historical native/browser receipts belong
to their existing owners and remain historical.

## Ownership and next integration gate

This lane owns only `contracts/capability_manifest/`. It supplies a versioned
machine contract, reference validator, local diagnostics and synthetic tests.

- [Record-edit owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51)
  retains accepted API fields, writer behavior, conflicts, approval and recovery.
- The existing release owner retains runtime identity instrumentation,
  deployment, actual discovery and any authorized read/write acceptance.
  No new owner identity is invented here.
- The operational-receipts lane owns human release/status presentation and can
  consume this machine result. This packet adds no competing status UI.
- Coverage/resumability, normalized investment records, canonical parity,
  evidence UI, collection, image/record attachment and Fluid/Hardware lanes
  retain their files and semantics.

The proposed consumer boundary is recorded in the canonical Space. No owner
acknowledgement is claimed. Adoption requires their review of the manifest
version, digest semantics, runtime identity binding, authorization provenance
and freshness policy. Source merge would still not establish hosted capability.
