import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMediaCoverage, localAssetPath, renderMediaCoverageMarkdown } from '../scripts/media-coverage-report.mjs';

// #85: the published media coverage report splits logo/portrait coverage by
// entity kind and pipeline stage, so stalls are visible without raw logs.

test('localAssetPath only accepts repository-local asset references', () => {
  assert.equal(localAssetPath('./assets/logos/acme.svg'), 'assets/logos/acme.svg');
  assert.equal(localAssetPath('https://castlemilk.github.io/startup-atlas/assets/portraits/jo.png'), 'assets/portraits/jo.png');
  assert.equal(localAssetPath('https://cdn.example.com/acme.png'), null);
  assert.equal(localAssetPath(null), null);
  assert.equal(localAssetPath(''), null);
});

const fixture = () => {
  const existing = new Set(['assets/logos/acme.svg', 'assets/portraits/jo.png', 'assets/logos/partner.svg']);
  return {
    profiles: {
      PartnerCo: {
        people: [{ name: 'Jo Bloggs', photo: 'https://castlemilk.github.io/startup-atlas/assets/portraits/jo.png', photo_source: 'https://example.com/jo' }],
        companies: [{ name: 'RemoteOnly', logo: 'https://cdn.example.com/remote.png', logo_source: 'https://example.com/remote' }],
      },
    },
    research: {
      startups: [
        { name: 'Acme', logo: 'https://castlemilk.github.io/startup-atlas/assets/logos/acme.svg', logo_source: 'https://acme.example', founders: [{ name: 'No Photo', source: 'https://acme.example' }] },
        { name: 'Bare', website: 'https://bare.example', founders: [] },
      ],
    },
    catalogue: { opportunities: [{ org: 'PartnerCo' }, { org: 'PartnerCo' }, { org: 'Unknown Org' }] },
    manifests: [{
      target: 'web/assets/portraits/jo.png',
      provenance: { identity: { decision: 'approved' }, rights: { decision: 'approved' } },
    }, {
      target: 'web/assets/logos/acme.svg',
      provenance: { identity: { decision: 'approved' }, rights: { decision: 'pending' } },
    }],
    graph: {
      entities: [
        { kind: 'startup', name: 'Acme', logo: './assets/logos/acme.svg' },
        { kind: 'person', name: 'Jo Bloggs', logo: './assets/portraits/jo.png' },
        { kind: 'partner', name: 'PartnerCo', logo: './assets/logos/partner.svg' },
      ],
    },
    logoMap: new Map([['PartnerCo', './assets/logos/partner.svg']]),
    fileExists: (p) => existing.has(p),
    artworkUrl: (e) => e.logo,
  };
};

test('stages are counted per kind from records, manifests and graph', () => {
  const report = buildMediaCoverage(fixture());
  const startups = report.kinds.startups;
  assert.equal(startups.total, 2);
  assert.deepEqual(startups.stages, { discovered: 1, published: 1, downloaded: 1, approved: 0, rendered: 1 });
  // Acme's manifest lacks a rights approval, so it is listed as unapproved.
  assert.deepEqual(startups.unapproved.map((r) => r.name), ['Acme']);
  assert.deepEqual(startups.missing.map((r) => r.name), ['Bare']);

  const portraits = report.kinds.portraits;
  assert.equal(portraits.total, 2);
  assert.deepEqual(portraits.stages, { discovered: 1, published: 1, downloaded: 1, approved: 1, rendered: 1 });

  const companies = report.kinds.companies;
  assert.equal(companies.total, 1);
  assert.equal(companies.stages.discovered, 1);
  assert.equal(companies.stages.published, 0);
  assert.equal(companies.missing[0].reason, 'reference is remote-only, no local asset published');
});

test('provider population is de-duplicated by organisation', () => {
  const report = buildMediaCoverage(fixture());
  assert.equal(report.kinds.providers.total, 2);
  assert.equal(report.kinds.providers.stages.downloaded, 1);
});

test('markdown renders the stage table and stall lists', () => {
  const md = renderMediaCoverageMarkdown(buildMediaCoverage(fixture()), { generatedAt: '2026-11-26', revision: 'abc123' });
  assert.match(md, /Startup logos \| 2 \| 1 \(50%\)/);
  assert.match(md, /Bare — no source-attributed image reference/);
  assert.match(md, /Public asset manifests on file: 2\./);
});

test('real data: populations match the committed records', async () => {
  const read = async (p) => JSON.parse(await readFile(new URL('../' + p, import.meta.url), 'utf8'));
  const [profiles, research, catalogue] = await Promise.all([
    read('data/partner-profiles.json'), read('data/startup-research.json'), read('data/catalogue.json'),
  ]);
  const report = buildMediaCoverage({
    profiles, research, catalogue, manifests: [], graph: { entities: [] },
    logoMap: new Map(), fileExists: () => false, artworkUrl: () => null,
  });
  assert.equal(report.kinds.startups.total, research.startups.length);
  const founders = research.startups.flatMap((s) => (s.founders || []).filter((f) => f && typeof f === 'object')).length;
  const people = Object.values(profiles).flatMap((r) => r.people || []).length;
  assert.equal(report.kinds.portraits.total, founders + people);
  assert.equal(report.kinds.providers.total, new Set(catalogue.opportunities.map((o) => o.org)).size);
  for (const kind of Object.values(report.kinds)) {
    assert.ok(kind.stages.discovered <= kind.total);
    assert.ok(kind.stages.downloaded <= kind.stages.published);
    assert.ok(kind.stages.approved <= kind.stages.downloaded);
  }
});
