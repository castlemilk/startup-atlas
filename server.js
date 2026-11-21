/**
 * DeepHost handler-mode entrypoint for the Startup Atlas MCP HTTP server.
 *
 * DeepHost's "node" framework does NOT run `npm start` and does not run a
 * long-lived server: its runtime (internal/runtimepool) imports this file
 * once as `server.js` at the artifact root, takes the default export as a
 * Node http handler `(req, res) => ...`, and serves every request itself
 * over a unix socket. A repo with no `server.js` at its root fails every
 * request with "handler could not start" — which is what happened to every
 * build before this file existed, regardless of the start script or the
 * bind host/port fixes.
 *
 * The handler is the same one `node backend/mcp/http-server.mjs` listens
 * with locally (see createHandler there); only the listening is skipped.
 * Configuration still comes from the environment (GOOGLE_CLIENT_ID,
 * GOOGLE_CLIENT_SECRET, ATLAS_GOOGLE_ALLOWED_EMAILS, ATLAS_HTTP_BASE_URL),
 * and the config validation throws at import time if it is missing, so a
 * misconfigured deployment fails loudly at worker start, not per request.
 */
import { createHandler } from './backend/mcp/http-server.mjs';

const handler = await createHandler();

export default handler;
