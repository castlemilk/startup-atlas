#!/usr/bin/env python3
"""Derive one headline "latest value" figure and a listing status per startup.

Implements design §1 of the market-cap treemap design note (24 Nov 2026):
the three evidence stores stay the source of truth — funding-round
valuations in ``data/startup-research.json`` plus ``private_valuations`` /
``market_caps`` / ``ownership`` in ``data/treemap-evidence.json`` — and the
headline figure is *derived*, never hand-maintained on the startup record.

The gates mirror the ones the treemap already enforces client-side
(``web/treemap-model.js``: ``sourcedAmount`` / ``comparableEvent`` /
``indexTreemapEvidence``): a figure counts only with an https source, a
valid ISO date and an ISO currency; market-cap records must additionally
pass the close x shares ~= amount validation when a calculation is
recorded. Null stays null — no figure is ever estimated or modelled.

Precedence: a listed market cap (latest dated observation) when the
ownership status is ``public``; otherwise the latest dated private
valuation event across rounds + ``private_valuations`` (latest-dated wins,
which fixes the stale-round trap: Canva's 2021 round at US$40B is
superseded by its 2025 secondary at US$42B). A subsidiary has no
standalone value.

USD normalisation uses the committed fallback table in
``data/fx-rates.json`` only (never the network), so graph and index
builds stay deterministic; the rate and its date are recorded on the
figure next to the preserved original amount and currency.
"""
import math
import re
import unicodedata
from datetime import date

_CURRENCY = re.compile(r'^[A-Z]{3}$')
_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

BASES = ('listed_market_cap', 'last_round_post_money', 'secondary_sale',
         'announced_valuation')


def slug(name):
    """Same slug algorithm as scripts/make-graph.py (kept in step with it)."""
    value = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')


def startup_id_for(name):
    return 'startup:' + slug(name)


def _as_date(value):
    if not isinstance(value, str) or not _DATE.match(value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _https(value):
    return isinstance(value, str) and value.startswith('https://')


def _positive(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value > 0)


def _sourced(amount, currency, date_value, source):
    return (_positive(amount) and isinstance(currency, str)
            and bool(_CURRENCY.match(currency))
            and _as_date(date_value) is not None and _https(source))


def _basis_for_stage(stage):
    text = (stage or '').lower()
    if 'secondary' in text:
        return 'secondary_sale'
    if 'post-money' in text or 'post money' in text:
        return 'last_round_post_money'
    return 'announced_valuation'


def private_events(rounds, private_valuations):
    """All gated private valuation events for one startup, oldest first."""
    events = []
    for event in rounds or []:
        if 'superseded_by' in event:
            continue
        amount, currency = event.get('valuation'), event.get('valuation_currency')
        when, source = event.get('announced_on'), event.get('source')
        if _sourced(amount, currency, when, source):
            events.append({'amount': amount, 'currency': currency, 'date': when,
                           'basis': 'last_round_post_money', 'source': source,
                           'approximate': bool(event.get('approximate', False)),
                           'stage': event.get('stage') or ''})
    seen_ids = set()
    for record in private_valuations or []:
        record_id = record.get('id')
        if not isinstance(record_id, str) or not record_id.strip() or record_id in seen_ids:
            continue
        if not isinstance(record.get('stage'), str) or not record['stage'].strip():
            continue
        if record.get('supporting_source') is not None and not _https(record['supporting_source']):
            continue
        if record.get('approximate') is not None and not isinstance(record['approximate'], bool):
            continue
        amount, currency = record.get('valuation'), record.get('valuation_currency')
        when, source = record.get('announced_on'), record.get('source')
        if not _sourced(amount, currency, when, source):
            continue
        seen_ids.add(record_id)
        events.append({'amount': amount, 'currency': currency, 'date': when,
                       'basis': _basis_for_stage(record.get('stage')),
                       'source': source,
                       'approximate': bool(record.get('approximate', False)),
                       'stage': record['stage']})
    return sorted(events, key=lambda e: (e['date'], e['amount'], e['source']))


def _market_cap_ok(record):
    if not _sourced(record.get('amount'), record.get('currency'),
                    record.get('observed_on'), record.get('source')):
        return False
    if not isinstance(record.get('ticker'), str) or not record['ticker'].strip():
        return False
    if not isinstance(record.get('exchange'), str) or not record['exchange'].strip():
        return False
    inputs = record.get('calculation')
    if inputs is not None:
        if not isinstance(inputs, dict):
            return False
        shares = inputs.get('shares')
        if not _positive(inputs.get('close')):
            return False
        if not isinstance(shares, int) or isinstance(shares, bool) or shares <= 0:
            return False
        shares_as_of = _as_date(inputs.get('shares_as_of'))
        if shares_as_of is None or shares_as_of > _as_date(record['observed_on']):
            return False
        if not _https(inputs.get('shares_source')):
            return False
        if inputs.get('close_data') is not None and not _https(inputs['close_data']):
            return False
        if inputs.get('share_terms_source') is not None and not _https(inputs['share_terms_source']):
            return False
        if abs(record['amount'] - inputs['close'] * shares) > 0.01:
            return False
    return True


def market_caps(records):
    """Validated, deduplicated market-cap observations, oldest first."""
    seen, caps = set(), []
    for record in records or []:
        if not _market_cap_ok(record):
            continue
        key = (record['startup_id'], record['currency'], record['observed_on'])
        if key in seen:
            continue
        seen.add(key)
        caps.append(record)
    return sorted(caps, key=lambda r: (r['observed_on'], r['amount'], r['ticker']))


def ownership_status(record):
    """The validated ownership status string, or None when unusable."""
    if not isinstance(record, dict):
        return None
    if record.get('status') not in ('public', 'private', 'subsidiary'):
        return None
    if _as_date(record.get('observed_on')) is None:
        return None
    if not _https(record.get('source')):
        return None
    if not isinstance(record.get('detail'), str) or not record['detail'].strip():
        return None
    return record['status']


def derive_latest_value(rounds, evidence, startup_id, fx_table=None):
    """Return (latest_value | None, listing) for one startup.

    ``rounds`` are the startup's funding rounds from startup-research;
    ``evidence`` is the whole treemap-evidence document (or None);
    ``fx_table`` is a currency.load_fallback_table() bundle (or None, in
    which case only USD figures gain an amount_usd).
    """
    evidence = evidence or {}
    status = ownership_status((evidence.get('ownership') or {}).get(startup_id))
    caps = market_caps([r for r in evidence.get('market_caps') or []
                        if r.get('startup_id') == startup_id])
    if status == 'subsidiary':
        return None, {'status': 'subsidiary'}
    if status == 'public':
        listing = {'status': 'public'}
        if caps:
            latest = caps[-1]
            listing['exchange'] = latest['exchange']
            listing['ticker'] = latest['ticker']
            return (_figure(latest['amount'], latest['currency'],
                            latest['observed_on'], 'listed_market_cap',
                            latest['source'], False, fx_table), listing)
        return None, listing
    events = private_events(
        rounds,
        [r for r in evidence.get('private_valuations') or []
         if r.get('startup_id') == startup_id])
    listing = {'status': status or 'unknown'}
    if not events:
        return None, listing
    latest = events[-1]
    return (_figure(latest['amount'], latest['currency'], latest['date'],
                    latest['basis'], latest['source'], latest['approximate'],
                    fx_table), listing)


def _figure(amount, currency, as_of, basis, source, approximate, fx_table):
    figure = {'amount': amount, 'currency': currency, 'as_of': as_of,
              'basis': basis, 'approximate': bool(approximate),
              'source': source}
    rates = (fx_table or {}).get('to_usd') or {}
    rate = rates.get(currency)
    if currency == 'USD':
        figure['amount_usd'] = amount
    elif rate:
        figure['amount_usd'] = round(amount * rate, 2)
        figure['fx_rate'] = rate
        figure['fx_date'] = (fx_table or {}).get('date') or None
    return figure
