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
RAW_ROUND_TERMS = r'(?P<terms>(?: [\w$-]+(?:[.,][\w$-]+)*){1,24})'
NAMED_SERIES_TERMS = ROUND_MODIFIERS + rf' (?P<series>{SERIES.pattern})'
# The coordinated platform descriptor is attested for this issuer in both release versions.
ISSUER_TODAY_REPORT = re.compile(
    rf'(?:(?P<described_issuer>Culture Amp), the People & Culture Platform,|(?P<issuer>{ISSUER_NAME}))'
    rf' announced today (?:that )?it has raised{RAW_ROUND_TERMS}[.!]',
    re.I,
)
ISSUER_ROUND_TERMS = re.compile(
    NAMED_SERIES_TERMS + r'(?: (?:funding round|round(?: of funding)?))?'
)
PRNEWSWIRE_DATELINE = r'(?-i:[A-Z][A-Z -]{1,40}, [A-Z][a-z]{2,8} [0-9]{1,2}, (?:19|20)[0-9]{2}) /PRNewswire/ -- '
RAISE_REPORT = r'announced (?:yesterday )?(?:that )?it has raised'
RAISE_AMOUNT_NUMBER = r'[0-9]{1,9}(?:,[0-9]{3}){0,3}(?:\.[0-9]{1,3})? (?:million|billion)'
STATED_RAISE_AMOUNT = rf'(?:(?:US|USD|AU|AUD|CA|CAD)?\${RAISE_AMOUNT_NUMBER}|{RAISE_AMOUNT_NUMBER} dollars)'
TRAILING_RAISE_TERMS = rf'(?:a|its|the) (?P<series>{SERIES.pattern}) round of (?P<amount>{STATED_RAISE_AMOUNT})'
NORMALIZED_RAISE_PREFIX = re.compile(rf'{RAISE_REPORT} (?:a|its|the)')
ISSUER_RAISE_REPORT = re.compile(
    rf'(?:{PRNEWSWIRE_DATELINE}HR Tech World: )?(?P<issuer>{ISSUER_NAME}) '
    rf'{RAISE_REPORT} {TRAILING_RAISE_TERMS}'
    r'(?: led by (?![^.!?]*\b(?:if|unless|pending|subject to)\b)'
    r'[A-Z][\w&-]{0,39}(?: [A-Z][\w&-]{0,39}){0,5}| to expand its (?:business|operations))?[.!]',
    re.I,
)
# These attestations bind an issuer article's saved prose to one existing round.
# They apply only to offline review of saved excerpts.
REVIEWED_ISSUER_ARTICLES = {
    'Culture Amp': {
        'url': 'https://www.cultureamp.com/blog/culture-amp-raises-20-million-in-series-c-funding',
        'round_id': 'culture-amp-2017-series-c',
        'stage': 'Series C',
        'round_source': (
            'https://www.prnewswire.com/news-releases/'
            'culture-amp-announces-new-funding-to-empower-companies-everywhere-to-put-culture-first-300474440.html'
        ),
        'opening_sha256': '090c3d4fdaad6b4934d5ebbb1795f72641012dee34a41ff47f1b56d99f97f2da',
        'continuation_sha256': (
            '36ddd0cfff154cbd9d5a886cf356a50436cb9f73a2a811db8fee6adc9cb45ce6',
            '359d1086a19baa50aaad618f55a241afab200e48abeb6b4831409934e55d1e44',
            '3d923a2bd33a7bb96032146950a26a2d4ed5ec8172521d01443c683b747a3d1f',
        ),
    },
    'Diraq': {
        'url': 'https://www.diraq.com/newsdesk/diraq-secures-usd-15-million-in-series-a-2-funding',
        'round_id': 'diraq-2024-series-a-2',
        'stage': 'Series A-2',
        'round_source': (
            'https://www.quantonation.com/news/'
            'diraq-secures-usd-15-million-in-series-a-2-funding-to-advance-fault-tolerant-quantum-computing-development'
        ),
        'round_terms': {'amount': 15000000, 'currency': 'USD'},
        'opening_sha256': '6f1a986f99802631840d22ea22340283bdea99c88d3e57a52fe3cf861583f9de',
        'completion_amount': 'USD $15 million',
    },
}
ISSUER_LINKED_FIRST_PERSON = re.compile(
    rf'Yesterday at [\w -]{{1,100}}, (?P<issuer>{ISSUER_NAME}) shared the news that we have raised '
    rf'{TRAILING_RAISE_TERMS} led by [\w& -]{{1,100}}\.',
    re.I,
)
NUMBERED_SERIES = r'series [a-h]-[1-9][0-9]?'
NUMBERED_SERIES_AMOUNT = rf'(?:{STATED_RAISE_AMOUNT}|(?:US|USD|AU|AUD|CA|CAD) \${RAISE_AMOUNT_NUMBER})'
ISSUER_LINKED_COMPLETION = re.compile(
    rf'(?P<issuer>{ISSUER_NAME})(?:{ISSUER_APPOSITION.pattern})? today announced the successful completion of '
    rf'(?:a|its|the) (?P<series>{NUMBERED_SERIES}) capital raise of (?P<amount>{NUMBERED_SERIES_AMOUNT})[.!]',
    re.I,
)
ANNOUNCED_CLOSING = r'(?:announced today|today announced) (?:that )?it has closed'
NORMALIZED_CLOSING_PREFIX = re.compile(rf'(?:(?:has|had|today|recently) )*{ANNOUNCED_CLOSING}\b')
ISSUER_CLOSING_REPORT = re.compile(
    rf'(?:{PRNEWSWIRE_DATELINE})?(?:People Analytics company )?'
    rf'(?P<issuer>{ISSUER_NAME})(?:{ISSUER_APPOSITION.pattern})?'
    rf' {ANNOUNCED_CLOSING}{RAW_ROUND_TERMS}[.!]',
    re.I,
)
QUOTATION_MARK = re.compile(r"""["“”„‟«»‹›‘‛\x60]|(?<!\w)['’]|['’](?!\w)""")
QUOTATION_PAIRS = {('"', '"'), ('“', '”'), ("'", "'"), ('‘', '’'), ('«', '»'), ('‹', '›')}
CLOSING_STATEMENT_BREAK = re.compile(
    rf'(?:{ISSUER_FINANCIAL_BREAK.pattern}|(?<=[.!?]["”\'’»›])\s+)', re.I,
)
CLOSING_DECLARATIVE_END = re.compile(r'[.!]["”\'’»›]?$')
CLOSING_PREFACE_BOUNDARY = re.compile(r'[:?？]|\b(?:asked|quoted|wondered|hypothetical)\b', re.I)
CAPITALIZED_NAME = r'(?-i:[A-Z][\w&-]{0,39}(?: [A-Z][\w&-]{0,39}){0,3})'
BUSINESS_WIRE_RELEASE = re.compile(r'/news/home/([0-9]{14})/en(?:/[^/]+)?/?')
BUSINESS_WIRE_DATELINE = r'(?-i:[A-Z][A-Z -]{1,40}(?:, [A-Z][A-Za-z -]{1,40})?--\(BUSINESS WIRE\)--) ?'
SEED_STAGE = r'(?:pre[- ]?seed|seed)'
SEED_INSTRUMENT = r'(?:(?:funding|financing|investment)(?: round)?|round)'
LATER_SEED_CLOSE = re.compile(rf'(?P<issuer>{ISSUER_NAME}) later closed its (?P<series>seed) round\.', re.I)
SEED_WIRE_LEADER = rf"{CAPITALIZED_NAME}(?: founders['’])?(?: investment consortium)?"
SEED_WIRE_CLOSE = re.compile(
    rf'{BUSINESS_WIRE_DATELINE}(?P<issuer>{ISSUER_NAME})'
    r'(?P<description>, (?:an?|the) (?:[\w-]+ ){0,8}(?:company|start[- ]?up),)?'
    rf' (?:today announced|announced(?: today)?) closing (?:a|its|the) (?P<amount>{STATED_RAISE_AMOUNT}) '
    rf'(?P<series>{SEED_STAGE}) {SEED_INSTRUMENT}'
    rf'(?: (?:co-)?led by (?:the )?{SEED_WIRE_LEADER}(?: and {SEED_WIRE_LEADER})?)?[.!]',
    re.I,
)
SEED_WIRE_CONDITION = re.compile(r'\b(?:if|unless|pending|subject to|provided that|conditional(?:ly)?|assuming)\b', re.I)
SEED_WIRE_INDIRECT_SUBJECT = re.compile(r'\b(?:subsidiar(?:y|ies)|affiliates?|portfolio|parent)\b', re.I)
NOMINAL_CLOSING_REPORT = re.compile(
    rf'(?:(?-i:[A-Z][a-z-]{{1,30}}) employee engagement startup )?(?P<issuer>{ISSUER_NAME}) '
    rf'(?:has )?announced the closing of (?:a|its|the) (?P<amount>{STATED_RAISE_AMOUNT}) '
    rf'(?P<series>{SERIES.pattern}) (?:funding )?round'
    rf'(?:, led by (?![^.!?]*\b(?:if|unless|pending|subject to)\b)(?:existing investors? )?{CAPITALIZED_NAME}'
    rf'(?: with participation from {CAPITALIZED_NAME}(?:, {CAPITALIZED_NAME}){{0,4}}'
    rf'(?:,? and {CAPITALIZED_NAME})?)?)?[.!]',
    re.I,
)
WIRE_SERIES_FUNDING = rf'(?P<terms>(?: [\w$-]+(?:[.,][\w$-]+)*){{0,24}} {SERIES.pattern} funding(?: round)?)'
WIRE_ACTIONS = r'close|raise|secure'
# Keep the customer list inside the named issuer's relative clause.
ISSUER_CUSTOMER_REPORT = re.compile(
    rf'(?:{PRNEWSWIRE_DATELINE})?'
    rf'(?:People Analytics company )?(?P<issuer>{ISSUER_NAME}), which counts {CAPITALIZED_NAME}'
    rf'(?:, {CAPITALIZED_NAME}){{0,6}}(?:,? and {CAPITALIZED_NAME})? among (?:its customers|the companies using its platform),'
    rf' (?:today )?announced (?:that )?it has (?P<action>{WIRE_ACTIONS})d{WIRE_SERIES_FUNDING}[.!]',
    re.I,
)
# The headline already qualifies through legacy matching. Use this form only to bind a correction.
ISSUER_FUNDING_HEADLINE = re.compile(
    rf'(?P<issuer>{ISSUER_NAME}) secures{WIRE_SERIES_FUNDING}(?: to grow culture-first companies)?[.!]',
    re.I,
)
ISSUER_WIRE_TERMS = re.compile(
    r'(?!.*\bplanned\b)' + NAMED_SERIES_TERMS + r' funding(?: round)?'
)
ISSUER_FIRST_PERSON_REPORT = re.compile(
    r'(?:It is with this success that )?I am proud to announce our(?: latest)?'
    rf'(?P<terms>(?: [\w$-]+(?:[.,][\w$-]+)*){{0,24}} {SERIES.pattern} funding round)[.!]',
    re.I,
)
CORRECTION_DETERMINERS = r'a|an|any|the|that'
CORRECTION_SERIES = rf'(?P<series>{SERIES.pattern})(?: (?:funding(?: round)?|round(?: of funding)?))?'
NOMINAL_CORRECTION_TERMS = (
    rf'(?:(?P<leading_amount>{STATED_RAISE_AMOUNT}) )?{CORRECTION_SERIES}'
    rf'(?: of (?P<trailing_amount>{STATED_RAISE_AMOUNT}))?'
)
NOMINAL_CLOSING_CORRECTION = re.compile(
    rf'(?:Correction: )?(?P<issuer>{ISSUER_NAME}) '
    r"(?:(?:actually )?(?:did not|didn['’]t) (?:(?:actually|in fact) )?(?:close|announce the closing of)"
    r"|(?:ha[sd] not|ha[sd]n['’]t|never) (?:(?:actually|yet) )?(?:closed|announced the closing of)) "
    rf'(?:the funding|(?:(?:{CORRECTION_DETERMINERS}|its) )?{NOMINAL_CORRECTION_TERMS})[.!]',
    re.I,
)
NOMINAL_POSSESSIVE_CLOSING_CORRECTION = re.compile(
    rf"(?:Correction: )?(?P<issuer>{ISSUER_NAME})['’]s {NOMINAL_CORRECTION_TERMS} "
    r"(?:did not|didn['’]t) close[.!]",
    re.I,
)
SEED_CORRECTION_TERMS = (
    rf'(?:(?P<leading_amount>{STATED_RAISE_AMOUNT}) )?(?P<series>{SEED_STAGE})(?: {SEED_INSTRUMENT})?'
    rf'(?: of (?P<trailing_amount>{STATED_RAISE_AMOUNT}))?'
)
SEED_CLOSE_DENIAL = (
    r"(?:(?:did not|didn['’]t) (?:later )?close|(?:has not|hasn['’]t) (?:yet )?closed"
    r"|(?:was (?:not(?: yet)?|never)|wasn['’]t) closed)(?: yet)?"
)
SEED_POSSESSIVE_CLOSE_CORRECTION = re.compile(
    rf"(?:Correction: )?(?P<issuer>{ISSUER_NAME})['’]s {SEED_CORRECTION_TERMS} "
    rf'{SEED_CLOSE_DENIAL}[.!]',
    re.I,
)
SEED_CLOSE_CORRECTIONS = (
    re.compile(
        rf'(?:Correction: )?(?P<issuer>{ISSUER_NAME}) '
        r"(?:(?:actually )?(?:did not|didn['’]t) (?:(?:actually|in fact) )?"
        r"(?:close|raise|announce (?:the closing of|closing))"
        r"|(?:ha[sd] not|ha[sd]n['’]t|never) (?:(?:actually|yet) )?"
        r"(?:closed|raised|announced (?:the closing of|closing))) "
        rf'(?:the funding|(?:(?:{CORRECTION_DETERMINERS}|its) )?{SEED_CORRECTION_TERMS})(?: yet)?[.!]',
        re.I,
    ),
    SEED_POSSESSIVE_CLOSE_CORRECTION,
)
LATER_SEED_CLOSE_CORRECTIONS = (
    re.compile(
        rf'(?:Correction: )?(?P<issuer>{ISSUER_NAME}) '
        r"(?:(?:did not|didn['’]t) (?:(?:actually|in fact) )?(?:later )?close"
        r"|(?:ha[sd] not|ha[sd]n['’]t|never) (?:(?:actually|yet) )?closed) "
        rf'(?:(?:{CORRECTION_DETERMINERS}|its) )?{SEED_CORRECTION_TERMS}(?: yet)?[.!]',
        re.I,
    ),
    SEED_POSSESSIVE_CLOSE_CORRECTION,
)
SEED_DEFINITE_CORRECTION = re.compile(
    rf'Correction: the (?P<amount>{STATED_RAISE_AMOUNT}) (?P<series>{SEED_STAGE}) {SEED_INSTRUMENT} '
    rf'{SEED_CLOSE_DENIAL}[.!]',
    re.I,
)
NUMBERED_CORRECTION_TERMS = (
    rf'(?:(?P<leading_amount>{NUMBERED_SERIES_AMOUNT}) )?(?P<series>{NUMBERED_SERIES})'
    rf'(?: (?:capital raise|funding(?: round)?|round))?(?: of (?P<trailing_amount>{NUMBERED_SERIES_AMOUNT}))?'
)
NUMBERED_COMPLETION_CORRECTIONS = (
    re.compile(
        rf'(?:Correction: )?(?P<issuer>{ISSUER_NAME}) '
        r"(?:(?:actually )?(?:did not|didn['’]t) (?:(?:actually|in fact) )?"
        r"(?:(?:successfully )?complete|close|announce the successful completion of)"
        r"|(?:ha[sd] not|ha[sd]n['’]t|never) (?:(?:actually|yet) )?"
        r"(?:completed|closed|announced the successful completion of)) "
        rf'(?:the funding|(?:(?:{CORRECTION_DETERMINERS}|its) )?{NUMBERED_CORRECTION_TERMS})[.!]',
        re.I,
    ),
    re.compile(
        rf"(?:Correction: )?(?P<issuer>{ISSUER_NAME})['’]s {NUMBERED_CORRECTION_TERMS} "
        r"(?:(?:did not|didn['’]t) (?:complete|close)|(?:has not|hasn['’]t) (?:yet )?closed)[.!]",
        re.I,
    ),
)
ISSUER_ROUND_CORRECTION = re.compile(
    rf'(?P<issuer>{ISSUER_NAME}) '
    rf'(?:did not (?P<simple_action>{WIRE_ACTIONS})|didn[\'’]t (?P<contracted_close>close)'
    rf'|has not (?:actually )?(?P<perfect_action>{WIRE_ACTIONS})d) '
    rf'(?:(?:(?:{CORRECTION_DETERMINERS}|its) )?{CORRECTION_SERIES}|the funding)[.!]',
    re.I,
)
ISSUER_REPEATED_CLOSE_DENIAL = re.compile(
    rf'(?P<issuer>{ISSUER_NAME}) (?:did not close|didn[\'’]t close|has not (?:actually )?closed)'
    rf'{RAW_ROUND_TERMS}[.!]',
    re.I,
)
QUANTIFIED_RAISE_DENIAL_TERMS = (
    rf'(?:{TRAILING_RAISE_TERMS}|(?:(?:a|its|the) )?(?P<leading_amount>{STATED_RAISE_AMOUNT}) '
    rf'(?:in )?(?:(?:a|its|the) )?(?P<leading_series>{SERIES.pattern}) (?:funding(?: round)?|round))[.!]'
)
ISSUER_QUANTIFIED_RAISE_DENIAL = re.compile(
    rf'(?P<issuer>{ISSUER_NAME}) (?:(?:did not|didn[\'’]t) raise|has not (?:actually )?raised) '
    + QUANTIFIED_RAISE_DENIAL_TERMS,
    re.I,
)
ISSUER_QUANTIFIED_FIRST_PERSON_DENIAL = re.compile(
    r"(?:I misspoke: )?we (?:(?:did not|didn['’]t) (?:actually )?raise"
    r"|(?:have not|haven['’]t) (?:actually )?raised) " + QUANTIFIED_RAISE_DENIAL_TERMS,
    re.I,
)
ISSUER_CONTRACTED_RAISE_DENIAL = re.compile(
    rf'(?P<issuer>{ISSUER_NAME}) didn[\'’]t (?:actually )?raise '
    rf'(?:(?:(?:{CORRECTION_DETERMINERS}|its) )?{CORRECTION_SERIES}|the funding)[.!]',
    re.I,
)
ISSUER_FIRST_PERSON_CORRECTION = re.compile(
    r"(?:I misspoke: )?we (?:(?:did not|didn['’]t) (?:actually )?raise"
    r"|(?:have not|haven['’]t) (?:actually )?raised) "
    rf'(?:(?:(?:{CORRECTION_DETERMINERS}|our) )?{CORRECTION_SERIES}|the funding)[.!]',
    re.I,
)
ADJACENT_RAISE_DENIAL = re.compile(
    rf"^(?P<subject>(?:I misspoke: )?{ISSUER_NAME}) "
    r"(?:(?P<before>did not|didn['’]t) actually|actually (?P<after>did not|didn['’]t)) (?=raise )",
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
NORMALIZED_TRAILING_AMOUNT = re.compile(rf'round of {AMOUNT}\b')
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
SERIES_EXTENSION_TAIL = re.compile(
    r"(?:-[1-9][0-9]?)?[\"”'’]?(?:\s+(?:funding|financing|investment))?(?:\s+round)?\s+"
    r'(?:extension|expanded|extended'
    r'|(?:has|had)(?:\s+not(?:\s+yet)?)?(?:\s+(?:now|later))?\s+(?:expanded|been\s+(?:expanded|extended))'
    r'|(?:was|were)(?:\s+not)?(?:\s+(?:now|later))?\s+(?:expanded|extended)'
    r'|(?:will|would)(?:\s+(?:now|later))?\s+(?:expand|be\s+(?:expanded|extended))'
    r'|did not expand)\b',
    re.I,
)
EXTENSION_AMOUNT = rf'(?:{NUMBERED_SERIES_AMOUNT}|A\${RAISE_AMOUNT_NUMBER})'
ROUND_EXTENSION_REPORT = re.compile(
    rf'(?:[\w-]{{1,40}}-based )?(?P<issuer>{ISSUER_NAME})'
    r'(?:, (?:an?|the)(?: [\w-]+){1,24},)? '
    r'(?:(?:has|had|today) )?'
    rf'(?:(?:{REPORT_ACTION}|{ROUND_ACTION}) (?:that )?(?:(?:a|its|the) )?'
    rf'{SERIES.pattern}{SERIES_EXTENSION_TAIL.pattern}'
    rf'|(?:closed|completed|secured) (?:a )?{EXTENSION_AMOUNT}'
    rf'(?:(?: \(approximately {EXTENSION_AMOUNT}\))? from {NAMED_FUND} as part of a {EXTENSION_AMOUNT})?'
    rf' extension to (?:its|the) {SERIES.pattern}(?:-[1-9][0-9]?)? (?:financing|funding|investment round|round)\b)',
    re.I,
)
ISSUER_CLOSING_TERMS = re.compile(
    r'(?!.*\bplanned\b)' + NAMED_SERIES_TERMS
    + rf'(?: (?:funding(?: round)?|round(?: of funding)?|{SCOPED_CONTEXT_SUFFIX.pattern}))?'
)
REPORTED_COMPLETION = re.compile(r'(?:(?:was|has been|had been) )?(?:completed|closed|announced)\b')
ROUND_COMPLETION = re.compile(r'(?:(?:was|has been|had been) )?(?:completed|closed)\b')
EXTERNAL_ROUND_PURPOSE = re.compile(
    r'^(?:for\b|on behalf of\b|(?:investment|funding|financing) in\b|to (?:finance|fund|support|back)\b)'
)
SEED_CLOSE_ADVERB = r'(?:(?:jointly|soon|later|likely|successfully) )?'
POSSESSIVE_SEED_PLAN = re.compile(
    r'^.*\b(?:(?:(?:plan(?:s|ned|ning)?|intend(?:s|ed|ing)?|expect(?:s|ed|ing)?'
    r'|aim(?:s|ed|ing)?|hop(?:e|es|ed|ing)|prepar(?:e|es|ed|ing)|agree(?:s|d|ing)?'
    r'|intentions?|due|scheduled|set) to'
    r'|will|would|may|might|could|can|should) '
    rf'{SEED_CLOSE_ADVERB}(?:close|complete|be (?:closing|completing))'
    rf'|anticipat(?:e|es|ed|ing) {SEED_CLOSE_ADVERB}(?:closing|completing)) '
    rf"(?P<issuer>{ISSUER_NAME})['’]s{RAW_ROUND_TERMS}?$",
    re.I,
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
    if mention.re is SERIES and SERIES_EXTENSION_TAIL.match(tail):
        return False
    suffix = name_key(tail)
    if any(pattern.search(subject) for pattern in CONTEXT.values()):
        return False
    # Check the full tail so a valuation or award cannot hide another issuer.
    if any(pattern.search(tail) for pattern in CONTEXT.values()) and not SCOPED_CONTEXT_SUFFIX.fullmatch(suffix):
        return False
    investment_in = mention.group().casefold().endswith('investment') and (suffix == 'in' or suffix.startswith('in '))
    if investment_in and not INVESTMENT_MONTH_QUALIFIER.fullmatch(tail):
        return False
    # Use the last prospective predicate and retain punctuation at the issuer boundary.
    seed_plan = POSSESSIVE_SEED_PLAN.fullmatch(' '.join(subject.split())) if mention.re is EARLY else None
    # A company inside another actor's unresolved aside cannot own the next verb.
    prefix = name_key(ISSUER_BOUNDARY.split(ISSUER_APPOSITION.sub(' ', subject))[-1])
    for name in names:
        if suffix == f'for {name}' and LEAD_ACTION.search(prefix):
            return True
        _, found, after_name = f' {prefix} '.rpartition(f' {name} ')
        if not found:
            continue
        if seed_plan and name_key(seed_plan['issuer']) == name:
            continue
        after_name = after_name.strip()
        # Normalization loses quotation and question marks. These openings need the raw assertion check.
        if mention.re is SERIES and (
            NORMALIZED_CLOSING_PREFIX.match(after_name)
            or (NORMALIZED_RAISE_PREFIX.fullmatch(after_name) and NORMALIZED_TRAILING_AMOUNT.match(suffix))
        ):
            continue
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


def round_correction(following, issuer, series, asserted_action, *, first_person=False, closing_terms=None):
    if not following:
        return False
    statement = following[0]
    correction = ISSUER_ROUND_CORRECTION.fullmatch(statement)
    if correction:
        denied_action = (
            correction['simple_action'] or correction['contracted_close'] or correction['perfect_action']
        ).casefold()
        # A denial of raising funds still retracts the funding claim. Closing and securing are distinct assertions.
        if name_key(correction['issuer']) != issuer or denied_action not in ('raise', asserted_action):
            correction = None
    # "We" stays bound to the issuer only in a direct correction of a bound first-person opening.
    if correction is None and first_person:
        if statement.casefold() == 'i misspoke.' and len(following) > 1:
            statement = following[1]
        correction = ISSUER_FIRST_PERSON_CORRECTION.fullmatch(statement)
    if correction and (correction['series'] is None or name_key(correction['series']) == series):
        return True
    if closing_terms is None:
        return False
    # Bind only the repeated wording. Normalizing the amount could erase its currency qualifier.
    repeated = ISSUER_REPEATED_CLOSE_DENIAL.fullmatch(statement)
    return bool(repeated and name_key(repeated['issuer']) == issuer and repeated['terms'] == closing_terms)


def reported_raise_denial(following, issuer, series, amount, *, first_person=False):
    if round_correction(following, issuer, series, 'raise', first_person=first_person):
        return True
    if not following:
        return False
    statement = following[0]
    if denial := ISSUER_CONTRACTED_RAISE_DENIAL.fullmatch(statement):
        return name_key(denial['issuer']) == issuer and (
            denial['series'] is None or name_key(denial['series']) == series
        )
    denial = ISSUER_QUANTIFIED_RAISE_DENIAL.fullmatch(statement)
    if denial and name_key(denial['issuer']) != issuer:
        denial = None
    if first_person and not denial:
        if statement.casefold() == 'i misspoke.' and len(following) > 1:
            statement = following[1]
        denial = ISSUER_QUANTIFIED_FIRST_PERSON_DENIAL.fullmatch(statement)
    # Compare the stated amount without converting symbols, units or currencies.
    return bool(
        denial and name_key(denial['series'] or denial['leading_series']) == series
        and (denial['amount'] or denial['leading_amount']).casefold() == amount.casefold()
    )


def closing_retraction(following, issuer, report, patterns):
    series = name_key(report['series'])
    stated_amount = report.groupdict().get('amount')
    for offset, statement in enumerate(following):
        if offset:
            # Cross one unrelated sentence only for a labelled correction repeating the terms.
            intervening = following[0]
            if (not statement.casefold().startswith('correction: ')
                    or not CLOSING_DECLARATIVE_END.search(intervening)
                    or CLOSING_PREFACE_BOUNDARY.search(intervening)
                    or QUOTATION_MARK.search(intervening)
                    or any(pattern.search(intervening) for pattern in (EARLY, SERIES, FINANCING_ROUND))):
                break
        denial = None
        for pattern in patterns:
            denial = pattern.fullmatch(statement)
            if denial:
                break
        if not denial or name_key(denial['issuer']) != issuer:
            continue
        if denial['series'] is not None and name_key(denial['series']) != series:
            continue
        # Compare written amounts without interpreting currency symbols or multipliers.
        amounts = [denial[key].casefold() for key in ('leading_amount', 'trailing_amount') if denial[key]]
        if (not offset and not amounts) or (stated_amount and amounts == [stated_amount.casefold()]):
            return statement
    return None


def issuer_reported_rounds(excerpt, names, *, allow_saved_reports):
    """Review complete named financing assertions within their sentence scope."""
    statements = [' '.join(part.split()) for part in CLOSING_STATEMENT_BREAK.split(excerpt)]
    quotations = [tuple(QUOTATION_MARK.findall(statement)) for statement in statements]
    unresolved_quotation = any(marks and marks not in QUOTATION_PAIRS for marks in quotations)
    saved_assertion = allow_saved_reports and not unresolved_quotation
    round_mention = early_mention = corrected = False
    retractions = set()
    for index, statement in enumerate(statements):
        following = statements[index + 1:index + 2]
        denied = None
        match = ISSUER_CLOSING_REPORT.fullmatch(ISSUER_ROUND_DATELINE.sub('', statement))
        if match and (issuer := name_key(match['issuer'])) in names and not prospective_clause(statement):
            terms = ISSUER_CLOSING_TERMS.fullmatch(' ' + name_key(match['terms']))
            if terms:
                denied = round_correction(following, issuer, terms['series'], 'close', closing_terms=match['terms'])
        raised = ISSUER_RAISE_REPORT.fullmatch(statement) if saved_assertion else None
        if raised and (issuer := name_key(raised['issuer'])) in names and not prospective_clause(statement):
            series = name_key(raised['series'])
            denied = reported_raise_denial(following, issuer, series, raised['amount'])
        nominal = NOMINAL_CLOSING_REPORT.fullmatch(statement) if saved_assertion else None
        if nominal and (issuer := name_key(nominal['issuer'])) in names:
            retraction = closing_retraction(
                statements[index + 1:index + 3], issuer, nominal,
                (NOMINAL_CLOSING_CORRECTION, NOMINAL_POSSESSIVE_CLOSING_CORRECTION),
            )
            denied = retraction is not None
            if denied:
                retractions.add(retraction)
        later_seed = LATER_SEED_CLOSE.fullmatch(statement) if saved_assertion else None
        if later_seed and (issuer := name_key(later_seed['issuer'])) in names and not prospective_clause(statement):
            retraction = closing_retraction(following, issuer, later_seed, LATER_SEED_CLOSE_CORRECTIONS)
            denied = retraction is not None
            if denied:
                retractions.add(retraction)
            else:
                early_mention = True
        if denied is not None:
            corrected |= denied
            round_mention |= not denied
        # Cross only complete prefacing statements. A quote that spans a split leaves later scope unresolved.
        body_start = raised.start('issuer') if raised else 0
        if (unresolved_quotation or not CLOSING_DECLARATIVE_END.search(statement)
                or CLOSING_PREFACE_BOUNDARY.search(statement, body_start)):
            break
    return round_mention, early_mention, corrected, retractions


def cited_seed_close(statements, names, reviewed_round):
    """Read an asserted wire opening only for its exact, unambiguous seed citation."""
    opening, *following = statements
    issuer, stage = reviewed_round
    if issuer not in names or not re.fullmatch(SEED_STAGE, stage):
        return False, None
    report = SEED_WIRE_CLOSE.fullmatch(opening)
    if (not report or name_key(report['issuer']) != issuer or name_key(report['series']) != stage
            or SEED_WIRE_CONDITION.search(opening) or prospective_clause(opening)
            or SEED_WIRE_INDIRECT_SUBJECT.search(report['description'] or '')):
        return False, None
    retraction = closing_retraction(following[:2], issuer, report, SEED_CLOSE_CORRECTIONS)
    if retraction is None and following:
        # Without a named issuer, require an immediate labelled correction repeating the literal terms.
        correction = SEED_DEFINITE_CORRECTION.fullmatch(following[0])
        if (correction and name_key(correction['series']) == stage
                and correction['amount'].casefold() == report['amount'].casefold()):
            retraction = following[0]
    return retraction is None, retraction


def linked_issuer_round(excerpt, names, article):
    # The exact opening binds the assertion before any nearby correction is considered.
    statements = [' '.join(part.split()) for part in ISSUER_FINANCIAL_BREAK.split(excerpt, maxsplit=6)]
    opening, *following = statements
    issuer, stage, attestation = article
    if issuer not in names or digest(opening.encode()) != attestation['opening_sha256']:
        return False, False, None
    if amount := attestation.get('completion_amount'):
        report = ISSUER_LINKED_COMPLETION.fullmatch(opening)
        if (not report or name_key(report['issuer']) != issuer or name_key(report['series']) != stage
                or report['amount'] != amount):
            return False, False, None
        retraction = closing_retraction(following[:2], issuer, report, NUMBERED_COMPLETION_CORRECTIONS)
        return retraction is None, retraction is not None, retraction
    match = ISSUER_LINKED_FIRST_PERSON.fullmatch(opening)
    if not match or name_key(match['issuer']) != issuer or name_key(match['series']) != stage:
        return False, False, None
    for expected in attestation['continuation_sha256']:
        if not following or digest(following[0].encode()) != expected:
            break
        following = following[1:]
    if following:
        if following[0].casefold().startswith('correction: '):
            following[0] = following[0][len('correction: '):]
        index = 1 if len(following) > 1 and following[0].casefold() == 'i misspoke.' else 0
        statement = following[index]
        # Reuse the same issuer, stage and amount checks after the explicit adverb.
        if denial := ADJACENT_RAISE_DENIAL.match(statement):
            negation = denial['before'] or denial['after']
            following[index] = f"{denial['subject']} {negation} {statement[denial.end():]}"
    corrected = reported_raise_denial(following, issuer, stage, match['amount'], first_person=True)
    return not corrected, corrected, None


def opening_issuer_round(statements, names, reviewed_round):
    # Match the full asserted opening before punctuation or coordination is removed.
    opening, *following = statements
    terms_pattern = ISSUER_ROUND_TERMS
    reviewed_stage = None
    asserted_action = 'raise'
    headline_only = False
    if match := ISSUER_TODAY_REPORT.fullmatch(ISSUER_ROUND_DATELINE.sub('', opening)):
        issuer = name_key(match['issuer'] or match['described_issuer'])
    elif match := ISSUER_CUSTOMER_REPORT.fullmatch(opening):
        issuer = name_key(match['issuer'])
        terms_pattern = ISSUER_WIRE_TERMS
        asserted_action = match['action'].casefold()
    elif following and (match := ISSUER_FUNDING_HEADLINE.fullmatch(opening)):
        issuer = name_key(match['issuer'])
        terms_pattern = ISSUER_WIRE_TERMS
        asserted_action = 'secure'
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
    corrected = round_correction(
        following, issuer, terms['series'], asserted_action, first_person=reviewed_stage is not None,
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


def classify(excerpt, names, *, reviewed_round=None, reviewed_article=None, search_result=False):
    clauses = CLAUSE_BREAK.split(excerpt)
    matching = [part for part in clauses if any(includes_name(part, name) for name in names)]
    if not matching and reviewed_round is None:
        return 'unmatched', []
    opening_text = excerpt.lstrip()
    raw_statements = ISSUER_FINANCIAL_BREAK.split(opening_text, maxsplit=3)
    statements = [' '.join(part.split()) for part in raw_statements]
    opening_round, opening_corrected = opening_issuer_round(statements, names, reviewed_round)
    report_round, report_seed, report_corrected, report_retractions = issuer_reported_rounds(
        opening_text, names, allow_saved_reports=not search_result,
    )
    seed_close = False
    if reviewed_round and not search_result:
        seed_close, seed_retraction = cited_seed_close(statements, names, reviewed_round)
        opening_corrected |= seed_retraction is not None
        if seed_retraction:
            report_retractions.add(seed_retraction)
    if reviewed_article and not search_result:
        linked_round, linked_corrected, linked_retraction = linked_issuer_round(opening_text, names, reviewed_article)
        opening_round |= linked_round
        opening_corrected |= linked_corrected
        if linked_retraction:
            report_retractions.add(linked_retraction)
    if not (matching or opening_round or opening_corrected or report_round or report_corrected or seed_close):
        return 'unmatched', []
    subjects = ' '.join(matching)
    support = chips_support_clauses(excerpt, names) if 'chips' in excerpt.casefold() else {}
    # A retracted opening supplies context. Later independent round statements can still qualify.
    round_candidates = matching
    if opening_corrected:
        remainder = opening_text[len(raw_statements[0]):].lstrip()
        round_candidates = [clause for clause in CLAUSE_BREAK.split(remainder) if clause in matching]
    round_clauses = [
        clause for clause in round_candidates
        if clause not in support and not prospective_clause(clause)
        # A bound possessive correction can otherwise match as "company's Series B".
        and (not report_retractions or ' '.join(clause.split()) not in report_retractions)
    ]
    early = seed_close or report_seed or any(
        associated_round(clause, match, names) for clause in round_clauses for match in EARLY.finditer(clause)
    )
    round_mention = early or any(
        associated_round(clause, match, names) for clause in round_clauses
        for pattern in (SERIES, FINANCING_ROUND) for match in pattern.finditer(clause)
    ) or opening_round or report_round
    context = [label for label, pattern in CONTEXT.items() if pattern.search(excerpt)]
    if support:
        if 'grant_or_public_support' not in context:
            context.append('grant_or_public_support')
        context.extend(sorted(set(support.values())))
    for clause in matching:
        extension = ROUND_EXTENSION_REPORT.match(' '.join(clause.split()))
        if extension and name_key(extension['issuer']) in names:
            context.append('round_extension_context')
            break
    context.extend(issuer_financial_signals(excerpt, names))
    if opening_corrected or report_corrected or any(prospective_clause(clause) for clause in matching):
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


def saved_results(captures, host, names, *, reviewed_rounds=None, reviewed_articles=None):
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
        reviewed_article = reviewed_articles.get(url) if reviewed_articles and acquisition == 'page_excerpt' else None
        bucket, signals = classify(excerpt, names, reviewed_round=reviewed_round, reviewed_article=reviewed_article,
                                   search_result=acquisition == 'search_result')
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
        return {}, {}
    name = record['name']
    if any(
        other['name'] != name and (other_host := website_host(site_url(other.get('website'))))
        and other_host.removeprefix('www.') == host.removeprefix('www.')
        for other in (*catalogue.values(), *queue.values())
    ):
        return {}, {}
    citations, wire_citations = defaultdict(list), defaultdict(list)
    article = REVIEWED_ISSUER_ARTICLES.get(name)
    wire_document = urlsplit(article['round_source']) if article else None
    linked_wire_citations = []
    for company in catalogue.values():
        rounds = company.get('funding_rounds')
        if not isinstance(rounds, list):
            continue
        for event in rounds:
            if not isinstance(event, dict):
                continue
            source = event.get('source')
            page = site_url(source)
            if page and (wire := urlsplit(page)).hostname in ('businesswire.com', 'www.businesswire.com'):
                if release := BUSINESS_WIRE_RELEASE.fullmatch(wire.path):
                    # Alternative paths, query strings and fragments can cite the same release.
                    wire_citations[release[1]].append((source, company['name'], event.get('stage')))
            if website_host(page) == host and urlsplit(page).path != '/':
                # Group fragments to check ambiguity. Attribution still requires the recorded URL.
                citations[page].append((source, company['name'], event.get('stage')))
            if wire_document and page:
                document = urlsplit(page)
                if (document.netloc, document.path) == (wire_document.netloc, wire_document.path):
                    linked_wire_citations.append((company['name'], event))
    results = {}
    for linked_rounds in citations.values():
        if len(linked_rounds) != 1:
            continue
        source, owner, stage = linked_rounds[0]
        if owner == name and isinstance(stage, str) and SERIES.fullmatch(stage):
            results[source] = (name_key(name), name_key(stage))
    for linked_rounds in wire_citations.values():
        if len(linked_rounds) != 1:
            continue
        source, owner, stage = linked_rounds[0]
        if (owner == name and isinstance(stage, str) and re.fullmatch(SEED_STAGE, stage, re.I)
                and not (urlsplit(source).query or urlsplit(source).fragment)):
            results[source] = (name_key(name), name_key(stage))
    articles = {}
    if len(linked_wire_citations) == 1:
        owner, event = linked_wire_citations[0]
        expected = {'source': article['round_source'], 'id': article['round_id'], 'stage': article['stage'],
                    **article.get('round_terms', {})}
        url = article['url']
        cited_paths = {urlsplit(page).path for page in citations}
        if (owner == name and all(event.get(key) == value for key, value in expected.items())
                and website_host(url) == host and urlsplit(url).path not in cited_paths):
            articles[url] = (name_key(name), name_key(article['stage']), article)
    return results, articles


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
        reviewed_rounds, reviewed_articles = reviewed_round_sources(record, host, catalogue, rows)
        results = saved_results(
            captures, host, [name_key(name), *(name_key(alias['name']) for alias in aliases)],
            reviewed_rounds=reviewed_rounds, reviewed_articles=reviewed_articles,
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
