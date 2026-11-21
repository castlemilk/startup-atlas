/**
 * Google identity verification for the HTTP MCP server.
 *
 * Two token shapes are accepted, both issued by Google:
 * - A Google ID token (JWT, RS256, signed by Google's JWKS). This is what
 *   the OAuth authorization-code flow returns, and what a user can paste
 *   from Google's own sign-in flow.
 * - A Google access token, checked against Google's tokeninfo endpoint.
 *
 * No Google client secret or token is ever stored here. Verification is
 * signature-based (JWKS) or a live tokeninfo call; the allow-list decides
 * which verified Google accounts may call the tools at all.
 */
import { createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

const jwksCache = { keys: null, fetchedAt: 0, ttlMs: 60 * 60 * 1000 };

function base64urlDecode(input) {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT: expected three segments.');
  let header;
  let payload;
  try {
    header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
    payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
  } catch {
    throw new Error('Malformed JWT: header or payload is not JSON.');
  }
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: base64urlDecode(parts[2]) };
}

async function fetchJwks({ fetchImpl = fetch, jwksUrl = GOOGLE_JWKS_URL } = {}) {
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.fetchedAt < jwksCache.ttlMs) return jwksCache.keys;
  const response = await fetchImpl(jwksUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Could not fetch Google JWKS (${response.status}).`);
  const body = await response.json();
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error('Google JWKS returned no keys.');
  jwksCache.keys = body.keys;
  jwksCache.fetchedAt = now;
  return body.keys;
}

/** Test-only hook: drop the cached JWKS so tests can point at a fresh mock. */
export function clearJwksCache() {
  jwksCache.keys = null;
  jwksCache.fetchedAt = 0;
}

/**
 * Verify a Google-issued ID token. Returns { email, emailVerified, sub,
 * expiresAt, method: 'id_token' }. Throws on any verification failure.
 */
export async function verifyGoogleIdToken(token, { clientId, fetchImpl = fetch, jwksUrl = GOOGLE_JWKS_URL } = {}) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is required to verify a Google ID token.');
  if (typeof token !== 'string' || token.split('.').length !== 3) throw new Error('Not a JWT.');
  const { header, payload, signingInput, signature } = decodeJwt(token);
  if (header.alg !== 'RS256') throw new Error(`Unsupported JWT alg: ${header.alg}.`);
  if (!header.kid) throw new Error('JWT has no kid.');
  const keys = await fetchJwks({ fetchImpl, jwksUrl });
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw new Error('No Google JWKS key matches this token.');
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const verified = createVerify('RSA-SHA256').update(signingInput).end().verify(publicKey, signature);
  if (!verified) throw new Error('Google ID token signature verification failed.');
  if (!GOOGLE_ISSUERS.includes(payload.iss)) throw new Error(`Unexpected token issuer: ${payload.iss}.`);
  if (payload.aud !== clientId) throw new Error('Token audience does not match GOOGLE_CLIENT_ID.');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) throw new Error('Google ID token has expired.');
  if (typeof payload.email !== 'string' || payload.email.length === 0) throw new Error('Google ID token carries no email.');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified) throw new Error('Google account email is not verified.');
  return { email: payload.email.toLowerCase(), emailVerified, sub: payload.sub ?? null, expiresAt: payload.exp, method: 'id_token' };
}

/**
 * Verify a Google access token through tokeninfo. Returns
 * { email, emailVerified, sub, expiresAt, method: 'access_token' }.
 */
export async function verifyGoogleAccessToken(token, { clientId, fetchImpl = fetch, tokeninfoUrl = GOOGLE_TOKENINFO_URL } = {}) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is required to verify a Google access token.');
  const url = new URL(tokeninfoUrl);
  url.searchParams.set('access_token', token);
  const response = await fetchImpl(url.toString(), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Google tokeninfo rejected this token (${response.status}).`);
  const body = await response.json();
  if (body.aud !== clientId && body.audience !== clientId) throw new Error('Token audience does not match GOOGLE_CLIENT_ID.');
  if (typeof body.expires_in === 'number' && body.expires_in <= 0) throw new Error('Google access token has expired.');
  if (typeof body.email !== 'string' || body.email.length === 0) throw new Error('Google tokeninfo returned no email.');
  const emailVerified = body.email_verified === true || body.email_verified === 'true';
  if (!emailVerified) throw new Error('Google account email is not verified.');
  return { email: body.email.toLowerCase(), emailVerified, sub: body.sub ?? body.user_id ?? null, expiresAt: undefined, method: 'access_token' };
}

/** Resolve a Bearer value to a verified Google identity, ID token first. */
export async function resolveGoogleIdentity(token, options = {}) {
  if (typeof token === 'string' && token.split('.').length === 3) return verifyGoogleIdToken(token, options);
  return verifyGoogleAccessToken(token, options);
}

/** Parse a comma-separated allow-list into a lowercase Set. Null means unset. */
export function parseEmailAllowList(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return new Set(String(value).split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
}

/** Fail-closed allow-list check: an unset or empty list allows nobody. */
export function isEmailAllowed(email, allowList) {
  if (!allowList || allowList.size === 0) return false;
  if (typeof email !== 'string') return false;
  return allowList.has(email.toLowerCase());
}

/** Constant-time string comparison for secrets of equal length. */
export function secretsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}
