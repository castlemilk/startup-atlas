#!/usr/bin/env node
/**
 * Offline validation of this country's production-shaped, staged projection.
 * This imports the production validator; it does not expand its schema, mutate
 * records, validate claim provenance, or write production data/build outputs.
 *
 * From the repository root:
 *   node research/countries/no/2026-11-18-batch-001/validate_projection.mjs
 *   node research/countries/no/2026-11-18-batch-001/validate_projection.mjs --self-test-only
 *   node research/countries/no/2026-11-18-batch-001/validate_projection.mjs --out research/countries/no/2026-11-18-batch-001/projection-validation.json
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startupSlug, validateStartupRecord } from '../../../../backend/hosted/src/startup-record.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKET_DIR = dirname(SCRIPT_PATH);
const EXPECTED_REVIEWED = '2026-11-18';
const DEFAULT_INPUT = resolve(PACKET_DIR, 'startups.staged.json');
const VALIDATOR_PATH = fileURLToPath(new URL('../../../../backend/hosted/src/startup-record.mjs', import.meta.url));
const GRAPH_BUILDER_PATH = fileURLToPath(new URL('../../../../scripts/make-graph.py', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

function optionsFrom(argv) {
  const options = { input: DEFAULT_INPUT, out: undefined, selfTestOnly: false, help: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    const separator = argument.indexOf('=');
    const flag = separator < 0 ? argument : argument.slice(0, separator);
    if (!['--input', '--out', '--self-test-only', '--help'].includes(flag)) {
      fail('CLI_ARGUMENT', `Unknown argument: ${argument}. Use --help.`);
    }
    if (seen.has(flag)) fail('CLI_ARGUMENT', `Repeated argument: ${flag}.`);
    seen.add(flag);
    if (flag === '--input' || flag === '--out') {
      const value = separator < 0 ? argv[++i] : argument.slice(separator + 1);
      if (!value || value.startsWith('--')) fail('CLI_ARGUMENT', `${flag} requires a file path.`);
      options[flag.slice(2)] = resolve(value);
    } else {
      if (separator >= 0) fail('CLI_ARGUMENT', `${flag} does not take a value.`);
      options[flag === '--help' ? 'help' : 'selfTestOnly'] = true;
    }
  }
  if (options.selfTestOnly && seen.has('--input')) {
    fail('CLI_ARGUMENT', '--self-test-only does not read --input; choose one mode.');
  }
  if (options.out === options.input || options.out === SCRIPT_PATH || options.out === VALIDATOR_PATH || options.out === GRAPH_BUILDER_PATH) {
    fail('CLI_ARGUMENT', '--out must not overwrite the input or validation implementation.');
  }
  return options;
}

function assertNoNulls(value, path = 'record') {
  if (value === null) fail('NULL_PRODUCTION_VALUE', `${path} is null; omit unknown production fields and retain uncertainty in the sidecar.`);
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) assertNoNulls(child, `${path}.${key}`);
}

/** Batch gates supplement, and are explicitly separate from, production schema. */
function validatePacket(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    fail('PACKET_SHAPE', 'The staged document must be an object with reviewed and startups.');
  }
  if (Object.keys(document).sort().join(',') !== 'reviewed,startups') {
    fail('PACKET_SHAPE', 'Only reviewed and startups belong in this projection; keep the projection map separate.');
  }
  // Reuse the actual date validation (including its non-future constraint).
  validateStartupRecord({ name: 'Batch review date', source: 'https://example.org/source', reviewed_at: document.reviewed });
  if (!Array.isArray(document.startups) || document.startups.length === 0) {
    fail('PACKET_SHAPE', 'startups must be a nonempty array; an empty packet is not a validated batch.');
  }
  const startupIds = new Map();
  const roundIds = new Map();
  const founderIds = new Map();
  const missingYears = [];
  const zeroAmountRounds = [];
  let founderOccurrences = 0;
  let exactAmountRounds = 0;
  let textOnlyAmountRounds = 0;
  let unquantifiedRounds = 0;
  let undatedRounds = 0;
  let profileFacts = 0;

  for (const [index, record] of document.startups.entries()) {
    assertNoNulls(record, `startups[${index}]`);
    const before = JSON.stringify(record);
    let validated;
    try {
      validated = validateStartupRecord(record);
    } catch (error) {
      error.message = `startups[${index}] (${JSON.stringify(record?.name)}): ${error.message}`;
      throw error;
    }
    if (validated !== record || JSON.stringify(record) !== before) {
      fail('VALIDATOR_MUTATION', 'Production validation must return the same record without changing its data.');
    }
    if (record.reviewed_at !== document.reviewed) {
      fail('REVIEW_DATE_MISMATCH', `${record.name}: reviewed_at must equal the packet reviewed date.`);
    }
    // The new-startup workflow documented in KNOWLEDGE-GRAPH.md requires these;
    // the lower-level validateStartupRecord function alone makes them optional.
    if (!Object.hasOwn(record, 'website') || !Object.hasOwn(record, 'description')) {
      fail('NEW_STARTUP_FIELDS', `${record.name}: this new-startup packet requires an official website and description.`);
    }
    const startupId = `startup:${startupSlug(record.name)}`;
    if (startupIds.has(startupId)) {
      fail('STARTUP_ID_COLLISION', `${startupId}: ${JSON.stringify(startupIds.get(startupId))} and ${JSON.stringify(record.name)} share an ID.`);
    }
    startupIds.set(startupId, record.name);
    if (!Object.hasOwn(record, 'founded_year')) missingYears.push(startupId);
    profileFacts += (record.profile_facts || []).length;

    for (const founder of record.founders || []) {
      founderOccurrences += 1;
      // Python's graph collision comparison uses casefold(), without Unicode
      // canonical normalization. Require NFC here without silently rewriting a
      // sourced name; compare actual spellings conservatively below.
      if (founder.name.normalize('NFC') !== founder.name) {
        fail('FOUNDER_UNICODE_NORMALIZATION', `${record.name}: founder ${JSON.stringify(founder.name)} is not NFC; review its spelling before projection.`);
      }
      const slug = startupSlug(founder.name);
      if (!slug) fail('FOUNDER_EMPTY_ID', `${record.name}: founder ${JSON.stringify(founder.name)} has no ASCII graph slug.`);
      const founderId = `person:${slug}`;
      const existing = founderIds.get(founderId);
      // This is intentionally more conservative than Python casefold for rare
      // compatibility forms. It never merges different names on slug alone.
      if (existing && existing.name.toLowerCase() !== founder.name.toLowerCase()) {
        fail('FOUNDER_ID_COLLISION', `${founderId}: ${JSON.stringify(existing.name)} and ${JSON.stringify(founder.name)} need explicit identity reconciliation.`);
      }
      if (existing) {
        existing.startup_ids.push(startupId);
        if (!existing.observed_names.includes(founder.name)) existing.observed_names.push(founder.name);
      } else {
        founderIds.set(founderId, { id: founderId, name: founder.name, observed_names: [founder.name], startup_ids: [startupId] });
      }
    }

    for (const round of record.funding_rounds || []) {
      // make-graph.py checks the entire funding event namespace, not one firm.
      if (roundIds.has(round.id)) {
        fail('FUNDING_ID_COLLISION', `${round.id} is used by ${roundIds.get(round.id)} and ${startupId}; funding IDs must be globally unique.`);
      }
      roundIds.set(round.id, startupId);
      if (Object.hasOwn(round, 'amount')) {
        exactAmountRounds += 1;
        if (round.amount === 0) zeroAmountRounds.push(round.id);
      } else if (Object.hasOwn(round, 'amount_text')) textOnlyAmountRounds += 1;
      else unquantifiedRounds += 1;
      if (!Object.hasOwn(round, 'announced_on')) undatedRounds += 1;
    }
  }
  return {
    reviewed: document.reviewed,
    records_checked: document.startups.length,
    records_valid: document.startups.length,
    null_production_values: 0,
    startup_ids: [...startupIds.keys()].sort(),
    funding_round_ids: [...roundIds.keys()].sort(),
    founders: {
      occurrences: founderOccurrences,
      unique_graph_ids: founderIds.size,
      shared_ids_requiring_identity_evidence: [...founderIds.values()].filter(founder => founder.startup_ids.length > 1),
    },
    funding: {
      events: roundIds.size,
      exact_amount_and_currency: exactAmountRounds,
      text_only_amount: textOnlyAmountRounds,
      unquantified: unquantifiedRounds,
      announced_on_absent: undatedRounds,
      numeric_zero_amount_ids: zeroAmountRounds,
    },
    profile_facts: profileFacts,
    absent_founded_year_startup_ids: missingYears,
  };
}

function selfTests() {
  const date = '2020-01-15';
  const source = 'https://example.org/source';
  const base = (name = 'Fixture Atlas') => ({ name, description: 'Validation fixture.', website: 'https://example.org', source, reviewed_at: date });
  const event = () => ({ id: 'fixture-series-a-2020', stage: 'Series A', source, announced_on: date, amount: 1000000, currency: 'USD' });
  const packet = (...startups) => ({ reviewed: date, startups });
  const results = [];
  const pass = (name, operation) => { operation(); results.push({ name, result: 'passed' }); };
  const reject = (name, operation, expectedCode, expectedMessage) => {
    let rejected;
    try { operation(); } catch (error) { rejected = error; }
    assert.ok(rejected, `${name}: invalid fixture was accepted`);
    assert.equal(rejected.code, expectedCode, `${name}: unexpected error type`);
    if (expectedMessage) assert.match(rejected.message, expectedMessage);
    results.push({ name, result: 'passed', expected_rejection: expectedCode });
  };
  pass('production_validator_returns_unmodified_input', () => {
    const record = { ...base(), funding_rounds: [event()] };
    const before = JSON.stringify(record);
    assert.equal(validateStartupRecord(record), record);
    assert.equal(JSON.stringify(record), before);
  });
  pass('unknown_year_and_amount_remain_absent', () => {
    const result = validatePacket(packet({ ...base(), funding_rounds: [{ id: 'fixture-text-only', stage: 'Funding round (stage not stated)', amount_text: '$80 million; currency unresolved', source }] }));
    assert.equal(result.funding.exact_amount_and_currency, 0);
    assert.equal(result.funding.text_only_amount, 1);
    assert.equal(result.absent_founded_year_startup_ids.length, 1);
  });
  reject('amount_requires_currency', () => {
    const round = event(); delete round.currency;
    validateStartupRecord({ ...base(), funding_rounds: [round] });
  }, 'VALIDATION_ERROR', /amount and currency together/);
  reject('currency_requires_exact_amount_even_with_amount_text', () => {
    const round = event(); delete round.amount; round.amount_text = 'USD 1 million';
    validateStartupRecord({ ...base(), funding_rounds: [round] });
  }, 'VALIDATION_ERROR', /amount and currency together/);
  reject('unknown_top_level_key', () => validateStartupRecord({ ...base(), headquarters: 'Oslo' }), 'VALIDATION_ERROR', /not supported/);
  reject('unsupported_funding_participants', () => validateStartupRecord({ ...base(), funding_rounds: [{ ...event(), participants: [] }] }), 'VALIDATION_ERROR', /not supported/);
  reject('null_optional_production_field', () => validateStartupRecord({ ...base(), description: null }), 'VALIDATION_ERROR', /trimmed text/);
  reject('null_numeric_production_field', () => validateStartupRecord({ ...base(), funding_rounds: [{ ...event(), amount: null }] }), 'VALIDATION_ERROR', /safe integer/);
  reject('recursive_null_packet_gate', () => validatePacket(packet({ ...base(), founders: [null] })), 'NULL_PRODUCTION_VALUE');
  reject('partial_date_cannot_be_announced_on', () => validateStartupRecord({ ...base(), funding_rounds: [{ ...event(), announced_on: '2020-01' }] }), 'VALIDATION_ERROR', /YYYY-MM-DD/);
  reject('impossible_calendar_date', () => validateStartupRecord({ ...base(), funding_rounds: [{ ...event(), announced_on: '2020-02-30' }] }), 'VALIDATION_ERROR', /real calendar date/);
  reject('production_founder_duplicate_uses_nfkc', () => validateStartupRecord({ ...base(), founders: [{ name: 'Åse Example', source }, { name: 'A\u030ase Example', source }] }), 'VALIDATION_ERROR', /duplicates/);
  pass('canonical_unicode_names_share_actual_production_slug', () => assert.equal(startupSlug('Åster'), startupSlug('A\u030aster')));
  reject('canonical_unicode_startup_slug_collision', () => validatePacket(packet(base('Åster'), base('A\u030aster'))), 'STARTUP_ID_COLLISION');
  reject('cross_startup_funding_id_collision', () => validatePacket(packet({ ...base('Fixture One'), funding_rounds: [event()] }, { ...base('Fixture Two'), funding_rounds: [event()] })), 'FUNDING_ID_COLLISION');
  reject('founder_decomposed_unicode_requires_review', () => validatePacket(packet({ ...base(), founders: [{ name: 'A\u030ase Example', source }] })), 'FOUNDER_UNICODE_NORMALIZATION');
  reject('distinct_founders_with_same_ascii_slug', () => validatePacket(packet({ ...base(), founders: [{ name: 'Renée Example', source }, { name: 'Renee Example', source }] })), 'FOUNDER_ID_COLLISION');
  reject('founder_empty_ascii_graph_slug', () => validatePacket(packet({ ...base(), founders: [{ name: '創業者', source }] })), 'FOUNDER_EMPTY_ID');
  pass('shared_founder_name_is_reported_not_identity_proof', () => {
    const result = validatePacket(packet({ ...base('Fixture One'), founders: [{ name: 'Ada Example', source }] }, { ...base('Fixture Two'), founders: [{ name: 'ADA EXAMPLE', source }] }));
    assert.equal(result.founders.shared_ids_requiring_identity_evidence.length, 1);
  });
  return { passed: results.length, failed: 0, cases: results };
}

const scope = {
  validates: ['actual production validateStartupRecord', 'no null values in production records', 'matching batch and record review dates', 'new startup website and description present', 'unique startup IDs and globally unique funding IDs within this packet', 'NFC founder names, nonempty founder IDs, and conservative founder slug collision checks'],
  not_evaluated: ['claim truth, source rights, field-level provenance and projection bindings', 'deduplication against the repository baseline or concurrent country packets', 'resumable research coverage', 'graph build, SQLite generation or publication', 'identity proof for repeated founder names', 'whether a funding event is equity, debt, a grant or a mixed transaction'],
  schema_quirks: ['Unknown optional values must be omitted; null is invalid.', 'amount/currency and valuation/valuation_currency are pairs; amount_text is independent.', 'Numeric amounts are nonnegative safe integers, with no decimal precision or approximate numeric type.', 'Currency validation checks three uppercase letters, not membership in an ISO currency registry.', 'announced_on requires a real, nonfuture YYYY-MM-DD date; partial dates and close dates need the staging sidecar.', 'Funding has no typed participants or transaction type; top-level fields have no dedicated headquarters, incorporation or aliases fields.', 'Startup and founder IDs use NFKD with non-ASCII characters removed, so some Norwegian letters are removed rather than transliterated.', 'The production founder duplicate check uses NFKC and whitespace normalization; graph collision comparison uses Python casefold without canonical normalization.', 'Production validation itself makes website and description optional; this new-startup packet additionally requires both.'],
};

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node validate_projection.mjs [--input PATH] [--out PATH]\n       node validate_projection.mjs --self-test-only [--out PATH]\n\nDefaults to adjacent startups.staged.json. Outputs a JSON receipt to stdout.\n--out additionally writes the receipt to an existing directory. No network or production writes.\nA missing input fails; --self-test-only explicitly skips record validation.\n');
    return;
  }
  const receipt = { validator: 'norway-batch-001-production-projection', status: 'passed', mode: options.selfTestOnly ? 'self-test-only' : 'staged-records', checked_at: new Date().toISOString(), scope };
  try {
    const [validatorBytes, graphBytes] = await Promise.all([readFile(VALIDATOR_PATH), readFile(GRAPH_BUILDER_PATH)]);
    receipt.implementation = {
      production_validator: { path: 'backend/hosted/src/startup-record.mjs', sha256: sha256(validatorBytes) },
      graph_builder_inspected: { path: 'scripts/make-graph.py', sha256: sha256(graphBytes) },
    };
    const graphSource = graphBytes.toString('utf8');
    const zeroDefault = /founded_year=startup\.get\('founded_year',\s*0\)/.test(graphSource);
    const conditionalYear = /\*\*\(\{'founded_year':startup\['founded_year'\]\} if 'founded_year' in startup else \{\}\)/.test(graphSource);
    receipt.graph_builder_observation = {
      method: 'static source inspection; graph execution is a separate gate',
      source: 'scripts/make-graph.py:build_graph',
      unknown_founded_year_status: zeroDefault ? 'zero_default_detected' : conditionalYear ? 'omission_preserving_pattern_detected' : 'unrecognized_requires_dry_run',
      zero_default_detected: zeroDefault,
      omission_preserving_pattern_detected: conditionalYear,
      omitted_founded_year_startup_ids: [],
      staged_records_evaluated: false,
      historical_context: 'Initial base f4bcbf7030d741772bb750deee584efa3ee17749 supplied zero for omitted years. Owner PR #179 changed the builder to conditionally include known years; current source is inspected on every run.',
      runtime_validation: 'Not run by this script. The packet owner performs an isolated graph dry run against current main before promotion.',
    };
    receipt.downstream_limitations = zeroDefault ? [{
      code: 'GRAPH_UNKNOWN_FOUNDED_YEAR_DEFAULT_ZERO',
      detail: 'The inspected builder still defaults omitted founded_year to zero. Valid projection omissions do not establish end-to-end unknown-value preservation.',
      follow_up: 'Refer to existing owner #177; this script does not change the graph builder.',
    }] : conditionalYear ? [] : [{
      code: 'GRAPH_UNKNOWN_YEAR_IMPLEMENTATION_UNRECOGNIZED',
      detail: 'Neither the known zero-default expression nor the known omission-preserving expression was found. Inspect and dry-run the current builder before claiming downstream preservation.',
    }];
    receipt.self_tests = selfTests();
    if (options.selfTestOnly) receipt.records_validation = { status: 'not_run', reason: 'Explicit --self-test-only; no staged records were read.' };
    else {
      const bytes = await readFile(options.input);
      receipt.input = { path: options.input, sha256: sha256(bytes) };
      const document = JSON.parse(bytes.toString('utf8'));
      if (document?.reviewed !== EXPECTED_REVIEWED) fail('PACKET_REVIEW_DATE', `This packet requires reviewed=${EXPECTED_REVIEWED}.`);
      receipt.records_validation = { status: 'passed', ...validatePacket(document) };
      receipt.graph_builder_observation.omitted_founded_year_startup_ids = receipt.records_validation.absent_founded_year_startup_ids;
      receipt.graph_builder_observation.staged_records_evaluated = true;
    }
    if (receipt.records_validation.founders?.shared_ids_requiring_identity_evidence.length) {
      receipt.warnings = ['Repeated founder names map to shared person IDs; source-backed identity reconciliation remains a separate gate.'];
    }
    if (receipt.records_validation.funding?.numeric_zero_amount_ids.length) {
      (receipt.warnings ||= []).push('Zero funding amounts are schema-valid; the provenance gate must establish that any zero is an observed value and not an unknown placeholder.');
    }
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = { code: error.code || error.name || 'VALIDATION_FAILED', message: error.message };
    process.exitCode = 1;
  }
  if (options.out) {
    try {
      const existingOutput = await realpath(options.out).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
      const protectedPaths = await Promise.all([options.input, SCRIPT_PATH, VALIDATOR_PATH, GRAPH_BUILDER_PATH].map(path => realpath(path).catch(error => { if (error.code === 'ENOENT') return path; throw error; })));
      if (existingOutput && protectedPaths.includes(existingOutput)) fail('CLI_ARGUMENT', '--out resolves to the input or validation implementation.');
      await writeFile(options.out, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    } catch (error) {
      receipt.status = 'failed';
      receipt.output_error = { code: error.code || error.name, message: error.message };
      process.exitCode = 1;
    }
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

await main().catch(error => {
  process.stdout.write(`${JSON.stringify({ status: 'failed', error: { code: error.code || error.name, message: error.message } }, null, 2)}\n`);
  process.exitCode = 1;
});
