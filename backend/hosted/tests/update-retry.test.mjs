import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubCatalogue } from '../src/github.mjs';
import { REPOSITORY } from '../src/common.mjs';

const base = 'a'.repeat(40);
const clone = value => structuredClone(value);
const partner = { website: 'https://example.com/', description: 'A reviewed investment firm', source: 'https://example.com/about', reviewed_at: '2026-01-01' };
const startup = { name: 'Example', website: 'https://example.com/', description: 'An existing source-backed startup', source: 'https://example.com/about', reviewed_at: '2025-01-01', founders: [{ name: 'Pat Founder', source: 'https://example.com/team' }] };
const update = { name: 'Example', source: 'https://example.com/news', reviewed_at: '2026-01-01', funding_rounds: [{ id: 'example-seed', stage: 'Seed', amount: 500000, currency: 'AUD', source: 'https://example.com/news' }] };
const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;

// Synthetic GitHub roundtrip: every snapshot, tree, commit, ref, diff and PR is
// stored/read here. No API/file overrides, credentials or real network requests.
function repository() {
  const initial = {
    'data/partner-leads.json': ['Example Ventures', 'Other Ventures'],
    'data/partners-reviewed.json': { 'Example Ventures': { ...partner, description: 'Old description', site_description: 'Stale snippet', site_source: partner.source, site_checked_at: '2025-01-01' }, 'Other Ventures': { description: 'Preserve other records' } },
    'data/startup-research.json': { reviewed: '2025-01-01', startups: [startup, { name: 'Other Startup', description: 'Preserve this startup', website: 'https://other.example.com/', source: 'https://other.example.com/about', reviewed_at: '2025-01-01' }] },
    'data/graph.json': { entities: [{ id: 'startup:example', name: 'Example', kind: 'startup' }] },
    'data/catalogue.json': { opportunities: [] },
  };
  const state = { head: base, calls: [], refs: new Map(), commits: new Map([[base, { parents: [], tree: 'tree-base', documents: clone(initial) }]]), trees: new Map([['tree-base', clone(initial)]]), prs: [], fault: null, counter: 0 };
  const sha = () => (++state.counter).toString(16).padStart(40, '0');
  const fetcher = async (target, init = {}) => {
    const url = new URL(target), method = init.method || 'GET', path = url.pathname.slice(`/repos/${REPOSITORY}`.length), body = init.body ? JSON.parse(init.body) : null;
    assert.equal(url.origin, 'https://api.github.com');
    assert.ok(url.pathname.startsWith(`/repos/${REPOSITORY}/`));
    assert.equal(init.redirect, 'manual');
    state.calls.push({ path, method, body });
    const fault = method === 'POST' && state.fault?.path === path ? state.fault : null;
    if (fault) state.fault = null;
    if (fault?.when === 'before') throw new Error('Synthetic request outcome unknown before acceptance');
    const accepted = value => {
      if (fault?.when === 'after') throw new Error('Synthetic response lost after accepted write');
      if (fault?.when === 'body') return new Response('{', { status: 201, headers: { 'Content-Type': 'application/json' } });
      if (fault?.when === 'shape') return Response.json({});
      return Response.json(value);
    };
    if (path === '/git/ref/heads/main') return Response.json({ object: { sha: state.head } });
    if (path.startsWith('/git/ref/heads/')) {
      const ref = state.refs.get(path.slice('/git/ref/heads/'.length));
      return ref ? Response.json({ object: { sha: ref } }) : new Response(null, { status: 404 });
    }
    if (path.startsWith('/contents/')) {
      const document = state.commits.get(url.searchParams.get('ref'))?.documents[path.slice('/contents/'.length)];
      assert.notEqual(document, undefined, `Missing fixture document ${target}`);
      const content = JSON.stringify(document);
      return Response.json({ type: 'file', encoding: 'base64', size: Buffer.byteLength(content), content: Buffer.from(content).toString('base64') });
    }
    if (path.startsWith('/git/commits/') && method === 'GET') {
      const commit = state.commits.get(path.slice('/git/commits/'.length));
      assert.ok(commit, `Missing fixture commit ${path}`);
      return Response.json({ parents: commit.parents.map(sha => ({ sha })), tree: { sha: commit.tree } });
    }
    if (path.startsWith('/compare/')) {
      const [from, to] = path.slice('/compare/'.length).split('...');
      let cursor = to, count = 0;
      while (cursor !== from && state.commits.get(cursor)?.parents.length === 1 && count < 100) { cursor = state.commits.get(cursor).parents[0]; count++; }
      const original = state.commits.get(from).documents, proposed = state.commits.get(to).documents;
      const files = [...new Set([...Object.keys(original), ...Object.keys(proposed)])].filter(file => JSON.stringify(original[file]) !== JSON.stringify(proposed[file])).map(filename => ({ filename, status: !Object.hasOwn(original, filename) ? 'added' : !Object.hasOwn(proposed, filename) ? 'removed' : 'modified' }));
      return Response.json({ status: cursor !== from ? 'diverged' : count ? 'ahead' : 'identical', total_commits: count, files });
    }
    if (path === '/git/trees') {
      const documents = clone(state.trees.get(body.base_tree));
      for (const file of body.tree) { assert.equal(file.mode, '100644'); assert.equal(file.type, 'blob'); documents[file.path] = JSON.parse(file.content); }
      const id = `tree-${state.trees.size}`; state.trees.set(id, documents);
      return accepted({ sha: id });
    }
    if (path === '/git/commits') {
      const id = sha(); state.commits.set(id, { parents: body.parents, tree: body.tree, documents: clone(state.trees.get(body.tree)) });
      return accepted({ sha: id });
    }
    if (path === '/git/refs') {
      const name = body.ref.slice('refs/heads/'.length);
      if (state.refs.has(name)) return new Response(null, { status: 422 });
      state.refs.set(name, body.sha);
      return accepted({ ref: body.ref });
    }
    if (path === '/pulls' && method === 'GET') return Response.json(state.prs.filter(pr => `${REPOSITORY.split('/')[0]}:${pr.head.ref}` === url.searchParams.get('head') && (!url.searchParams.has('base') || pr.base.ref === url.searchParams.get('base'))));
    if (path === '/pulls' && method === 'POST') {
      if (state.prs.some(pr => pr.head.ref === body.head && pr.state === 'open')) return new Response(null, { status: 422 });
      const pr = { ...body, head: { ref: body.head, sha: state.refs.get(body.head), repo: { full_name: REPOSITORY } }, base: { ref: body.base, repo: { full_name: REPOSITORY } }, state: 'open', merged_at: null, html_url: `https://github.com/${REPOSITORY}/pull/${state.prs.length + 1}` };
      state.prs.push(pr); return accepted(pr);
    }
    throw new Error(`Unexpected fixture request ${method} ${path}`);
  };
  const client = new GitHubCatalogue('synthetic-fixture-not-a-credential', { fetcher });
  const writes = () => state.calls.filter(call => call.method !== 'GET').length;
  const advance = () => {
    const id = sha(), documents = clone(state.commits.get(state.head).documents), tree = `tree-main-${id}`;
    documents['unrelated.json'] = { change: 'Preserve concurrent main work' };
    state.trees.set(tree, documents); state.commits.set(id, { parents: [state.head], tree, documents }); state.head = id;
  };
  return { client, state, writes, advance };
}

const cases = [
  { kind: 'partner', file: 'data/partners-reviewed.json', record: partner, validate: (client, record) => client.validatePartner('Example Ventures', record), propose: (client, record, revision) => client.proposePartner('Example Ventures', record, revision) },
  { kind: 'startup', file: 'data/startup-research.json', record: update, validate: (client, record) => client.validateStartup(record), propose: (client, record, revision) => client.proposeStartup(record, revision) },
];

for (const item of cases) {
  test(`${item.kind}: exact one-file roundtrip and key-order retries return one verified draft`, async () => {
    const { client, state, writes } = repository();
    const validation = await item.validate(client, item.record);
    assert.equal(validation.revision, base); assert.equal(writes(), 0);
    const first = await item.propose(client, item.record, validation.revision);
    assert.equal(first.status, 'proposed'); assert.equal(first.published, false);
    assert.equal(state.prs.length, 1); assert.equal(state.prs[0].draft, true); assert.equal(state.prs[0].base.ref, 'main');
    assert.equal(state.head, base);
    const tree = state.calls.find(call => call.path === '/git/trees').body.tree;
    assert.deepEqual(tree.map(file => file.path), [item.file]);
    const changed = JSON.parse(tree[0].content);
    if (item.kind === 'partner') {
      assert.deepEqual(changed['Example Ventures'], partner);
      assert.deepEqual(changed['Other Ventures'], { description: 'Preserve other records' });
    } else {
      assert.deepEqual(changed.startups[0], { ...startup, ...update });
      assert.deepEqual(changed.startups[1], state.commits.get(base).documents[item.file].startups[1]);
    }
    const count = writes(), receipt = await item.propose(client, reorder(item.record), base);
    assert.equal(receipt.pullRequest, first.pullRequest); assert.equal(receipt.branch, first.branch); assert.match(receipt.note, /Verified existing/);
    assert.equal(writes(), count); assert.equal(state.prs.length, 1);
    if (item.kind === 'startup') {
      const normalized = await item.propose(client, { ...reorder(item.record), name: 'ＥＸＡＭＰＬＥ' }, base);
      assert.equal(normalized.branch, first.branch); assert.equal(normalized.pullRequest, first.pullRequest); assert.equal(writes(), count);
    }
  });

  for (const when of ['after', 'body', 'shape']) test(`${item.kind}: lost ${when === 'body' ? 'response body' : when === 'shape' ? 'valid response shape' : 'accepted PR response'} is recovered read-only after unrelated main advances`, async () => {
    const { client, state, writes, advance } = repository();
    state.fault = { path: '/pulls', when };
    await assert.rejects(item.propose(client, item.record, base), { code: 'WRITE_UNCERTAIN' });
    assert.equal(state.prs.length, 1);
    const count = writes(); advance();
    const validation = await item.validate(client, item.record);
    assert.notEqual(validation.revision, base);
    const receipt = await item.propose(client, reorder(item.record), validation.revision);
    assert.equal(receipt.status, 'proposed'); assert.equal(receipt.pullRequest, state.prs[0].html_url); assert.equal(receipt.published, false);
    assert.equal(writes(), count); assert.equal(state.refs.size, 1); assert.equal(state.prs.length, 1);
    // The original revision is also a read-only recovery request, never permission for a fresh write.
    assert.equal((await item.propose(client, item.record, base)).pullRequest, receipt.pullRequest);
    assert.equal(writes(), count);
  });

  for (const fault of [{ path: '/git/refs', when: 'after' }, { path: '/git/refs', when: 'shape' }, { path: '/pulls', when: 'before' }]) test(`${item.kind}: an uncertain partial write at ${fault.path} (${fault.when}) is never completed by retry`, async () => {
    const { client, state, writes, advance } = repository(); state.fault = fault;
    await assert.rejects(item.propose(client, item.record, base), { code: 'WRITE_UNCERTAIN' });
    assert.equal(state.refs.size, 1); assert.equal(state.prs.length, 0);
    const count = writes(); advance();
    await assert.rejects(item.propose(client, reorder(item.record), state.head), { code: 'WRITE_UNCERTAIN' });
    assert.equal(writes(), count); assert.equal(state.prs.length, 0);
  });

  test(`${item.kind}: stale fresh proposals and exact no-ops perform no writes`, async () => {
    const { client, state, writes } = repository();
    await assert.rejects(item.propose(client, item.record, 'f'.repeat(40)), { code: 'STALE_REVISION' });
    const documents = state.commits.get(base).documents;
    if (item.kind === 'partner') documents[item.file]['Example Ventures'] = clone(partner);
    else documents[item.file].startups[0] = { ...clone(startup), ...clone(update) };
    assert.equal((await item.propose(client, item.record, base)).status, 'already_present');
    assert.equal(writes(), 0);
  });

  for (const change of ['extra file', 'other record', 'requested content', 'unexpected history', 'unrelated parent', 'wrong PR head', 'wrong PR base', 'wrong PR repository', 'wrong PR URL', 'multiple PRs', 'missing branch', 'missing branch with changed PR base']) test(`${item.kind}: recovery rejects ${change} without writing`, async () => {
    const { client, state, writes } = repository();
    const first = await item.propose(client, item.record, base), count = writes(), tip = state.refs.get(first.branch), commit = state.commits.get(tip);
    if (change === 'extra file') commit.documents['unexpected.js'] = { malicious: true };
    if (change === 'other record') {
      if (item.kind === 'partner') commit.documents[item.file]['Other Ventures'].description = 'Unexpected modification';
      else commit.documents[item.file].startups[1].description = 'Unexpected modification';
    }
    if (change === 'requested content') {
      if (item.kind === 'partner') commit.documents[item.file]['Example Ventures'].description = 'Different requested content';
      else commit.documents[item.file].startups[0].source = 'https://example.com/different';
    }
    if (change === 'unexpected history') commit.parents = [base, base];
    if (change === 'unrelated parent') { const detached = 'e'.repeat(40); state.commits.set(detached, clone(state.commits.get(base))); state.head = detached; }
    if (change === 'wrong PR head') state.prs[0].head.sha = base;
    if (change === 'wrong PR base' || change === 'missing branch with changed PR base') state.prs[0].base.ref = 'other-base';
    if (change === 'wrong PR repository') state.prs[0].head.repo.full_name = 'different/repository';
    if (change === 'wrong PR URL') state.prs[0].html_url = 'https://example.com/not-a-receipt';
    if (change === 'multiple PRs') state.prs.push(clone(state.prs[0]));
    if (change.startsWith('missing branch')) state.refs.delete(first.branch);
    await assert.rejects(item.propose(client, item.record, state.head), { code: change.startsWith('missing branch') ? 'WRITE_UNCERTAIN' : 'BRANCH_CONFLICT' });
    assert.equal(writes(), count);
  });

  for (const status of ['closed', 'merged']) test(`${item.kind}: verified ${status} receipts are never reopened or reported as deployed`, async () => {
    const { client, state, writes } = repository(); await item.propose(client, item.record, base);
    state.prs[0].state = 'closed'; state.prs[0].merged_at = status === 'merged' ? '2026-01-01T00:00:00Z' : null;
    const count = writes(), receipt = await item.propose(client, item.record, base);
    assert.equal(receipt.status, status); assert.equal(receipt.published, false); assert.equal(writes(), count);
  });

  test(`${item.kind}: concurrent identical requests never create two branches or draft PRs`, async () => {
    const { client, state, writes } = repository();
    const results = await Promise.allSettled([item.propose(client, item.record, base), item.propose(client, reorder(item.record), base)]);
    assert.ok(results.some(result => result.status === 'fulfilled'));
    for (const result of results) if (result.status === 'rejected') assert.ok(['GITHUB_CONFLICT', 'WRITE_UNCERTAIN'].includes(result.reason.code));
    assert.equal(state.refs.size, 1); assert.equal(state.prs.length, 1);
    const count = writes(); assert.equal((await item.propose(client, item.record, base)).status, 'proposed'); assert.equal(writes(), count);
  });
}

test('new startup proposals recover identical requests and never duplicate normalized-name retries', async () => {
  const { client, state, writes } = repository();
  const record = { name: 'New Example', website: 'https://new.example.com/', description: 'A newly reviewed startup', source: 'https://new.example.com/about', reviewed_at: '2026-01-01' };
  const validation = await client.validateStartup(record);
  assert.equal(validation.previous, null);
  const first = await client.proposeStartup(record, validation.revision), count = writes();
  assert.equal((await client.proposeStartup(reorder(record), base)).pullRequest, first.pullRequest);
  // The branch identity is canonical, but recovery still requires the exact
  // stored content. A different display name on a new record needs inspection.
  await assert.rejects(client.proposeStartup({ ...record, name: 'ＮＥＷ ＥＸＡＭＰＬＥ' }, base), { code: 'BRANCH_CONFLICT' });
  assert.equal(writes(), count); assert.equal(state.refs.size, 1); assert.equal(state.prs.length, 1);
});
