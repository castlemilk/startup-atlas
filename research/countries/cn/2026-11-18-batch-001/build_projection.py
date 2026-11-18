#!/usr/bin/env python3
"""Rebuild this bounded staging projection from preserved research-lane inputs.

Uses the existing runtime schema; does not alter production records or source
claims. Every mapped claim ID retains its original local input-array index.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import subprocess
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
LANES = ('ai', 'robotics', 'deeptech')
REVIEW_DATE = '2026-11-18'
DAY = re.compile(r'^\d{4}-\d{2}-\d{2}$')
EXACT = {'exact', 'reported_exact'}
COUNTRIES = {'CN': 'China', 'KY': 'Cayman Islands', 'US': 'United States'}


def slug(value):
    ascii_text = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', ascii_text.lower()).strip('-')


def claim_id(company, index):
    return f"cn:{company['id']}:{index:03d}"


def date_only(value):
    return value[:10] if isinstance(value, str) and DAY.fullmatch(value[:10]) else REVIEW_DATE


def location_text(value):
    parts = []
    for key in ('city', 'district', 'region'):
        part = value.get(key)
        if part and part not in parts:
            parts.append(part)
    country = COUNTRIES.get(value.get('country_code'), value.get('country'))
    if country and country not in parts:
        parts.append(country)
    result = ', '.join(parts)
    kind = value.get('kind')
    if kind:
        result += ' (' + kind.replace('_', ' ') + ')'
    if value.get('as_of'):
        result += ' [as of ' + value['as_of'] + ']'
    return result


def profile_fact_value(field, value):
    labels = {
        'headquarters': ('headquarters', 'Headquarters'),
        'headquarters_district': ('headquarters-district', 'Reported headquarters district'),
        'contact_office': ('contact-office', 'Contact office'),
        'principal_office': ('principal-office', 'Principal office'),
        'registered_location': ('registered-location', 'Registered address location'),
        'registered_geography': ('registered-location', 'Registered address location'),
        'entity_administrative_geography': ('administrative-jurisdiction', 'Entity administrative jurisdiction'),
        'operating_location': ('operating-location', 'Reported operating location'),
        'office': ('office', 'Office'),
    }
    if field in labels:
        key, label = labels[field]
        text = value if isinstance(value, str) else location_text(value)
        return key, label, text
    if field == 'operating_locations':
        return 'operating-locations', 'Reported locations and purposes', '; '.join(location_text(v) for v in value)
    if field == 'research_centres':
        return 'research-centres', 'Reported research centres', '; '.join(value)
    if field == 'country_association':
        return 'country-association', 'Country association', COUNTRIES.get(value.get('country_code'), value['country']) + '; headquarters not established by this claim'
    if field == 'incorporation_geography' and value.get('basis') == 'registered address':
        text = COUNTRIES.get(value['country_code'], value['country_code']) + ' (registered-address statement)'
        if value.get('as_of'):
            text += '; as of ' + value['as_of']
        return 'registered-jurisdiction', 'Registered-address jurisdiction', text
    if field == 'incorporation':
        entity = value.get('legal_entity') or value.get('entity_name')
        text = entity + ': ' + value['jurisdiction']
        if value.get('established_on'):
            text += '; established ' + value['established_on'] + ' (' + value['date_precision'] + ' precision)'
        if value.get('as_of'):
            text += '; reported as of ' + value['as_of']
        return 'legal-entity-incorporation', 'Reported legal-entity incorporation', text
    if field == 'incorporation_date':
        return 'entity-establishment', 'Legal entity establishment date', value['date'] + ' (' + value['legal_entity'] + ')'
    if field in ('aliases', 'alias'):
        return 'reported-names', 'Reported names', '; '.join(value) if isinstance(value, list) else value
    if field == 'sectors':
        return 'research-sectors', 'Sectors (research classification)', '; '.join(value)
    if field == 'legal_names_observed':
        return 'legal-name-variants', 'Conflicting legal-name source variants', 'Unresolved source variants: ' + '; '.join(value)
    if field in ('legal_name', 'legal_name_english', 'legal_names_observed', 'legal_name_observed'):
        if isinstance(value, dict):
            text = value['name']
            if value.get('as_of'):
                text += ' (as of ' + value['as_of'] + ')'
        else:
            text = '; '.join(value) if isinstance(value, list) else value
        return 'reported-legal-name', 'Reported legal name', text
    return None


def event_id(value):
    return value.get('event_id') or value.get('id') or value.get('round_id')


def prefixed_event_id(company, original):
    prefix = slug(company['name']) + '-'
    if original.startswith(prefix):
        return original
    # The LimX lane used the short brand in event IDs. Preserve that original
    # source event ID in every mapping rather than changing the source claim.
    if company['id'] == 'startup:limx-dynamics' and original.startswith('limx-'):
        return prefix + original[len('limx-'):]
    return prefix + original


def build(inputs_dir):
    fields, startups, inputs, omissions = [], [], [], []

    def mapping(company, path, refs, precision=None, original_event_id=None):
        ids = list(dict.fromkeys(claim_id(company, i) for i, _ in refs))
        assert ids, (company['id'], path)
        entry = {'entity_id': company['id'], 'path': path, 'claim_ids': ids}
        if precision:
            entry['precision'] = precision
        if original_event_id:
            entry['event_id'] = original_event_id
        fields.append(entry)

    for lane in LANES:
        raw = (inputs_dir / (lane + '.json')).read_bytes()
        data = json.loads(raw)
        inputs.append({'path': 'inputs/' + lane + '.json', 'sha256': hashlib.sha256(raw).hexdigest()})
        for company in data['companies']:
            if company['candidate_status'] != 'accepted':
                continue
            indexed = list(enumerate(company['claims'], 1))
            byfield = {}
            for pair in indexed:
                byfield.setdefault(pair[1]['field'], []).append(pair)
            ident = byfield.get('identity', [])
            name_ref = byfield.get('name', ident)
            website_ref = byfield.get('website', ident)
            desc_ref = byfield['description']
            assert name_ref and website_ref
            source_claim = name_ref[0][1]
            record = {
                'name': company['name'],
                'description': desc_ref[0][1]['value'],
                'website': company['website'],
                'source': source_claim['source_url'],
                'reviewed_at': REVIEW_DATE,
            }
            mapping(company, '/name', [name_ref[0]])
            mapping(company, '/description', [desc_ref[0]])
            mapping(company, '/website', [website_ref[0]])

            founded_refs = [p for p in indexed if p[1]['field'] in ('founding_date', 'founded', 'founded_on')]
            years = set()
            for _, q in founded_refs:
                value = q['value']
                year = value.get('year')
                if year is None:
                    year = int(value['value'][:4])
                years.add(year)
            if founded_refs:
                assert len(years) == 1, ('conflicting founding years', company['id'])
                record['founded_year'] = years.pop()
                mapping(company, '/founded_year', founded_refs, 'year')

            founders, seen_founders = [], set()
            for pair in indexed:
                _, q = pair
                if q['field'] == 'founders_original_script':
                    omissions.append({'entity_id': company['id'], 'claim_id': claim_id(company, pair[0]), 'reason': 'Original-script founder spelling stays in sidecar; no verified ASCII name in this claim.'})
                if q['field'] not in ('founder', 'founders'):
                    continue
                entries = q['value'] if isinstance(q['value'], list) else [q['value']]
                for founder in entries:
                    name = founder.get('name_english') or founder.get('english_name') or founder.get('name')
                    if not name or not slug(name):
                        omissions.append({'entity_id': company['id'], 'claim_id': claim_id(company, pair[0]), 'reason': 'Chinese-only founder spelling retained in sidecar; no invented ASCII transliteration.'})
                        continue
                    key = name.casefold()
                    if key in seen_founders:
                        continue
                    seen_founders.add(key)
                    f = {'name': name, 'source': q['source_url']}
                    if founder.get('profile_url'):
                        f['profile_url'] = founder['profile_url']
                    idx = len(founders)
                    founders.append(f)
                    mapping(company, f'/founders/{idx}', [pair])
                    mapping(company, f'/founders/{idx}/name', [pair])
                    if 'profile_url' in f:
                        mapping(company, f'/founders/{idx}/profile_url', [pair])
            if founders:
                record['founders'] = founders

            facts, used_keys = [], set()
            for pair in indexed:
                _, q = pair
                item = profile_fact_value(q['field'], q['value'])
                if not item:
                    continue
                key, label, value = item
                if not value:
                    continue
                effective_on = q.get('effective_on')
                already_scoped = isinstance(q['value'], dict) and q['value'].get('as_of')
                if effective_on and not already_scoped and q['field'] in (
                    'headquarters', 'contact_office', 'principal_office',
                    'registered_location', 'registered_geography',
                    'entity_administrative_geography', 'operating_location',
                    'legal_name', 'legal_name_english',
                ):
                    value += '; source as of ' + effective_on
                root_key, number = key, 2
                while key in used_keys:
                    key = root_key + '-' + str(number)
                    number += 1
                used_keys.add(key)
                f = {'key': key, 'label': label, 'value': value, 'source': q['source_url'], 'reviewed_at': date_only(q.get('reviewed_at'))}
                idx = len(facts)
                facts.append(f)
                mapping(company, f'/profile_facts/{idx}', [pair])
                mapping(company, f'/profile_facts/{idx}/value', [pair])
            if facts:
                record['profile_facts'] = facts

            rounds = []
            if lane == 'ai':
                for candidate in company.get('legacy_record', {}).get('funding_rounds', []):
                    original = candidate['id']
                    refs = [p for p in indexed if isinstance(p[1]['value'], dict) and p[1]['value'].get('event_id') == original]
                    assert refs
                    r = copy.deepcopy(candidate)
                    r['id'] = prefixed_event_id(company, original)
                    amount_refs = [p for p in refs if p[1]['field'] == 'funding_round.amount']
                    date_refs = [p for p in refs if p[1]['field'] == 'funding_round.announced_on']
                    if not amount_refs:
                        r.pop('amount_text', None)
                    if not date_refs:
                        r.pop('announced_on', None)
                    if 'amount' in r:
                        assert amount_refs and amount_refs[0][1]['value']['qualifier'] in EXACT
                        assert amount_refs[0][1]['value']['amount'] == r['amount']
                    if 'announced_on' in r:
                        assert date_refs and date_refs[0][1]['value']['date'] == r['announced_on']
                        assert date_refs[0][1]['value']['precision'] == 'day'
                    idx = len(rounds)
                    rounds.append(r)
                    mapping(company, f'/funding_rounds/{idx}', refs, original_event_id=original)
                    for key in r:
                        if key == 'source':
                            continue
                        relevant = amount_refs if key in ('amount', 'currency', 'amount_text') else date_refs if key == 'announced_on' else refs
                        precision = 'exact' if key == 'amount' else 'day' if key == 'announced_on' else None
                        mapping(company, f'/funding_rounds/{idx}/{key}', relevant or refs, precision, original)
            else:
                for pair in indexed:
                    _, q = pair
                    if q['field'] != 'funding_round':
                        continue
                    v = q['value']
                    assert v.get('event_kind', 'financing_round') == 'financing_round'
                    original = v['id']
                    r = {'id': prefixed_event_id(company, original), 'stage': v['stage'], 'source': q['source_url']}
                    if v.get('amount') is not None:
                        assert v.get('amount_qualifier') in EXACT
                        assert v.get('currency') and isinstance(v['amount'], int)
                        assert v.get('amount_scope', 'round_total') == 'round_total'
                        r.update(amount=v['amount'], currency=v['currency'])
                    if v.get('amount_text'):
                        r['amount_text'] = v['amount_text']
                    if v.get('announced_on'):
                        assert DAY.fullmatch(v['announced_on'])
                        precision = v.get('announced_on_precision') or v.get('event_date', {}).get('precision')
                        kind = v.get('event_date', {}).get('type')
                        assert precision == 'day' and kind in (None, 'announcement')
                        r['announced_on'] = v['announced_on']
                    note = []
                    reported = v.get('reported_on') or v.get('reported_by')
                    if reported:
                        note.append('Reported by ' + reported + '.')
                    event_date = v.get('event_date', {})
                    event_value = event_date.get('value') or v.get('event_on')
                    event_precision = event_date.get('precision') or v.get('event_on_precision')
                    if event_value and not r.get('announced_on'):
                        if event_date.get('type') == 'company_publication':
                            note.append('Company publication: ' + event_value + '.')
                        else:
                            note.append('Reported event timing: ' + event_value + ' (' + event_precision + ' precision).')
                    if not r.get('announced_on'):
                        note.append('Original announcement day is not established.')
                    if v.get('closed_on') is None:
                        note.append('Closing day is not established.')
                    if v.get('amount_qualifier') not in EXACT and v.get('amount_text'):
                        note.append('Retain the source amount qualifier; no exact scalar is projected.')
                    if not v.get('amount_text') and v.get('amount') is None:
                        note.append('Round total and currency are not established.')
                    r['note'] = ' '.join(note)
                    idx = len(rounds)
                    rounds.append(r)
                    mapping(company, f'/funding_rounds/{idx}', [pair], original_event_id=original)
                    for key in r:
                        if key == 'source':
                            continue
                        precision = 'exact' if key == 'amount' else 'day' if key == 'announced_on' else None
                        mapping(company, f'/funding_rounds/{idx}/{key}', [pair], precision, original)
            if rounds:
                record['funding_rounds'] = rounds
            startups.append(record)

    assert len(startups) == 18, ('bounded accepted set changed', len(startups))
    assert len({slug(r['name']) for r in startups}) == len(startups)
    assert len({(m['entity_id'], m['path']) for m in fields}) == len(fields)
    projection = {
        'schema_version': 1,
        'scope': 'Offline staging projection into the current startup-record schema; no production submission.',
        'claim_id_convention': 'cn:{original company.id}:{original 1-based local claim index:03d}',
        'inputs': inputs,
        'fields': fields,
        'omissions': omissions,
        'rules': [
            'Unresolved or Chinese-only founder spellings remain in the claim sidecar.',
            'Aggregates, funding intentions and portfolio-only relationships are not projected as rounds.',
            'Exact amounts require an exact source qualifier and round-total scope.',
            'Partial dates and publication-only bounds are not projected as announcement days.',
            'No investor graph edges or new API fields are created.',
            'Funding mapping event_id preserves the source event ID even where the runtime ID prefix changes.',
        ],
    }
    return {'startups': startups}, projection


def validate_current_schema(output_dir):
    code = r"""
import {readFileSync} from 'node:fs';
import {validateStartupRecord,startupSlug} from './backend/hosted/src/startup-record.mjs';
const d=JSON.parse(readFileSync(process.argv[1],'utf8'));
const ids=new Set();let founders=0,rounds=0,exactAmounts=0,announcementDays=0;
for(const r of d.startups){
  validateStartupRecord(r);
  if(!r.website||!r.description)throw Error('Missing required new-record identity');
  for(const f of r.founders||[]){if(!startupSlug(f.name))throw Error('Missing ASCII founder identity');founders++;}
  for(const e of r.funding_rounds||[]){
    if(ids.has(e.id))throw Error('Duplicate round ID');ids.add(e.id);
    if(!e.id.startsWith(startupSlug(r.name)+'-'))throw Error('Wrong company event prefix');
    rounds++;if(Object.hasOwn(e,'amount'))exactAmounts++;if(e.announced_on)announcementDays++;
  }
}
console.log(JSON.stringify({records:d.startups.length,founders,rounds,exactAmounts,announcementDays,validation:'current validateStartupRecord passed'}));
"""
    subprocess.run(['node', '--input-type=module', '-e', code, str(output_dir / 'startup-records.json')], cwd=REPO, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs-dir', type=Path, default=HERE / 'inputs')
    parser.add_argument('--output-dir', type=Path, default=HERE)
    args = parser.parse_args()
    records, projection = build(args.inputs_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, data in [('startup-records.json', records), ('projection-map.json', projection)]:
        (args.output_dir / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    validate_current_schema(args.output_dir)


if __name__ == '__main__':
    main()
