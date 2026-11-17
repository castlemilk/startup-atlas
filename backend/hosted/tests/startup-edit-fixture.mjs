// Reuses the existing retry test GitHub simulation for canonical record edits.
import assert from 'node:assert/strict';
import { GitHubCatalogue } from '../src/github.mjs';
import { REPOSITORY } from '../src/common.mjs';

export const base = 'a'.repeat(40);
const clone = value => structuredClone(value);
const partner = { website: 'https://example.com/', description: 'A reviewed investment firm', source: 'https://example.com/about', reviewed_at: '2026-01-01' };
const startup = { name: 'Example', website: 'https://example.com/', description: 'An existing source-backed startup', source: 'https://example.com/about', reviewed_at: '2025-01-01', founders: [{ name: 'Pat Founder', source: 'https://example.com/team' }] };
const update = { name: 'Example', source: 'https://example.com/news', reviewed_at: '2026-01-01', funding_rounds: [{ id: 'example-seed', stage: 'Seed', amount: 500000, currency: 'AUD', source: 'https://example.com/news' }] };

// Synthetic GitHub roundtrip: every snapshot, tree, commit, ref, diff and PR is
// stored/read here. No API/file overrides, credentials or real network requests.
export function repository() {
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
