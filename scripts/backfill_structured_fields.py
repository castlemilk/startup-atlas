#!/usr/bin/env python3
"""Backfill structured fields from data already in the repo. Never guesses.

- Startup ``hq_country`` / ``hq_city``: parsed from existing HQ profile
  facts (``headquarters``, ``business-base``, ``co-headquarters``,
  ``sydney-headquarters`` keys). A value parses only when it contains
  exactly one unambiguous ``City, Country`` pair; anything else leaves
  the fields absent and lists the startup in the report as ambiguous.
- Round ``stage_normalised``: the controlled vocabulary (Pre-Seed, Seed,
  Series A-H, Bridge, Grant, Debt, Crowdfunding, IPO, Acquisition,
  Unknown) mapped from the free-text ``stage`` spellings. The original
  ``stage`` is always preserved. A stage outside the vocabulary
  (e.g. Series I, or a stage the source never stated) maps to Unknown.
- Opportunity ``deadline`` + controlled status: ``deadline`` is an ISO
  date or null, extracted only when exactly one date parses unambiguously
  from the status text. Controlled status vocabulary: Open, Closing soon,
  Closed, Check intake, Eligibility review, Partner required,
  Apply / verify, Unknown. The controlled value goes in the NEW field
  ``status_controlled``; ``status`` itself keeps the original free text
  verbatim, because existing consumers render it (web/app.js, web/entity.js)
  and the catalogue tests assert on it. (An earlier version of this script
  put the controlled value in ``status`` and the original in
  ``status_text``; that shape is migrated back on sight.)

Writes the fields into ``data/startup-research.json`` and
``data/catalogue.json`` and prints a report (filled / ambiguous / missing
per field). ``--dry-run`` prints the report without writing. The script
is idempotent: ``status`` always holds the original text, so re-running
recomputes the same ``status_controlled`` and ``deadline``. It also
keeps ``data/opportunities-added.json`` in sync — that file mirrors
catalogue entries and the SQLite builder requires the mirror to match
exactly.
"""
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HQ_KEYS = ('headquarters', 'business-base', 'co-headquarters', 'sydney-headquarters')

CONTROLLED_STAGES = (
    'Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D',
    'Series E', 'Series F', 'Series G', 'Series H', 'Bridge', 'Grant',
    'Debt', 'Crowdfunding', 'IPO', 'Acquisition', 'Unknown',
)

CONTROLLED_STATUSES = (
    'Open', 'Closing soon', 'Closed', 'Check intake', 'Eligibility review',
    'Partner required', 'Apply / verify', 'Unknown',
)

_COUNTRY_ALIASES = {
    'USA': 'United States', 'U.S.': 'United States', 'US': 'United States',
    'UK': 'United Kingdom', 'U.K.': 'United Kingdom',
}

_COUNTRIES = (
    'Australia', 'New Zealand', 'United States', 'USA', 'U.S.', 'US',
    'United Kingdom', 'UK', 'U.K.', 'Canada', 'Singapore', 'Ireland',
    'Germany', 'France', 'Netherlands', 'India', 'Japan', 'China',
    'Israel', 'Brazil', 'South Africa', 'Switzerland', 'Sweden', 'Norway',
    'Denmark', 'Finland', 'Spain', 'Italy', 'Austria', 'Belgium',
)

_CITY_COUNTRY_RE = re.compile(
    r"([A-Z][A-Za-z'\u2019\-]+(?:\s+[A-Z][A-Za-z'\u2019\-]+)*),\s*("
    + '|'.join(re.escape(country) for country in _COUNTRIES) + r")\b")

# "X and Y, Country" names two cities for one country: ambiguous, not a pick.
_TWO_CITIES_RE = re.compile(
    r"[A-Z][A-Za-z'\u2019\-]+(?:\s+[A-Z][A-Za-z'\u2019\-]+)*\s+and\s+"
    r"[A-Z][A-Za-z'\u2019\-]+")

_MONTHS = {
    'january': 1, 'jan': 1, 'february': 2, 'feb': 2, 'march': 3, 'mar': 3,
    'april': 4, 'apr': 4, 'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
    'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'sept': 9,
    'october': 10, 'oct': 10, 'november': 11, 'nov': 11,
    'december': 12, 'dec': 12,
}
_MONTH_NAMES = '|'.join(sorted(_MONTHS, key=len, reverse=True))
_DATE_RE = re.compile(
    r"(\d{1,2})\s+(" + _MONTH_NAMES + r")\.?\s+(\d{4})", re.IGNORECASE)
_ISO_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")

# Two streams/rounds in one status line means a date belongs to one of them,
# not to the opportunity as a whole: refuse the deadline.
_MULTI_STREAM_RE = re.compile(r"\bStream\s+[A-Z]\b.*\bStream\s+[A-Z]\b", re.IGNORECASE)


def parse_hq(value):
    """Parse "City, Country" from an HQ profile-fact value.

    Returns (city, country) when exactly one unambiguous pair is present,
    else None. Never guesses: parentheticals, trailing clauses and
    multi-city values do not produce a pick.
    """
    if not value or not isinstance(value, str):
        return None
    if _TWO_CITIES_RE.search(value):
        return None
    matches = {(city, _COUNTRY_ALIASES.get(country, country))
               for city, country in _CITY_COUNTRY_RE.findall(value)}
    if len(matches) != 1:
        return None
    return next(iter(matches))


_SERIES_RE = re.compile(r"(?i)^series\s+([A-H])(?:[-\s].*)?$")
_STAGE_EXACT = {
    'pre-seed': 'Pre-Seed', 'pre seed': 'Pre-Seed', 'preseed': 'Pre-Seed',
    'seed': 'Seed', 'seed round': 'Seed', 'seed extension': 'Seed',
    'bridge': 'Bridge', 'bridge round': 'Bridge',
    'grant': 'Grant', 'grant award': 'Grant',
    'grant award (non-equity)': 'Grant', 'non-equity grant': 'Grant',
    'debt': 'Debt', 'debt financing': 'Debt', 'venture debt': 'Debt',
    'crowdfunding': 'Crowdfunding', 'crowdfund': 'Crowdfunding',
    'ipo': 'IPO', 'initial public offering': 'IPO',
    'acquisition': 'Acquisition', 'acquired': 'Acquisition',
}


def normalise_stage(stage):
    """Map a free-text round stage to the controlled vocabulary."""
    if not stage or not isinstance(stage, str):
        return 'Unknown'
    text = ' '.join(stage.strip().split())
    if text in CONTROLLED_STAGES:
        return text
    lowered = text.lower()
    if lowered in _STAGE_EXACT:
        return _STAGE_EXACT[lowered]
    match = _SERIES_RE.match(text)
    if match:
        return f"Series {match.group(1).upper()}"
    if 'grant' in lowered:
        return 'Grant'
    if 'crowdfund' in lowered:
        return 'Crowdfunding'
    if 'bridge' in lowered:
        return 'Bridge'
    if 'ipo' in lowered:
        return 'IPO'
    if 'acqui' in lowered:
        return 'Acquisition'
    return 'Unknown'


def parse_deadline(text):
    """Extract an ISO deadline date from opportunity status text.

    Returns the date only when exactly one date parses unambiguously;
    otherwise None. A bare year, several dates, an invalid date, or a
    multi-stream line all refuse.
    """
    if not text or not isinstance(text, str):
        return None
    if _MULTI_STREAM_RE.search(text):
        return None
    found = set()
    for day, month, year in _DATE_RE.findall(text):
        try:
            found.add(date(int(year), _MONTHS[month.lower().rstrip('.')], int(day)))
        except ValueError:
            return None
    for year, month, day in _ISO_DATE_RE.findall(text):
        try:
            found.add(date(int(year), int(month), int(day)))
        except ValueError:
            return None
    if len(found) != 1:
        return None
    return next(iter(found)).isoformat()


def map_status(text):
    """Map free-text opportunity status to the controlled vocabulary."""
    if not text or not isinstance(text, str):
        return 'Unknown'
    stripped = text.strip()
    if stripped in CONTROLLED_STATUSES:
        return stripped
    low = stripped.lower()
    if 'closed' in low or 'deadline passed' in low:
        return 'Closed'
    if 'paused' in low:
        return 'Closed'
    if low.startswith('closes') or low.startswith('closing'):
        return 'Closing soon'
    if 'expressions of interest open' in low:
        return 'Open'
    if 'open until' in low or 'open for proposals' in low:
        return 'Open'
    if 'rolling' in low or 'year-round' in low or 'year round' in low:
        return 'Open'
    if 'apply' in low or 'pitch' in low:
        return 'Apply / verify'
    if 'partner required' in low:
        return 'Partner required'
    if 'eligibility' in low:
        return 'Eligibility review'
    if ('intake' in low or 'cohort' in low or 'future cycle' in low
            or 'terms' in low or 'to verify' in low):
        return 'Check intake'
    if 'free trial' in low:
        return 'Open'
    if 'open' in low:
        return 'Open'
    return 'Unknown'


def backfill(research_path, catalogue_path, dry_run=False, additions_path=None):
    research = json.loads(Path(research_path).read_text(encoding='utf-8'))
    catalogue = json.loads(Path(catalogue_path).read_text(encoding='utf-8'))
    report = {
        'hq': {'filled': [], 'ambiguous': [], 'missing': [], 'already_present': []},
        'stages': {'normalised': 0, 'unknown': 0, 'unmapped_spellings': []},
        'opportunities': {'deadline_extracted': [], 'deadline_none': [],
                          'status_counts': {}, 'additions_synced': 0},
    }
    for startup in research['startups']:
        name = startup['name']
        if 'hq_country' in startup or 'hq_city' in startup:
            report['hq']['already_present'].append(name)
        else:
            facts = [fact for fact in startup.get('profile_facts', [])
                     if fact.get('key') in HQ_KEYS]
            if not facts:
                report['hq']['missing'].append(name)
            else:
                parsed = None
                for fact in facts:
                    parsed = parse_hq(fact.get('value', ''))
                    if parsed is not None:
                        break
                if parsed is None:
                    report['hq']['ambiguous'].append(name)
                else:
                    city, country = parsed
                    if not dry_run:
                        startup['hq_city'] = city
                        startup['hq_country'] = country
                    report['hq']['filled'].append(name)
        for round_ in startup.get('funding_rounds', []) or []:
            stage = normalise_stage(round_.get('stage'))
            if not dry_run:
                round_['stage_normalised'] = stage
            if stage == 'Unknown':
                report['stages']['unknown'] += 1
                spelling = round_.get('stage') or ''
                if spelling and spelling not in report['stages']['unmapped_spellings']:
                    report['stages']['unmapped_spellings'].append(spelling)
            else:
                report['stages']['normalised'] += 1
    for opportunity in catalogue['opportunities']:
        # Additive shape (corrected during integration): ``status`` keeps
        # the original free text verbatim — existing consumers render it
        # (web/app.js "Status & source", web/entity.js) and the catalogue
        # tests assert on it — and the controlled vocabulary lives in the
        # NEW field ``status_controlled``. An earlier version of this
        # backfill instead moved the original into ``status_text`` and put
        # the controlled value in ``status``; if that shape is found, it is
        # migrated back here, so re-runs are idempotent either way.
        original = opportunity.get('status_text') or opportunity.get('status', '')
        status = map_status(original)
        deadline = parse_deadline(original)
        if not dry_run:
            opportunity.pop('status_text', None)
            opportunity['status'] = original
            opportunity['status_controlled'] = status
            opportunity['deadline'] = deadline
        counts = report['opportunities']['status_counts']
        counts[status] = counts.get(status, 0) + 1
        if deadline is not None:
            report['opportunities']['deadline_extracted'].append(opportunity['id'])
        else:
            report['opportunities']['deadline_none'].append(opportunity['id'])
    if additions_path is None:
        candidate = Path(catalogue_path).parent / 'opportunities-added.json'
        additions_path = candidate if candidate.is_file() else None
    if additions_path is not None:
        # opportunities-added.json mirrors catalogue entries, and the
        # SQLite builder requires the mirror to match exactly: sync any
        # entry whose catalogue record this backfill changed.
        additions = json.loads(Path(additions_path).read_text(encoding='utf-8'))
        by_id = {opp['id']: opp for opp in catalogue['opportunities']}
        synced = 0
        for addition in additions.get('entries', []):
            entry = addition.get('entry', {})
            updated = by_id.get(entry.get('id'))
            if updated is not None and entry != updated:
                addition['entry'] = json.loads(json.dumps(updated))
                synced += 1
        report['opportunities']['additions_synced'] = synced
        if synced and not dry_run:
            Path(additions_path).write_text(
                json.dumps(additions, ensure_ascii=False, indent=2) + '\n',
                encoding='utf-8')
    if not dry_run:
        Path(research_path).write_text(
            json.dumps(research, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        Path(catalogue_path).write_text(
            json.dumps(catalogue, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


def print_report(report):
    hq = report['hq']
    print(f"HQ: {len(hq['filled'])} filled, {len(hq['ambiguous'])} ambiguous, "
          f"{len(hq['missing'])} missing, {len(hq['already_present'])} already present")
    if hq['ambiguous']:
        print(f"  ambiguous: {', '.join(sorted(hq['ambiguous']))}")
    stages = report['stages']
    print(f"Stages: {stages['normalised']} normalised, {stages['unknown']} Unknown")
    if stages['unmapped_spellings']:
        print(f"  mapped to Unknown: {', '.join(sorted(stages['unmapped_spellings']))}")
    opps = report['opportunities']
    print(f"Deadlines: {len(opps['deadline_extracted'])} extracted, "
          f"{len(opps['deadline_none'])} none")
    if opps.get('additions_synced'):
        print(f"Additions synced: {opps['additions_synced']} entries in "
              f"opportunities-added.json")
    print("Statuses: " + ', '.join(
        f"{status}={count}" for status, count in
        sorted(opps['status_counts'].items(), key=lambda item: -item[1])))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path, default=ROOT / 'data' / 'startup-research.json')
    parser.add_argument('--catalogue', type=Path, default=ROOT / 'data' / 'catalogue.json')
    parser.add_argument('--dry-run', action='store_true',
                        help='Print the report without writing any files')
    args = parser.parse_args(argv)
    report = backfill(args.research, args.catalogue, dry_run=args.dry_run)
    print_report(report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
