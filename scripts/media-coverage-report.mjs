// Published media coverage report for #85 (CRAWL-07): how far each entity
// kind's logos and portraits have travelled through the image pipeline,
// split by stage — discovered / published / downloaded / approved / rendered.
//
// Stage definitions (per entity row):
//   discovered — a source-attributed image reference exists (a record's
//     logo/photo field with its *_source, or a reviewed web/logos.js entry).
//   published — that reference points at a repository-local asset path
//     (./assets/... or the GitHub Pages URL of one), i.e. the site is wired
//     to serve our own copy rather than a remote original.
//   downloaded — the referenced local asset file actually exists in web/.
//   approved — a public asset manifest (web/assets/manifests/) covers that
//     file with both identity and rights decisions approved.
//   rendered — the published graph's artwork for the matching entity
//     resolves to a local file that exists, so the explorer/treemap shows
//     the image instead of an initials fallback.
//
// The audit script (scripts/audit-image-coverage.mjs) answers "which rows
// have any image reference"; this report answers "where does each kind
// stall", and its output is committed as docs/MEDIA-COVERAGE.md so the
// numbers are visible without running anything.
import { access, readdir, readFile, writeFile } from 'node:fs/promises';

const PAGES_ORIGIN = 'https://castlemilk.github.io/startup-atlas/';
export const STAGES = ['discovered', 'published', 'downloaded', 'approved', 'rendered'];

// Normalise a record/logo reference to a web-relative local path
// ('assets/logos/x.svg'), or null when it is remote or absent.
export function localAssetPath(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('./assets/')) return value.slice(2);
  if (value.startsWith(PAGES_ORIGIN + 'assets/')) return value.slice(PAGES_ORIGIN.length);
  return null;
}

function manifestApproved(manifest) {
  return manifest?.provenance?.identity?.decision === 'approved'
    && manifest?.provenance?.rights?.decision === 'approved';
}

// graph kind(s) that can render each report kind
const GRAPH_KINDS = {
  startups: ['startup'],
  partners: ['partner'],
  providers: ['provider'],
  companies: null, // portfolio companies appear under several graph kinds
  portraits: ['person'],
};

export function buildMediaCoverage({ profiles, research, catalogue, manifests, graph, logoMap, fileExists, artworkUrl }) {
  const approvedTargets = new Set(
    (manifests || []).filter(manifestApproved).map((m) => m.target).filter(Boolean),
  );
  const manifestTargets = new Set((manifests || []).map((m) => m.target).filter(Boolean));

  const graphByName = new Map();
  for (const entity of graph?.entities || []) {
    const key = entity.name;
    if (!graphByName.has(key)) graphByName.set(key, []);
    graphByName.get(key).push(entity);
  }
  const renderedFor = (kind, name) => {
    const kinds = GRAPH_KINDS[kind];
    const candidates = (graphByName.get(name) || []).filter((e) => !kinds || kinds.includes(e.kind));
    return candidates.some((entity) => {
      const local = localAssetPath(artworkUrl ? artworkUrl(entity) : entity.logo);
      return !!local && fileExists(local);
    });
  };

  const rows = { startups: [], partners: [], providers: [], companies: [], portraits: [] };
  const addRow = (kind, name, context, reference, discovered) => {
    const local = localAssetPath(reference);
    rows[kind].push({
      name, context: context || null, discovered: !!discovered,
      published: !!local,
      downloaded: !!local && fileExists(local),
      approved: !!local && approvedTargets.has('web/' + local),
      hasManifest: !!local && manifestTargets.has('web/' + local),
      rendered: renderedFor(kind, name),
      reference: reference || null,
      local,
    });
  };

  for (const s of research?.startups || []) {
    addRow('startups', s.name, null, s.logo, s.logo && s.logo_source);
  }
  for (const [partner, record] of Object.entries(profiles || {})) {
    addRow('partners', partner, null, logoMap.get(partner), logoMap.get(partner));
    for (const c of record.companies || []) {
      const mapped = logoMap.get(c.name);
      addRow('companies', c.name, partner, (c.logo && c.logo_source) ? c.logo : mapped, (c.logo && c.logo_source) || mapped);
    }
    for (const p of record.people || []) {
      addRow('portraits', p.name, partner, p.photo, p.photo && p.photo_source);
    }
  }
  const orgs = [...new Set((catalogue?.opportunities || []).map((o) => o.org).filter(Boolean))].sort();
  for (const org of orgs) addRow('providers', org, null, logoMap.get(org), logoMap.get(org));
  for (const s of research?.startups || []) {
    for (const f of s.founders || []) {
      if (!f || typeof f !== 'object') continue;
      addRow('portraits', f.name, s.name, f.photo_url, f.photo_url && f.photo_source);
    }
  }

  const labels = {
    startups: 'Startup logos', partners: 'Partner logos', providers: 'Provider logos',
    companies: 'Portfolio company logos', portraits: 'Portraits (founders & partner people)',
  };
  const kinds = {};
  for (const [kind, list] of Object.entries(rows)) {
    const stages = Object.fromEntries(STAGES.map((stage) => [stage, list.filter((r) => r[stage]).length]));
    kinds[kind] = {
      label: labels[kind], total: list.length, stages,
      missing: list.filter((r) => !r.downloaded).map((r) => ({
        name: r.name, context: r.context,
        reason: !r.discovered ? 'no source-attributed image reference'
          : !r.published ? 'reference is remote-only, no local asset published'
            : 'referenced local asset file is missing',
      })),
      unapproved: list.filter((r) => r.downloaded && !r.approved).map((r) => ({
        name: r.name, context: r.context,
        reason: r.hasManifest ? 'manifest present but identity/rights not both approved' : 'no public asset manifest',
      })),
    };
  }
  return { kinds, manifestCount: (manifests || []).length };
}

export function renderMediaCoverageMarkdown(report, { generatedAt, revision }) {
  const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '—');
  const lines = [
    '# Media coverage report',
    '',
    `Generated ${generatedAt} from data revision ${revision || 'working tree'} by \`npm run report:media-coverage\` (#85).`,
    'Counts are computed from the committed records, `web/logos.js`, the public asset',
    'manifests in `web/assets/manifests/` and the published graph — not from live fetches.',
    '',
    'Stages, per entity: **discovered** = a source-attributed image reference exists;',
    '**published** = the reference points at a repository-local asset; **downloaded** =',
    'that asset file exists in `web/`; **approved** = a public manifest covers it with',
    'identity and rights both approved; **rendered** = graph artwork for the entity',
    'resolves to an existing local file (no initials fallback).',
    '',
    '| Entity kind | Total | Discovered | Published | Downloaded | Approved | Rendered |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const kind of Object.values(report.kinds)) {
    const s = kind.stages;
    lines.push(`| ${kind.label} | ${kind.total} | ${s.discovered} (${pct(s.discovered, kind.total)}) | ${s.published} (${pct(s.published, kind.total)}) | ${s.downloaded} (${pct(s.downloaded, kind.total)}) | ${s.approved} (${pct(s.approved, kind.total)}) | ${s.rendered} (${pct(s.rendered, kind.total)}) |`);
  }
  lines.push('', `Public asset manifests on file: ${report.manifestCount}.`,
    'Rendered can exceed a kind\'s own discovered count where the graph carries an image',
    'reference from another record (for example a partner portfolio listing) that the',
    'kind\'s own records do not carry.', '');
  for (const kind of Object.values(report.kinds)) {
    lines.push(`## ${kind.label}`, '');
    if (kind.missing.length) {
      lines.push(`<details><summary>Not downloaded (${kind.missing.length})</summary>`, '');
      for (const m of kind.missing) lines.push(`- ${m.name}${m.context ? ` (${m.context})` : ''} — ${m.reason}`);
      lines.push('', '</details>', '');
    } else lines.push('Every entity has a downloaded local asset.', '');
    if (kind.unapproved.length) {
      lines.push(`<details><summary>Downloaded but not manifest-approved (${kind.unapproved.length})</summary>`, '');
      for (const m of kind.unapproved) lines.push(`- ${m.name}${m.context ? ` (${m.context})` : ''} — ${m.reason}`);
      lines.push('', '</details>', '');
    }
  }
  return lines.join('\n');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = new URL('../', import.meta.url);
  const read = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [{ logoEntries }, { graphArtwork }] = await Promise.all([
    import('../web/logos.js'), import('../web/graph-artwork.js'),
  ]);
  const manifestDir = new URL('web/assets/manifests/', root);
  const manifests = [];
  for (const file of await readdir(manifestDir)) {
    if (file.endsWith('.json')) manifests.push(JSON.parse(await readFile(new URL(file, manifestDir), 'utf8')));
  }
  const [profiles, research, catalogue, graph] = await Promise.all([
    read('data/partner-profiles.json'), read('data/startup-research.json'),
    read('data/catalogue.json'), read('data/graph.json'),
  ]);
  const fileExists = (webRelative) => access(new URL('web/' + webRelative, root)).then(() => true, () => false);
  // fileExists is async in the CLI; resolve existence up front per asset path.
  const paths = new Set();
  const collect = (v) => { const p = localAssetPath(v); if (p) paths.add(p); };
  for (const s of research.startups) { collect(s.logo); for (const f of s.founders || []) collect(f?.photo_url); }
  for (const record of Object.values(profiles)) {
    for (const c of record.companies || []) collect(c.logo);
    for (const p of record.people || []) collect(p.photo);
  }
  for (const [, slug] of logoEntries) paths.add('assets/logos/' + slug);
  for (const e of graph.entities) collect(graphArtwork(e).url);
  const existing = new Set();
  for (const p of paths) if (await fileExists(p)) existing.add(p);
  const report = buildMediaCoverage({
    profiles, research, catalogue, manifests, graph,
    logoMap: new Map(logoEntries.map(([name, slug]) => [name, `./assets/logos/${slug.endsWith('.png') ? slug : slug + '.svg'}`])),
    fileExists: (p) => existing.has(p),
    artworkUrl: (entity) => graphArtwork(entity).url,
  });
  const generatedAt = new Date().toISOString().slice(0, 10);
  let revision = graph.source_revision || null;
  if (!revision) {
    try {
      const { execFileSync } = await import('node:child_process');
      revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root.pathname }).toString().trim();
    } catch { /* keep null */ }
  }
  const markdown = renderMediaCoverageMarkdown(report, { generatedAt, revision });
  await writeFile(new URL('docs/MEDIA-COVERAGE.md', root), markdown.replace(/\n+$/, '') + '\n');
  console.log(JSON.stringify({ generatedAt, kinds: Object.fromEntries(Object.entries(report.kinds).map(([k, v]) => [k, { total: v.total, ...v.stages }])) }, null, 2));
}
