#!/usr/bin/env node
// Read-only, country-local checks. The production schema is imported unchanged.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startupSlug,
  validateStartupRecord,
} from '../../../../backend/hosted/src/startup-record.mjs';

const packetDirectory = dirname(fileURLToPath(import.meta.url));
const checks = [];
const counts = {};
const inputs = {};
const own = (value, key) => Object.hasOwn(value, key);
const normalizedName = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const numericSuppressedKind = kind => /(?:debt|blended|mixed_primary_secondary)/i.test(kind || '');

function check(id, task) {
  try {
    const detail = task();
    checks.push({ id, status: 'passed', ...(detail === undefined ? {} : { detail }) });
  } catch (error) {
    checks.push({ id, status: 'failed', error: error.message });
  }
}

function canonicalDomain(website) {
  assert.equal(typeof website, 'string', 'A reviewed company website is required.');
  const url = new URL(website);
  assert.equal(url.protocol, 'https:', 'A reviewed website must use HTTPS.');
  assert.equal(url.username, '', 'Website must not contain credentials.');
  assert.equal(url.password, '', 'Website must not contain credentials.');
  return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} contains duplicates.`);
}

function assertNoNull(value, path = 'record') {
  assert.notEqual(value, null, `${path} must be absent rather than null in the projection.`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNull(item, `${path}[${index}]`));
  } else if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNoNull(item, `${path}.${key}`);
  }
}

function foundedYear(founded) {
  if (founded === null || founded === undefined || founded.value === null || founded.value === undefined) return null;
  const patterns = {
    year: /^\d{4}$/,
    month: /^\d{4}-\d{2}$/,
    day: /^\d{4}-\d{2}-\d{2}$/,
  };
  assert.ok(patterns[founded.precision], 'Founding precision must be explicitly year, month or day.');
  assert.match(String(founded.value), patterns[founded.precision], 'Founding value must match its stated precision.');
  return Number(String(founded.value).slice(0, 4));
}

const fixture = {
  name: 'Schema Control Fixture',
  description: 'Synthetic fixture used only by this local validator.',
  website: 'https://example.com/',
  source: 'https://example.com/about',
  reviewed_at: '2000-01-01',
  founders: [{ name: 'Fixture Founder', source: 'https://example.com/about' }],
  funding_rounds: [{
    id: 'fixture-seed',
    stage: 'Seed',
    announced_on: '2000-01-01',
    amount: 1000000,
    currency: 'EUR',
    source: 'https://example.com/seed',
  }],
};

check('schema_positive_control', () => { validateStartupRecord(structuredClone(fixture)); });
function negativeControl(id, mutate, expectedMessage) {
  check(id, () => {
    const value = structuredClone(fixture);
    mutate(value);
    let rejection;
    try { validateStartupRecord(value); } catch (error) { rejection = error; }
    assert.ok(rejection, 'Invalid fixture was accepted by the existing Atlas schema.');
    assert.equal(rejection.code, 'VALIDATION_ERROR', 'Fixture failed for an unrelated reason.');
    assert.match(rejection.message, expectedMessage, 'Fixture failed for an unintended constraint.');
    return { rejected: true, reason: rejection.message };
  });
}
negativeControl('reject_currency_without_amount', value => {
  delete value.funding_rounds[0].amount;
}, /requires amount and currency together/i);
negativeControl('reject_amount_without_currency', value => {
  delete value.funding_rounds[0].currency;
}, /requires amount and currency together/i);
negativeControl('reject_unsupported_top_level_hq', value => {
  value.hq = { city: 'Amsterdam', country: 'NL' };
}, /record\.hq is not supported/i);
negativeControl('reject_month_only_announced_on', value => {
  value.funding_rounds[0].announced_on = '2000-01';
}, /(?:date|YYYY-MM-DD)/i);
negativeControl('reject_missing_founder_source', value => {
  delete value.founders[0].source;
}, /founders\.source is required/i);
negativeControl('reject_duplicate_round_ids', value => {
  value.funding_rounds.push(structuredClone(value.funding_rounds[0]));
}, /funding_rounds contains duplicates/i);

async function loadInput(filename, arrayKey) {
  const path = join(packetDirectory, filename);
  const bytes = await readFile(path);
  const parsed = JSON.parse(bytes.toString('utf8'));
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed), `${filename} must contain an object.`);
  assert.ok(Array.isArray(parsed[arrayKey]), `${filename}.${arrayKey} must be an array.`);
  inputs[filename] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  return parsed[arrayKey];
}

try {
  const [records, companies] = await Promise.all([
    loadInput('startup-records.json', 'startups'),
    loadInput('companies.json', 'companies'),
  ]);
  counts.rich_companies = companies.length;
  counts.projected_records = records.length;
  counts.expected_records = companies.length; // Derive; never hard-code the initial batch size.
  counts.projected_funding_events = records.reduce((sum, record) => sum + (record.funding_rounds?.length || 0), 0);
  counts.rich_funding_events = companies.reduce((sum, company) => sum + (company.funding_rounds?.length || 0), 0);

  check('nonempty_and_matching_record_counts', () => {
    assert.ok(companies.length > 0, 'An empty input cannot pass this country batch.');
    assert.equal(records.length, companies.length, 'Projection count differs from the rich company count.');
  });
  check('rich_company_names_unique', () => {
    assert.ok(companies.every(company => typeof company.canonical_name === 'string' && company.canonical_name.trim()), 'Every company needs a canonical name.');
    assertUnique(companies.map(company => normalizedName(company.canonical_name)), 'Canonical names');
  });
  check('projected_names_unique', () => assertUnique(records.map(record => normalizedName(record.name)), 'Projected names'));
  check('rich_domains_unique', () => assertUnique(companies.map(company => canonicalDomain(company.website)), 'Rich company domains'));
  check('projected_domains_unique', () => assertUnique(records.map(record => canonicalDomain(record.website)), 'Projected domains'));
  check('rich_atlas_slugs_unique', () => assertUnique(companies.map(company => startupSlug(company.canonical_name)), 'Rich Atlas slugs'));
  check('projected_atlas_slugs_unique', () => assertUnique(records.map(record => startupSlug(record.name)), 'Projected Atlas slugs'));
  check('canonical_company_sets_match', () => assert.deepEqual(
    records.map(record => normalizedName(record.name)).sort(),
    companies.map(company => normalizedName(company.canonical_name)).sort(),
  ));

  const companyByName = new Map(companies.map(company => [normalizedName(company.canonical_name), company]));
  const recordByName = new Map(records.map(record => [normalizedName(record.name), record]));
  const eventPairs = [];

  for (const record of records) {
    const label = startupSlug(record.name);
    check(`schema:${label}`, () => { validateStartupRecord(record); });
    check(`no_nulls:${label}`, () => assertNoNull(record));
    check(`projection:${label}`, () => {
      const company = companyByName.get(normalizedName(record.name));
      assert.ok(company, 'Projected company has no rich evidence record.');
      assert.equal(record.name, company.canonical_name, 'Projection must retain the canonical name exactly.');
      assert.equal(canonicalDomain(record.website), canonicalDomain(company.website), 'Projected official domain differs from rich evidence.');
      if (typeof company.description?.text === 'string') {
        assert.equal(record.description, company.description.text, 'Projected description differs from reviewed rich description.');
      }
      const expectedYear = foundedYear(company.founded);
      if (expectedYear === null) {
        assert.ok(!own(record, 'founded_year'), 'Unknown founding year must remain absent.');
      } else {
        assert.equal(record.founded_year, expectedYear, 'Projected founding year differs from rich founding evidence.');
      }

      const richEvents = company.funding_rounds || [];
      const projectedEvents = record.funding_rounds || [];
      assert.ok(Array.isArray(richEvents) && Array.isArray(projectedEvents), 'Funding events must be arrays.');
      assertUnique(richEvents.map(event => event.id), 'Rich event IDs for this company');
      assert.deepEqual(
        projectedEvents.map(event => event.id).sort(),
        richEvents.map(event => event.id).sort(),
        'Projection must preserve the selected rich event IDs without adding or dropping events.',
      );
      for (const event of projectedEvents) {
        const rich = richEvents.find(candidate => candidate.id === event.id);
        assert.ok(rich, 'Projected funding event has no rich counterpart.');
        eventPairs.push({ company, event, rich });
      }
    });
  }

  for (const { company, event, rich } of eventPairs) {
    check(`event_projection:${event.id}`, () => {
      assert.equal(event.source, rich.source_url, 'Funding-event source differs from its rich counterpart.');
      if (rich.stage !== null && rich.stage !== undefined) {
        assert.equal(event.stage, rich.stage, 'A stated funding stage must be preserved.');
      }
      if (rich.date_precision === 'day') {
        assert.match(rich.announced_on, /^\d{4}-\d{2}-\d{2}$/, 'Day precision requires an exact day.');
        assert.equal(event.announced_on, rich.announced_on, 'The exact announced date must be preserved.');
      } else {
        assert.ok(!own(event, 'announced_on'), 'Partial or unknown dates must not become exact announced_on dates.');
      }

      const suppressed = numericSuppressedKind(rich.kind);
      const amountKnown = Number.isSafeInteger(rich.amount) && rich.amount > 0;
      const currencyKnown = typeof rich.currency === 'string' && /^[A-Z]{3}$/.test(rich.currency);
      if (suppressed || !amountKnown || !currencyKnown) {
        assert.ok(!own(event, 'amount'), 'Unresolved or mixed/debt financing must not become a numeric event amount.');
        assert.ok(!own(event, 'currency'), 'Currency must be omitted with a suppressed numeric amount.');
      } else if (own(event, 'amount')) {
        assert.equal(event.amount, rich.amount, 'Numeric funding amount differs from rich evidence.');
        assert.equal(event.currency, rich.currency, 'Funding currency differs from rich evidence.');
      }
      if (own(event, 'amount')) assert.ok(event.amount > 0, 'Zero must not stand in for an unknown amount.');
      if (own(event, 'valuation')) {
        const richValuation = typeof rich.valuation === 'object' && rich.valuation !== null ? rich.valuation : null;
        const expectedValue = richValuation ? richValuation.amount : rich.valuation;
        const expectedCurrency = richValuation ? richValuation.currency : rich.valuation_currency;
        assert.ok(Number.isSafeInteger(expectedValue) && expectedValue > 0, 'Projected valuation needs a positive rich valuation.');
        assert.equal(event.valuation, expectedValue, 'Projected valuation differs from rich evidence.');
        assert.equal(event.valuation_currency, expectedCurrency, 'Projected valuation currency differs from rich evidence.');
      }
      return { company: company.canonical_name, kind: rich.kind, numeric_amount_present: own(event, 'amount') };
    });
  }

  check('all_projected_events_compared', () => assert.equal(eventPairs.length, counts.projected_funding_events, 'Some projected events could not be matched to rich evidence.'));
  check('projected_round_ids_globally_unique', () => assertUnique(
    records.flatMap(record => (record.funding_rounds || []).map(event => event.id)),
    'Global projected round IDs',
  ));

  check('qblox_unknown_founding_omitted', () => {
    const company = companyByName.get('qblox');
    const record = recordByName.get('qblox');
    assert.ok(company && record, 'Qblox case is missing.');
    assert.equal(company.founded, null, 'Qblox must retain its unresolved founding conflict.');
    assert.ok(!own(record, 'founded_year'), 'Qblox must not have a guessed founded_year.');
  });
  check('falqon_month_date_omitted', () => {
    const company = companyByName.get('falqon systems');
    const record = recordByName.get('falqon systems');
    assert.ok(company && record, 'Falqon Systems case is missing.');
    const monthEvents = company.funding_rounds.filter(event => event.date_precision === 'month');
    assert.ok(monthEvents.length > 0, 'Expected Falqon month-precision event is missing.');
    for (const rich of monthEvents) {
      const event = record.funding_rounds.find(candidate => candidate.id === rich.id);
      assert.ok(event, 'Falqon month-precision event was dropped.');
      assert.ok(!own(event, 'announced_on'), 'Falqon month-precision event gained an invented day.');
    }
    return { checked_event_ids: monthEvents.map(event => event.id) };
  });
  check('blended_and_debt_events_remain_nonnumeric', () => {
    const blocked = eventPairs.filter(({ rich }) => /(?:blended|debt)/i.test(rich.kind || ''));
    assert.ok(blocked.some(({ rich }) => /blended/i.test(rich.kind)), 'Expected blended-finance control cases are missing.');
    assert.ok(blocked.some(({ rich }) => /debt/i.test(rich.kind)), 'Expected debt control cases are missing.');
    for (const { event } of blocked) {
      assert.ok(!own(event, 'amount') && !own(event, 'currency'), 'Blended/debt event has a numeric amount/currency pair.');
    }
    return { checked_event_ids: blocked.map(({ event }) => event.id) };
  });
  for (const name of ['Cradle', 'Weaviate', 'Framer', 'Vitestro']) {
    check(`currency_null_amount_omitted:${startupSlug(name)}`, () => {
      const company = companyByName.get(normalizedName(name));
      const record = recordByName.get(normalizedName(name));
      assert.ok(company && record, `${name} case is missing.`);
      const unresolved = company.funding_rounds.filter(event => event.currency === null);
      assert.ok(unresolved.length > 0, `${name} has no expected currency-null control event.`);
      for (const rich of unresolved) {
        const event = record.funding_rounds.find(candidate => candidate.id === rich.id);
        assert.ok(event, 'Currency-unresolved event was dropped.');
        assert.ok(!own(event, 'amount') && !own(event, 'currency'), 'Unresolved currency was converted into a numeric amount/currency pair.');
      }
      return { checked_event_ids: unresolved.map(event => event.id) };
    });
  }
} catch (error) {
  checks.push({ id: 'input_loading_or_structure', status: 'failed', error: error.message });
}

const failed = checks.filter(item => item.status === 'failed');
const result = {
  validator: 'netherlands-country-record-projection',
  checked_at: new Date().toISOString(),
  status: failed.length ? 'failed' : 'passed',
  scope: 'Staged country records; schema and projection consistency, not source truth or publication.',
  schema: 'backend/hosted/src/startup-record.mjs#validateStartupRecord',
  inputs,
  counts: { ...counts, checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
  checks,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exitCode = failed.length ? 1 : 0;
