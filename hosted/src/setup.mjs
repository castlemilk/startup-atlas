import { ServiceError, siteSettings, settings, seal, unseal, browserPost } from './common.mjs';
import { GitHubClientConfigStore } from './storage.mjs';

const validSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{20,256}$/.test(value);
const alreadyConfigured = () => new ServiceError('ALREADY_CONFIGURED', 'A GitHub client secret is already configured. This setup form cannot replace it.', 409);
export class GitHubClientConfig {
  constructor(env) { this.env = env; this.store = new GitHubClientConfigStore(env.DB); }
  context(user) {
    const { origin } = siteSettings(this.env);
    return JSON.stringify(['github-client-secret:v1', origin, this.env.GITHUB_CLIENT_ID, user]);
  }
  async load(user) {
    siteSettings(this.env);
    // An explicitly configured server secret always takes precedence, without reading D1.
    if (this.env.GITHUB_CLIENT_SECRET) return this.env.GITHUB_CLIENT_SECRET;
    const row = await this.store.get(user);
    if (!row) return null;
    try {
      const value = await unseal(row.payload, this.env, this.context(user));
      if (!value || Object.keys(value).length !== 1 || !validSecret(value.clientSecret)) throw new Error();
      return value.clientSecret;
    } catch {
      throw new ServiceError('SETUP_REQUIRED', 'The saved GitHub client configuration cannot be opened. Ask the Site maintainer to check its server configuration.', 503);
    }
  }
  async forUser(user) {
    const env = { ...this.env, GITHUB_CLIENT_SECRET: await this.load(user) };
    settings(env); // No GitHub operation may run without a configured secret for this user.
    return env;
  }
  async create(user, clientSecret) {
    siteSettings(this.env);
    if (this.env.GITHUB_CLIENT_SECRET) throw alreadyConfigured();
    if (!validSecret(clientSecret)) throw new ServiceError('INVALID_SETUP', 'Enter the existing GitHub App client secret, using 20–256 letters, numbers, hyphens or underscores without spaces.', 400);
    const payload = await seal({ clientSecret }, this.env, this.context(user));
    if (!await this.store.create(user, payload)) throw alreadyConfigured();
  }
}

// A fixed total deadline and byte limit also apply to streaming/chunked bodies.
export async function readSetupBody(request) {
  if (!request.body) throw new ServiceError('INVALID_SETUP', 'Submit the setup form with the existing client secret.', 400);
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new ServiceError('REQUEST_TOO_LARGE', 'The setup form must not exceed 4 KiB.', 413);
  const reader = request.body.getReader();
  const chunks = []; let size = 0; let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ServiceError('REQUEST_TIMEOUT', 'The setup form took too long to arrive. Submit it again when ready.', 408)), 5000); });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new ServiceError('REQUEST_TOO_LARGE', 'The setup form must not exceed 4 KiB.', 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new ServiceError('INVALID_SETUP', 'The setup form must use valid UTF-8.', 400); }
  } finally {
    clearTimeout(timer);
    // A hostile stalled stream must not extend the deadline through cancellation.
    void reader.cancel().catch(() => {});
  }
}

export async function saveSetup(request, env, user) {
  browserPost(request, siteSettings(env).origin);
  if (new URL(request.url).search) throw new ServiceError('INVALID_SETUP', 'Use the setup form without query parameters. Never put credentials in a URL.', 400);
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '') || request.headers.has('Content-Encoding')) {
    throw new ServiceError('INVALID_SETUP', 'Submit the uncompressed setup form from this private Site.', 415);
  }
  const form = new URLSearchParams(await readSetupBody(request));
  const keys = [...form.keys()];
  if (keys.length !== 2 || form.getAll('action').length !== 1 || form.get('action') !== 'save-existing-secret' || form.getAll('client_secret').length !== 1 || keys.some(key => !['action', 'client_secret'].includes(key))) {
    throw new ServiceError('INVALID_SETUP', 'The setup form contains missing, duplicate or unexpected fields.', 400);
  }
  await new GitHubClientConfig(env).create(user, form.get('client_secret'));
}

export const setupForm = `<p>Finish setup by pasting the existing GitHub App client secret directly into this private form yourself. Do not paste it into chat or ask an agent to read it.</p><p>It will be encrypted on this Site’s server and bound to your signed-in Site account, this Site and the registered GitHub App. It is never returned by the page or MCP tools.</p><form method="post" action="/setup" autocomplete="off"><input type="hidden" name="action" value="save-existing-secret"><label for="client-secret">Existing GitHub App client secret</label><input id="client-secret" type="password" name="client_secret" required minlength="20" maxlength="256" autocomplete="new-password" autocapitalize="none" spellcheck="false"><button type="submit">Save existing client secret</button></form><p>This setup form only saves the first secret for your account. It cannot replace an existing one or connect GitHub without your separate authorization.</p>`;
