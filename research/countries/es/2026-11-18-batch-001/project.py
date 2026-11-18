#!/usr/bin/env python3
"""Deterministic country-only projection into the existing startup-record schema.

This is a research packet adapter, not an importer or collector. No networking,
production writes, investor resolution, seed approval or API/schema changes.
"""
import csv
import io
import json
from pathlib import Path
import re
import unicodedata

HERE = Path(__file__).resolve().parent
REVIEW_DATE = '2026-11-18'

def read(name):
    return json.loads((HERE / name).read_text(encoding='utf-8'))

def slug(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')

def normalized_name(value):
    return slug(value).replace('-', '')

def generate():
    companies = read('companies.json')['companies']
    claims = read('claims.json')['claims']
    source_by = {s['id']: s for s in read('source-registry.json')['sources']}
    claim_by = {c['claim_id']: c for c in claims}
    output, maps, holds = [], [], []

    def eligible(c):
        return (c['status'] == 'reviewed_staged' and c.get('accessed') is True
                and not source_by[c['source_id']].get('rights_review_required'))

    for company in sorted(companies, key=lambda c: c['name']):
        if company['review_disposition'] != 'accepted_staged':
            holds.append({'company': company['name'], 'reason': company['review_disposition']})
            continue
        cc = [c for c in claims if c['entity_id'] == company['staging_id'] and eligible(c)]
        def field(*names):
            return [c for c in cc if c['field'] in names]
        description = field('description')[-1]
        record = {'name': company['name'], 'description': description['value'],
                  'website': company['website'], 'source': description['source_url'],
                  'reviewed_at': REVIEW_DATE}
        mapping = {'company': company['name'], 'staging_id': company['staging_id'],
                   'proposed_entity_id': company['proposed_entity_id'], 'paths': [], 'omissions': []}

        def mapped(path, evidence, transformation='verbatim factual value or concise researcher paraphrase'):
            assert evidence, (company['name'], path, 'missing evidence')
            mapping['paths'].append({'path': path, 'claim_ids': list(dict.fromkeys(c['claim_id'] for c in evidence)),
                                     'source_ids': list(dict.fromkeys(c['source_id'] for c in evidence)),
                                     'transformation': transformation})
        mapped('/name', field('name', 'identity'))
        mapped('/website', field('website', 'identity'))
        mapped('/description', [description])
        mapped('/source', [description], 'source selected for the description; other fields retain their own source map')
        mapping['paths'].append({'path': '/reviewed_at', 'claim_ids': [], 'source_ids': [],
                                 'transformation': 'research review metadata; not an external factual assertion'})

        facts = []
        def fact(key, label, value, evidence, transform='source-backed observation with scope and precision'):
            text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, separators=(', ', ': '))
            if not evidence or len(text) > 1000:
                mapping['omissions'].append({'field': key, 'reason': 'No eligible source or exceeds legacy text bound; retained in ledger.'})
                return
            facts.append({'key': key, 'label': label, 'value': text,
                          'source': evidence[-1]['source_url'], 'reviewed_at': REVIEW_DATE})
            mapped('/profile_facts/' + str(len(facts)-1), evidence, transform)

        for f, label in [('headquarters', 'Headquarters observation and scope'),
                         ('reported_base', 'Reported company base; headquarters unverified'),
                         ('registered_office', 'Registered office; headquarters not inferred'),
                         ('incorporation', 'Legal-entity observation; date and entity scope retained')]:
            evidence = field(f)
            if evidence:
                fact(slug(f), label, evidence[-1]['value'], [evidence[-1]])
        for index, observation in enumerate(field('headquarters_scope_observation')):
            fact('headquarters-scope-' + str(index+1), 'Scope-limited headquarters observation', observation['value'], [observation])
        founding = field('founded')
        if founding and company['name'] not in {'Quibim', 'INBRAIN Neuroelectronics'}:
            value = founding[-1]['value']
            if isinstance(value, dict) and re.fullmatch(r'\d{4}(?:-\d{2}(?:-\d{2})?)?', value.get('value', '')):
                record['founded_year'] = int(value['value'][:4])
                mapped('/founded_year', [founding[-1]], 'Year component only; original precision and source retained in founding-observation fact and ledger.')
            fact('founding-observation', 'Founding observation and date precision', value, [founding[-1]])
        else:
            mapping['omissions'].append({'field': 'founded_year', 'reason': 'Unresolved source conflict or no eligible evidence; never zero.'})
        aliases = field('aliases', 'alias')
        for index, a in enumerate(aliases):
            fact('alias-observation-' + str(index+1), 'Alias observation', a['value'], [a])
        sectors = field('sectors')
        if sectors:
            fact('research-sector-classification', 'Research sector classification', sectors[-1]['value'], [sectors[-1]],
                 'Analyst classification from the cited product description; not a source taxonomy.')
        # Explain country scope using source claims, without inventing a schema-level HQ country.
        geography = field('scope_class', 'headquarters', 'reported_base', 'registered_office', 'founding_geography', 'founded')
        if geography:
            fact('country-research-scope', 'Spain research scope', company['scope_class'], geography,
                 'Research inclusion classification; no statutory startup certification or current global HQ inferred.')

        founders = {}
        for cl in field('founder'):
            v = cl['value']; name = v.get('name') if isinstance(v, dict) else None
            if not name:
                continue
            key = normalized_name(name)
            # The last independently eligible source wins only for the same normalized name.
            founders[key] = ({'name': name, 'source': cl['source_url']}, cl)
        if founders:
            record['founders'] = []
            for founder, cl in founders.values():
                record['founders'].append(founder)
                mapped('/founders/' + str(len(record['founders'])-1), [cl], 'Public professional founder identity only; no contacts or automatic person entity resolution.')

        rounds = []
        for event in company['funding_events']:
            mode = event['projection_policy']['mode']
            evclaims = [claim_by[i] for i in event['claim_ids'] if eligible(claim_by[i])]
            descriptive = [c for c in evclaims if c['field'] not in {'round_participant', 'financing_provider'}]
            if mode == 'sidecar_only' or not descriptive:
                mapping['omissions'].append({'field': 'funding_rounds', 'event_id': event['id'],
                                             'reason': event['projection_policy']['reason'] if mode == 'sidecar_only' else 'No eligible event assertion outside restricted sources.'})
                continue
            kind = event['transaction_kind']
            fallback_stage = {'mixed_grant_equity': 'Grant and equity package',
                              'mixed_investment_grants': 'Investment and grant package',
                              'mixed_primary_secondary_equity': 'Primary and secondary equity transaction',
                              'equity': 'Equity financing (stage unstated)',
                              'debt': 'Debt financing (stage unstated)'}.get(kind, 'Financing (stage unstated)')
            available = [s for s in event['source_ids'] if not source_by[s].get('rights_review_required')]
            primary = next((s for s in available if any(c['source_id'] == s for c in descriptive)), descriptive[0]['source_id'])
            r = {'id': event['id'], 'stage': event.get('stage') or fallback_stage, 'source': source_by[primary]['url']}
            # Exact original-company dates are deliberately withheld where independent evidence is only month precision.
            if event.get('announced_on') and company['name'] != 'iPronics':
                r['announced_on'] = event['announced_on']
            amount, currency = event.get('amount'), event.get('currency')
            if mode == 'numeric_if_supported' and amount is not None and currency:
                r['amount'], r['currency'] = amount, currency
            text = event.get('amount_text')
            if mode == 'text_only':
                text = text or (f'{currency} {amount:,}' if amount is not None and currency else 'Amount unresolved')
                if 'mixed' in kind:
                    text += '; ' + kind.replace('_', ' ') + '; components not separately quantified'
            if text:
                assert len(text) <= 200, (event['id'], 'amount text too long')
                r['amount_text'] = text
            participants = []
            participant_claims = []
            for p in event.get('participants') or []:
                pcs = [claim_by[i] for i in p['claim_ids'] if eligible(claim_by[i])]
                if pcs:
                    participants.append(p['name'] + ' (' + p['role'] + ')')
                    participant_claims += pcs
            notes = ['Financing kind: ' + kind + '.', 'Selected event; funding history and participant coverage are partial.',
                     'Exact closing date is unverified.']
            if event.get('event_date'):
                notes.append('Event date evidence: ' + json.dumps(event['event_date'], ensure_ascii=False) + '.')
            if event.get('signed_on'):
                notes.append('Signature date: ' + json.dumps(event['signed_on'], ensure_ascii=False) + '; not an announcement date.')
            if event.get('reported_on'):
                notes.append('Report date: ' + json.dumps(event['reported_on'], ensure_ascii=False) + '; not an exact closing date.')
            if company['name'] == 'iPronics':
                notes.append('Independent sources establish September 2026; original company announcement day withheld. Amount and participants independently reported by the transaction adviser.')
            if company['name'] == 'Multiverse Computing':
                notes.append('Investor announcement supports the selected round. Later fundraising target and direct-company-only assertions are excluded.')
            else:
                for key in ['notes', 'note']:
                    if event.get(key):
                        notes.append(event[key])
            if event.get('close_scope'):
                notes.append('Close scope: ' + event['close_scope'] + '; round not asserted complete.')
            if participants:
                notes.append('Explicit event participants/providers (identities unresolved): ' + '; '.join(participants) + '.')
            if company['name'] == 'Bdeo':
                notes.append('CDTI participated through K Fund; the intermediary relationship is retained in the ledger.')
            if mode == 'text_only':
                notes.append(event['projection_policy']['reason'])
            r['note'] = ' '.join(notes)
            assert len(r['note']) <= 2000, (event['id'], 'note too long')
            rounds.append(r)
            mapped('/funding_rounds/' + str(len(rounds)-1), descriptive + participant_claims,
                   'Legacy fields only. Instrument/precision caveats remain in note; typed participants and legal entity resolution remain solely in the research ledger.')
        if rounds:
            record['funding_rounds'] = rounds
        if facts:
            record['profile_facts'] = facts
        output.append(record); maps.append(mapping)

    text = io.StringIO(newline='')
    writer = csv.writer(text, lineterminator='\n'); writer.writerow(['partner', 'official_website', 'approved'])
    writer.writerows((r['name'], r['website'], 'no') for r in output)
    return ({'startups': output}, {'scope': 'research_only', 'records': maps, 'company_holds': holds}, text.getvalue())

if __name__ == '__main__':
    records, mapping, seeds = generate()
    for name, data in [('startups.json', records), ('projection-map.json', mapping)]:
        (HERE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (HERE / 'collector-seeds.csv').write_text(seeds, encoding='utf-8')
    print(json.dumps({'projected_records': len(records['startups']), 'projected_financing_events': sum(len(r.get('funding_rounds', [])) for r in records['startups'])}))
