import { ServiceError, settings, random, digest, seal, unseal, readJson, REPOSITORY, REPOSITORY_ID, OWNER_ID } from './common.mjs';
import { OAuthStore } from './storage.mjs';

const COOKIE = '__Host-atlas-oauth';
const cookie = value => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const redirect = (location, setCookie = clearCookie) => new Response(null, { status: 303, headers: { Location: location, 'Set-Cookie': setCookie, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export class GitHubOAuth {
  constructor(env, { fetcher = globalThis.fetch.bind(globalThis), clock = Date.now, store = new OAuthStore(env.DB) } = {}) {
    this.env = env; this.fetcher = fetcher; this.clock = clock; this.store = store;
  }
  async start(user) {
    const { callback } = settings(this.env);
    const state = random(), nonce = random(), verifier = random();
    const hash = await digest(state);
    const generation = (await this.store.beginAuth(user)).version;
    await this.store.putState(hash, user, await seal({ verifier, nonce: await digest(nonce), generation }, this.env, `state:${user}:${hash}`), this.clock() + 600000);
    const url = new URL('https://github.com/login/oauth/authorize');
    Object.entries({ client_id: this.env.GITHUB_CLIENT_ID, redirect_uri: callback, state, scope: 'offline_access', code_challenge: await digest(verifier), code_challenge_method: 'S256', allow_signup: 'false' }).forEach(([key, value]) => url.searchParams.set(key, value));
    return redirect(url.href, cookie(nonce));
  }
  async tokenRequest(parameters) {
    let response;
    try {
      response = await this.fetcher('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'manual', signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ client_id: this.env.GITHUB_CLIENT_ID, client_secret: this.env.GITHUB_CLIENT_SECRET, ...parameters }),
      });
    } catch (error) {
      // Keep provider/network details and request bodies out of logs. The exchange may
      // have succeeded remotely; this only classifies the failure, never retries it.
      const kind = error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'AbortError' ? 'aborted' : 'network_or_redirect';
      console.error(JSON.stringify({ event: 'github_token_exchange_unconfirmed', kind }));
      throw new ServiceError('CONNECT_GITHUB', 'GitHub authorization could not be confirmed. Reconnect; do not replay a token exchange.', 401);
    }
    if (!response.ok) throw new ServiceError('CONNECT_GITHUB', 'GitHub rejected authorization. Reconnect GitHub.', 401);
    const value = await readJson(response, 16384);
    if (value.error || typeof value.access_token !== 'string' || value.token_type?.toLowerCase() !== 'bearer' || value.scope ||
        !Number.isInteger(value.expires_in) || value.expires_in < 60 || value.expires_in > 28800 ||
        typeof value.refresh_token !== 'string' || !Number.isInteger(value.refresh_token_expires_in) || value.refresh_token_expires_in < 60) {
      throw new ServiceError('CONNECT_GITHUB', 'GitHub must return an expiring GitHub App user token, not a personal token or broad OAuth scope.', 401);
    }
    return { accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt: this.clock() + value.expires_in * 1000, refreshExpiresAt: this.clock() + value.refresh_token_expires_in * 1000 };
  }
  async api(path, token) {
    const response = await this.fetcher(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'Startup-Atlas-MCP', 'X-GitHub-Api-Version': '2026-03-10' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ServiceError('CONNECT_GITHUB', 'GitHub access could not be verified. Check the app installation and reconnect.', 401);
    return readJson(response, 524288);
  }
  async verify(token) {
    const account = await this.api('/user', token);
    if (account.id !== OWNER_ID) throw new ServiceError('WRONG_ACCOUNT', 'Connect the GitHub account that owns Startup Atlas.', 403);
    const installations = await this.api('/user/installations?per_page=100', token);
    const candidates = installations.installations?.filter(item => item.account?.id === OWNER_ID) ?? [];
    if (candidates.length !== 1) throw new ServiceError('INSTALLATION_REQUIRED', 'Install this private GitHub App on the Startup Atlas owner account only.', 403);
    const installation = candidates[0];
    if (installation.repository_selection !== 'selected' || installation.permissions?.contents !== 'write' || installation.permissions?.pull_requests !== 'write' ||
        Object.entries(installation.permissions ?? {}).some(([key, value]) => !['contents', 'pull_requests', 'metadata'].includes(key) && value !== 'none')) {
      throw new ServiceError('INSTALLATION_SCOPE', 'Use selected-repository access with only Contents and Pull requests read/write, plus automatic Metadata read.', 403);
    }
    const repos = await this.api(`/user/installations/${installation.id}/repositories?per_page=100`, token);
    if (repos.total_count !== 1 || repos.repositories?.length !== 1 || repos.repositories[0].id !== REPOSITORY_ID || repos.repositories[0].full_name?.toLowerCase() !== REPOSITORY) {
      throw new ServiceError('INSTALLATION_SCOPE', 'The GitHub App installation must select only castlemilk/startup-atlas.', 403);
    }
    return { githubUserId: account.id, installationId: installation.id };
  }
  async callback(request, user) {
    const { origin, callback } = settings(this.env);
    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw new ServiceError('INVALID_STATE', 'Start Connect GitHub again from this Site.', 403);
    const hash = await digest(state);
    const saved = await this.store.consumeState(hash, user, this.clock());
    if (!saved) throw new ServiceError('INVALID_STATE', 'This authorization expired, belongs to another session or has already been used.', 403);
    const stateData = await unseal(saved.payload, this.env, `state:${user}:${hash}`);
    const nonce = request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!nonce || await digest(nonce) !== stateData.nonce) throw new ServiceError('INVALID_STATE', 'Complete authorization in the browser that started it.', 403);
    if (url.searchParams.has('error')) return redirect(`${origin}/?connection=cancelled`);
    const code = url.searchParams.get('code');
    if (!code || code.length > 1024) throw new ServiceError('INVALID_CODE', 'GitHub did not return a valid authorization code.', 400);
    const tokens = await this.tokenRequest({ code, redirect_uri: callback, code_verifier: stateData.verifier, repository_id: String(REPOSITORY_ID) });
    try {
      const verified = await this.verify(tokens.accessToken);
      if (!await this.store.save(user, await seal({ ...tokens, ...verified }, this.env, `connection:${user}`), stateData.generation)) {
        throw new ServiceError('INVALID_STATE', 'This connection was cancelled or replaced while authorization was in progress. Start again if intended.', 409);
      }
    } catch (error) {
      // Revoke only this token, never the grant: another browser may have reconnected.
      await this.revokeToken(tokens.accessToken);
      throw error;
    }
    return redirect(`${origin}/?connection=connected`);
  }
  async status(user) {
    const row = await this.store.get(user);
    if (!row?.payload) return { connected: false, repository: REPOSITORY };
    const tokens = await unseal(row.payload, this.env, `connection:${user}`);
    const connected = tokens.refreshExpiresAt > this.clock();
    // The callback verified this immutable account ID before saving. Derive only
    // the known public identity; older records need no migration or provider read.
    const githubLogin = connected && tokens.githubUserId === OWNER_ID ? REPOSITORY.split('/')[0] : undefined;
    return { connected, repository: REPOSITORY, expiresAt: new Date(tokens.expiresAt).toISOString(), ...(githubLogin ? { githubLogin } : {}) };
  }
  async access(user) {
    settings(this.env);
    const row = await this.store.get(user);
    if (!row?.payload) throw new ServiceError('CONNECT_GITHUB', 'Open this private Site and choose Connect GitHub before using repository tools.', 401);
    if (row.lock_owner && row.lock_until <= this.clock()) {
      await this.store.invalidate(user, row.version, row.lock_owner);
      throw new ServiceError('CONNECT_GITHUB', 'A previous token renewal has an uncertain outcome. Reconnect GitHub; the old refresh token will not be replayed.', 401);
    }
    const tokens = await unseal(row.payload, this.env, `connection:${user}`);
    if (tokens.expiresAt > this.clock() + 60000) return tokens.accessToken;
    if (tokens.refreshExpiresAt <= this.clock()) throw new ServiceError('CONNECT_GITHUB', 'GitHub authorization expired. Reconnect GitHub.', 401);
    const owner = random();
    if (!await this.store.claim(user, row.version, owner, this.clock())) throw new ServiceError('REFRESH_BUSY', 'Another request is renewing the connection. Retry this read after it finishes.', 409);
    try {
      const refreshed = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken });
      const payload = await seal({ ...tokens, ...refreshed }, this.env, `connection:${user}`);
      if (!await this.store.refreshed(user, row.version, owner, payload)) {
        await this.revokeToken(refreshed.accessToken);
        throw new ServiceError('CONNECT_GITHUB', 'The connection changed during renewal. Check connection status before retrying.', 401);
      }
      return refreshed.accessToken;
    } catch (error) {
      // A refresh token may have rotated even if the response was lost. Never replay it.
      await this.store.invalidate(user, row.version, owner);
      throw error;
    }
  }
  async revokeToken(accessToken) {
    try {
      const response = await this.fetcher(`https://api.github.com/applications/${encodeURIComponent(this.env.GITHUB_CLIENT_ID)}/token`, {
        method: 'DELETE', headers: { Accept: 'application/vnd.github+json', Authorization: `Basic ${btoa(`${this.env.GITHUB_CLIENT_ID}:${this.env.GITHUB_CLIENT_SECRET}`)}`, 'Content-Type': 'application/json', 'User-Agent': 'Startup-Atlas-MCP', 'X-GitHub-Api-Version': '2026-03-10' },
        body: JSON.stringify({ access_token: accessToken }), redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
      return response.status === 204;
    } catch { return false; }
  }
  async disconnect(user) {
    const row = await this.store.disconnect(user);
    if (!row?.payload) return { disconnected: true, revoked: false };
    const tokens = await unseal(row.payload, this.env, `connection:${user}`);
    // Token-specific revocation cannot revoke a newer connection's entire grant.
    return { disconnected: true, revoked: await this.revokeToken(tokens.accessToken) };
  }
}
