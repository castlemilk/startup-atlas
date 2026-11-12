import { validateOpportunity, validateProvenance, parseAdditions } from '../../scripts/catalogue-entries.mjs';
import { ServiceError, REPOSITORY, digest, readJson } from './common.mjs';

const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
function validatePartnerRecord(name, record) {
  if (typeof name !== 'string' || !name.trim() || name.length > 200 || !record || Array.isArray(record) || typeof record !== 'object' || Object.keys(record).sort().join(',') !== 'description,reviewed_at,source,website') throw new ServiceError('VALIDATION_ERROR', 'Provide an exact partner name and the four reviewed metadata fields.');
  for (const field of ['website', 'source']) {
    try { const url = new URL(record[field]); if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || (url.port && url.port !== '443')) throw new Error(); }
    catch { throw new ServiceError('VALIDATION_ERROR', `${field} must be an HTTPS URL without credentials.`); }
  }
  if (typeof record.description !== 'string' || record.description.trim().length < 8 || record.description.length > 500) throw new ServiceError('VALIDATION_ERROR', 'Description must be 8–500 characters.');
  const date = record.reviewed_at;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date || date > new Date().toISOString().slice(0,10)) throw new ServiceError('VALIDATION_ERROR', 'Use a valid non-future review date.');
}
export class GitHubCatalogue {
  constructor(token, { fetcher = globalThis.fetch.bind(globalThis) } = {}) { this.token = token; this.fetcher = fetcher; }
  async api(suffix, { method = 'GET', body, optional = false } = {}) {
    // Repository and endpoint selection are server-owned, never an arbitrary proxy.
    const target = `https://api.github.com/repos/${REPOSITORY}${suffix}`;
    let response;
    try {
      response = await this.fetcher(target, {
        method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', 'User-Agent': 'Startup-Atlas-MCP', 'X-GitHub-Api-Version': '2026-03-10' },
        body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceError(method === 'GET' ? 'GITHUB_UNAVAILABLE' : 'WRITE_UNCERTAIN', method === 'GET' ? 'GitHub is temporarily unavailable.' : 'GitHub did not confirm the write. Inspect the existing entry branch/PR before retrying; no automatic retry was made.', 502);
    }
    if (optional && response.status === 404) return null;
    if (response.status === 401) throw new ServiceError('CONNECT_GITHUB', 'GitHub authorization was revoked or expired. Reconnect GitHub.', 401);
    if (!response.ok) throw new ServiceError(response.status === 422 ? 'GITHUB_CONFLICT' : 'GITHUB_ERROR', `GitHub returned HTTP ${response.status}; no write was automatically retried.`, response.status === 422 ? 409 : 502);
    return readJson(response, 3000000);
  }
  async file(file, ref) {
    if (!['data/catalogue.json', 'data/opportunities-added.json', 'data/partner-leads.json', 'data/partners-reviewed.json'].includes(file)) throw new ServiceError('INVALID_PATH', 'Only catalogue data files are available.');
    const value = await this.api(`/contents/${file}?ref=${encodeURIComponent(ref)}`);
    if (value.type !== 'file' || value.encoding !== 'base64' || value.size > 2000000) throw new ServiceError('INVALID_DATA', 'Catalogue data is not a supported bounded JSON file.');
    return JSON.parse(decode(value.content));
  }
  async snapshot(ref) {
    const head = ref ?? (await this.api('/git/ref/heads/main')).object.sha;
    const [catalogue, additions] = await Promise.all([this.file('data/catalogue.json', head), this.file('data/opportunities-added.json', head)]);
    parseAdditions(additions);
    if (!Array.isArray(catalogue.opportunities)) throw new ServiceError('INVALID_DATA', 'The repository catalogue is invalid.');
    const ids = new Set(catalogue.opportunities.map(x => x.id));
    for (const { entry } of additions.entries) {
      const generated = catalogue.opportunities.find(x => x.id === entry.id);
      if (generated && !same(generated, entry)) throw new ServiceError('CATALOGUE_CONFLICT', 'Resolve the generated/source catalogue conflict before adding entries.');
    }
    return { head, catalogue, additions, opportunities: [...catalogue.opportunities, ...additions.entries.filter(x => !ids.has(x.entry.id)).map(x => x.entry)] };
  }
  validate(entry, provenance) {
    validateOpportunity(entry); validateProvenance(provenance, entry);
    if (entry.checked > new Date().toISOString().slice(0, 10)) throw new ServiceError('VALIDATION_ERROR', 'checked cannot be in the future.');
  }
  inspect(current, entry, provenance) {
    const existing = current.opportunities.find(x => x.id === entry.id);
    if (existing) {
      const source = current.additions.entries.find(x => x.entry.id === entry.id);
      if (source && same(source.entry, entry) && same(source.provenance, provenance)) return 'already_present';
      throw new ServiceError('DUPLICATE_ID', `Opportunity ${entry.id} already exists. This tool never replaces entries.`);
    }
    const duplicate = current.opportunities.find(x => normalize(x.name) === normalize(entry.name) && normalize(x.org) === normalize(entry.org));
    if (duplicate) throw new ServiceError('DUPLICATE_ENTRY', `This programme already exists as ${duplicate.id}.`);
    return 'valid';
  }
  async search(query = '', limit = 20) {
    if (typeof query !== 'string' || query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ServiceError('VALIDATION_ERROR', 'Use a query up to 200 characters and a limit from 1 to 100.');
    const current = await this.snapshot();
    const matches = current.opportunities.filter(x => normalize([x.id, x.name, x.org, x.summary].join(' ')).includes(normalize(query)));
    return { revision: current.head, total: matches.length, entries: matches.slice(0, limit) };
  }
  async get(id) {
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new ServiceError('VALIDATION_ERROR', 'Use an opportunity slug.');
    const current = await this.snapshot();
    const entry = current.opportunities.find(x => x.id === id);
    if (!entry) throw new ServiceError('NOT_FOUND', 'Opportunity not found.', 404);
    return { revision: current.head, entry, provenance: current.additions.entries.find(x => x.entry.id === id)?.provenance ?? null };
  }
  async partnerSnapshot() {
    const head=(await this.api('/git/ref/heads/main')).object.sha;
    const [leads,reviewed]=await Promise.all([this.file('data/partner-leads.json',head),this.file('data/partners-reviewed.json',head)]);
    if (!Array.isArray(leads) || leads.some(name=>typeof name!=='string') || !reviewed || Array.isArray(reviewed) || typeof reviewed!=='object')
      throw new ServiceError('INVALID_DATA','Partner index data is invalid.');
    return {head,leads,reviewed};
  }
  async searchPartners(query='',limit=20) {
    if (typeof query!=='string' || query.length>200 || !Number.isInteger(limit) || limit<1 || limit>100)
      throw new ServiceError('VALIDATION_ERROR','Use a query up to 200 characters and a limit from 1 to 100.');
    const current=await this.partnerSnapshot();
    const matches=current.leads.filter(name=>{
      const record=Object.hasOwn(current.reviewed,name)?current.reviewed[name]:null;
      return normalize([name,record?.description||'',record?.website||''].join(' ')).includes(normalize(query));
    });
    return {revision:current.head,total:matches.length,partners:matches.slice(0,limit).map(name=>({name,record:Object.hasOwn(current.reviewed,name)?current.reviewed[name]:null})),note:'A directory lead does not establish a provider partnership or eligibility.'};
  }
  async getPartner(name) {
    if (typeof name!=='string' || !name.trim() || name.length>200) throw new ServiceError('VALIDATION_ERROR','Use an exact partner name.');
    const current=await this.partnerSnapshot();
    if (!current.leads.includes(name)) throw new ServiceError('NOT_FOUND','Partner not found.',404);
    return {revision:current.head,name,record:Object.hasOwn(current.reviewed,name)?current.reviewed[name]:null,note:'A directory lead does not establish a provider partnership or eligibility.'};
  }
  async validatePartner(name, record) {
    validatePartnerRecord(name, record);
    const current = await this.partnerSnapshot();
    if (!current.leads.includes(name)) throw new ServiceError('NOT_FOUND', 'Partner not found.', 404);
    return { name, record, previous: Object.hasOwn(current.reviewed, name) ? current.reviewed[name] : null, revision: current.head, persisted: false };
  }
  async proposePartner(name, record, expectedRevision) {
    validatePartnerRecord(name, record);
    if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{40}$/.test(expectedRevision)) throw new ServiceError('VALIDATION_ERROR', 'Use the revision returned by validation.');
    const current = await this.partnerSnapshot();
    if (current.head !== expectedRevision) throw new ServiceError('STALE_REVISION', 'Main changed. Validate again before proposing an update.');
    if (!current.leads.includes(name)) throw new ServiceError('NOT_FOUND', 'Partner not found.', 404);
    const previous = Object.hasOwn(current.reviewed, name) ? current.reviewed[name] : {};
    const updated = { ...previous, ...record };
    // Older site snippets must not mask a newly reviewed description in the UI.
    delete updated.site_description; delete updated.site_source; delete updated.site_checked_at;
    if (same(previous, updated)) return { status: 'already_present', name, revision: current.head, published: false };
    const reviewed = { ...current.reviewed, [name]: updated };
    const branch = `atlas-partner/${(await digest(name)).slice(0,12).toLowerCase()}-${crypto.randomUUID().slice(0,8)}`;
    const parent = await this.api(`/git/commits/${current.head}`);
    const tree = await this.api('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree: [{ path: 'data/partners-reviewed.json', mode: '100644', type: 'blob', content: JSON.stringify(reviewed, null, 2) + '\n' }] } });
    const commit = await this.api('/git/commits', { method: 'POST', body: { message: `Update reviewed partner: ${name}`, tree: tree.sha, parents: [current.head] } });
    await this.api('/git/refs', { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
    const pr = await this.api('/pulls', { method: 'POST', body: { title: `Update reviewed partner: ${name}`, head: branch, base: 'main', draft: true, body: `Updates one reviewed partner record.\n\n- Partner: ${name}\n- Evidence: ${record.source}\n- Reviewed: ${record.reviewed_at}\n\nReview the source, identity and diff before merging. This proposal does not publish the site.` } });
    return { status: 'proposed', name, branch, pullRequest: pr.html_url, published: false };
  }
  async validateCandidate(entry, provenance) {
    this.validate(entry, provenance);
    const current = await this.snapshot();
    return { status: this.inspect(current, entry, provenance), revision: current.head, persisted: false };
  }
  async proposal(branch, entry, provenance) {
    const ref = await this.api(`/git/ref/heads/${branch}`, { optional: true });
    if (!ref) return null;
    const current = await this.snapshot(ref.object.sha);
    if (this.inspect(current, entry, provenance) !== 'already_present') throw new ServiceError('BRANCH_CONFLICT', 'The existing proposal branch does not match this entry.');
    const commit = await this.api(`/git/commits/${ref.object.sha}`);
    if (commit.parents?.length !== 1) throw new ServiceError('BRANCH_CONFLICT', 'The proposal branch has unexpected commit history.');
    const parent = commit.parents[0].sha;
    const main = (await this.api('/git/ref/heads/main')).object.sha;
    const ancestry = await this.api(`/compare/${parent}...${main}`);
    if (!['ahead', 'identical'].includes(ancestry.status)) throw new ServiceError('BRANCH_CONFLICT', 'The proposal is based on unrelated history. Review it manually.');
    const comparison = await this.api(`/compare/${parent}...${ref.object.sha}`);
    const files = comparison.files?.map(file => file.filename).sort();
    if (comparison.total_commits !== 1 || !same(files, ['data/catalogue.json', 'data/opportunities-added.json']) || comparison.files.some(file => file.status !== 'modified')) {
      throw new ServiceError('BRANCH_CONFLICT', 'The proposal contains unexpected changes. Review it manually; no pull request was created.');
    }
    const original = await this.snapshot(parent);
    const last = current.additions.entries.at(-1);
    if (current.additions.entries.length !== original.additions.entries.length + 1 ||
        !same(current.additions, { ...original.additions, entries: [...original.additions.entries, last] }) ||
        !same(last.entry, entry) || !same(last.provenance, provenance) ||
        !same(current.catalogue, { ...original.catalogue, opportunities: [...original.opportunities, entry] })) {
      throw new ServiceError('BRANCH_CONFLICT', 'The proposal is not exactly one additive catalogue change. Review it manually.');
    }
    const prs = await this.api(`/pulls?state=all&head=${encodeURIComponent(`castlemilk:${branch}`)}&base=main&per_page=100`);
    if (prs.length > 1) throw new ServiceError('BRANCH_CONFLICT', 'Multiple pull requests exist for this proposal; review them in GitHub.');
    if (prs.length === 1) {
      const pr = prs[0];
      return { status: pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'proposed', id: entry.id, branch, pullRequest: pr.html_url, published: false, note: 'GitHub Pages deployment status is separate; this MCP does not merge or publish.' };
    }
    return { branchOnly: true };
  }
  async add(entry, provenance, expectedRevision) {
    this.validate(entry, provenance);
    if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{40}$/.test(expectedRevision)) throw new ServiceError('VALIDATION_ERROR', 'Use the exact revision returned by validation.');
    const hash = (await digest(JSON.stringify(stable({ entry, provenance })))).slice(0, 16).toLowerCase();
    const branch = `atlas-entry/${entry.id}-${hash}`;
    const existing = await this.proposal(branch, entry, provenance);
    if (existing && !existing.branchOnly) return existing;
    if (!existing) {
      const current = await this.snapshot();
      if (this.inspect(current, entry, provenance) === 'already_present') return { status: 'already_present', id: entry.id, revision: current.head, published: false };
      if (current.head !== expectedRevision) throw new ServiceError('STALE_REVISION', 'Main changed. Search and validate again before creating the entry.');
      const additions = { ...current.additions, entries: [...current.additions.entries, { entry, provenance, addedAt: new Date().toISOString() }] };
      const catalogue = { ...current.catalogue, opportunities: [...current.opportunities, entry] };
      const parent = await this.api(`/git/commits/${current.head}`);
      const tree = await this.api('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree: [
        { path: 'data/opportunities-added.json', mode: '100644', type: 'blob', content: JSON.stringify(additions, null, 2) + '\n' },
        { path: 'data/catalogue.json', mode: '100644', type: 'blob', content: JSON.stringify(catalogue, null, 2) + '\n' },
      ] } });
      const commit = await this.api('/git/commits', { method: 'POST', body: { message: `Add sourced opportunity: ${entry.name}`, tree: tree.sha, parents: [current.head] } });
      try { await this.api('/git/refs', { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } }); }
      catch (error) {
        // A competing request may have created this deterministic branch. Inspect, never force-update.
        if (error.code !== 'GITHUB_CONFLICT') throw error;
        const recovered = await this.proposal(branch, entry, provenance);
        if (!recovered) throw error;
        if (!recovered.branchOnly) return recovered;
      }
    }
    let pr;
    try {
      pr = await this.api('/pulls', { method: 'POST', body: {
        title: `Add sourced opportunity: ${entry.name}`, head: branch, base: 'main', draft: true,
        body: `Adds one source-backed opportunity through Startup Atlas MCP.\n\n- Entry: ${entry.id}\n- Primary source: ${entry.url}\n- Research date: ${entry.checked}\n\nReview the two catalogue data files and CI. This action does not merge the PR or publish the site.`,
      } });
    } catch (error) {
      if (error.code !== 'GITHUB_CONFLICT') throw error;
      const recovered = await this.proposal(branch, entry, provenance);
      if (!recovered || recovered.branchOnly) throw error;
      return recovered;
    }
    return { status: 'proposed', id: entry.id, branch, pullRequest: pr.html_url, published: false, note: 'Review the draft PR and CI before merging through the existing release workflow.' };
  }
}
