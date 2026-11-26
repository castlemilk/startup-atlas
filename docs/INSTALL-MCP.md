# Install & connect — Startup Atlas MCP quickstart

The fastest way to get the 18 Startup Atlas tools into your MCP client.
Verified 26 Nov 2026 against the live hosted endpoint and a fresh clone
of this repository.

## Which path should I use?

| Path | Install | Use it when |
| --- | --- | --- |
| **Hosted** (recommended) | Nothing — one URL in your client | You just want to search and use Atlas data. Data is the live published corpus; sign-in is Google. |
| **Local stdio** | A clone of this repo + Node 20+ | You are developing Atlas, work offline, or want the write tools to edit *your own checkout*. |
| **Self-hosted HTTP** | Your own deployment + your own Google OAuth client | You run a team server at your own origin. See [MCP over HTTP](MCP-HTTP.md); the hosted path below is this same server, already deployed. |

The local server's full tool and data contract is in [MCP.md](MCP.md);
this page is only about getting connected.

## 1. Hosted — nothing to install

Endpoint (copy it exactly, including the `/mcp` path):

```
https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp
```

**Access:** sign-in is Google OAuth, and the server only admits
allow-listed Google accounts. If sign-in ends in `access_denied` or your
calls return **403**, your Google account is not on the allow-list — ask
the repository owner to add it; no client-side setting fixes that. A
**401** just means "not signed in (yet)" — finish the sign-in flow your
client offers.

### Claude Code

```sh
claude mcp add --transport http startup-atlas https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp
```

Then run `/mcp` inside Claude Code and choose **Authenticate** to
complete the Google sign-in in your browser. Or commit this `.mcp.json`
at your project root — note `type` is required; an entry with only a
`url` is silently skipped:

```json
{
  "mcpServers": {
    "startup-atlas": {
      "type": "http",
      "url": "https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp"
    }
  }
}
```

### Claude.ai and Claude Desktop (custom connector)

1. Open **Settings → Connectors** (Claude Desktop: **Customize →
   Connectors**).
2. Choose **Add custom connector**.
3. Name: `Startup Atlas`. Remote MCP server URL: paste the endpoint
   above.
4. Click **Add**, then **Connect**, and sign in with an allow-listed
   Google account.

Do not put the hosted URL in `claude_desktop_config.json` — that file
only starts local stdio processes. (On an old Desktop version without
Connectors, bridge it instead: `"command": "npx"`, `"args": ["-y",
"mcp-remote", "<endpoint>"]` in that file's `mcpServers`.)

### Cursor

Add to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` in a
project:

```json
{
  "mcpServers": {
    "startup-atlas": {
      "url": "https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp"
    }
  }
}
```

Restart Cursor, open **Customize → MCPs**, switch **startup-atlas** on
and complete the Google sign-in when prompted.

### VS Code

`.vscode/mcp.json` (note: the top-level key is `servers`, not
`mcpServers`):

```json
{
  "servers": {
    "startup-atlas": {
      "type": "http",
      "url": "https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp"
    }
  }
}
```

### Any other Streamable HTTP client

- Transport: **Streamable HTTP**; URL: the endpoint above.
- Auth: OAuth 2.0 with dynamic client registration (RFC 7591) and PKCE
  S256. The client discovers everything itself from
  `<base>/.well-known/oauth-protected-resource/mcp` and
  `<base>/.well-known/oauth-authorization-server` — there is no client
  ID or secret to paste in.
- Clients that cannot do OAuth can send a Google ID token directly as
  `Authorization: Bearer <token>`; it is verified the same way.

Smoke test (no token → expect `401`, which proves the endpoint is up
and challenging):

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Check it worked:** ask your assistant to run `atlas_get_catalogue_info`
or search for a programme. You should see the Atlas tools answer with
the catalogue revision and counts.

## 2. Local stdio — run it from your own checkout

```sh
git clone https://github.com/castlemilk/startup-atlas.git
cd startup-atlas
npm ci --prefix backend/mcp --ignore-scripts   # one time
```

You do **not** need `npm run data:generate` on a fresh clone — the
catalogue the server reads is committed. (Regenerate only after editing
source data yourself.)

Then either run it in a terminal —

```sh
npm run mcp              # read-only
npm run mcp -- --write   # enable the four write tools
```

`npm run mcp` goes through `scripts/run-mcp.mjs`, which installs the
`backend/mcp` dependencies automatically on first run, so the one-time
`npm ci` above can be skipped when you start it this way.

— or register it with your client. Claude Code users opening this repo
get it for free: the committed `.mcp.json` at the repo root registers
the local server (read-only) via the same launcher. For other clients:

```sh
# Claude Code, from anywhere
claude mcp add startup-atlas -- node /absolute/path/to/startup-atlas/scripts/run-mcp.mjs

# Codex CLI
codex mcp add startup-atlas -- node /absolute/path/to/startup-atlas/backend/mcp/server.mjs --write
```

Generic stdio JSON (Claude Desktop's `claude_desktop_config.json`,
Cursor's `mcp.json`, and similar) — replace the absolute path:

```json
{
  "mcpServers": {
    "startup-atlas": {
      "command": "node",
      "args": ["/absolute/path/to/startup-atlas/backend/mcp/server.mjs"]
    }
  }
}
```

Add `"--write"` to `args` only when you want the write tools; writes
change files in that checkout only — nothing is committed, pushed or
published by the server. The server defaults to the checkout containing
it, whatever the client's working directory is; `--repo <path>` selects
a different checkout.

## 3. Self-hosted HTTP

Run the same server at your own origin with your own Google OAuth
client: follow [MCP over HTTP (Google OAuth)](MCP-HTTP.md) and start
from the variable template in
[`backend/mcp/.env.example`](../backend/mcp/.env.example). The server
fails closed at startup and names any required variable that is
missing.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Cannot find package '@modelcontextprotocol/sdk'` | The `backend/mcp` dependencies are not installed — the root `npm ci --ignore-scripts` deliberately skips the hook that installs them. Run `npm ci --prefix backend/mcp --ignore-scripts`, or start via `npm run mcp` / `scripts/run-mcp.mjs`, which installs them for you. |
| Hosted calls return **401** | Not signed in, or the access token expired (they last 1 hour). Re-authenticate in your client; refresh is automatic in OAuth-capable clients. |
| Hosted sign-in ends in `access_denied`, or calls return **403** | Your Google account is verified but not on the server's allow-list. Ask the owner to add it — this is not a client setting. |
| Claude Code lists no `startup-atlas` server | In JSON config the entry needs `"type": "http"` next to `url`; a bare-`url` entry is treated as stdio and skipped. |
| Cursor shows nothing after editing `mcp.json` | Restart Cursor, then enable the server under **Customize → MCPs**. |
| Nothing in Claude Desktop after editing `claude_desktop_config.json` | That file is local-stdio only. For the hosted server use **Connectors** (above); for the local server use the stdio JSON with an absolute path. |
| Local HTTP server exits immediately | It names the missing variable (e.g. `ATLAS_GOOGLE_CLIENT_ID … is not set`). Copy `backend/mcp/.env.example`, fill it in, and export the values — the server does not read `.env` files itself. |
| Tools answer but the data looks stale (local) | The server reads the committed catalogue in your checkout: `git pull`, and regenerate only if you edited source data (`npm run data:generate`). |
