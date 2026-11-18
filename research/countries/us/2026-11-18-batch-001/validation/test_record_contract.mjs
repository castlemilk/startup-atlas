import assert from 'node:assert/strict';
import test from 'node:test';
import {validateStartupRecord} from '../../../../../backend/hosted/src/startup-record.mjs';

const base = () => ({name:'Synthetic research fixture',source:'https://example.com/evidence',reviewed_at:'2020-01-01'});
const round = () => ({id:'fixture-series-a',stage:'Series A',source:'https://example.com/funding'});

test('unknown optional facts are omitted; a minimal sourced record is valid', () => {
  assert.equal(validateStartupRecord(base()).name, 'Synthetic research fixture');
});
test('null is not accepted in an optional structured founding-year field', () => {
  assert.throws(() => validateStartupRecord({...base(),founded_year:null}), /founded_year/);
});
test('null founder collections do not silently become an empty known list', () => {
  assert.throws(() => validateStartupRecord({...base(),founders:null}), /founders/);
});
test('unsupported enrichment fields cannot silently expand the production schema', () => {
  assert.throws(() => validateStartupRecord({...base(),aliases:['Fixture alias']}), /not supported/);
});
test('numeric funding requires an explicit currency pair', () => {
  assert.throws(() => validateStartupRecord({...base(),funding_rounds:[{...round(),amount:100}]}), /amount and currency/);
});
test('valuation independently requires its explicit currency pair', () => {
  assert.throws(() => validateStartupRecord({...base(),funding_rounds:[{...round(),valuation:100}]}), /valuation and valuation_currency/);
});
test('uncertain funding text remains valid without invented numeric values', () => {
  const record = {...base(),funding_rounds:[{...round(),amount_text:'Over $100 million; currency unspecified'}]};
  validateStartupRecord(record);
  assert.equal(Object.hasOwn(record.funding_rounds[0], 'amount'), false);
});
test('a round ID is counted once within a company projection', () => {
  assert.throws(() => validateStartupRecord({...base(),funding_rounds:[round(),round()]}), /duplicates/);
});
test('participants remain in the ledger while the production round schema lacks that field', () => {
  assert.throws(() => validateStartupRecord({...base(),funding_rounds:[{...round(),participants:['Example investor']}]}), /not supported/);
});
