// Hosted partner validator: optional `aliases` / `relationships` fields
// (docs/KG-CONNECTIVE-TISSUE.md §3) and the coverage programme's
// `logo` / `linkedin` media fields (each with a mandatory *_source
// companion) are accepted and shape-checked by validatePartnerRecord
// in backend/hosted/src/github.mjs; the four reviewed metadata fields
// stay mandatory, and no other keys are allowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubCatalogue } from '../src/github.mjs';

const base = 'a'.repeat(40);
function provider() {
  const state = { head: base, commits: { [base]: { leads: ['Example Fund', 'Example Network'], reviewed: {} } } };
  const encode = value => btoa(unescape(encodeURIComponent(JSON.stringify(value))));
  const fetcher = async (target, init = {}) => {
    const url = new URL(target), method = init.method ?? 'GET';
    const path = url.pathname.slice('/repos/castlemilk/startup-atlas'.length);
    if (path === '/git/ref/heads/main') return Response.json({ object: { sha: state.head } });
    if (path.startsWith('/contents/')) {
      const current = state.commits[url.searchParams.get('ref')];
      const data = path.endsWith('partner-leads.json') ? current.leads : current.reviewed;
      return Response.json({ type: 'file', encoding: 'base64', size: 100, content: encode(data) });
    }
    throw new Error(`Unexpected test call ${method} ${path}`);
  };
  return { state, fetcher };
}

const record = {
  website: 'https://fund.example.com/', description: 'An example fund for relationship validation.',
  source: 'https://fund.example.com/', reviewed_at: '2026-11-24',
};
const relationship = {
  type: 'member_of_network', target: 'partner:example-network',
  note: 'Member of the Example Network since 2020.', source: 'https://network.example.com/members',
};

test('hosted validator accepts aliases and relationships', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  const validation = await client.validatePartner('Example Fund',
    { ...record, aliases: ['Example', 'Example VC'], relationships: [relationship] });
  assert.equal(validation.name, 'Example Fund');
  assert.equal(validation.persisted, false);
});

test('hosted validator still accepts the plain four-field record', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  const validation = await client.validatePartner('Example Fund', record);
  assert.equal(validation.name, 'Example Fund');
});

test('hosted validator accepts logo and linkedin with sources', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  const validation = await client.validatePartner('Example Fund', {
    ...record,
    logo: 'https://fund.example.com/logo.png', logo_source: 'https://fund.example.com/',
    linkedin: 'https://www.linkedin.com/company/example-fund', linkedin_source: 'https://fund.example.com/',
  });
  assert.equal(validation.name, 'Example Fund');
  assert.equal(validation.persisted, false);
});

test('hosted validator rejects malformed logo and linkedin fields', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  // A media field without its *_source companion is unverifiable.
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, logo: 'https://fund.example.com/logo.png' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, logo_source: 'https://fund.example.com/' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, logo: 'http://fund.example.com/logo.png', logo_source: 'https://fund.example.com/' }), { code: 'VALIDATION_ERROR' });
  // Partner LinkedIn is the firm's company page, never a personal profile.
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, linkedin: 'https://www.linkedin.com/in/example-person', linkedin_source: 'https://fund.example.com/' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, linkedin: 'https://example.com/company/example-fund', linkedin_source: 'https://fund.example.com/' }), { code: 'VALIDATION_ERROR' });
});

test('hosted validator rejects malformed relationships and aliases', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, relationships: [{ ...relationship, type: 'owned_by' }] }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, relationships: [{ ...relationship, target: 'Example Network' }] }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, relationships: [{ ...relationship, source: 'http://network.example.com/members' }] }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, aliases: 'Example' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.validatePartner('Example Fund',
    { ...record, nickname: 'Example' }), { code: 'VALIDATION_ERROR' });
});
