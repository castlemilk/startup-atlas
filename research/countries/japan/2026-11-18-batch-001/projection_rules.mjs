// Country-local rendering of sourced claims into the existing Atlas record shape.
// These helpers do not change or extend any production schema.
import assert from 'node:assert/strict';

export const factLabels = {
  identity:'Company identity', alias:'Name alias', legal_name:'Legal name as reported',
  native_name:'Native company name', headquarters:'Headquarters as reported',
  operating_location:'Corporate operating location', registered_office:'Registered office as reported',
  founded:'Establishment / origin date', business_origin:'Business origin', group_origin:'Group origin',
  sectors:'Research sector classification', current_listing:'Listing observation',
  exclusion:'Listed or acquired ecosystem alumni', company_status:'Company status observation',
  related_entity:'Related legal entity', reported_registration:'Company-reported registration',
};

export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['source_ids','source_id','ref_id'].includes(key)).map(([k,v]) => [k,clean(v)]));
  return value;
}

export function factValue(claim) {
  const v = clean(claim.value);
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.every(x => typeof x === 'string')) return v.join('; ');
  if (claim.field === 'founded') return `${v.date ?? 'Unknown'} (${v.precision}; ${v.kind ?? v.date_kind ?? 'source-reported date'}).`;
  return JSON.stringify(v);
}

export function stageValue(event) {
  return event.stage || (/debt|loan|credit/.test(event.transaction_kind)
    ? 'Debt financing (venture stage not stated)' : 'Financing (stage not disclosed)');
}

export function amountText(event) {
  const amount = event.amount === null ? 'Amount undisclosed'
    : `${event.currency} ${event.amount.toLocaleString('en-US')}`;
  return `${amount}; ${event.amount_precision}; ${event.transaction_kind}; ${event.amount_scope}`;
}

export function roundNote(event) {
  const parts = [
    `Instrument: ${event.transaction_kind}. Amount scope: ${event.amount_scope}. Precision: ${event.amount_precision}.`,
    `Date ${event.date ?? 'unknown'} is ${event.original_date_kind ?? event.date_kind}; no independently verified cash-closing date is implied.`,
    `Overlap classification: ${event.overlap_status}.`,
  ];
  if (event.transaction_state) parts.push(`Source transaction state: ${event.transaction_state}.`);
  if (!event.stage) parts.push('The displayed stage is an explanatory placeholder; no venture-series designation was stated.');
  for (const note of event.notes || []) if (note) parts.push(note);
  if (event.company_reported_funding_period) parts.push(`Company-reported funding period: ${JSON.stringify(event.company_reported_funding_period)}.`);
  if (event.round_total) parts.push(`Non-additive full-round context: ${JSON.stringify(event.round_total)}.`);
  if (event.cumulative_total) parts.push(`Non-additive cumulative context: ${JSON.stringify(event.cumulative_total)}.`);
  if (event.secondary_amount) parts.push(`Separately reported secondary amount: ${event.secondary_amount} ${event.secondary_currency ?? event.currency}; excluded from primary amount.`);
  return parts.join(' ');
}

export function readPath(value, path) {
  for (const key of path) {
    assert(value !== null && value !== undefined && Object.hasOwn(value,key), `missing claim path ${path.join('.')}`);
    value = value[key];
  }
  return value;
}

export function derive(binding, company, packet) {
  const claim = company.claims.find(c => c.id === binding.claim_id);
  assert(claim, `binding claim absent ${binding.claim_id}`);
  assert.equal(claim.status,'reviewed_staged');
  const source = packet.sources.find(s => s.id === binding.source_id);
  switch(binding.operation) {
    case 'claim_value': return readPath(claim.value,binding.path || []);
    case 'source_url':
      assert(claim.source_ids.includes(binding.source_id));
      assert.equal(source?.accessed,true);
      return source.url;
    case 'review_date': return packet.reviewed_at.slice(0,10);
    case 'founded_year':
      assert.equal(claim.field,'founded');
      assert(claim.value.date && !['business_commencement','holding_company_establishment'].includes(claim.value.kind));
      assert(!company.conflicts.some(x => ['founding','founding_date','legal_identity_and_founding'].includes(x.field)));
      return Number(claim.value.date.slice(0,4));
    case 'fact_label': assert(factLabels[claim.field]); return factLabels[claim.field];
    case 'fact_key': return `${claim.field.replaceAll('_','-')}-${claim.id.split(':').at(-1)}`;
    case 'fact_value': assert(factLabels[claim.field]); return factValue(claim);
    case 'round_stage': assert.equal(claim.field,'funding_round'); return stageValue(claim.value);
    case 'round_amount_text': assert.equal(claim.field,'funding_round'); return amountText(claim.value);
    case 'round_note': assert.equal(claim.field,'funding_round'); return roundNote(claim.value);
    default: throw new Error(`unsupported derivation ${binding.operation}`);
  }
}

export function leaves(value, prefix='') {
  if (value && typeof value==='object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return [prefix];
    return entries.flatMap(([key,v]) => leaves(v,`${prefix}/${key.replaceAll('~','~0').replaceAll('/','~1')}`));
  }
  return [prefix];
}

export function atPointer(value, pointer) {
  return pointer.slice(1).split('/').reduce((v,k) => v[k.replaceAll('~1','/').replaceAll('~0','~')],value);
}
