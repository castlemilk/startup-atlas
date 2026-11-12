import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubCatalogue } from '../src/github.mjs';
import { entry, provenance } from './helpers.mjs';
const base = 'a'.repeat(40);
function provider() {
  const state = { head: base, refs: {}, calls: [], prs: [], commits: { [base]: { catalogue: { updated: '2026-01-01', opportunities: [], partnerLeads: [], relatedPartners: {} }, additions: { schemaVersion: 1, entries: [] } } }, trees: {}, lostPR: false };
  const encode = value => btoa(unescape(encodeURIComponent(JSON.stringify(value))));
  const fetcher = async (target, init = {}) => {
    const url = new URL(target), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : null;
    assert.equal(url.origin, 'https://api.github.com');
    assert.ok(url.pathname.startsWith('/repos/castlemilk/startup-atlas/'));
    const path = url.pathname.slice('/repos/castlemilk/startup-atlas'.length);
    state.calls.push({ path, method, body });
    if (path === '/git/ref/heads/main') return Response.json({ object: { sha: state.head } });
    if (path.startsWith('/git/ref/heads/')) {
      const branch = path.slice('/git/ref/heads/'.length);
      return state.refs[branch] ? Response.json({ object: { sha: state.refs[branch] } }) : new Response(null, { status: 404 });
    }
    if (path.startsWith('/contents/')) {
      const current = state.commits[url.searchParams.get('ref')];
      const data = path.endsWith('partner-leads.json') ? (current.leads ?? []) : path.endsWith('partners-reviewed.json') ? (current.reviewed ?? {}) : path.endsWith('opportunities-added.json') ? current.additions : current.catalogue;
      return Response.json({ type: 'file', encoding: 'base64', size: 100, content: encode(data) });
    }
    if (path.startsWith('/git/commits/') && method === 'GET') return Response.json({ tree: { sha: 'base-tree' }, parents: state.commits[path.slice('/git/commits/'.length)].parents ?? [] });
    if (path.startsWith('/compare/') && path.endsWith(`...${state.head}`)) return Response.json({ status: state.unrelatedParent ? 'diverged' : 'identical' });
    if (path.startsWith('/compare/')) return Response.json({ total_commits: 1, files: (state.tampered ? ['data/catalogue.json', 'data/opportunities-added.json', 'app.js'] : ['data/catalogue.json', 'data/opportunities-added.json']).map(filename => ({ filename, status: 'modified' })) });
    if (path === '/git/trees') { const sha = `tree-${Object.keys(state.trees).length}`; state.trees[sha] = body; return Response.json({ sha }); }
    if (path === '/git/commits') {
      const sha = String(Object.keys(state.commits).length).padStart(40, '0');
      const files = state.trees[body.tree].tree;
      state.commits[sha] = { parents: body.parents.map(sha => ({ sha })), catalogue: JSON.parse(files.find(x => x.path === 'data/catalogue.json').content), additions: JSON.parse(files.find(x => x.path === 'data/opportunities-added.json').content) };
      return Response.json({ sha });
    }
    if (path === '/git/refs') {
      const name = body.ref.slice('refs/heads/'.length);
      if (state.refs[name]) return new Response(null, { status: 422 });
      state.refs[name] = body.sha; return Response.json({ ref: body.ref });
    }
    if (path === '/pulls' && method === 'GET') return Response.json(state.prs.filter(pr => `castlemilk:${pr.head}` === url.searchParams.get('head')));
    if (path === '/pulls' && method === 'POST') {
      if (state.prs.some(pr => pr.head === body.head)) return new Response(null, { status: 422 });
      const pr = { ...body, state: 'open', html_url: 'https://github.com/castlemilk/startup-atlas/pull/999', merged_at: null }; state.prs.push(pr);
      if (state.lostPR) throw new Error('response lost after provider accepted write');
      return Response.json(pr);
    }
    throw new Error(`Unexpected test call ${method} ${path}`);
  };
  return { state, fetcher };
}
test('hosted add writes exactly two data files to a new draft PR and safely returns repeated requests', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  const validation = await client.validateCandidate(entry, provenance);
  assert.equal(validation.revision, base);
  const result = await client.add(entry, provenance, validation.revision);
  assert.equal(result.status, 'proposed'); assert.equal(result.published, false);
  assert.match(result.branch, /^atlas-entry\/oauth-fixture-/);
  const tree = mock.state.calls.find(x => x.path === '/git/trees').body.tree;
  assert.deepEqual(tree.map(x => x.path), ['data/opportunities-added.json', 'data/catalogue.json']);
  assert.equal(mock.state.prs[0].draft, true);
  assert.equal(mock.state.prs[0].base, 'main');
  const mutations = mock.state.calls.filter(x => x.method === 'POST').length;
  assert.deepEqual(await client.add(entry, provenance, base), { ...result, note: 'GitHub Pages deployment status is separate; this MCP does not merge or publish.' });
  assert.equal(mock.state.calls.filter(x => x.method === 'POST').length, mutations);
  assert.equal(mock.state.head, base);
});
test('stale revisions, duplicate IDs and unsafe sources never write', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  await assert.rejects(client.add(entry, provenance, 'b'.repeat(40)), { code: 'STALE_REVISION' });
  await assert.rejects(client.add({ ...entry, url: 'https://127.0.0.1/' }, provenance, base));
  mock.state.commits[base].catalogue.opportunities.push({ ...entry, value: 'Different' });
  await assert.rejects(client.add(entry, provenance, base), { code: 'DUPLICATE_ID' });
  assert.equal(mock.state.calls.filter(x => x.method !== 'GET').length, 0);
});
test('lost PR response is not replayed and a later retry discovers the accepted PR', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  mock.state.lostPR = true;
  await assert.rejects(client.add(entry, provenance, base), { code: 'WRITE_UNCERTAIN' });
  assert.equal(mock.state.prs.length, 1);
  mock.state.lostPR = false;
  const recovered = await client.add(entry, provenance, base);
  assert.equal(recovered.status, 'proposed');
  assert.equal(mock.state.calls.filter(x => x.path === '/pulls' && x.method === 'POST').length, 1);
});
test('main changes are retained and an identical already-merged addition creates no replacement', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  mock.state.commits[base].additions.entries.push({ entry, provenance, addedAt: '2026-01-01T00:00:00.000Z' });
  mock.state.commits[base].catalogue.opportunities.push(entry);
  const result = await client.add(entry, provenance, 'b'.repeat(40));
  assert.equal(result.status, 'already_present');
  assert.equal(mock.state.calls.filter(x => x.method !== 'GET').length, 0);
});

test('recovered branches with unrelated edits cannot cause a pull request to be created', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  await client.add(entry, provenance, base);
  mock.state.prs = [];
  mock.state.tampered = true;
  const mutations = mock.state.calls.filter(x => x.method !== 'GET').length;
  await assert.rejects(client.add(entry, provenance, base), { code: 'BRANCH_CONFLICT' });
  assert.equal(mock.state.calls.filter(x => x.method !== 'GET').length, mutations);
});


test('a valid-looking entry commit on unrelated earlier history cannot create a PR', async () => {
  const mock = provider(), client = new GitHubCatalogue('test-token-not-real', mock);
  await client.add(entry, provenance, base);
  mock.state.prs = []; mock.state.unrelatedParent = true;
  const mutations = mock.state.calls.filter(x => x.method !== 'GET').length;
  await assert.rejects(client.add(entry, provenance, base), { code: 'BRANCH_CONFLICT' });
  assert.equal(mock.state.calls.filter(x => x.method !== 'GET').length, mutations);
});

test('hosted partner search reads both files at one revision and preserves unreviewed leads', async () => {
  const mock=provider(), client=new GitHubCatalogue('test-token-not-real',mock);
  mock.state.commits[base].leads=['Airtree','Ambiguous'];
  mock.state.commits[base].reviewed={Airtree:{website:'https://www.airtree.vc/',description:'Australian venture capital',source:'https://www.airtree.vc/',reviewed_at:'2026-01-01'}};
  const result=await client.searchPartners('venture');
  assert.equal(result.revision,base);
  assert.equal(result.total,1);
  assert.equal(result.partners[0].name,'Airtree');
  assert.equal((await client.getPartner('Ambiguous')).record,null);
  await assert.rejects(client.getPartner('missing'),{code:'NOT_FOUND'});
  await assert.rejects(client.searchPartners('',101),{code:'VALIDATION_ERROR'});
  assert.equal(mock.state.calls.filter(x=>x.method!=='GET').length,0);
});
