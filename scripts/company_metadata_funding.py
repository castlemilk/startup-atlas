"""Prioritize early financing leads in saved evidence for offline review."""

from collections import defaultdict
import json
import re

try:
    from .company_metadata_evidence import site_url, source_url
    from .plan_company_profiles import digest, read_input, website_host
    from .stage_early_investments import date_observation, fields, load_json, name_key, read_bytes, text
except ImportError:
    from company_metadata_evidence import site_url, source_url
    from plan_company_profiles import digest, read_input, website_host
    from stage_early_investments import date_observation, fields, load_json, name_key, read_bytes, text


EARLY_TERMS = ('pre-seed', 'seed funding', 'seed round', 'early investment')
EARLY = re.compile(r'\b(?:pre[- ]?seed|seed)[ -]+(?:funding|financing|investment|round)\b', re.I)
SERIES = re.compile(r'\bseries\s+[a-h]\b', re.I)
FINANCING_ROUND = re.compile(r'\b(?:financing|funding|investment)\s+round\b', re.I)
CONTEXT = {
    'grant_or_public_support': re.compile(r'\b(?:grants?|public support|government award)\b', re.I),
    'commercial_contract': re.compile(r'\bcontracts?\b', re.I),
    'valuation': re.compile(r'\bvaluations?\b', re.I),
    'debt_or_secondary': re.compile(r'\b(?:venture debt|secondary (?:sale|transaction)|tender offer)\b', re.I),
}
PROSPECTIVE = re.compile(r'\b(?:seeking|plans to raise|did not raise|no seed funding)\b', re.I)
BACKING = re.compile(r'\b(?:portfolio|back(?:ed|ing|ers?)|invest(?:ors?|ments?)|participat\w*|led by)\b', re.I)
BUCKETS = ('early_round_lead', 'mixed_financing_lead', 'round_lead', 'context', 'unmatched')


def includes_name(passage, normalized_name):
    return bool(normalized_name) and f' {normalized_name} ' in f' {name_key(passage)} '


def former_names(aliases, current, host, owners, evidence):
    if not isinstance(aliases, list) or len(aliases) > 4:
        raise ValueError('Expected at most four reviewed former names')
    names = []
    for alias in aliases:
        fields(alias, ('name', 'evidence_id'))
        label = text(alias['name'], 'former name', 256)
        key = name_key(label)
        artifact = evidence.get((current, text(alias['evidence_id'], 'alias evidence ID', 64)))
        if artifact is None:
            raise ValueError('Former name requires evidence from the committed alias review')
        support = text(artifact['support'], 'former-name evidence', 1500)
        if (not key or key in owners or website_host(artifact['source_url']) != host
                or not includes_name(support, key) or not includes_name(support, name_key(current))):
            raise ValueError('Former name is ambiguous or lacks support from the reviewed issuer site')
        owners.add(key)
        names.append({**alias, **artifact})
    return sorted(names, key=lambda item: item['name'])


def classify(excerpt, names):
    # Keep financing language tied to a named subject in the saved excerpt.
    sentences = re.split(r'(?<=[.!?])\s+', excerpt)
    matching = [part for part in sentences if any(includes_name(part, name) for name in names)]
    if not matching:
        return 'unmatched', []
    subjects = ' '.join(matching)
    round_sentences = [part for part in matching if not PROSPECTIVE.search(part)]
    early = any(EARLY.search(part) for part in round_sentences)
    round_mention = early or any(
        SERIES.search(part) or (FINANCING_ROUND.search(part)
                                and not any(pattern.search(part) for pattern in CONTEXT.values()))
        for part in round_sentences
    )
    context = [label for label, pattern in CONTEXT.items() if pattern.search(excerpt)]
    if PROSPECTIVE.search(subjects):
        context.append('prospective_or_negated')
    signals = (['early_stage_mention'] if early else []) + context
    if round_mention:
        signals.insert(0, 'round_mention')
        if context:
            return 'mixed_financing_lead', signals
        return ('early_round_lead' if early else 'round_lead'), signals
    if BACKING.search(subjects):
        signals.append('backing_context')
    return ('context' if signals else 'unmatched'), signals


def saved_results(captures, host, names):
    if not isinstance(captures, list) or len(captures) > 32:
        raise ValueError('Expected at most 32 saved captures per company')
    documents = defaultdict(dict)
    for capture in captures:
        fields(capture, ('url', 'excerpt', 'acquisition', 'retrieved_on'), ('dates',))
        url = source_url(capture['url'])
        excerpt = text(capture['excerpt'], 'saved excerpt', 1500)
        acquisition = capture['acquisition']
        if acquisition not in ('page_excerpt', 'reviewer_paraphrase', 'search_result'):
            raise ValueError('Expected saved page, reviewer paraphrase or search result provenance')
        date_observation(capture['retrieved_on'], full_day=True)
        dates = fields(capture.get('dates', {}), (), ('published', 'announced', 'closed'))
        if dates and acquisition == 'search_result':
            raise ValueError('Date observations require saved document evidence')
        bucket, signals = classify(excerpt, names)
        observation = {**capture, 'bucket': bucket, 'signals': signals}
        if dates:
            observation['dates'] = {label: date_observation(day) for label, day in dates.items()}
        # Collapse repeated URL hits while keeping distinct captures and source assertions.
        documents[site_url(url)][observation_key(observation)] = observation

    results = []
    for url, observations in documents.items():
        ordered = sorted(observations.values(), key=lambda item: (
            BUCKETS.index(item['bucket']), item['acquisition'] == 'search_result', observation_key(item),
        ))
        results.append({'url': url, 'on_issuer_host': website_host(url) == host,
                        'bucket': ordered[0]['bucket'], 'observations': ordered, 'review_required': True})
    return sorted(results, key=lambda item: (
        BUCKETS.index(item['bucket']), item['observations'][0]['acquisition'] == 'search_result',
        not item['on_issuer_host'], item['url'],
    ))


def observation_key(value):
    # A stable key preserves distinct provenance even if their text agrees.
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def next_action(fields):
    early = fields['early_financing']
    if 'conflict' in (early, fields['rounds']):
        return 'reconcile_financing_sources'
    if early in ('unsearched', 'searched_unknown'):
        return 'search_early_history'
    if early == 'candidate':
        return 'review_saved_leads'
    return early


def prepare_funding_review(report, overlay, manifest_path, alias_evidence):
    raw = read_bytes(manifest_path)
    request = fields(load_json(raw), ('version', 'revision', 'plan_id', 'companies'))
    if (type(request['version']) is not int or request['version'] != 1
            or any(request[key] != report[key] for key in ('revision', 'plan_id'))):
        raise ValueError('Funding review must match the exact inventory plan and revision')
    overlay_bytes = read_input(overlay)
    if digest(overlay_bytes) != report['input_hashes']['overlay_sha256']:
        raise ValueError('Funding review overlay bytes have changed')
    sites = {row['name']: row.get('website') for row in load_json(overlay_bytes)['startups']}
    rows = {row['name']: row for row in report['queue']}
    owners = {name_key(name) for name in rows}
    companies = request['companies']
    if not isinstance(companies, list) or not 1 <= len(companies) <= 4:
        raise ValueError('Funding review accepts one to four companies')
    entries = {}
    for company in companies:
        fields(company, ('name', 'captures'), ('former_names',))
        name = text(company['name'], 'funding review company', 256)
        row = rows.get(name)
        if name in entries or not row or row['fields']['identity'] not in ('reviewed', 'published'):
            raise ValueError('Funding review needs one exact, reviewed company identity per entry')
        host = website_host(site_url(row.get('website') or sites.get(name)))
        if not host:
            raise ValueError('Funding review needs the reviewed official website')
        aliases = former_names(company.get('former_names', []), name, host, owners, alias_evidence)
        action = next_action(row['fields'])
        searches = []
        if action == 'search_early_history':
            searches = [{'name': name, 'site': host, 'terms': EARLY_TERMS}]
            searches.extend({'name': alias['name'], 'terms': EARLY_TERMS, 'identity_source': alias['source_url']}
                            for alias in aliases)
        captures = company['captures']
        results = saved_results(captures, host, [name_key(name), *(name_key(alias['name']) for alias in aliases)])
        entries[name] = {
            'name': name, 'official_host': host, 'action': action, 'searches': searches,
            'prior_rounds': row['fields']['rounds'], 'prior_early_financing': row['fields']['early_financing'],
            'former_names': aliases, 'captures': len(captures), 'repeated_url_hits': len(captures) - len(results),
            'unique_urls_by_bucket': {bucket: sum(result['bucket'] == bucket for result in results) for bucket in BUCKETS},
            'results': results,
        }
    return {'manifest_sha256': digest(raw), 'external_source_population': 'unknown',
            'review_required': True, 'companies': [entries[name] for name in sorted(entries)]}
