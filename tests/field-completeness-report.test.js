import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFieldCompleteness, fieldPresent, freshnessBucket, renderFieldCompletenessMarkdown } from '../scripts/field-completeness-report.mjs';

// #89 (OPS-01): the field-level completeness report counts, per reviewed
// entity kind, how many records carry each field, and buckets review
// stamps by freshness — so thin fields are visible without raw logs.

test('fieldPresent requires a usable value', () => {
  assert.equal(fieldPresent('x'), true);
  assert.equal(fieldPresent('  '), false);
  assert.equal(fieldPresent(''), false);
  assert.equal(fieldPresent(null), false);
  assert.equal(fieldPresent(undefined), false);
  assert.equal(fieldPresent([1]), true);
  assert.equal(fieldPresent([]), false);
  assert.equal(fieldPresent(2021), true);
  assert.equal(fieldPresent({ text: 'blurb' }), true);
  assert.equal(fieldPresent({ text: ' ' }), false);
  assert.equal(fieldPresent({}), false);
});

test('freshnessBucket ages stamps against the report date', () => {
  const today = Date.parse('2026-11-27T00:00:00Z');
  assert.equal(freshnessBucket('2026-11-27', today), 'fresh');
  assert.equal(freshnessBucket('2026-11-20', today), 'fresh');
  assert.equal(freshnessBucket('2026-11-19', today), 'recent');
  assert.equal(freshnessBucket('2026-10-28', today), 'recent');
  assert.equal(freshnessBucket('2026-10-27', today), 'stale');
  assert.equal(freshnessBucket(null, today), 'undated');
  assert.equal(freshnessBucket('not-a-date', today), 'undated');
});

const fixture = () => ({
  research: {
    startups: [
      {
        name: 'Acme', description: 'd', website: 'https://acme.example', founded_year: 2020,
        hq_city: 'Sydney', hq_country: 'Australia', source: 'https://acme.example',
        reviewed_at: '2026-11-26',
        founders: [{ name: 'Jo', linkedin: 'https://linkedin.example/jo', photo_url: 'https://x.example/jo.png', blurb: { text: 'b' }, socials: [{ url: 'https://x.example' }], source: 'https://acme.example' }],
        funding_rounds: [{ id: 'r1' }], profile_facts: [{ id: 'f1' }], articles: [],
      },
      { name: 'Bare', reviewed_at: '2026-10-01', founders: [{ name: 'No Links' }] },
    ],
  },
  partners: {
    PartnerCo: { description: 'p', website: 'https://p.example', source: 'https://p.example', aliases: [], reviewed_at: '2026-11-25' },
  },
  profiles: {
    PartnerCo: {
      checked: '2026-11-24', geography: 'Australia', type: 'Venture capital',
      people: [{ name: 'Jo Bloggs', role: 'Partner', source: 'https://p.example' }],
      companies: [{ name: 'Acme', source: 'https://p.example', logo_source: 'https://p.example' }],
    },
  },
});

test('buildFieldCompleteness counts fields and freshness per kind', () => {
  const today = Date.parse('2026-11-27T00:00:00Z');
  const report = buildFieldCompleteness({ ...fixture(), today });
  const byId = Object.fromEntries(report.kinds.map((k) => [k.id, k]));

  assert.equal(byId.startups.total, 2);
  const startupFields = Object.fromEntries(byId.startups.fields.map((f) => [f.label, f]));
  assert.equal(startupFields.description.present, 1);
  assert.equal(startupFields.description.pct, 50);
  assert.equal(startupFields['articles (≥1)'].present, 0);
  assert.equal(startupFields['funding_rounds (≥1)'].present, 1);
  assert.deepEqual(byId.startups.freshness, { fresh: 1, recent: 0, stale: 1, undated: 0 });

  assert.equal(byId.founders.total, 2);
  const founderFields = Object.fromEntries(byId.founders.fields.map((f) => [f.label, f]));
  assert.equal(founderFields.linkedin.present, 1);
  assert.equal(founderFields.blurb.present, 1);
  assert.equal(byId.founders.freshness, null);

  assert.equal(byId.partners.total, 1);
  assert.equal(byId['profile-people'].total, 1);
  assert.equal(byId['profile-companies'].fields.find((f) => f.label === 'logo').present, 0);
  assert.deepEqual(byId['partner-profiles'].freshness, { fresh: 1, recent: 0, stale: 0, undated: 0 });
});

test('renderFieldCompletenessMarkdown emits a table per kind', () => {
  const today = Date.parse('2026-11-27T00:00:00Z');
  const report = buildFieldCompleteness({ ...fixture(), today });
  const md = renderFieldCompletenessMarkdown(report, { generatedAt: '2026-11-27', revision: 'abc1234' });
  assert.match(md, /# Field completeness and freshness/);
  assert.match(md, /from revision abc1234/);
  assert.match(md, /\| description \| 1 \| 2 \| 50 \|/);
  assert.match(md, /Freshness: 1 fresh, 0 recent, 1 stale, 0 undated\./);
});
