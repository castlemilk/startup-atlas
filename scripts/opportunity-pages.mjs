// Prerendered opportunity pages for the #130 SEO cohort.
//
// The interactive directory renders opportunities client-side, so crawlers
// and no-JavaScript readers only see placeholders. This module renders a
// small, reviewed cohort of catalogue opportunities as self-contained static
// HTML at build time (wired into scripts/build.mjs), following the pattern
// docs/partner-index.html established: no scripts, no globe, ordinary links.
//
// Cohort rule — deliberately narrow, derived from the existing catalogue
// contracts (scripts/catalogue-entries.mjs), never a hand-picked list:
//   1. status_controlled is "Open" or "Apply / verify" — the record is
//      currently actionable, not closed, paused or intake-unknown.
//   2. facts is a non-empty object — structured claims were extracted from
//      the provider's official source during review (#71 source-attributed
//      claims), which is the in-data evidence a record was source-reviewed.
//   3. Every publication field is present: name, org, kind (benefit type),
//      value, summary, eligibility, limits, a checked/review date and an
//      official http(s) URL.
// The cohort is re-derived on every build, so a record whose review state
// changes enters or leaves the prerendered set automatically.
//
// Honesty boundaries (#130 acceptance criteria):
//   - Opportunities stay distinct from partners, investors and providers:
//     these pages describe provider-published opportunities only and link
//     to the partner index separately; no lead is promoted to a claim.
//   - Geography is rendered exactly as recorded; an UNKNOWN scope is shown
//     as unspecified, never as worldwide eligibility.
//   - An outbound click is discovery only. Nothing here records clicks
//     (analytics stays disabled — docs/ANALYTICS.md) and no page claims an
//     application, award or credit outcome.

// The origin configuration that already exists on main (#418 canonicals,
// web/sitemap.xml, web/robots.txt). Issue #129 owns choosing the canonical
// public origin; if it decides otherwise, this constant and the #418
// surfaces change together — do not diverge them here.
export const SITE_BASE = 'https://castlemilk.github.io/startup-atlas/';

export const ACTIONABLE_STATUSES = new Set(['Open', 'Apply / verify']);

const REQUIRED_TEXT = ['name', 'org', 'kind', 'value', 'summary', 'eligibility', 'limits', 'checked'];

const SCOPE_LABELS = {
  WORLD: 'Worldwide (as stated by the provider)',
  AU: 'Australia', NZ: 'New Zealand', GB: 'United Kingdom', US: 'United States',
  CA: 'Canada', SG: 'Singapore', IN: 'India',
};

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isOfficialUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isCohortRecord(record) {
  if (!record || typeof record !== 'object') return false;
  if (!ACTIONABLE_STATUSES.has(record.status_controlled)) return false;
  if (!record.facts || typeof record.facts !== 'object' || Array.isArray(record.facts)) return false;
  if (Object.keys(record.facts).length === 0) return false;
  for (const field of REQUIRED_TEXT) {
    if (typeof record[field] !== 'string' || record[field].trim() === '') return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.checked)) return false;
  if (!Array.isArray(record.scope) || record.scope.length === 0) return false;
  return isOfficialUrl(record.url);
}

// Deterministic cohort: actionable, source-reviewed records sorted by
// benefit type, then name, then id, so builds are reproducible.
export function selectCohort(opportunities) {
  return opportunities
    .filter(isCohortRecord)
    .sort((a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id));
}

export function opportunityPath(id) {
  return `opportunities/${id}.html`;
}

export function geographyLabel(scope) {
  if (scope.length === 1 && scope[0] === 'UNKNOWN') {
    return 'Not specified by the provider — confirm on the official page';
  }
  return scope.map(code => SCOPE_LABELS[code] ?? code).join(', ');
}

function metaDescription(summary) {
  const text = summary.replace(/\s+/g, ' ').trim();
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  return cut.slice(0, cut.lastIndexOf(' ')).trimEnd() + '…';
}

const PAGE_CSS = `:root{font-family:system-ui,sans-serif;color:#172a2f;background:#f6f4ee}body{margin:0}main{max-width:1000px;margin:auto;padding:3rem 1.25rem 5rem}a{color:#075f69}a:focus-visible{outline:3px solid #e77643;outline-offset:3px}header{border-bottom:1px solid #bdccc8;padding-bottom:2rem}h1{font-size:clamp(2.2rem,5vw,3.6rem);letter-spacing:-.05em;line-height:1.05;margin:1.5rem 0 1rem}header p{max-width:64ch;line-height:1.6;color:#41565a}.crumbs{font-size:.9rem}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.5rem;margin:1.5rem 0}.fact{background:white;border:1px solid #dde6e3;border-radius:12px;padding:1rem}.fact dt{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:#53666a}.fact dd{margin:.35rem 0 0;font-weight:600}section{margin:2rem 0}section h2{margin:0 0 .75rem}section p{max-width:68ch;line-height:1.65}.official{font-size:1.05rem;font-weight:600}.note{font-size:.9rem;color:#41565a;max-width:68ch;line-height:1.6}.rows{display:grid;gap:.5rem}.row{background:white;border:1px solid #dde6e3;border-radius:12px;padding:1rem}.row h3{font-size:1rem;margin:0}.row p{font-size:.88rem;color:#53666a;margin:.35rem 0 0;line-height:1.55}`;

function head({ title, description, canonical }) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<meta name="description" content="${escapeHtml(description)}">`
    + `<link rel="canonical" href="${canonical}">`
    + `<meta property="og:type" content="website">`
    + `<meta property="og:site_name" content="Startup Atlas">`
    + `<meta property="og:title" content="${escapeHtml(title)}">`
    + `<meta property="og:description" content="${escapeHtml(description)}">`
    + `<meta property="og:url" content="${canonical}">`
    + `<title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style>`;
}

function breadcrumbJsonLd(items) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, item: item.url,
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function renderOpportunityPage(record) {
  const canonical = SITE_BASE + opportunityPath(record.id);
  const title = `${record.name} — ${record.kind} | Startup Atlas`;
  const facts = Object.entries(record.facts)
    .map(([key, value]) => `<div class="fact"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');
  const grid = [
    ['Provider', record.org],
    ['Benefit type', record.kind],
    ['Value', record.value],
    ['Access', record.access],
    ['Geography', geographyLabel(record.scope)],
    ['Status', record.status],
    ['Checked against the official source', record.checked],
    ...(record.deadline ? [['Deadline', record.deadline]] : []),
  ].map(([key, value]) => `<div class="fact"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  return `<!doctype html>
<html lang="en"><head>${head({ title, description: metaDescription(record.summary), canonical })}
${breadcrumbJsonLd([
    { name: 'Startup Atlas', url: SITE_BASE },
    { name: 'Startup credits and programmes', url: SITE_BASE + 'opportunities.html' },
    { name: record.name, url: canonical },
  ])}
</head><body><main>
<header>
<nav class="crumbs" aria-label="Breadcrumb"><a href="../">Startup Atlas</a> › <a href="../opportunities.html">Startup credits and programmes</a> › ${escapeHtml(record.name)}</nav>
<h1>${escapeHtml(record.name)}</h1>
<p>${escapeHtml(record.summary)}</p>
</header>
<section aria-label="Opportunity details"><dl class="facts">${grid}</dl></section>
<section><h2>Eligibility</h2><p>${escapeHtml(record.eligibility)}</p></section>
<section><h2>Limits and terms</h2><p>${escapeHtml(record.limits)}</p></section>
${facts ? `<section><h2>Key facts from the official source</h2><dl class="facts">${facts}</dl></section>` : ''}
<section><h2>Apply</h2>
<p class="official"><a href="${escapeHtml(record.url)}" rel="noopener">Official programme page ↗</a></p>
<p class="note">Startup Atlas republishes the provider's public information, checked ${escapeHtml(record.checked)}. Following this link is not an application, and a listing is not an award: the provider decides eligibility and whether credits or places are granted. Prefer the interactive <a href="../">Startup Atlas directory</a> to search and filter every opportunity.</p>
</section>
</main></body></html>
`;
}

export function renderCohortIndex(cohort, { updated } = {}) {
  const canonical = SITE_BASE + 'opportunities.html';
  const title = 'Startup credits and programmes — reviewed cohort | Startup Atlas';
  const description = 'A small reviewed cohort of startup credits and programmes, prerendered from the Startup Atlas catalogue with eligibility, benefit type, review dates and official application links.';
  const byKind = new Map();
  for (const record of cohort) {
    if (!byKind.has(record.kind)) byKind.set(record.kind, []);
    byKind.get(record.kind).push(record);
  }
  const sections = [...byKind.entries()].map(([kind, records]) => {
    const rows = records.map(record => `<article class="row"><h3><a href="./${opportunityPath(record.id)}">${escapeHtml(record.name)}</a></h3><p>${escapeHtml(record.org)} · ${escapeHtml(record.value)} · ${escapeHtml(geographyLabel(record.scope))}</p><p>${escapeHtml(record.summary)}</p><p>Checked ${escapeHtml(record.checked)} · <a href="${escapeHtml(record.url)}" rel="noopener">Official page ↗</a></p></article>`).join('\n');
    return `<section><h2>${escapeHtml(kind)}</h2><div class="rows">${rows}</div></section>`;
  }).join('\n');
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Startup Atlas reviewed credits and programmes cohort',
    itemListElement: cohort.map((record, index) => ({
      '@type': 'ListItem', position: index + 1, name: record.name, url: SITE_BASE + opportunityPath(record.id),
    })),
  };
  return `<!doctype html>
<html lang="en"><head>${head({ title, description, canonical })}
<script type="application/ld+json">${JSON.stringify(itemList)}</script>
</head><body><main>
<header>
<nav class="crumbs" aria-label="Breadcrumb"><a href="./">Startup Atlas</a> › Startup credits and programmes</nav>
<h1>Startup credits &amp; programmes.</h1>
<p>These ${cohort.length} opportunities are the reviewed cohort of the Startup Atlas catalogue: currently open or accepting applications, with structured facts extracted from each provider's official source and a recorded check date${updated ? ` (catalogue updated ${escapeHtml(updated)})` : ''}. Every other catalogue record stays in the <a href="./">interactive directory</a> until it meets the same bar.</p>
<p>Opportunities are published by the providers named on each page. They are distinct from the Atlas <a href="./docs/partner-index.html">partner index</a>, whose names are research leads, and a listing here is not an application, an endorsement or an award — providers decide eligibility and grants.</p>
</header>
${sections}
</main></body></html>
`;
}

// Append the cohort index and one URL per cohort page to the published
// sitemap. The curated base entries in web/sitemap.xml are preserved
// verbatim; only the closing tag moves.
export function withCohortUrls(sitemapXml, cohort) {
  if (!sitemapXml.includes('</urlset>')) throw new Error('sitemap.xml has no closing </urlset> tag');
  if (sitemapXml.includes(SITE_BASE + 'opportunities.html')) return sitemapXml;
  const entries = [
    `  <url><loc>${SITE_BASE}opportunities.html</loc></url>`,
    ...cohort.map(record => `  <url><loc>${SITE_BASE}${opportunityPath(record.id)}</loc></url>`),
  ].join('\n');
  return sitemapXml.replace('</urlset>', `${entries}\n</urlset>`);
}
