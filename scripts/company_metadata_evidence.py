"""Evidence checks for the offline company metadata review queue."""
from datetime import date
import re
from urllib.parse import urlsplit, urlunsplit

try:
    from .plan_company_profiles import website_host
    from .replay_company_profiles import utc
    from .stage_early_investments import fields, matching, text
except ImportError:
    from plan_company_profiles import website_host
    from replay_company_profiles import utc
    from stage_early_investments import fields, matching, text


INTERPRETED_FIELDS = {'founder_bios', 'founder_roles', 'headcount', 'round_participants'}
PARTICIPATION_PREFIXES = {
    'lead': ('led by ', 'lead: ', 'leads: '),
    'participant': ('with participation from ', 'other named participants: ',
                    'named participants: ', 'the round also included participation from '),
}


def site_url(value):
    host = website_host(value)
    if not host or host == 'localhost' or host.endswith('.local') or '\\' in value:
        return None
    parts = urlsplit(value)
    return urlunsplit(('https', host, parts.path or '/', parts.query, ''))


def source_url(value):
    text(value, 'evidence source URL', 2048)
    if not site_url(value):
        raise ValueError('Evidence requires a public HTTPS source URL')
    return value


def reviewed_at(value, as_of):
    parsed = utc(value)
    if parsed.strftime('%Y-%m-%dT%H:%M:%SZ') != value or parsed > utc(as_of):
        raise ValueError('Evidence retrieval time must be UTC and at or before the batch review')


def receipt_context(value, name, revision):
    if type(value['version']) is not int or value['version'] != 1 or value['name'] != name or value['revision'] != revision:
        raise ValueError('Evidence receipt must identify the exact startup record and revision')


def startup_index(graph, revision):
    if (not isinstance(graph, dict) or type(graph.get('version')) is not int or graph['version'] != 1
            or graph.get('source_revision') != revision or not isinstance(graph.get('entities'), list)):
        raise ValueError('Identity requires a graph snapshot with the exact source revision')
    startups = {}
    for row in graph['entities']:
        if not isinstance(row, dict):
            raise ValueError('Malformed identity snapshot entity')
        if row.get('kind') != 'startup':
            continue
        key = matching(row.get('id'), r'startup:[a-z0-9]+(?:-[a-z0-9]+)*', 'canonical startup ID')
        if key in startups:
            raise ValueError('Duplicate canonical startup ID in the identity snapshot')
        startups[key] = (text(row.get('name'), 'canonical startup name', 256), site_url(row.get('website')))
    return startups


def canonical_startup(name, official_site, startups):
    candidates = [(key, label, site) for key, (label, site) in startups.items() if label.casefold() == name.casefold()]
    if len(candidates) != 1 or candidates[0][1] != name:
        raise ValueError('Missing or ambiguous canonical startup identity in the graph snapshot')
    startup_id, _, site = candidates[0]
    if not site or site_url(official_site) != site:
        raise ValueError('Canonical startup website must match the reviewed overlay website')
    if sum(home == site for _, home in startups.values()) != 1:
        raise ValueError('Canonical startup website is shared by multiple graph identities')
    return startup_id, site


def reviewed_alias(value, name, revision, as_of, startup_id, canonical_site, startups):
    fields(value, ('version', 'name', 'revision', 'startup_id', 'alias_name', 'alias_website',
                   'source_url', 'retrieved_at', 'support'))
    receipt_context(value, name, revision)
    alias = text(value['alias_name'], 'alternate startup name', 256)
    alias_website = source_url(value['alias_website'])
    alternate = site_url(alias_website)
    source = source_url(value['source_url'])
    support = text(value['support'], 'alternate identity evidence', 1500).casefold()
    reviewed_at(value['retrieved_at'], as_of)
    if (value['startup_id'] != startup_id or website_host(source) != website_host(canonical_site)
            or (alias, alternate) == (name, canonical_site) or name.casefold() not in support
            or alias.casefold() not in support or (alternate != canonical_site and alias_website.casefold() not in support)):
        raise ValueError('Alternate startup identity needs explicit matching reviewed official evidence')
    if any(key != startup_id and (label.casefold() == alias.casefold() or home == alternate)
           for key, (label, home) in startups.items()):
        raise ValueError('Alternate startup identity conflicts with another graph record')
    return alias, alternate


def validate_search_log(value, name, dimension, revision, as_of):
    fields(value, ('version', 'name', 'revision', 'dimension', 'attempts'))
    receipt_context(value, name, revision)
    attempts = value['attempts']
    if value['dimension'] != dimension or not isinstance(attempts, list) or not 1 <= len(attempts) <= 20:
        raise ValueError('Searched-unknown needs a bounded search log for the exact field')
    seen = set()
    for attempt in attempts:
        fields(attempt, ('url', 'query', 'retrieved_at', 'outcome', 'evidence'))
        url = source_url(attempt['url'])
        query = text(attempt['query'], 'search query or page inspection scope', 500)
        retrieved = attempt['retrieved_at']
        reviewed_at(retrieved, as_of)
        text(attempt['evidence'], 'bounded search result evidence', 1500)
        if attempt['outcome'] != 'no_supported_value' or name.casefold() not in query.casefold():
            raise ValueError('Searched-unknown needs a completed, company-specific search with no supported value')
        key = (url, query, retrieved)
        if key in seen:
            raise ValueError('Duplicate searched-unknown attempt')
        seen.add(key)


def founder_subject(readback, person_id):
    matching(person_id, r'person:[a-z0-9]+(?:-+[a-z0-9]+)*', 'published founder ID')
    people = [row for row in readback['related_entities']
              if row.get('id') == person_id and row.get('kind') == 'person']
    if len(people) != 1 or not any(
        row.get('kind') == 'founded' and row.get('from') == person_id and row.get('to') == readback['startup']['id']
        for row in readback['relationships']
    ):
        raise ValueError('Published person must have a founded relationship to this startup')
    text(people[0].get('name'), 'published founder name')
    return people[0]


def round_names_participant(note, support, participant, role):
    if not isinstance(note, str) or support not in note:
        return False
    marker = next((prefix for prefix in PARTICIPATION_PREFIXES.get(role, ())
                   if support.casefold().startswith(prefix)), None)
    if marker is None:
        return False
    start = note.index(support)
    intro = note[:start].rstrip()
    after = note[start + len(support):]
    if after and not after.startswith((',', '.', ';', ' and ', ' (')):
        return False
    # A quoted fragment about a different investment can also say "with participation from".
    at_round_clause = not intro or intro.endswith(('.', ';'))
    if marker == 'with participation from ' and intro:
        at_round_clause = (intro.casefold().startswith('led by ') and intro.endswith(',')
                           and not re.search(r'[.;]', intro))
    names = support[len(marker):]
    return at_round_clause and re.search(
        r'(?:^|,\s+|\band\s+)' + re.escape(participant) + r'(?=$|[,.;]$|,\s+|\s+and\s+|\s*\()',
        names, re.I
    ) is not None


def validate_publication_claim(claim, name, dimension, path, selected, readback, canonical_site, revision, as_of):
    fields(claim, ('version', 'name', 'revision', 'dimension', 'public_path', 'subject_id',
                   'source_url', 'retrieved_at', 'value', 'support'))
    receipt_context(claim, name, revision)
    if claim['dimension'] != dimension or claim['public_path'] != path:
        raise ValueError('Publication claim must match the exact field and readback path')
    source = source_url(claim['source_url'])
    reviewed_at(claim['retrieved_at'], as_of)
    support = text(claim['support'], 'claim evidence', 1500)
    subject = text(claim['subject_id'], 'publication claim subject ID')
    value = claim['value']
    if dimension == 'founder_bios':
        fields(value, ('bio_url', 'title'))
        person = founder_subject(readback, subject)
        title = text(value['title'], 'source biography title')
        if (person != readback['related_entities'][path[1]] or value['bio_url'] != selected or source != selected
                or site_url(source) in (canonical_site, site_url(readback['startup'].get('website')))
                or person['name'].casefold() not in title.casefold()
                or person['name'].casefold() not in support.casefold()):
            raise ValueError('Published founder bio needs same-person evidence from the linked biography')
        return
    if dimension == 'round_participants':
        fields(value, ('name', 'role'))
        round_row = readback['funding_rounds'][path[1]]
        participant = text(value['name'], 'source-named round participant')
        role = text(value['role'], 'source-reported participation role')
        if (round_row.get('id') != subject or source != round_row.get('source')
                or not round_names_participant(selected, support, participant, role)):
            raise ValueError('Published round participant needs an explicit matching source-attributed round clause')
        return

    if (not isinstance(selected, dict) or source != selected.get('source')
            or not isinstance(selected.get('value'), str) or support not in selected['value']):
        raise ValueError('Publication evidence must quote the exact selected, sourced profile fact')
    if dimension == 'founder_roles':
        fields(value, ('role',))
        person = founder_subject(readback, subject)
        role = text(value['role'], 'source-reported founder role')
        phrase = f"{person['name']} as {role}"
        if (phrase.casefold() not in support.casefold()
                or not re.search(re.escape(phrase) + r'(?=[,.;]|$)', selected['value'], re.I)):
            raise ValueError('Published founder role must be attributed to the cited founder')
    else:
        fields(value, ('as_of', 'scope', 'measure', 'as_stated'))
        day = matching(value['as_of'], r'[0-9]{4}-[0-9]{2}-[0-9]{2}', 'headcount observation date')
        observed = date.fromisoformat(day)
        human_date = f'{observed.day} {observed:%B %Y}'
        scope = text(value['scope'], 'headcount scope')
        measure = matching(value['measure'], r'people|employees|staff|workers', 'headcount measure')
        amount = text(value['as_stated'], 'headcount as stated')
        quantity = (r'(?<![\w,.])((?:(?:more than|over|at least|up to|around|about|approximately|nearly)\s+)?'
                    r'\d[\d,]*(?:\s*(?:to|[-–])\s*\d[\d,]*)?)\s+' + measure + r'\b')
        quantities = re.findall(quantity, selected['value'], re.I)
        if (subject != readback['startup']['id'] or observed > utc(claim['retrieved_at']).date()
                or len(quantities) != 1 or quantities[0].casefold() != amount.casefold()
                or f'{amount} {measure}'.casefold() not in support.casefold()
                or scope.casefold() not in support.casefold()
                or not any(rendered in support for rendered in (day, human_date))):
            raise ValueError('Published headcount needs the cited number, scope and observation date')
