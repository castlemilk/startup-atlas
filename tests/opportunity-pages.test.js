import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SITE_BASE, selectCohort, isCohortRecord, renderOpportunityPage,
  renderCohortIndex, withCohortUrls, opportunityPath, geographyLabel, escapeHtml,
} from '../scripts/opportunity-pages.mjs';

const catalogue = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
const cohort = selectCohort(catalogue.opportunities);
const byId = new Map(catalogue.opportunities.map(record => [record.id, record]));

const complete = {
  id: 'synthetic-programme', name: 'Synthetic Programme', org: 'Synthetic Org',
  kind: 'Cloud credits', access: 'Direct', scope: ['AU'], value: 'US$1,000',
  summary: 'A synthetic summary.', eligibility: 'Synthetic eligibility.',
  limits: 'Synthetic limits.', url: 'https://example.com/programme',
  status: 'Apply directly', checked: '2026-11-11', extra: [], facts: { Duration: 'One year' },
  status_controlled: 'Apply / verify', deadline: null,
};

test('cohort rule admits only actionable, source-reviewed, complete records', () => {
  assert.equal(isCohortRecord(complete), true);
  assert.equal(isCohortRecord({ ...complete, status_controlled: 'Closed' }), false);
  assert.equal(isCohortRecord({ ...complete, status_controlled: 'Partner required' }), false);
  assert.equal(isCohortRecord({ ...complete, status_controlled: 'Check intake' }), false);
  assert.equal(isCohortRecord({ ...complete, facts: {} }), false);
  assert.equal(isCohortRecord({ ...complete, facts: null }), false);
  assert.equal(isCohortRecord({ ...complete, eligibility: ' ' }), false);
  assert.equal(isCohortRecord({ ...complete, checked: 'last week' }), false);
  assert.equal(isCohortRecord({ ...complete, url: 'not a url' }), false);
  assert.equal(isCohortRecord({ ...complete, scope: [] }), false);
});

test('live catalogue cohort is small, verified and reproducible', () => {
  assert.ok(cohort.length >= 5 && cohort.length <= 30, `cohort size ${cohort.length}`);
  assert.ok(cohort.length < catalogue.opportunities.length / 3, 'cohort stays a small subset');
  for (const record of cohort) assert.ok(isCohortRecord(record), record.id);
  assert.deepEqual(selectCohort(catalogue.opportunities).map(r => r.id), cohort.map(r => r.id));
  // Known reviewed records are in; known non-actionable ones stay out.
  assert.ok(byId.has('cloudflare-founders') && cohort.some(r => r.id === 'cloudflare-founders'));
  assert.ok(!cohort.some(r => r.id === 'vercel'), 'partner-required records are not promoted');
  assert.ok(!cohort.some(r => r.id === 'digitalocean-startups'), 'paused records are not promoted');
});

test('cohort pages carry the full opportunity record without scripts or the globe', () => {
  for (const record of cohort) {
    const html = renderOpportunityPage(record);
    assert.match(html, new RegExp(`<title>${record.name.replace(/[.*+?^${'{}'}()|[\]\\]/g, '\\$&')}`), record.id);
    assert.ok(html.includes(escapeHtml(record.eligibility)), `${record.id} eligibility`);
    assert.ok(html.includes(escapeHtml(record.kind)), `${record.id} benefit type`);
    assert.ok(html.includes(record.checked), `${record.id} checked date`);
    assert.ok(html.includes(`href="${record.url}"`), `${record.id} official link`);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE_BASE}${opportunityPath(record.id)}">`), `${record.id} canonical`);
    assert.ok(html.includes('"@type":"BreadcrumbList"'), `${record.id} breadcrumb metadata`);
    assert.ok(html.includes('not an application'), `${record.id} no award claim`);
    assert.ok(!/<script(?! type="application\/ld\+json")/.test(html), `${record.id} loads no scripts`);
    assert.ok(!/globe/i.test(html), `${record.id} does not load the globe`);
  }
});

test('record text is escaped before it reaches the page', () => {
  const hostile = { ...complete, summary: '<script>alert(1)</script>', name: 'A & B <Programme>' };
  const html = renderOpportunityPage(hostile);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; B &lt;Programme&gt;'));
});

test('geography is rendered honestly, never invented', () => {
  assert.equal(geographyLabel(['AU']), 'Australia');
  assert.match(geographyLabel(['UNKNOWN']), /Not specified by the provider/);
  const unknown = cohort.find(record => record.scope.length === 1 && record.scope[0] === 'UNKNOWN');
  assert.ok(unknown, 'cohort includes an unspecified-geography record to prove the phrasing');
  assert.match(renderOpportunityPage(unknown), /Not specified by the provider/);
});

test('cohort index links every page and keeps opportunities distinct from partner leads', () => {
  const html = renderCohortIndex(cohort, { updated: catalogue.updated });
  for (const record of cohort) {
    assert.ok(html.includes(`href="./${opportunityPath(record.id)}"`), `${record.id} linked from index`);
  }
  assert.ok(html.includes('partner index'), 'points at the separate partner index');
  assert.ok(html.includes('not an application'), 'no award claim');
  assert.ok(html.includes('"@type":"ItemList"'), 'item list metadata');
  assert.ok(!/<script(?! type="application\/ld\+json")/.test(html), 'index loads no scripts');
});

test('sitemap gains exactly the cohort URLs and keeps the curated base', async () => {
  const base = await readFile(new URL('../web/sitemap.xml', import.meta.url), 'utf8');
  const merged = withCohortUrls(base, cohort);
  for (const record of cohort) {
    assert.ok(merged.includes(`<loc>${SITE_BASE}${opportunityPath(record.id)}</loc>`), record.id);
  }
  assert.ok(merged.includes(`<loc>${SITE_BASE}opportunities.html</loc>`));
  for (const match of base.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.ok(merged.includes(`<loc>${match[1]}</loc>`), `base entry kept: ${match[1]}`);
  }
  assert.equal(withCohortUrls(merged, cohort), merged, 'idempotent');
});
