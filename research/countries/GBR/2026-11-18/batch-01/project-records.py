#!/usr/bin/env python3
"""Offline projection of this reviewed evidence packet onto the EXISTING Atlas schema.

Writes this directory only. Does not merge, approve seeds, fetch URLs or publish.
Unrepresentable or ambiguous semantics remain in claims.json and funding-events.json.
"""
import copy
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
DAY = '2026-11-18'

def read(name):
    return json.loads((HERE / name).read_text())

def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def clean(value):
    return re.sub(r'\s+', ' ', str(value)).strip()

def full_day(value):
    return isinstance(value, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value))

def main():
    companies = read('companies.json')['companies']
    claims = read('claims.json')['claims']
    by_id = {f['claim_id']: f for f in claims}
    prior = {r['name']: r for r in json.loads((REPO / 'data/startup-research.json').read_text())['startups']}
    outputs = {'new': [], 'existing': [], 'context': []}
    projection = []
    complex_kinds = {'grant_package', 'mixed_primary_secondary', 'mixed_new_equity_and_loan_note_conversion', 'mixed_equity_debt_financing'}
    profile_fields = {'headquarters', 'operating_base', 'operating_geography', 'office_geography', 'facility_geography', 'alias', 'aliases', 'domain_alias', 'brand_change', 'legal_name_history', 'incorporation', 'incorporation_date', 'legal_identity', 'incorporation_jurisdiction', 'legal_status', 'legal_entity_status', 'lifecycle', 'ownership_status', 'acquisition', 'ownership_relationship', 'headquarters_scope', 'legal_group_scope', 'university_spinout', 'founding_date', 'establishment_date_observation', 'transaction', 'funding_event_observation', 'funding_amount_observation', 'funding_components', 'planned_round_allocation', 'acquisition_option'}
    for company in companies:
        rows = [by_id[cid] for cid in company['claim_ids']]
        reviewed = [f for f in rows if f['status'] == 'reviewed_staged']
        desc = next(f for f in reviewed if f['field'] == 'description')
        ident = next(f for f in reviewed if f['field'] in ('identity', 'canonical_name'))
        website_claim = next((f for f in reviewed if f['field'] == 'website'), ident)
        group = 'existing' if company['disposition'] == 'existing_enrichment' else 'context' if company['disposition'] == 'context_hold' else 'new'
        base = prior.get(company['canonical_name']) if group == 'existing' else None
        # Existing root source and all existing funding/founder fields remain untouched.
        record = {'name': company['canonical_name'], 'source': base['source'] if base else desc['source_url'], 'reviewed_at': base['reviewed_at'] if base else DAY}
        maps = [{'record_path': 'name', 'claim_ids': [ident['claim_id']]}]
        if group != 'existing':
            value = desc['value']
            record.update(description=clean(value['text'] if isinstance(value, dict) else value), website='https://' + company['canonical_domain'] + '/')
            maps += [{'record_path': 'description', 'claim_ids': [desc['claim_id']]}, {'record_path': 'website', 'claim_ids': [website_claim['claim_id']]}]
            years = [f for f in reviewed if f['field'] == 'founding_date']
            founding_conflict = any(f['field'] in ('founding_date', 'founded_alternative', 'establishment_date_observation') and f['status'] == 'conflict' for f in rows) or any(f['field'] == 'establishment_date_observation' for f in rows)
            if len(years) == 1 and not founding_conflict:
                v = years[0]['value']; value = v.get('date', v.get('value')) if isinstance(v, dict) else v
                if value and re.match(r'^\d{4}(?:-|$)', str(value)):
                    record['founded_year'] = int(str(value)[:4]); maps.append({'record_path': 'founded_year', 'claim_ids': [years[0]['claim_id']]})
            founders = []; seen = set()
            for f in reviewed:
                if f['field'] != 'founder': continue
                name = clean(f['value']['name'])
                if name.casefold() in seen: continue
                seen.add(name.casefold()); founders.append({'name': name, 'source': f['source_url']})
                maps.append({'record_path': 'founders.' + name, 'claim_ids': [f['claim_id']]})
            if founders: record['founders'] = founders
            rounds = []
            for f in reviewed:
                if f['field'] != 'funding_round': continue
                v = f['value']; kind = v.get('transaction_kind')
                # No supported typed field can express these mixed or non-equity scopes safely.
                if kind in complex_kinds: continue
                stage = v.get('stage') or ('Preferred investment' if kind == 'preferred_equity_investment' else 'Funding (stage unspecified)')
                if kind == 'equity_round_additional_close': stage += ' additional close'
                r = {'id': v['event_id'], 'stage': stage, 'source': f['source_url']}
                if full_day(v.get('announced_on')) and not v.get('date_conflict'): r['announced_on'] = v['announced_on']
                amount = v.get('amount'); precision = v.get('amount_precision')
                if isinstance(amount, int) and amount > 0 and v.get('currency') in ('GBP', 'USD', 'EUR') and precision in ('exact', 'reported_exact', 'as_reported') and not v.get('amount_conflict'):
                    r.update(amount=amount, currency=v['currency'])
                text = clean(v.get('amount_text', 'Amount not disclosed'))
                if v.get('currency') is None and ('$' in text): text += '; currency code unresolved'
                if len(text) <= 200: r['amount_text'] = text
                notes = [v.get('note'), v.get('scope'), v.get('amount_scope'), v.get('currency_resolution')]
                if v.get('stage') is None: notes.append('Series/stage not disclosed.')
                if v.get('close_status'): notes.append('Close status: ' + v['close_status'] + '.')
                if v.get('completion_state_at_announcement'): notes.append('Status at announcement: ' + v['completion_state_at_announcement'] + '.')
                if v.get('closed_on') is None: notes.append('Announcement date is not an asserted legal closing date.')
                if v.get('parent_event_id'): notes.append('Related original event: ' + v['parent_event_id'] + '; do not repeat cumulative proceeds.')
                if v.get('amount_conflict'): notes.append('Later source amount conflicts; numeric amount withheld in this projection. Original and later observations remain in the ledger.')
                if v.get('date_conflict'): notes.append('Announcement year ' + v.get('announced_on', '') + '; exact dates conflict: ' + ', '.join(v.get('announcement_date_candidates', [])) + '.')
                if v.get('close_scope'): notes.append('Scope: ' + v['close_scope'] + '.')
                if v.get('headline_total_includes_planned_allocation'): notes.append('Headline total includes an allocated future close; only the completed first close is represented.')
                if v.get('conditions'): notes.append('Conditions: ' + ', '.join(v['conditions']) + '.')
                if isinstance(v.get('valuation'), int) and v.get('valuation_currency') in ('GBP', 'USD', 'EUR'):
                    r['valuation'] = v['valuation']; r['valuation_currency'] = v['valuation_currency']
                notes.append('Participant identities and full scope remain in the evidence ledger; no investor edges inferred.')
                r['note'] = clean(' '.join(x for x in notes if x))
                assert len(r['note']) <= 2000
                rounds.append(r); maps.append({'record_path': 'funding_rounds.' + r['id'], 'claim_ids': [f['claim_id']]})
            if rounds: record['funding_rounds'] = rounds
        profile = []
        for f in rows:
            if f['status'] not in ('reviewed_staged', 'conflict'): continue
            is_complex_event = f['field'] == 'funding_round' and f['value'].get('transaction_kind') in complex_kinds
            if f['field'] not in profile_fields and not is_complex_event: continue
            value = json.dumps(f['value'], ensure_ascii=False, separators=(',', ':'))
            if len(value) > 870:
                # No truncated money or precision: retain this claim only in the complete ledger.
                continue
            prefix = 'Unresolved conflicting observation: ' if f['status'] == 'conflict' else ''
            text = prefix + value
            key = 'uk-b01-' + hashlib.sha256(f['claim_id'].encode()).hexdigest()[:16]
            profile.append({'key': key, 'label': clean(f['field'].replace('_', ' ').capitalize() + ' — source scoped'), 'value': text, 'source': f['source_url'], 'reviewed_at': DAY})
            maps.append({'record_path': 'profile_facts.' + key, 'claim_ids': [f['claim_id']]})
        if profile: record['profile_facts'] = profile
        outputs[group].append(record)
        projection.append({'entity_id': company['entity_id'], 'canonical_name': company['canonical_name'], 'projection_group': group, 'claim_map': maps, 'existing_record_sha256': hashlib.sha256(json.dumps(base, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest() if base else None, 'existing_source_and_rounds_preserved': bool(base), 'new_founder_ids_require_global_review': group != 'existing'})
    write('records.json', {'reviewed': DAY, 'startups': outputs['new']})
    write('existing-record-enrichment.json', {'reviewed': DAY, 'startups': outputs['existing']})
    write('historical-context.json', {'reviewed': DAY, 'startups': outputs['context'], 'not_for_independent_startup_import': True})
    write('projection-map.json', {'projections': projection, 'policy': 'Strict existing schema only. Profile facts retain source-scoped claims; full typed provenance lives in sidecars. Existing funding and founders are never replaced by this projection.'})
    print(json.dumps({'new': len(outputs['new']), 'existing': len(outputs['existing']), 'context': len(outputs['context'])}))

if __name__ == '__main__': main()
