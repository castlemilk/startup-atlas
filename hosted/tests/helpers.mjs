import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { REPOSITORY_ID, OWNER_ID, REPOSITORY } from '../src/common.mjs';
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_oauth.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const stmt = sqlite.prepare(statement.sql);
          return statement.sql.startsWith('SELECT') ? { results: stmt.all(...statement.args) } : { meta: { changes: Number(stmt.run(...statement.args).changes) } };
        });
        sqlite.exec('COMMIT'); return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    prepare(sql) {
      return { bind(...args) { return { sql, args,
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
      }; } };
    },
  };
}
export function environment() {
  return { PUBLIC_ORIGIN: 'https://atlas.example.com', GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-client-secret-not-real', OAUTH_ENCRYPTION_KEY: btoa('a'.repeat(32)), DB: database() };
}
export const entry = { id: 'oauth-fixture', name: 'OAuth Fixture Programme', org: 'Example', kind: 'Founder programmes', access: 'Direct', scope: ['UNKNOWN'], value: 'No cash award established', summary: 'Test fixture only.', eligibility: 'Test fixture only.', limits: 'Never publish test fixture.', url: 'https://example.com/programme', status: 'Check intake', checked: '2026-01-01', extra: [], facts: {} };
export const provenance = { sourceUrls: [entry.url], reviewedOn: entry.checked, evidence: 'Synthetic test data, not a real opportunity.' };
export const tokenResponse = { access_token: 'ghu_test_not_real', refresh_token: 'ghr_test_not_real', token_type: 'bearer', scope: '', expires_in: 28800, refresh_token_expires_in: 15897600 };
export function oauthProvider() {
  const calls = [];
  const provider = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === 'https://github.com/login/oauth/access_token') return Response.json(tokenResponse);
    if (url === 'https://api.github.com/user') return Response.json({ id: OWNER_ID, login: 'castlemilk' });
    if (url === 'https://api.github.com/user/installations?per_page=100') return Response.json({ installations: [{ id: 42, account: { id: OWNER_ID }, repository_selection: 'selected', permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' } }] });
    if (url === 'https://api.github.com/user/installations/42/repositories?per_page=100') return Response.json({ total_count: 1, repositories: [{ id: REPOSITORY_ID, full_name: REPOSITORY }] });
    if (url.endsWith('/token') && init.method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error(`Unexpected test URL ${url}`);
  };
  return { fetcher: provider, calls };
}
