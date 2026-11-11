export const REPOSITORY = 'castlemilk/startup-atlas';
export const REPOSITORY_ID = 1453828311;
export const OWNER_ID = 7474316;
export class ServiceError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...headers },
});
export function settings(env) {
  let origin;
  try { origin = new URL(env.PUBLIC_ORIGIN); } catch { throw new ServiceError('SETUP_REQUIRED', 'The private hosted MCP has not been configured.', 503); }
  if (origin.protocol !== 'https:' || origin.origin !== env.PUBLIC_ORIGIN || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.OAUTH_ENCRYPTION_KEY || !env.DB) {
    throw new ServiceError('SETUP_REQUIRED', 'The private hosted MCP OAuth registration, encrypted storage and server secrets must be configured first.', 503);
  }
  return { origin: origin.origin, callback: `${origin.origin}/auth/github/callback` };
}
export function identity(request) {
  const subject = request.headers.get('oai-authenticated-user-id');
  if (!subject || subject.length > 200) throw new ServiceError('SIGN_IN_REQUIRED', 'Sign in through this private Site before using the MCP.', 401);
  return subject;
}
export function browserPost(request, origin) {
  if (request.method !== 'POST' || request.headers.get('Origin') !== origin) throw new ServiceError('FORBIDDEN_ORIGIN', 'A same-origin form submission is required.', 403);
}
export function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function unbase64(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async value => base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export async function readJson(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw new ServiceError('UPSTREAM_RESPONSE', 'The upstream response was empty.', 502);
  const parts = []; let length = 0; let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ServiceError('UPSTREAM_RESPONSE', 'The upstream response body timed out.', 502)), 15000); });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new ServiceError('UPSTREAM_RESPONSE', 'The upstream response exceeded its size limit.', 502);
      parts.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); }
}
export async function seal(value, env, context) {
  const raw = unbase64(env.OAUTH_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new ServiceError('SETUP_REQUIRED', 'OAuth encryption requires a 32-byte server secret.', 503);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, new TextEncoder().encode(JSON.stringify(value)));
  return `${base64url(iv)}.${base64url(encrypted)}`;
}
export async function unseal(value, env, context) {
  const [iv, encrypted] = value.split('.');
  const key = await crypto.subtle.importKey('raw', unbase64(env.OAUTH_ENCRYPTION_KEY), 'AES-GCM', false, ['decrypt']);
  try {
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(iv), additionalData: new TextEncoder().encode(context) }, key, unbase64(encrypted))));
  } catch { throw new ServiceError('CONNECT_GITHUB', 'The saved connection cannot be opened. Reconnect GitHub.', 401); }
}
