"""Offline coverage for issuer links already reviewed in the pinned startup overlay.

A receipt binds one saved issuer document (or a reviewed overlay baseline) to
an exact startup. Its roles are reviewer observations. A platform path or
matching handle cannot establish new ownership.
"""
from datetime import date
import re
from urllib.parse import urlsplit

try:
    from .company_metadata_evidence import receipt_context, source_url
    from .plan_company_profiles import website_host
    from .stage_early_investments import fields, text
except ImportError:
    from company_metadata_evidence import receipt_context, source_url
    from plan_company_profiles import website_host
    from stage_early_investments import fields, text


COMPANY_SOCIALS = 'company_socials'
ROLES = {'company', 'founder', 'other_organisation', 'incidental', 'unknown'}
PLATFORMS = {
    'linkedin.com': ('linkedin', r'/company/[A-Za-z0-9-]+/?'),
    'youtube.com': ('youtube', r'/(?:@[A-Za-z0-9_.-]+|channel/UC[A-Za-z0-9_-]+)/?'),
    'twitter.com': ('twitter', r'/[A-Za-z0-9_]{1,15}/?'),
    'x.com': ('twitter', r'/[A-Za-z0-9_]{1,15}/?'),
}
NON_PROFILE_ROUTES = {
    'linkedin': {'in', 'pub', 'sharearticle', 'sharing'},
    'youtube': {'embed', 'live', 'playlist', 'shorts', 'watch'},
    'twitter': {'compose', 'explore', 'home', 'i', 'intent', 'search', 'settings', 'share'},
}


def day(value):
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return value if parsed.isoformat() == value else None


def profile_key(url):
    try:
        parts = urlsplit(url)
        if (parts.scheme != 'https' or '\\' in url or not parts.hostname
                or parts.username is not None or parts.password is not None
                or parts.port not in (None, 443)):
            return None, 'unsafe_profile_url'
    except ValueError:
        return None, 'unsafe_profile_url'
    platform = PLATFORMS.get(parts.hostname.removeprefix('www.'))
    if platform is None:
        return None, 'unsupported_profile_url'
    family, pattern = platform
    route = parts.path.lstrip('/').partition('/')[0].casefold()
    if route in NON_PROFILE_ROUTES[family]:
        return None, 'non_profile_url'
    if parts.query or parts.fragment or not re.fullmatch(pattern, parts.path):
        return None, 'unsupported_profile_url'
    path = parts.path.rstrip('/')
    # Use only for duplicate comparison. Keep every literal saved URL.
    return (family, path.casefold() if family == 'twitter' else path), None


def company_social_review(value, company, revision, as_of, startup_id, website):
    fields(value, ('version', 'name', 'revision', 'startup_id', 'source_url', 'observed_on',
                   'reviewed_since', 'acquisition', 'evidence', 'links'))
    receipt_context(value, company['name'], revision)
    if value['startup_id'] != startup_id:
        raise ValueError('Company social evidence must identify the exact canonical startup')
    source = source_url(value['source_url'])
    evidence = text(value['evidence'], 'saved issuer evidence', 1500)
    acquisition = value['acquisition']
    if acquisition not in ('issuer_anchor_capture', 'reviewed_overlay_baseline'):
        raise ValueError('Company social evidence needs a saved issuer capture or reviewed overlay baseline')
    observed = day(value['observed_on'])
    cutoff = day(value['reviewed_since'])
    if not cutoff or cutoff > as_of[:10] or (observed and observed > as_of[:10]):
        raise ValueError('Company social evidence dates must be at or before the batch review')
    if value['observed_on'] is not None and not observed:
        raise ValueError('Invalid company social evidence observation day')
    if not isinstance(value['links'], list) or len(value['links']) > 30:
        raise ValueError('Company social evidence supports up to 30 saved links')

    source_hold = None
    if website_host(source) != website_host(website):
        source_hold = 'issuer_source_mismatch'
    elif not observed or observed < cutoff:
        source_hold = 'missing_observation_date' if not observed else 'stale_observation'
    stored = company.get('socials')
    if stored is not None and not isinstance(stored, list):
        raise ValueError('Expected saved company socials to be a list')
    known = {(row['label'], row['url'], row['source']): (index, day(row.get('reviewed_at')))
             for index, row in enumerate(stored or [])
             if isinstance(row, dict) and all(isinstance(row.get(key), str) for key in ('label', 'url', 'source'))}
    rows, comparison_keys, winners = [], [], {}
    for link in value['links']:
        fields(link, ('label', 'url'), ('role',))
        label = text(link['label'], 'social link label', 100)
        url = text(link['url'], 'literal social link URL', 2048)
        role = link.get('role', 'unknown')
        if not isinstance(role, str) or role not in ROLES:
            raise ValueError('Invalid saved social-link role')
        key, route = profile_key(url)
        status, reason = 'held', source_hold or 'no_exact_issuer_review'
        rank, reviewed_on = known.get((label, url, source), (None, None))
        if role in ('founder', 'other_organisation', 'incidental'):
            status, reason = 'rejected', role
        elif route in ('unsafe_profile_url', 'non_profile_url'):
            status, reason = 'rejected', route
        elif role == 'unknown' or route:
            reason = 'ownership_unconfirmed' if role == 'unknown' else route
        elif not source_hold and rank is not None:
            if not reviewed_on:
                reason = 'missing_review_date'
            elif reviewed_on > as_of[:10]:
                reason = 'future_review_date'
            elif reviewed_on < cutoff:
                reason = 'stale_review'
            else:
                status, reason = 'reviewed', 'exact_issuer_review'
                candidate = (rank, len(rows))
                winners[key] = min(candidate, winners.get(key, candidate))
        rows.append({'label': label, 'url': url, 'source_url': source, 'role': role,
                     'status': status, 'reason': reason, 'reviewed_on': reviewed_on})
        comparison_keys.append(key)

    for index, (row, key) in enumerate(zip(rows, comparison_keys)):
        winner = winners.get(key)
        if winner and index != winner[1] and row['reason'] in ('exact_issuer_review', 'no_exact_issuer_review'):
            row.update(status='duplicate', reason='same_profile_key', duplicate_of=rows[winner[1]]['url'])
    counts = {status: sum(row['status'] == status for row in rows)
              for status in ('reviewed', 'duplicate', 'rejected', 'held')}
    disposition = 'searched_unknown'
    if counts['reviewed']:
        disposition = 'reviewed'
    elif source_hold or counts['held']:
        disposition = 'candidate'
    return disposition, {
        'startup_id': startup_id, 'source_url': source, 'observed_on': observed,
        'reviewed_since': cutoff, 'acquisition': acquisition, 'evidence': evidence, 'source_hold': source_hold,
        'coverage': 'partial' if counts['reviewed'] else 'unknown', 'counts': counts, 'links': rows,
    }
