#!/usr/bin/env python3
"""Project reviewed evidence into the existing strict startup record schema.

Reads only evidence/{general,fintech,deeptech}.json. Writes this batch's two
projection artifacts, never production data. --check performs a byte comparison.
"""
import argparse
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[4]
REVIEWED = '2026-11-18'
GROUPS = ('general', 'fintech', 'deeptech')
EXCLUDED = {'staging:it:bending-spoons': 'Publicly listed lifecycle reference; excluded from this private startup/scaleup checkpoint.',
            'staging:it:fiscozen': 'Acquired by Visma in April 2024; historical reference, excluded from this independent-startup checkpoint.'}
COUNTRIES = {'IT':'Italy', 'FR':'France', 'GB':'United Kingdom', 'US':'United States', 'LU':'Luxembourg'}
SAFE_AMOUNT_PRECISIONS = {'exact', 'as_reported'}
FOUNDED_CONFLICT_IDS = {'staging:it:satispay', 'staging:it:unobravo'}

def clean(value):
    return re.sub(r'\s+', ' ', str(value)).strip()

def slug(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')

def uniq(values):
    return list(dict.fromkeys(values))

def unwrap(value):
    return value.get('value') if isinstance(value, dict) and 'value' in value else value

def cid(company):
    return company.get('id', company.get('entity_id'))

def cname(company):
    return company.get('name', company.get('canonical_name'))

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()

def date_value(value):
    if isinstance(value, str):
        return {'value':value, 'precision':'day' if re.fullmatch(r'\d{4}-\d{2}-\d{2}', value) else 'unknown'}
    return value or {'value':None,'precision':'unknown'}

def event_id(event):
    return event.get('event_id', event.get('id'))

class Projection:
    def __init__(self, group, packet, company, index, output_index):
        self.group, self.packet, self.c = group, packet, company
        self.entity = cid(company)
        self.input_prefix = f'evidence/{group}.json#/companies/{index}'
        self.sources = {s['id']:s for s in packet['sources']}
        self.claims = [q for q in packet['claims'] if q['entity_id']==self.entity]
        self.record = {}
        self.map = {'entity_id':self.entity,'name':cname(company),'packet':f'evidence/{group}.json',
                    'output_index':output_index,'input_company_index':index,'field_mappings':[],
                    'funding_projections':[],'omissions':[]}

    def refs(self, node=None, field=None):
        if isinstance(node, dict) and node.get('source_ids'):
            return list(node['source_ids'])
        mapping = self.c.get('field_sources',{}).get(field,{})
        if isinstance(mapping, dict) and mapping.get('source_ids'):
            return list(mapping['source_ids'])
        return []

    def source_urls(self, sids):
        assert sids, (self.entity, 'source IDs required')
        for sid in sids:
            assert sid in self.sources and self.sources[sid].get('accessed') is True, (self.entity, sid, 'source not accessed')
        return [self.sources[sid]['url'] for sid in uniq(sids)]

    def matching_claims(self, fields, sids, predicate=None):
        result = []
        for q in self.claims:
            if fields and q['field'] not in fields:
                continue
            support = uniq([q.get('source_id')]+q.get('source_ids',[])+q.get('support_source_ids',[]))
            support += [sid for sid,s in self.sources.items() if s['url'] in q.get('supporting_source_urls',[])]
            if not set(sids).intersection(support):
                continue
            if q.get('accessed') is not True or q.get('status') not in ('reviewed_staged','conflict'):
                continue
            if predicate is not None and not predicate(q):
                continue
            result.append(q['claim_id'])
        return result

    def mapping(self, path, sids, fields=(), predicate=None, input_suffix='', transformation='Directly sourced value.', kind='sourced', extras=None):
        item={'path':path,'input_paths':[self.input_prefix+input_suffix], 'source_ids':uniq(sids),
              'source_urls':self.source_urls(sids) if sids else [],
              'claim_ids':self.matching_claims(fields,sids,predicate) if sids else [],
              'transformation':transformation,'kind':kind}
        if extras:
            item.update(extras)
        self.map['field_mappings'].append(item)
        return item

    def set(self, field, value, sids, fields=(), predicate=None, input_suffix='', transformation='Directly sourced value.', kind='sourced'):
        self.record[field]=value
        return self.mapping('/'+field,sids,fields,predicate,input_suffix,transformation,kind)

    def omit(self, field, reason, input_suffix='', source_ids=None):
        self.map['omissions'].append({'field':field,'reason':reason,'input_path':self.input_prefix+input_suffix,'source_ids':source_ids or []})

    def fact(self, key, label, value, sids, fields=(), predicate=None, input_suffix='', transformation='Preserve sourced scope as a profile fact.', extra_sources_in_value=True, kind='sourced'):
        if value is None or not sids:
            return
        value=clean(value)
        urls=self.source_urls(sids)
        if extra_sources_in_value and len(urls)>1:
            value += ' Additional source: '+'; '.join(urls[1:])+'.'
        assert len(value)<=1000, (self.entity,key,'profile fact too long',len(value))
        facts=self.record.setdefault('profile_facts',[])
        key=slug(key)
        assert key and key not in {x['key'] for x in facts}, (self.entity,key,'duplicate fact key')
        item={'key':key,'label':clean(label),'value':value,'source':urls[0],'reviewed_at':REVIEWED}
        index=len(facts); facts.append(item)
        self.mapping(f'/profile_facts/{index}',sids,fields,predicate,input_suffix,transformation,kind,
                     {'fact_key':key,'metadata_note':'key/label are editorial; reviewed_at is this batch review date.'})

    def geography(self, node, key, label, fields, suffix, default_scope):
        if not node or unwrap(node) is None:
            if label.lower().endswith('headquarters') or key=='headquarters':
                self.omit('profile_facts.headquarters','No explicit headquarters observation; office/origin facts retain their specific scopes.',suffix)
            return
        value=unwrap(node)
        sids=self.refs(node)
        scope=value.get('scope') or value.get('location_type') or value.get('qualifier') or default_scope
        scope=scope.replace('_',' ')
        place=uniq([x for x in [value.get('city'),value.get('region'),value.get('country') or COUNTRIES.get(value.get('country_code'),value.get('country_code'))] if x])
        text=f"{scope}: {', '.join(place)}."
        if value.get('entity_name'):
            text += f" Entity: {value['entity_name']}."
        if value.get('as_of'):
            text += f" Observation as of {value['as_of']}."
        if node.get('note'):
            text += ' '+node['note']
        if value.get('registry_identifier'):
            text += f" Registry identifier: {value['registry_identifier']}."
        if 'historical' in scope.lower() or (node.get('note') and 'historical' in node['note'].lower()):
            label='Historical headquarters'
        elif 'base' in scope.lower() and key=='headquarters':
            label='Company base'
        elif 'administrative' in scope.lower() and key=='headquarters':
            label='Administrative headquarters'
        def matches_place(q):
            observation=q.get('value',{})
            if not isinstance(observation,dict): return False
            return all(observation.get(k)==value[k] for k in ('city','region','country_code','entity_name') if value.get(k) is not None)
        self.fact(key,label,text,sids,fields,matches_place,input_suffix=suffix)

    def build(self):
        c=self.c
        identity=c.get('identity_source_ids') or self.refs(c.get('website'),'website')
        assert identity, (self.entity,'identity provenance absent')
        self.set('name',cname(c),identity,('identity','website'),input_suffix='/name',transformation='Canonical company name from the identified company source; identity/website claims retain the source link.')
        self.set('source',self.source_urls(identity)[0],identity,('identity','website'),input_suffix='/website',transformation='Primary identity source only; other fields use their own mappings and source-bearing facts.')
        self.set('reviewed_at',REVIEWED,[],input_suffix='',transformation='Declared batch review date, not a founding, retrieval or event date.',kind='administrative')
        website=unwrap(c.get('website'))
        if website:
            self.set('website',website,identity,('identity','website'),input_suffix='/website')
        description=unwrap(c.get('description'))
        drefs=self.refs(c.get('description'),'description')
        if description and drefs:
            self.set('description',clean(description),drefs,('description',),input_suffix='/description')
            if drefs[0]!=identity[0]:
                self.fact('business-activity','Business activity',description,drefs,('description',),input_suffix='/description',transformation='Explicit field-level source because the root identity source differs.')
        sectors=unwrap(c.get('sectors'))
        if sectors:
            self.fact('sector-tags','Sector tags (researcher classification)',
                      'Researcher classification based on sourced business activity: '+', '.join(sectors)+'.',
                      self.refs(c.get('sectors'),'sectors'),('sectors',),input_suffix='/sectors',
                      transformation='Editorial tags are explicitly labeled as researcher classification.',kind='researcher_classification')
        founded=c.get('founded')
        if founded and unwrap(founded):
            frefs=self.refs(founded)
            text=f"{unwrap(founded)}; {founded.get('precision','unknown')} precision; company founding/origin, not legal incorporation."
            self.fact('founding-date','Founding date and precision',text,frefs,('founding_date','founded_date'),input_suffix='/founded')
            if self.entity in FOUNDED_CONFLICT_IDS:
                self.omit('founded_year','Conflicting primary origin/founding years retained in source-bearing profile facts; no single numeric year promoted.', '/founded', frefs)
            else:
                self.set('founded_year',int(str(unwrap(founded))[:4]),frefs,('founding_date','founded_date'),input_suffix='/founded',transformation='Extract year only from sourced year/month/day value; exact input precision retained in founding-date fact.')
        else:
            self.omit('founded_year','Founding year unknown; seed financing is not used as a substitute.','/founded')
        self.omit('incorporation','No incorporation evidence promoted; registered offices and headquarters retain distinct scopes.','/incorporation')
        for i,a in enumerate(c.get('aliases',[])):
            kind=a.get('kind',a.get('alias_type','name relationship')).replace('_',' ')
            value=f"{a['name']}: {kind}."
            if a.get('note'): value+=' '+a['note']
            self.fact('name-relationship-'+str(i+1),'Name and brand relationship',value,self.refs(a),('alias',),
                      predicate=lambda q,a=a:isinstance(q['value'],dict) and q['value'].get('name')==a['name'], input_suffix=f'/aliases/{i}')
        if not c.get('aliases'):
            self.omit('aliases','No alternate trade name verified; an omitted list does not assert universal absence.','/aliases')
        self.geography(c.get('headquarters'),'headquarters','Headquarters',('headquarters',),'/headquarters','headquarters')
        if c.get('registered_office'):
            self.geography(c['registered_office'],'registered-office','Registered or legal office',('registered_office',),'/registered_office','registered office')
        for field,label,claims,scope in [('registered_offices','Registered office',('registered_office',),'registered office'),
                                          ('operational_offices','Operational office',('operational_office',),'operational office'),
                                          ('geographic_presence','Geographic presence',('geographic_presence',),'geographic presence')]:
            for i,node in enumerate(c.get(field,[])):
                self.geography(node,f'{field}-{i+1}',label,claims,f'/{field}/{i}',scope)
        basis=c.get('country_basis')
        if basis:
            self.fact('italy-ecosystem-basis','Italy ecosystem connection',unwrap(basis),self.refs(basis),('country_basis',),input_suffix='/country_basis')
        # Fintech Jet HR has a sourced founding-location claim without a current HQ.
        for q in self.claims:
            if q['field']=='founding_geography' and q.get('status')=='reviewed_staged':
                v=q['value']; self.fact('founding-location','Founding location',', '.join(x for x in [v.get('city'),v.get('country')] if x),[q['source_id']],('founding_geography',),input_suffix='/claim_ids')
        for i,person in enumerate(c.get('founders',[])):
            sids=self.refs(person)
            pred=lambda q,n=person['name']:isinstance(q['value'],dict) and q['value'].get('name')==n
            assert self.matching_claims(('founder',),sids,pred), (self.entity,person['name'],'no matching founder claim')
            founders=self.record.setdefault('founders',[])
            n=len(founders); founders.append({'name':person['name'],'source':self.source_urls(sids)[0]})
            self.mapping(f'/founders/{n}',sids,('founder',),pred,f'/founders/{i}',
                         'Founder-specific source; no inherited company-level founder evidence or social/asset claims.')
            role=person.get('professional_role') or person.get('role_at_source') or person.get('role')
            if role and role.lower() not in ('founder','co-founder'):
                value=f"{person['name']}: {role} (role stated by the source)."
                if person.get('role_as_of'): value+=f" As of {person['role_as_of']}."
                self.fact('founder-role-'+slug(person['name']),'Public professional founder role',value,sids,('founder',),pred,f'/founders/{i}')
        for i,org in enumerate(c.get('founding_organisations',[])):
            self.fact('founding-organisation-'+str(i+1),'Founding organisation',org['name'],self.refs(org),('founding_organisation',),input_suffix=f'/founding_organisations/{i}')
        for i,entity in enumerate(c.get('legal_entities',[])):
            value=entity['name']+(f"; {entity['relationship']}" if entity.get('relationship') else '')+'.'
            self.fact('legal-entity-'+str(i+1),'Named legal entity and relationship',value,self.refs(entity),('legal_entity',),input_suffix=f'/legal_entities/{i}')
        self.conflicts()
        for i,ev in enumerate(c.get('other_events',[])):
            if ev.get('kind')=='proposed_capital_increase':
                value='Proposed capital increase announced '+ev['announced_on']+f"; ceiling {ev['currency']} {ev['maximum_amount']:,}. Approximately half was backed by subscription commitments; completion and final proceeds are unverified."
                self.fact('proposed-capital-increase','Proposed financing, completion unverified',value,self.refs(ev),('proposed_funding',),input_suffix=f'/other_events/{i}')
                self.omit('funding_rounds.proposed_capital_increase','Uncompleted proposal excluded from funding-round list.',f'/other_events/{i}',self.refs(ev))
            elif ev.get('kind')=='acquisition' and ev.get('target'):
                self.fact('acquisition-'+slug(ev['target']),'Acquisition announcement',f"Acquisition of {ev['target']} announced {ev['announced_on']}; acquisition consideration is not established.",self.refs(ev),('acquisition',),input_suffix=f'/other_events/{i}')
        raw_events=c.get('funding_events',c.get('funding_rounds',[]))
        for i,event in enumerate(raw_events): self.funding(event,i,'funding_events' if 'funding_events' in c else 'funding_rounds')
        self.omit('relationships','Investor/founder canonical IDs have not been reconciled; no canonical relationships generated. Participant roles remain sourced narrative and companion evidence.')
        self.omit('logo/socials/founder assets','No verified asset rights or social-profile claims supplied; omitted rather than inferred.')
        self.omit('funding_rounds.valuation','No verified valuation values supplied; unknown is not zero.')
        return self.record,self.map

    def conflicts(self):
        explanations={
            'staging:it:satispay':'The 2024 company chronology states founding in 2013 and app launch in 2015; 2026 boilerplate says founded in 2015. The more explicit chronology is preferred in research, while the numeric founded_year remains withheld.',
            'staging:it:unobravo':'Company origin narrative says 2019; CDP’s 2023 release says founded in 2020. These may describe different milestones. Legal establishment remains unresolved and numeric founded_year is withheld.',
            'staging:it:scalapay':'Careers timeline places the Series B in January 2022; contemporaneous company-issued announcement is dated 23 February 2022. The dated announcement is used for announced_on.',
            'staging:it:weroad':'The same Series C release states $58 million and €58 million. Both numeric amount and currency are withheld pending corroboration; the textual conflict is retained.',
            'staging:it:tot':'The original 2021 announcement calls the financing Seed; a 2025 retrospective calls the initial stage pre-seed. One event is retained with the contemporaneous Seed label.',
            'staging:it:leaf-space':'A current company timeline labels EUR 35m as Series B. Detailed financing evidence separates EUR 20m equity and EUR 15m venture-debt availability that was not yet fully finalized; the equity event retains EUR 20m.',
            'staging:it:aiko':'Initial Series A announcement is dated 9 October 2024; the February 2025 update refers to earlier financing in December. Closing day remains unknown; the updated total is not added to the earlier total.',
            'staging:it:caracol':'Company subheading calls CDP a Series B co-lead; detailed wording and the Omnes release name Omnes and Move as co-leads. CDP is conservatively described as a participant.'}
        for i,conflict in enumerate(self.c.get('conflicts',[])):
            if self.entity not in explanations: continue
            sids=self.refs(conflict)
            if not sids: continue
            def relevant(q):
                return q.get('status')=='conflict' or q['field'] in ('founding_date','founded_date','funding_round','funding_observation')
            self.fact('source-conflict-'+str(i+1),'Source conflict and retained scope',explanations[self.entity],sids,(),relevant,input_suffix=f'/conflicts/{i}',
                      transformation='Transparent synthesis of conflicting statements; no conflicted number promoted as an exact funding amount.')

    def funding(self, event, raw_index, raw_field):
        raw_id=event_id(event); sids=list(event['source_ids']); main=sids[0]
        id_=slug(raw_id.replace('staging:it:','it-'))
        rounds=self.record.setdefault('funding_rounds',[])
        idx=len(rounds); path=f'/funding_rounds/{idx}'; suffix=f'/{raw_field}/{raw_index}'
        pred=lambda q:isinstance(q['value'],dict) and q['value'].get('event_id',q['value'].get('id'))==raw_id
        assert self.matching_claims(('funding_round',),sids,pred), (self.entity,raw_id,'no matching funding claim')
        def field_refs(field):
            explicit=event.get('field_sources',{}).get(field)
            if explicit: return list(explicit)
            if field=='announced_on' and event.get('date_source_ids'): return list(event['date_source_ids'])
            if field=='announced_on':
                return list(event.get('field_sources',{}).get('announced',[main]))
            return [main]
        item={'id':id_,'stage':clean(event['stage']),'source':self.source_urls([main])[0]}
        rounds.append(item)
        self.mapping(path+'/id',[],input_suffix=suffix,transformation='Deterministic slug of original event identity.',kind='administrative')
        self.mapping(path+'/source',[main],('funding_round',),pred,suffix,transformation='Primary financing observation source; additional evidence is attributed in note and field map.')
        self.mapping(path+'/stage',field_refs('stage'),('funding_round','funding_stage_confirmation'),pred,suffix+'/stage')
        announced=date_value(event.get('announced',event.get('announced_on',event.get('announced_date'))))
        closed=date_value(event.get('closed',event.get('closed_on',event.get('closed_date'))))
        announced_refs=field_refs('announced_on')
        if announced.get('precision')=='day' and re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(announced.get('value'))):
            item['announced_on']=announced['value']
            self.mapping(path+'/announced_on',announced_refs,('funding_round','funding_announcement_date'),pred,suffix,transformation='Only explicitly day-precise announcement/publication date; not an inferred closing date.')
        else:
            self.omit(path+'/announced_on','No day-precise announcement; coarse date retained in note.',suffix,announced_refs)
        amount,currency,precision=event.get('amount'),event.get('currency'),event.get('amount_precision')
        safe=type(amount) is int and 0<amount<=9007199254740991 and precision in SAFE_AMOUNT_PRECISIONS and isinstance(currency,str) and re.fullmatch('[A-Z]{3}',currency)
        if safe:
            item.update(amount=amount,currency=currency)
            self.mapping(path+'/amount',field_refs('amount'),('funding_round',),pred,suffix+'/amount',transformation='Positive safe integer exactly stated by source; no conversion, summation or bound substitution.',extras={'input_amount_precision':precision})
            self.mapping(path+'/currency',field_refs('currency'),('funding_round','funding_currency_confirmation'),pred,suffix+'/currency',transformation='Explicit currency; corroborating source is separate where required.')
        else:
            self.omit(path+'/amount,currency',f'No exact, unconflicted positive integer/currency pair: input amount precision {precision}.',suffix,field_refs('amount'))
        text_amount=event.get('amount_text')
        if not safe and not text_amount and amount is not None:
            prefixes={'approximate':'About','upper_bound':'Up to','lower_bound':'More than','strict_lower_bound':'More than','reported_rounded_total':'Reported rounded total of'}
            text_amount=f"{prefixes.get(precision,'Reported')} {currency or ''} {amount:,}".strip()
        if text_amount:
            item['amount_text']=clean(text_amount)
            assert len(item['amount_text'])<=200, (self.entity,raw_id,'amount text too long')
            self.mapping(path+'/amount_text',field_refs('amount'),('funding_round',),pred,suffix,transformation='Preserve source wording and uncertainty; not a numeric amount assertion.',extras={'input_amount_precision':precision})
        sections=[]
        def section(text, refs, claimfields=('funding_round',), predicate=pred, in_suffix=suffix, transformation='Source-qualified financing context.'):
            if text:
                refs=uniq(refs); self.source_urls(refs)
                sections.append({'text':clean(text),'source_ids':refs,'source_urls':self.source_urls(refs),
                                 'claim_ids':self.matching_claims(claimfields,refs,predicate),
                                 'input_path':self.input_prefix+in_suffix,'transformation':transformation})
        if event.get('note'): section(event['note'],sids)
        kind=event.get('transaction_kind')
        if kind=='debt': section('Debt financing; separate from equity.',field_refs('transaction_kind'))
        elif kind=='financing_unspecified': section('Financing composition is unspecified; do not treat the entire amount as equity.',field_refs('transaction_kind'))
        if announced.get('value') and announced.get('precision')!='day':
            section(f"Announcement period: {announced['value']} ({announced['precision']} precision); exact announcement day unknown.",announced_refs)
        if closed.get('value'): section(f"Closing period: {closed['value']} ({closed['precision']} precision).",field_refs('closed'))
        if event.get('event_date',{}).get('value'): section(f"Event period: {event['event_date']['value']} ({event['event_date']['precision']} precision).",[main])
        participant_groups=defaultdict(list)
        for p in event.get('participants',[]):
            key=(tuple(p['source_ids']),p.get('participation_scope'),p.get('role','unspecified'))
            participant_groups[key].append(p)
        for (refs,scope,role),people in participant_groups.items():
            label={'lead':'Lead','participant':'Participant','unspecified':'Named investor'}[role]
            if len(people)>1: label+='s'
            if scope: label+=f' ({scope})'
            names=[p['name'] for p in people]
            pp=lambda q,names=names:pred(q) and q['value'].get('name') in names
            section(label+': '+', '.join(names)+'.',list(refs),('round_participant',),pp,suffix+'/participants')
        for lender in event.get('lenders',[]):
            pp=lambda q,name=lender['name']:pred(q) and q['value'].get('name')==name
            section('Lender: '+lender['name']+'.',lender['source_ids'],('credit_provider',),pp,suffix+'/lenders')
        for q in self.claims:
            if q['field']=='investment_vehicle' and isinstance(q['value'],dict) and q['value'].get('event_id')==raw_id:
                v=q['value']; section(f"Investment vehicle: {v['manager']} through {v['compartment']} of {v['fund']}.",[q['source_id']],('investment_vehicle',),pred)
        if event.get('participants'): section('Named participants are a partial list.',uniq([sid for p in event['participants'] for sid in p['source_ids']]),('round_participant',),pred)
        all_support=uniq([sid for sec in sections for sid in sec['source_ids']]+sids+field_refs('stage')+announced_refs+field_refs('currency'))
        additional=[sid for sid in all_support if sid!=main]
        note=' '.join(sec['text'] for sec in sections)
        if additional: note+=' Additional evidence: '+'; '.join(self.source_urls(additional))+'.'
        if note:
            item['note']=clean(note)
            assert len(item['note'])<=2000, (self.entity,raw_id,'funding note exceeds schema',len(item['note']))
            self.mapping(path+'/note',all_support,(),pred,suffix,transformation='Role- and tranche-qualified narrative; no canonical investor relationships.',extras={'note_sections':sections})
        related=self.c.get('related_funding_observations',[])
        matching_related=[r for r in related if (r.get('value',{}).get('event_id') or r.get('value',{}).get('linked_event_id'))==raw_id]
        self.map['funding_projections'].append({'raw_event_id':raw_id,'output_event_id':id_,'output_index':idx,
            'source_ids':all_support,'amount_numeric_promoted':bool(safe),'input_amount_precision':precision,
            'announced_on_promoted':'announced_on' in item,'input_announcement':announced,
            'related_event_id':event.get('related_event_id'),'round_group':event.get('round_group'),
            'related_observations_not_added':matching_related,'component_observations_not_added':event.get('components',[]),
            'participant_policy':'Explicit names/roles/scopes retained only in note; canonical relationships omitted.'})
        if matching_related or event.get('components'):
            self.omit(path+'.additional_tranches','Related observations/components overlap the represented round or describe unfinalized debt; not emitted as additional funding rounds.',suffix,all_support)

def build():
    inputs=[]; records=[]; maps=[]; exclusions=[]
    for group in GROUPS:
        path=ROOT/'evidence'/f'{group}.json'
        raw=path.read_bytes(); packet=json.loads(raw)
        inputs.append({'path':f'evidence/{group}.json','sha256':hashlib.sha256(raw).hexdigest()})
        for index,company in enumerate(packet['companies']):
            if cid(company) in EXCLUDED:
                exclusions.append({'entity_id':cid(company),'name':cname(company),'reason':EXCLUDED[cid(company)],'input_path':f'evidence/{group}.json#/companies/{index}'})
                continue
            record,mapping=Projection(group,packet,company,index,len(records)).build()
            records.append(record); maps.append(mapping)
    assert len(records)==22 and len(exclusions)==2
    schema_path=REPO/'backend/hosted/src/startup-record.mjs'
    proposals={'reviewed':REVIEWED,'startups':records}
    mapping={'schema_version':'italy-startup-projection-map-1','reviewed':REVIEWED,
             'target_schema':'backend/hosted/src/startup-record.mjs#startupRecordSchema',
             'target_schema_sha256':hashlib.sha256(schema_path.read_bytes()).hexdigest(),
             'inputs':inputs,'record_count':len(records),'excluded_records':exclusions,'records':maps,
             'policies':{'production_write':False,'unknown_fields':'omitted; never zero-filled',
                         'numeric_amounts':'only exact/as-reported positive safe integers with explicit currency; approximate, bounded, conflicted and rounded totals remain text',
                         'funding_dates':'full-day announcement only; no padded month/year or inferred close day',
                         'source_inheritance':'field-specific provenance; root source is identity only',
                         'sector_labels':'researcher classification, explicitly labeled',
                         'relationships':'no unsupported participant arrays or canonical investor relationships',
                         'coverage':'bounded source-backed proposal checkpoint, not a complete funding history or ecosystem census'}}
    return {'startup-proposals.json':json_bytes(proposals),'projection-map.json':json_bytes(mapping)}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--check',action='store_true'); args=parser.parse_args()
    outputs=build()
    for name,content in outputs.items():
        if args.check:
            assert (ROOT/name).read_bytes()==content, f'{name} is not reproducible from current evidence'
        else:
            (ROOT/name).write_bytes(content)
    print(json.dumps({'mode':'check' if args.check else 'build','records':22,'outputs':list(outputs)},indent=2))
