"""Prioritize early financing leads in saved evidence for offline review."""

from collections import defaultdict
import json
import re
from urllib.parse import urlsplit

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
SERIES = re.compile(r'\bseries\s+[a-h]\b(?![\s—–:-]+(?:products?|models?|editions?)\b)', re.I)
FINANCING_ROUND = re.compile(r'\b(?:financing|funding|investment)\s+round\b', re.I)
NAMED_FUND = r'(?:the\s+)?(?:[\w-]+\s+){1,8}fund'
FUND_AWARD = rf'award(?:ed)?\s+(?:by|from|through)\s+{NAMED_FUND}'
CONTEXT = {
    'grant_or_public_support': re.compile(rf'\b(?:grants?|public support|government awards?|{FUND_AWARD})\b', re.I),
    'commercial_contract': re.compile(r'\bcontracts?\b', re.I),
    'valuation': re.compile(r'\bvaluations?\b', re.I),
    'debt_or_secondary': re.compile(
        r'\b(?:venture debt|secondary (?:share )?(?:sales?|transactions?|transfers?)|tender offer)\b', re.I,
    ),
}
CLAUSE_BREAK = re.compile(
    r'(?<=[.!?;])\s+|\s+(?:and|but)\s+'
    r'(?=(?:(?:also|separately)\s+)*(?:received|won|secured|was awarded)\b)'
    r'|\s+alongside\s+(?=(?:(?![.!?;](?:\s|$)).)*\bgrants?\b)',
    re.I,
)
PROSPECTIVE = re.compile(
    r'\b(?:seeking|(?:plans|expects) to (?:raise|close)|did not raise|no seed funding'
    r'|not yet|yet to (?:raise|close)|only if)\b', re.I,
)
# These words connect an actor or its statement to a round label. Amount and
# currency tokens are used only for proximity and stay in the original excerpt.
CURRENCY = r'(?:aud|usd|eur|gbp|cad|au|us)'
SCALED_TL_AMOUNT = r'[0-9]+ (?:thousand|million|billion) tl'
ROUND_MODIFIERS = (
    r'(?: (?:a|an|the|its|another|new|additional|planned|oversubscribed|at least'
    rf'|about|over|more than|up to|in|of|{CURRENCY}|{SCALED_TL_AMOUNT}'
    rf'|million|billion|thousand|{CURRENCY}?\d+[kmb]?))*'
)
ROUND_ACTION = r'(?:raised|raises|received|receives|secured|secures|closed|closes|completed|completes)'
REPORT_ACTION = r'(?:announced|announces|reported|reports)'
ISSUER_ACTION = re.compile(
    r'(?:launched in [0-9]{4} with|s|(?:(?:has|had|today|recently) )*'
    rf'(?:{ROUND_ACTION}|{REPORT_ACTION}(?: (?:that )?it (?:has |had )?{ROUND_ACTION})?))'
    + ROUND_MODIFIERS
)
ISSUER_APPOSITION = re.compile(
    r',\s+(?:an?|the)\s+(?:[\w-]+\s+){0,6}'
    r'(?:company|start[- ]?up|provider|developer|manufacturer|supplier|firm|spin[- ]?out|leader|platform)'
    r'(?:\s+(?:of|in|for|developing)\s+(?:[\w-]+\s+){0,24}[\w-]+)?\s*,',
    re.I,
)
ISSUER_BOUNDARY = re.compile(
    rf'[,)]\s*(?=(?:(?:has|had|today|recently)\s+)*(?:{ROUND_ACTION}|{REPORT_ACTION})\b)',
    re.I,
)
ISSUER_RELEASE = re.compile(
    r'(?:news )?release (?:says|said|reports|reported)(?: that)?' + ROUND_MODIFIERS
)
# Keep common company suffixes with any condition or question that follows them.
ISSUER_FINANCIAL_BREAK = re.compile(r'(?<=[.!?;])(?<!\b(?:Inc|Ltd)\.)(?<!\bCo\.)\s+', re.I)
ISSUER_FINANCIAL_DATELINE = re.compile(
    r'^(?:[A-Z][A-Z -]{1,40}, ){1,2}[A-Z][a-z]{2,8} [0-9]{1,2}, (?:19|20)[0-9]{2} [—–-] '
)
ISSUER_ROUND_DATELINE = re.compile(
    r'^(?:\[[A-Z][a-z]{2,8} [0-9]{1,2}, (?:19|20)[0-9]{2} [—–-] [A-Z][A-Za-z -]{1,40}\]'
    r'|[A-Z][A-Z -]{1,40}--\(BUSINESS WIRE\)--) '
)
ISSUER_NAME = r"\w[\w &'’.-]{0,119}?"
# The coordinated platform descriptor is attested for this issuer in both release versions.
ISSUER_TODAY_REPORT = re.compile(
    rf'(?:(?P<described_issuer>Culture Amp), the People & Culture Platform,|(?P<issuer>{ISSUER_NAME}))'
    r' announced today (?:that )?it has raised'
    r'(?P<terms>(?: [\w$-]+(?:[.,][\w$-]+)*){1,24})[.!]',
    re.I,
)
ISSUER_ROUND_TERMS = re.compile(
    ROUND_MODIFIERS + rf' (?P<series>{SERIES.pattern})(?: (?:funding round|round(?: of funding)?))?'
)
CUSTOMER_NAME = r'(?-i:[A-Z][\w&-]{0,39}(?: [A-Z][\w&-]{0,39}){0,3})'
WIRE_SERIES_FUNDING = rf'(?P<terms>(?: [\w$-]+(?:[.,][\w$-]+)*){{0,24}} {SERIES.pattern} funding(?: round)?)'
# Keep the customer list inside the named issuer's relative clause.
ISSUER_CUSTOMER_REPORT = re.compile(
    r'(?:(?-i:[A-Z][A-Z -]{1,40}, [A-Z][a-z]{2,8} [0-9]{1,2}, (?:19|20)[0-9]{2}) /PRNewswire/ -- )?'
    rf'(?:People Analytics company )?(?P<issuer>{ISSUER_NAME}), which counts {CUSTOMER_NAME}'
    rf'(?:, {CUSTOMER_NAME}){{0,6}}(?:,? and {CUSTOMER_NAME})? among (?:its customers|the companies using its platform),'
    rf' (?:today )?announced (?:that )?it has (?:closed|raised|secured){WIRE_SERIES_FUNDING}[.!]',
    re.I,
)
# The headline already qualifies through legacy matching. Use this form only to bind a correction.
ISSUER_FUNDING_HEADLINE = re.compile(
    rf'(?P<issuer>{ISSUER_NAME}) secures{WIRE_SERIES_FUNDING}(?: to grow culture-first companies)?[.!]',
    re.I,
)
ISSUER_WIRE_TERMS = re.compile(
    r'(?!.*\bplanned\b)' + ROUND_MODIFIERS + rf' (?P<series>{SERIES.pattern}) funding(?: round)?'
)
ISSUER_FIRST_PERSON_REPORT = re.compile(
    r'(?:It is with this success that )?I am proud to announce our(?: latest)?'
    rf'(?P<terms>(?: [\w$-]+(?:[.,][\w$-]+)*){{0,24}} {SERIES.pattern} funding round)[.!]',
    re.I,
)
CORRECTION_DETERMINERS = r'a|an|any|the|that'
CORRECTION_SERIES = rf'(?P<series>{SERIES.pattern})(?: (?:funding(?: round)?|round(?: of funding)?))?'
ISSUER_ROUND_CORRECTION = re.compile(
    rf'(?P<issuer>{ISSUER_NAME}) (?:did not raise|has not (?:actually )?raised) '
    rf'(?:(?:(?:{CORRECTION_DETERMINERS}|its) )?{CORRECTION_SERIES}|the funding)[.!]',
    re.I,
)
ISSUER_FIRST_PERSON_CORRECTION = re.compile(
    r"(?:I misspoke: )?we (?:(?:did not|didn['’]t) (?:actually )?raise"
    r"|(?:have not|haven['’]t) (?:actually )?raised) "
    rf'(?:(?:(?:{CORRECTION_DETERMINERS}|our) )?{CORRECTION_SERIES}|the funding)[.!]',
    re.I,
)
ISSUER_ARR = (
    r'(?:reach(?:es|ed)|surpass(?:es|ed)) (?:over |more than )?'
    r'(?:US)?\$[0-9]+(?:\.[0-9]+)?(?: ?(?:million|billion|[mb]))? in '
    r'(?:annual recurring revenue(?: \(ARR\))?|ARR)'
)
ISSUER_STRATEGIC_INVESTMENT = (
    r'(?:receiv(?:es|ed)|secur(?:es|ed)) (?:a )?strategic investment from '
    r'(?!\b(?:a|an|another|its|our|their) )'
    r'(?!.*\b(?:for|to|into|on behalf of|if|unless|pending|subject to|provided that)\b)'
    r'(?-i:[A-Z][\w&-]*(?: [A-Z][\w&-]*){0,7})'
)
ISSUER_FINANCIAL_CONTEXT = re.compile(
    r"(?P<issuer>[\w &'’.-]{1,120}?) (?:(?:(?-i:today) )?announced (?:that )?it has )?"
    rf'(?:(?P<arr>{ISSUER_ARR})(?: and (?P<paired>{ISSUER_STRATEGIC_INVESTMENT}))?'
    rf'|(?P<investment>{ISSUER_STRATEGIC_INVESTMENT}))[.!]?',
    re.I,
)
AMOUNT = rf'(?:(?:{CURRENCY}|a) ?)?\d+(?: \d+){{0,3}}(?: ?(?:[kmb]|thousand|million|billion))?'
COMMERCE = r'(?:washington d c )?(?:the )?(?:u s )?(?:department of )?commerce'
CHIPS_INTENT_FRAME = re.compile(
    rf'{COMMERCE} (?:today )?(?:signed|announced (?:today )?the signing of) '
    rf'(?:\d{{1,2}} )?letters? of intent(?: to provide {AMOUNT} in federal incentives)? under the chips and science act'
)
CHIPS_PLANNED_RECIPIENT = re.compile(
    rf'(?P<recipient>[\w ]{{1,120}}) will receive (?:up to )?{AMOUNT} in planned funding(?: to [\w ]+)?'
)
CHIPS_SIGNED_RECIPIENT = re.compile(
    rf'{COMMERCE} (?:signed|announced (?:today )?the signing of) a final award of up to {AMOUNT} '
    r'to (?P<recipient>[\w ]{1,120}) under the chips and science act'
)
# Keep these dotted US references attached until the question check.
CHIPS_STATEMENT_BREAK = re.compile(
    r'(?<=[.!?;])(?!(?<=\bU\.S\.)\s+(?:department\s+of\s+commerce|production\s+of\s+its)\b)\s+',
    re.I,
)
CHIPS_ISSUER_APPOSITION = re.compile(
    r'^(?P<subject>[^,]{1,140}),\s+(?:an?|the)\s+(?:[\w-]+\s+){0,6}pioneer\s*,\s*', re.I,
)
CHIPS_AGENCY = r'(?:the )?(?:(?:u s|us) )?department of commerce'
CHIPS_ACT = r'(?:the )?chips (?:and science )?act'
CHIPS_ISSUER_INTENT = re.compile(
    rf'(?P<recipient>[\w ]{{1,120}}) (?:'
    rf'sign(?:s|ed) {AMOUNT} letter of intent with {CHIPS_AGENCY} under {CHIPS_ACT}'
    rf'|today announced (?:that )?it has signed a letter of intent(?: loi)? with {CHIPS_AGENCY}'
    rf' for up to {AMOUNT} in proposed federal funding from (?:the )?chips research and development office'
    rf'|has (?:also )?secured a letter of intent for {AMOUNT} from {CHIPS_AGENCY} under {CHIPS_ACT}'
    r'(?: to support (?:u s|us) production of its (?:\w+ ){0,6}(?:computers|processors))?)'
)
ROUND_SUFFIX = r'(?:(?:(?:funding|financing|investment) )?round )?'
SCOPED_CONTEXT_SUFFIX = re.compile(
    ROUND_SUFFIX
    + rf'(?:at (?:(?:an?|its) )?(?:{AMOUNT} (?:post money |pre money )?valuation'
    rf'|(?:post money |pre money )?valuation of {AMOUNT})'
    rf'|plus (?:(?:an?|the) )?(?:(?:separate|additional|further) )?(?:{AMOUNT} )?'
    rf'(?:{FUND_AWARD}|(?:public |government )?grant(?: (?:by|from) {NAMED_FUND})?))'
)
REPORTED_COMPLETION = re.compile(r'(?:(?:was|has been|had been) )?(?:completed|closed|announced)\b')
ROUND_COMPLETION = re.compile(r'(?:(?:was|has been|had been) )?(?:completed|closed)\b')
EXTERNAL_ROUND_PURPOSE = re.compile(
    r'^(?:for\b|on behalf of\b|(?:investment|funding|financing) in\b|to (?:finance|fund|support|back)\b)'
)
INVESTMENT_MONTH_QUALIFIER = re.compile(
    r'\s+in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)'
    r'\s+(?:19|20)[0-9]{2}[.;]?\s*',
    re.I,
)
RECEIPT_ACTION = re.compile(r'\breceiv(?:ed|es)\b')
LEAD_ACTION = re.compile(r'\bled' + ROUND_MODIFIERS + r'$')
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


def associated_round(clause, mention, names):
    subject = clause[:mention.start()]
    tail = clause[mention.end():]
    suffix = name_key(tail)
    if any(pattern.search(subject) for pattern in CONTEXT.values()):
        return False
    # Check the full tail so a valuation or award cannot hide another issuer.
    if any(pattern.search(tail) for pattern in CONTEXT.values()) and not SCOPED_CONTEXT_SUFFIX.fullmatch(suffix):
        return False
    investment_in = mention.group().casefold().endswith('investment') and (suffix == 'in' or suffix.startswith('in '))
    if investment_in and not INVESTMENT_MONTH_QUALIFIER.fullmatch(tail):
        return False
    # A company inside another actor's unresolved aside cannot own the next verb.
    prefix = name_key(ISSUER_BOUNDARY.split(ISSUER_APPOSITION.sub(' ', subject))[-1])
    for name in names:
        if suffix == f'for {name}' and LEAD_ACTION.search(prefix):
            return True
        _, found, after_name = f' {prefix} '.rpartition(f' {name} ')
        if not found:
            continue
        after_name = after_name.strip()
        # Only the recipient can use the month/year exception for an investment.
        if (ISSUER_ACTION.fullmatch(after_name) and not EXTERNAL_ROUND_PURPOSE.match(suffix)
                and (not investment_in or RECEIPT_ACTION.search(after_name))):
            return True
        if ISSUER_RELEASE.fullmatch(after_name) and REPORTED_COMPLETION.match(suffix):
            return True
    return False


def prospective_clause(clause):
    if PROSPECTIVE.search(clause):
        return True
    for pattern in (EARLY, SERIES, FINANCING_ROUND):
        for mention in pattern.finditer(clause):
            prefix = name_key(clause[:mention.start()])
            suffix = re.sub(r'^round\b\s*', '', name_key(clause[mention.end():]))
            if (re.search(r'\bplanned\b', prefix) and not re.search(r'\b(?:closed|completed)\b', prefix)
                    and not ROUND_COMPLETION.match(suffix)):
                return True
    return False


def opening_issuer_round(statements, names, reviewed_round):
    # Match the full asserted opening before punctuation or coordination is removed.
    opening, *following = (' '.join(statement.split()) for statement in statements)
    terms_pattern = ISSUER_ROUND_TERMS
    reviewed_stage = None
    headline_only = False
    if match := ISSUER_TODAY_REPORT.fullmatch(ISSUER_ROUND_DATELINE.sub('', opening)):
        issuer = name_key(match['issuer'] or match['described_issuer'])
    elif match := ISSUER_CUSTOMER_REPORT.fullmatch(opening):
        issuer = name_key(match['issuer'])
        terms_pattern = ISSUER_WIRE_TERMS
    elif following and (match := ISSUER_FUNDING_HEADLINE.fullmatch(opening)):
        issuer = name_key(match['issuer'])
        terms_pattern = ISSUER_WIRE_TERMS
        headline_only = True
    elif reviewed_round and (match := ISSUER_FIRST_PERSON_REPORT.fullmatch(opening)):
        issuer, reviewed_stage = reviewed_round
    else:
        return False, False
    if issuer not in names or prospective_clause(opening):
        return False, False
    terms = terms_pattern.fullmatch(' ' + name_key(match['terms']))
    if not terms or (reviewed_stage is not None and terms['series'] != reviewed_stage):
        return False, False
    if not following:
        return True, False
    statement = following[0]
    correction = ISSUER_ROUND_CORRECTION.fullmatch(statement)
    if correction and name_key(correction['issuer']) != issuer:
        correction = None
    # "We" stays bound to the issuer only in a direct correction of a bound first-person opening.
    if correction is None and reviewed_stage is not None:
        if statement.casefold() == 'i misspoke.' and len(following) > 1:
            statement = following[1]
        correction = ISSUER_FIRST_PERSON_CORRECTION.fullmatch(statement)
    corrected = bool(
        correction and (correction['series'] is None or name_key(correction['series']) == terms['series'])
    )
    return not (headline_only or corrected), corrected


def issuer_financial_signals(excerpt, names):
    """Keep explicit operating and investment statements as review context."""
    signals = set()
    for statement in ISSUER_FINANCIAL_BREAK.split(excerpt):
        # Parse a complete asserted statement so an attributed second verb keeps its subject.
        text = ISSUER_FINANCIAL_DATELINE.sub('', ' '.join(statement.split()))
        wording = ISSUER_APPOSITION.sub('', text, count=1)
        match = ISSUER_FINANCIAL_CONTEXT.fullmatch(wording)
        if not match or name_key(match['issuer']) not in names:
            continue
        if match['arr']:
            signals.add('annual_recurring_revenue')
        if match['paired'] or match['investment']:
            signals.add('strategic_investment')
    return sorted(signals)


def chips_support_clauses(excerpt, names):
    """Find explicitly attributed programme wording in saved review excerpts."""
    in_cohort = False
    support = {}
    for statement in CHIPS_STATEMENT_BREAK.split(excerpt):
        # Check questions before splitting coordinated clauses or normalizing punctuation.
        if '?' in statement or '？' in statement:
            in_cohort = False
            continue
        clauses = CLAUSE_BREAK.split(statement)
        wording = name_key(CHIPS_ISSUER_APPOSITION.sub(r'\g<subject> ', statement))
        issuer_intent = CHIPS_ISSUER_INTENT.fullmatch(wording)
        if issuer_intent and issuer_intent['recipient'] in names:
            support.update(dict.fromkeys(clauses, 'public_support_letter_of_intent'))
            in_cohort = False
            continue
        for clause in clauses:
            wording = name_key(clause)
            if CHIPS_INTENT_FRAME.fullmatch(wording):
                in_cohort = True
                continue
            planned = CHIPS_PLANNED_RECIPIENT.fullmatch(wording) if in_cohort else None
            if planned:
                if planned['recipient'] in names:
                    support[clause] = 'public_support_letter_of_intent'
                continue
            # A cohort frame applies only to its contiguous recipient statements.
            in_cohort = False
            signed = CHIPS_SIGNED_RECIPIENT.fullmatch(wording)
            if signed and signed['recipient'] in names:
                support[clause] = 'public_support_signed_award'
    return support


def classify(excerpt, names, *, reviewed_round=None):
    clauses = CLAUSE_BREAK.split(excerpt)
    matching = [part for part in clauses if any(includes_name(part, name) for name in names)]
    if not matching and reviewed_round is None:
        return 'unmatched', []
    statements = ISSUER_FINANCIAL_BREAK.split(excerpt.lstrip(), maxsplit=3)
    opening_round, opening_corrected = opening_issuer_round(statements, names, reviewed_round)
    if not (matching or opening_round or opening_corrected):
        return 'unmatched', []
    subjects = ' '.join(matching)
    support = chips_support_clauses(excerpt, names) if 'chips' in excerpt.casefold() else {}
    # A retracted opening supplies context. Later independent round statements can still qualify.
    round_candidates = matching
    if opening_corrected:
        remainder = excerpt.lstrip()[len(statements[0]):].lstrip()
        round_candidates = [clause for clause in CLAUSE_BREAK.split(remainder) if clause in matching]
    round_clauses = [
        clause for clause in round_candidates
        if clause not in support and not prospective_clause(clause)
    ]
    early = any(associated_round(clause, match, names) for clause in round_clauses for match in EARLY.finditer(clause))
    round_mention = early or any(
        associated_round(clause, match, names) for clause in round_clauses
        for pattern in (SERIES, FINANCING_ROUND) for match in pattern.finditer(clause)
    ) or opening_round
    context = [label for label, pattern in CONTEXT.items() if pattern.search(excerpt)]
    if support:
        if 'grant_or_public_support' not in context:
            context.append('grant_or_public_support')
        context.extend(sorted(set(support.values())))
    context.extend(issuer_financial_signals(excerpt, names))
    if opening_corrected or any(prospective_clause(clause) for clause in matching):
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


def saved_results(captures, host, names, *, reviewed_rounds=None):
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
        reviewed_round = reviewed_rounds.get(url) if reviewed_rounds and acquisition == 'page_excerpt' else None
        bucket, signals = classify(excerpt, names, reviewed_round=reviewed_round)
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


def reviewed_round_sources(record, host, catalogue, queue):
    """Bind first-person review cues to unambiguous reviewed issuer citations."""
    if not record or website_host(site_url(record.get('website'))) != host:
        return {}
    name = record['name']
    if any(
        other['name'] != name and (other_host := website_host(site_url(other.get('website'))))
        and other_host.removeprefix('www.') == host.removeprefix('www.')
        for other in (*catalogue.values(), *queue.values())
    ):
        return {}
    citations = defaultdict(list)
    for company in catalogue.values():
        rounds = company.get('funding_rounds')
        if not isinstance(rounds, list):
            continue
        for event in rounds:
            if not isinstance(event, dict):
                continue
            source = event.get('source')
            page = site_url(source)
            if website_host(page) == host and urlsplit(page).path != '/':
                # Group fragments to check ambiguity. Attribution still requires the recorded URL.
                citations[page].append((source, company['name'], event.get('stage')))
    results = {}
    for linked_rounds in citations.values():
        if len(linked_rounds) != 1:
            continue
        source, owner, stage = linked_rounds[0]
        if owner == name and isinstance(stage, str) and SERIES.fullmatch(stage):
            results[source] = (name_key(name), name_key(stage))
    return results


def prepare_funding_review(report, overlay, manifest_path, alias_evidence):
    raw = read_bytes(manifest_path)
    request = fields(load_json(raw), ('version', 'revision', 'plan_id', 'companies'))
    if (type(request['version']) is not int or request['version'] != 1
            or any(request[key] != report[key] for key in ('revision', 'plan_id'))):
        raise ValueError('Funding review must match the exact inventory plan and revision')
    overlay_bytes = read_input(overlay)
    if digest(overlay_bytes) != report['input_hashes']['overlay_sha256']:
        raise ValueError('Funding review overlay bytes have changed')
    catalogue = {row['name']: row for row in load_json(overlay_bytes)['startups']}
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
        record = catalogue.get(name, {})
        host = website_host(site_url(row.get('website') or record.get('website')))
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
        results = saved_results(
            captures, host, [name_key(name), *(name_key(alias['name']) for alias in aliases)],
            reviewed_rounds=reviewed_round_sources(record, host, catalogue, rows),
        )
        entries[name] = {
            'name': name, 'official_host': host, 'action': action, 'searches': searches,
            'prior_rounds': row['fields']['rounds'], 'prior_early_financing': row['fields']['early_financing'],
            'former_names': aliases, 'captures': len(captures), 'repeated_url_hits': len(captures) - len(results),
            'unique_urls_by_bucket': {bucket: sum(result['bucket'] == bucket for result in results) for bucket in BUCKETS},
            'results': results,
        }
    return {'manifest_sha256': digest(raw), 'external_source_population': 'unknown',
            'review_required': True, 'companies': [entries[name] for name in sorted(entries)]}
