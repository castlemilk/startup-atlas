#!/usr/bin/env python3
"""Stage saved filings and attributed funding observations for offline review."""

import argparse
from collections import Counter
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit
from xml.etree import ElementTree


MAX_BYTES = 1_000_000
MAX_ITEMS = 100
ACCESSION = re.compile(r'[0-9]{10}-[0-9]{2}-[0-9]{6}')
ARCHIVE = re.compile(r'/Archives/edgar/data/([0-9]{1,10})/([0-9]{18})/(?:[a-zA-Z0-9-]+/)?[a-zA-Z0-9._-]+')
INSTRUMENTS = {
    'isEquityType': 'Equity',
    'isDebtType': 'Debt',
    'isOptionToAcquireType': 'Option, warrant or other right to acquire another security',
    'isSecurityToBeAcquiredType': 'Security to be acquired',
    'isPooledInvestmentFundType': 'Pooled Investment Fund Interests',
    'isTenantInCommonType': 'Tenant-in-Common Securities',
    'isOtherType': 'Other',
}


def fields(value, required, optional=()):
    if not isinstance(value, dict) or not set(required) <= value.keys() or value.keys() - set(required) - set(optional):
        raise ValueError(f'Expected fields {", ".join(required)} with optional {", ".join(optional)}')
    return value


def items(value, label):
    if not isinstance(value, list) or len(value) > MAX_ITEMS:
        raise ValueError(f'{label} must be a list of at most {MAX_ITEMS} entries')
    return value


def text(value, label, limit=500):
    if (not isinstance(value, str) or not value.strip() or value != value.strip()
            or len(value) > limit or any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise ValueError(f'Invalid {label}')
    return value


def matching(value, pattern, label):
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError(f'Invalid {label}')
    return value


def read_bytes(path):
    if not path.is_file():
        raise ValueError(f'Expected a saved file: {path}')
    with path.open('rb') as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError(f'Saved file exceeds {MAX_BYTES} bytes: {path}')
    return raw


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON field: {key}')
        result[key] = value
    return result


def load_json(raw):
    def invalid_constant(value):
        raise ValueError(f'Invalid JSON constant: {value}')

    return json.loads(raw, object_pairs_hook=unique_object, parse_constant=invalid_constant)


def evidence_url(value):
    text(value, 'source URL', 2048)
    parts = urlsplit(value)
    if (parts.scheme != 'https' or not parts.hostname or '.' not in parts.hostname
            or parts.username or parts.password or parts.port not in (None, 443) or '\\' in value):
        raise ValueError('Source evidence needs an HTTPS URL')
    return parts


def date_observation(value, full_day=False):
    matching(value, r'[0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?', 'date')
    precision = {4: 'year', 7: 'month', 10: 'day'}[len(value)]
    if full_day and precision != 'day':
        raise ValueError('This date requires an exact day')
    # Validate the calendar while retaining the original precision.
    date.fromisoformat(value + {4: '-01-01', 7: '-01', 10: ''}[len(value)])
    return {'value': value, 'precision': precision}


def normalize_cik(value):
    matching(value, r'[0-9]{1,10}', 'CIK')
    if int(value) == 0:
        raise ValueError('CIK must be positive')
    return value.zfill(10)


def name_key(value):
    normalized = unicodedata.normalize('NFKC', value).casefold()
    return ' '.join(re.sub(r'[\W_]+', ' ', normalized).split())


def legal_entities(rows):
    entities, registries = {}, set()
    for row in items(rows, 'legal entities'):
        fields(row, ('id', 'name', 'aliases', 'jurisdiction', 'registry', 'role', 'evidence'))
        key = matching(row['id'], r'[a-z0-9]+(?:-[a-z0-9]+)*', 'legal entity ID')
        role = row['role']
        if role not in ('operating_company', 'related_company', 'excluded_vehicle'):
            raise ValueError('Unknown legal entity role')
        if role != 'excluded_vehicle' or row['name'] is not None:
            text(row['name'], 'legal name')
        aliases = [text(alias, 'alias') for alias in items(row['aliases'], 'aliases')]
        text(row['jurisdiction'], 'jurisdiction')
        registry = fields(row['registry'], ('system', 'id'))
        if registry['system'] == 'sec_cik':
            registry = {**registry, 'id': normalize_cik(registry['id'])}
        elif registry['system'] == 'companies_house':
            matching(registry['id'], r'[A-Z0-9]{8}', 'Companies House number')
        else:
            raise ValueError('Unsupported company registry')
        registry_key = (registry['system'], registry['id'])
        if key in entities or registry_key in registries:
            raise ValueError('Duplicate legal entity or registry ID')
        evidence = items(row['evidence'], 'legal identity evidence')
        if not evidence:
            raise ValueError('Legal entity needs identity evidence')
        for entry in evidence:
            fields(entry, ('url', 'basis'))
            evidence_url(entry['url'])
            text(entry['basis'], 'identity evidence basis')
        registries.add(registry_key)
        entities[key] = {**row, 'registry': registry, 'aliases': aliases}
    if not any(row['role'] == 'operating_company' for row in entities.values()):
        raise ValueError('Resolve at least one operating company before staging')
    return entities


def amount(value):
    if value is None:
        return None
    fields(value, ('as_stated',), ('number', 'currency'))
    number, currency = value.get('number'), value.get('currency')
    if number is not None:
        matching(number, r'[0-9]{1,18}(?:\.[0-9]{1,6})?', 'exact amount')
    if currency is not None:
        matching(currency, r'[A-Z]{3}', 'stated currency')
    return {'as_stated': text(value['as_stated'], 'amount wording', 200),
            'number': number, 'currency': currency}


def filing_issuer(value):
    fields(value, ('name',), ('cik',))
    cik = value.get('cik')
    return {'name': text(value['name'], 'filed issuer name'), 'cik': normalize_cik(cik) if cik is not None else None}


def form_values(value):
    fields(value, ('form', 'primary_issuer', 'co_issuers', 'instruments', 'offered', 'sold'),
           ('first_sale', 'first_sale_pending', 'previous_accession'))
    form = value['form']
    if form not in ('D', 'D/A'):
        raise ValueError('Only Form D and D/A are supported')
    previous = value.get('previous_accession')
    if previous is not None:
        matching(previous, ACCESSION, 'previous accession')
        if form != 'D/A':
            raise ValueError('An original Form D cannot amend another filing')
    pending = value.get('first_sale_pending', False)
    observed = value.get('first_sale')
    if type(pending) is not bool or (pending and observed is not None):
        raise ValueError('Conflicting first sale fields')
    return {
        'form': form, 'previous_accession': previous,
        'primary_issuer': filing_issuer(value['primary_issuer']),
        'co_issuers': [filing_issuer(issuer) for issuer in items(value['co_issuers'], 'co-issuers')],
        'first_sale': date_observation(observed, full_day=True) if observed is not None else None,
        'first_sale_state': 'reported' if observed is not None else 'pending' if pending else 'unknown',
        'instruments': [text(x, 'instrument') for x in items(value['instruments'], 'instruments')],
        'offered': amount(value['offered']), 'sold': amount(value['sold']),
    }


def xml_text(root, path):
    nodes = root.findall(path)
    if len(nodes) > 1 or (nodes and len(nodes[0])):
        raise ValueError(f'Ambiguous Form D XML element: {path}')
    if not nodes:
        return None
    return (nodes[0].text or '').strip() or None


def xml_flag(root, path):
    value = xml_text(root, path)
    if value not in (None, 'true', 'false', '1', '0'):
        raise ValueError(f'Invalid Form D XML flag: {path}')
    return value in ('true', '1')


def form_xml(raw):
    document = raw.decode('utf-8-sig')
    if re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b', document, re.I):
        raise ValueError('Form D XML must not declare DTDs or entities')
    root = ElementTree.fromstring(document)
    for element in root.iter():
        element.tag = element.tag.rsplit('}', 1)[-1]
    if root.tag != 'edgarSubmission':
        raise ValueError('Expected an EDGAR primary XML document')
    if xml_text(root, 'testOrLive') == 'TEST':
        raise ValueError('An EDGAR test submission is not filing evidence')
    issuer = root.findall('primaryIssuer')
    if len(issuer) != 1:
        raise ValueError('Expected one primary issuer')

    def read_issuer(node):
        return {'cik': xml_text(node, 'cik'), 'name': xml_text(node, 'entityName')}

    co_issuers = []
    if any('coissuer' in node.tag.lower() and node.tag != 'coIssuerList' for node in root):
        raise ValueError('Unsupported co-issuer XML structure')
    for container in root.findall('coIssuerList'):
        if any(node.tag not in ('coIssuer', 'coIssuerInfo') for node in container):
            raise ValueError('Unsupported co-issuer XML structure')
        co_issuers.extend(read_issuer(node) for node in container)

    def read_amount(path):
        value = xml_text(root, 'offeringData/offeringSalesAmounts/' + path)
        if value is None:
            return None
        number = value if re.fullmatch(r'[0-9]{1,18}(?:\.[0-9]{1,6})?', value) else None
        return {'as_stated': value, 'number': number}

    securities = 'offeringData/typesOfSecuritiesOffered/'
    instruments = [label for flag, label in INSTRUMENTS.items() if xml_flag(root, securities + flag)]
    description = xml_text(root, securities + 'descriptionOfOtherType')
    if description:
        instruments.append(description)
    filing_type = 'offeringData/typeOfFiling/'
    return form_values({
        'form': xml_text(root, 'submissionType'),
        'primary_issuer': read_issuer(issuer[0]), 'co_issuers': co_issuers,
        'instruments': instruments,
        'offered': read_amount('totalOfferingAmount'), 'sold': read_amount('totalAmountSold'),
        'previous_accession': xml_text(root, filing_type + 'newOrAmendment/previousAccessionNumber'),
        'first_sale': xml_text(root, filing_type + 'dateOfFirstSale/value'),
        'first_sale_pending': xml_flag(root, filing_type + 'dateOfFirstSale/yetToOccur'),
    })


def form_archive(url, accession):
    parts = evidence_url(url)
    found = ARCHIVE.fullmatch(parts.path)
    if (parts.netloc != 'www.sec.gov' or parts.query or parts.fragment or not found
            or found[2] != accession.replace('-', '')):
        raise ValueError('Form D source URL must match the SEC accession directory')
    return normalize_cik(found[1])


def capture(root, raw_entry, revision):
    entry = fields(raw_entry, ('file', 'format', 'url', 'acquired_on', 'acquisition', 'sha256'),
                   ('accession', 'filed_on', 'filing_index_url'))
    relative = Path(text(entry['file'], 'relative saved filename'))
    path = (root / relative).resolve()
    if relative.is_absolute() or '..' in relative.parts or not path.is_relative_to(root):
        raise ValueError('Saved file must be within the manifest directory')
    evidence_url(entry['url'])
    acquired = date_observation(entry['acquired_on'], full_day=True)['value']
    if entry['acquisition'] not in ('saved_original', 'reviewed_public_excerpt'):
        raise ValueError('Unknown acquisition kind')
    raw = read_bytes(path)
    if matching(entry['sha256'], r'[a-f0-9]{64}', 'capture SHA-256') != sha256(raw).hexdigest():
        raise ValueError(f'Capture digest mismatch: {relative}')
    source = {**entry, 'catalogue_revision': revision}
    kind = entry['format']
    if kind == 'round_observations_json':
        if any(key in entry for key in ('accession', 'filed_on', 'filing_index_url')):
            raise ValueError('Investor and founder observations have their own sources')
        return source, load_json(raw)
    if kind not in ('sec_form_d_json', 'sec_form_d_xml'):
        raise ValueError('Unsupported saved format')
    accession = matching(entry.get('accession'), ACCESSION, 'accession')
    archive_cik = form_archive(entry['url'], accession)
    index = entry.get('filing_index_url')
    if (form_archive(index, accession) != archive_cik
            or Path(urlsplit(index).path).name != accession + '-index.html'):
        raise ValueError('Expected the matching SEC filing index URL')
    filed = date_observation(entry.get('filed_on'), full_day=True)
    if filed['value'] > acquired:
        raise ValueError('A filing date cannot postdate the saved capture')
    if kind == 'sec_form_d_xml' and entry['acquisition'] != 'saved_original':
        raise ValueError('XML requires an original saved document')
    parsed = form_xml(raw) if kind == 'sec_form_d_xml' else form_values(load_json(raw))
    return source, {**parsed, 'archive_cik': archive_cik, 'filed_on': filed,
                    'stage': None, 'participants': None, 'named_round_id': None}


def issuer_scope(filing, entities):
    issuer = filing['primary_issuer']
    cik, name = issuer['cik'], name_key(issuer['name'])
    names = {row['id']: {name_key(x) for x in [row['name'], *row['aliases']] if x}
             for row in entities.values()}
    matches = sorted(key for key, keys in names.items() if name in keys)
    exact = next((row for row in entities.values()
                  if row['registry'] == {'system': 'sec_cik', 'id': cik}), None)
    entity = exact['id'] if exact else None
    if exact and exact['role'] != 'operating_company':
        return 'excluded_entity', entity, matches
    if filing['co_issuers']:
        return 'excluded_co_issuers', entity, matches
    if 'Pooled Investment Fund Interests' in filing['instruments']:
        return 'excluded_pooled_fund', entity, matches
    if not exact:
        status = 'ambiguous_alias' if not cik and len(matches) > 1 else 'unresolved_issuer'
        return status, None, matches
    if cik != filing['archive_cik'] or name not in names[entity]:
        return 'issuer_conflict', entity, matches
    return 'resolved_issuer', entity, matches


def stage_observations(value, source, entities):
    for original in items(value, 'attributed observations'):
        row = fields(original, ('kind', 'status', 'detail'),
                     ('entity', 'stage', 'dates', 'participants'))
        if row['kind'] not in ('investor', 'founder', 'interview_summary', 'institutional'):
            raise ValueError('Unknown observation source kind')
        if row['status'] not in ('attributed', 'unresolved'):
            raise ValueError('Observations require an explicit review state')
        entity = row.get('entity')
        if entity is not None and (entity not in entities or entities[entity]['role'] == 'excluded_vehicle'):
            raise ValueError('Observation uses an unreviewed or excluded entity')
        stage = row.get('stage')
        if stage is not None:
            text(stage, 'source-stated stage', 100)
        dates = {key: date_observation(value) for key, value in fields(
            row.get('dates', {}), (), ('reported', 'announced', 'closed')).items()}
        members = row.get('participants')
        if members is not None:
            for participant in items(members, 'source-stated participants'):
                fields(participant, ('name', 'role'))
                text(participant['name'], 'source-stated participant')
                if participant['role'] not in ('lead', 'participant'):
                    raise ValueError('Unknown participant role')
        yield {'kind': row['kind'], 'status': row['status'], 'stage': stage, 'entity': entity,
               'dates': dates, 'participants': members, 'detail': text(row['detail'], 'evidence detail', 2000),
               'source': source}


def offering_root(filing, by_accession):
    current, seen = filing, set()
    while current['form'] == 'D/A':
        accession = current['accession']
        if accession in seen:
            return None, 'cyclic_lineage'
        seen.add(accession)
        previous = by_accession.get(current['previous_accession'])
        if previous is None:
            return None, 'missing_previous_filing'
        if (previous['issuer_state'] != 'resolved_issuer' or previous['entity'] != filing['entity']
                or previous['filed_on']['value'] > current['filed_on']['value']):
            return None, 'lineage_conflict'
        current = previous
    return current['accession'], 'linked' if seen else 'original'


def stage_offerings(filings):
    by_accession = {x['accession']: x for x in filings}
    if len(by_accession) != len(filings):
        raise ValueError('Duplicate SEC accession in the saved batch')
    grouped = {}
    for filing in filings:
        if filing['issuer_state'] != 'resolved_issuer':
            filing['lineage_state'] = 'outside_resolved_issuer'
            continue
        root, state = offering_root(filing, by_accession)
        filing['lineage_state'] = state
        if root is not None:
            grouped.setdefault(root, []).append(filing)
    offerings = []
    for root, chain in sorted(grouped.items()):
        chain.sort(key=lambda row: (row['filed_on']['value'], row['accession']))
        parents = {row['previous_accession'] for row in chain}
        leaves = [row['accession'] for row in chain if row['accession'] not in parents]
        # The report points to one saved statement. The source totals are never added.
        offerings.append({'original_accession': root, 'entity': by_accession[root]['entity'],
                          'accessions': [row['accession'] for row in chain],
                          'lineage_state': 'single_chain' if len(leaves) == 1 else 'branch_conflict',
                          'latest_in_saved_chain': leaves[0] if len(leaves) == 1 else None})
    return offerings


def stage(manifest_path):
    path = manifest_path.resolve()
    raw = read_bytes(path)
    manifest = fields(load_json(raw), ('version', 'catalogue_revision', 'startup_id', 'legal_entities', 'inputs'))
    if type(manifest['version']) is not int or manifest['version'] != 1:
        raise ValueError('Expected version 1 manifest')
    revision = matching(manifest['catalogue_revision'], r'[a-f0-9]{40}', 'catalogue revision')
    startup = matching(manifest['startup_id'], r'startup:[a-z0-9]+(?:-[a-z0-9]+)*', 'startup ID')
    entities = legal_entities(manifest['legal_entities'])
    filings, observations, sources = [], [], []
    for entry in items(manifest['inputs'], 'saved inputs'):
        source, result = capture(path.parent, entry, revision)
        sources.append(source)
        if source['format'] == 'round_observations_json':
            observations.extend(stage_observations(result, source, entities))
            if len(observations) > MAX_ITEMS:
                raise ValueError(f'Batch exceeds {MAX_ITEMS} attributed observations')
        else:
            state, entity, matches = issuer_scope(result, entities)
            filings.append({**result, 'accession': source['accession'], 'source': source, 'issuer_state': state,
                            'entity': entity, 'alias_candidates': matches})
    offerings = stage_offerings(filings)
    return {'version': 1, 'offline': True, 'publication_state': 'review_only',
            'catalogue_revision': revision, 'manifest_sha256': sha256(raw).hexdigest(), 'startup_id': startup,
            'legal_entities': list(entities.values()), 'filings': filings, 'offerings': offerings,
            'observations': observations,
            'coverage': {'saved_inputs': len(sources), 'filings': len(filings), 'attributed_observations': len(observations),
                         'issuer_states': dict(Counter(row['issuer_state'] for row in filings)),
                         'lineage_states': dict(Counter(row['lineage_state'] for row in filings)),
                         'source_population': 'unknown'}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(stage(args.manifest), ensure_ascii=False, indent=2))
    except (OSError, ValueError, ElementTree.ParseError) as exc:
        parser.exit(1, f'Early investment evidence: {exc}\n')


if __name__ == '__main__':
    main()
