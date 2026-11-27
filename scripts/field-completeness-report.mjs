// Field-level completeness and freshness report for #89 (OPS-01).
//
// The KPI coverage signals (C1-C10) each watch one field or one stall;
// this report is the operator's full table: for every reviewed entity
// kind, how many records carry each field, and how fresh each kind's
// review stamps are. It answers "which field, on which kind, is thin"
// without reading raw data files or crawl logs.
//
// Completeness is counted against the records actually in the reviewed
// files (observed denominators, never source-estimated totals), and a
// field counts as present only when it carries a usable value: a
// non-empty string, a non-empty list, a number, or an object with text.
// Freshness buckets each record's review stamp (reviewed_at on the
// record, checked on partner profiles) by age in days against the
// report date: fresh <= 7, recent 8-30, stale > 30, undated = no stamp.
//
// Output is committed as docs/FIELD-COMPLETENESS.md (regenerate with
// `npm run report:field-completeness`) so the numbers are visible
// without running anything.
import { readFile, writeFile } from 'node:fs/promises';

export function fieldPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim().length > 0;
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshnessBucket(stamp, today) {
  if (!stamp || typeof stamp !== 'string') return 'undated';
  const date = Date.parse(stamp.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(date)) return 'undated';
  const ageDays = Math.floor((today - date) / DAY_MS);
  if (ageDays <= 7) return 'fresh';
  if (ageDays <= 30) return 'recent';
  return 'stale';
}

// kind -> { label, rows: [record], stamp: record -> stamp,
//           fields: [[fieldLabel, record -> value]] }
function kindRows({ research, partners, profiles }) {
  const startups = research?.startups || [];
  const founders = startups.flatMap((s) => (s.founders || []).map((f) => ({ ...f, _startup: s.name })));
  const partnerRows = Object.entries(partners || {}).map(([name, r]) => ({ ...r, name }));
  const profileRows = Object.entries(profiles || {}).map(([name, r]) => ({ ...r, name }));
  const people = profileRows.flatMap((p) => (p.people || []).map((person) => ({ ...person, _partner: p.name })));
  const companies = profileRows.flatMap((p) => (p.companies || []).map((c) => ({ ...c, _partner: p.name })));
  return [
    {
      id: 'startups', label: 'Startups (startup-research.json)', rows: startups,
      stamp: (r) => r.reviewed_at,
      fields: [
        ['description', (r) => r.description],
        ['website', (r) => r.website],
        ['founded_year', (r) => r.founded_year],
        ['hq_city', (r) => r.hq_city],
        ['hq_country', (r) => r.hq_country],
        ['source', (r) => r.source],
        ['founders (≥1)', (r) => r.founders],
        ['funding_rounds (≥1)', (r) => r.funding_rounds],
        ['profile_facts (≥1)', (r) => r.profile_facts],
        ['articles (≥1)', (r) => r.articles],
      ],
    },
    {
      id: 'founders', label: 'Founders (across startups)', rows: founders,
      stamp: null,
      fields: [
        ['linkedin', (r) => r.linkedin],
        ['photo_url', (r) => r.photo_url],
        ['blurb', (r) => r.blurb],
        ['socials (≥1)', (r) => r.socials],
        ['source', (r) => r.source],
      ],
    },
    {
      id: 'partners', label: 'Partners (partners-reviewed.json)', rows: partnerRows,
      stamp: (r) => r.reviewed_at,
      fields: [
        ['description', (r) => r.description],
        ['website', (r) => r.website],
        ['source', (r) => r.source],
        ['aliases (≥1)', (r) => r.aliases],
      ],
    },
    {
      id: 'profile-people', label: 'Partner-profile people (partner-profiles.json)', rows: people,
      stamp: null,
      fields: [
        ['role', (r) => r.role],
        ['source', (r) => r.source],
        ['photo', (r) => r.photo],
        ['linkedin', (r) => r.linkedin],
      ],
    },
    {
      id: 'profile-companies', label: 'Partner-profile companies (partner-profiles.json)', rows: companies,
      stamp: null,
      fields: [
        ['source', (r) => r.source],
        ['logo', (r) => r.logo],
        ['logo_source', (r) => r.logo_source],
      ],
    },
    {
      id: 'partner-profiles', label: 'Partner profiles (freshness by checked)', rows: profileRows,
      stamp: (r) => r.checked,
      fields: [
        ['people (≥1)', (r) => r.people],
        ['companies (≥1)', (r) => r.companies],
        ['geography', (r) => r.geography],
        ['type', (r) => r.type],
      ],
    },
  ];
}

export function buildFieldCompleteness({ research, partners, profiles, today }) {
  const kinds = kindRows({ research, partners, profiles }).map((kind) => {
    const total = kind.rows.length;
    const fields = kind.fields.map(([label, get]) => {
      const present = kind.rows.filter((r) => fieldPresent(get(r))).length;
      return { label, present, total, pct: total ? Math.round((present / total) * 1000) / 10 : 0 };
    });
    let freshness = null;
    if (kind.stamp) {
      freshness = { fresh: 0, recent: 0, stale: 0, undated: 0 };
      for (const r of kind.rows) freshness[freshnessBucket(kind.stamp(r), today)] += 1;
    }
    return { id: kind.id, label: kind.label, total, fields, freshness };
  });
  return { kinds };
}

export function renderFieldCompletenessMarkdown(report, { generatedAt, revision }) {
  const lines = [
    '# Field completeness and freshness',
    '',
    `Generated ${generatedAt}${revision ? ` from revision ${revision}` : ''} by \`npm run report:field-completeness\` (scripts/field-completeness-report.mjs). Do not edit by hand.`,
    '',
    'Field-level completeness for #89 (OPS-01): per reviewed entity kind, the share of records carrying each field, counted against the records in the reviewed files (observed denominators). Freshness buckets each record\'s review stamp by age at the report date: fresh ≤ 7 days, recent 8–30 days, stale > 30 days.',
    '',
  ];
  for (const kind of report.kinds) {
    lines.push(`## ${kind.label}`, '', `Records: ${kind.total}`, '');
    if (kind.freshness) {
      const f = kind.freshness;
      lines.push(`Freshness: ${f.fresh} fresh, ${f.recent} recent, ${f.stale} stale, ${f.undated} undated.`, '');
    }
    lines.push('| Field | Present | Total | % |', '| --- | ---: | ---: | ---: |');
    for (const field of kind.fields) {
      lines.push(`| ${field.label} | ${field.present} | ${field.total} | ${field.pct} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = new URL('../', import.meta.url);
  const read = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const [research, partners, profiles] = await Promise.all([
    read('data/startup-research.json'), read('data/partners-reviewed.json'),
    read('data/partner-profiles.json'),
  ]);
  const generatedAt = new Date().toISOString().slice(0, 10);
  const today = Date.parse(generatedAt + 'T00:00:00Z');
  const report = buildFieldCompleteness({ research, partners, profiles, today });
  let revision = null;
  try {
    const { execFileSync } = await import('node:child_process');
    revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root.pathname }).toString().trim();
  } catch { /* keep null */ }
  const markdown = renderFieldCompletenessMarkdown(report, { generatedAt, revision });
  await writeFile(new URL('docs/FIELD-COMPLETENESS.md', root), markdown.replace(/\n+$/, '') + '\n');
  console.log(JSON.stringify({
    generatedAt,
    kinds: Object.fromEntries(report.kinds.map((k) => [k.id, k.total])),
  }, null, 2));
}
