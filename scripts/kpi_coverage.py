#!/usr/bin/env python3
"""KPI coverage signals C6-C10: media/identity coverage + thin records.

The Nov 2026 coverage programme (founder headshots, founder LinkedIn,
partner logos, partner LinkedIn) was measured once by hand. Ben directed
(27 Nov 2026) that the KPI tracker monitor this coverage continuously,
so these signals are computed here, from the canonical reviewed data
files, reusing the exact scope definitions the crawl gap report emits
(``crawl_gap_report.founder_scopes`` / ``partner_scopes``, PR #644) --
the crawl and the KPI tracker can never disagree about what counts as
covered.

Signals (definitions live with the other KPI definitions in
``process-critique-and-kpis-2026-11-23.md``, coverage addendum
2026-11-27):

- C6 founder photo coverage    <- gap scope ``founder-photos``
- C7 founder LinkedIn coverage <- gap scope ``founder-linkedin``
- C8 partner logo coverage     <- gap scope ``partner-logos``
- C9 partner LinkedIn coverage <- gap scope ``partner-linkedin``
- C10 thin startup records: startups with (no funding rounds recorded
  AND fewer than 3 profile_facts) OR no description; named list.

Each coverage signal reports covered / total, %, gap count, and the
evidence-exhausted split: a gap whose entity carries an
evidence-exhausted record in ``data/coverage-exhausted.json`` is a
completed checklist outcome, not a failure, so RAG is scored on *open*
gaps (gaps minus exhausted):

- GREEN: no open gaps (every gap is evidence-exhausted, or none exist).
- AMBER: open gaps exist but the count fell since the previous
  snapshot; also the baseline state (no previous snapshot yet).
- RED: open gaps grew since the previous snapshot, or the open-gap
  count is identical across the last three snapshots (no movement
  across two refreshes) while open gaps remain.

Trend state is a small JSON history file maintained by the caller (the
KPI refresh / green loop keeps it at
``hidden_files/kpi-coverage-history.json`` in the goal workspace); the
script reads prior open-gap counts from it and can append the current
snapshot. Without a history file every signal with open gaps scores
AMBER (baseline).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from crawl_gap_report import founder_scopes, partner_scopes  # noqa: E402

VERSION = 1

# KPI id -> gap-report scope_id for the four field-coverage signals.
COVERAGE_SIGNALS = (
    ('C6', 'Founder photo coverage', 'founder-photos'),
    ('C7', 'Founder LinkedIn coverage', 'founder-linkedin'),
    ('C8', 'Partner logo coverage', 'partner-logos'),
    ('C9', 'Partner LinkedIn coverage', 'partner-linkedin'),
)

THIN_SIGNAL_ID = 'C10'
THIN_SCOPE_ID = 'thin-records'


def exhausted_index(registry):
    """Map scope_id -> set of entity ids with an exhausted record."""
    index = {}
    for record in (registry or {}).get('records') or []:
        if not isinstance(record, dict):
            continue
        scope_id = record.get('scope_id')
        entity_id = record.get('entity_id')
        if scope_id and entity_id:
            index.setdefault(scope_id, set()).add(entity_id)
    return index


def thin_startups(research):
    """Startups whose record is materially incomplete.

    Thin = (no funding rounds recorded AND fewer than 3 profile_facts)
    OR no description. Returns one entry per thin startup, named
    ``startup:<slug>``, with the counts that flagged it.
    """
    from crawl_gap_report import _slug

    thin = []
    for startup in (research or {}).get('startups') or []:
        if not isinstance(startup, dict) or not startup.get('name'):
            continue
        rounds = len(startup.get('funding_rounds') or [])
        facts = len(startup.get('profile_facts') or [])
        has_description = bool((startup.get('description') or '').strip())
        reasons = []
        if rounds == 0 and facts < 3:
            reasons.append('no funding rounds and fewer than 3 profile facts')
        if not has_description:
            reasons.append('no description')
        if reasons:
            thin.append({
                'entity_id': f'startup:{_slug(startup["name"])}',
                'name': startup['name'],
                'funding_rounds': rounds,
                'profile_facts': facts,
                'has_description': has_description,
                'reasons': reasons,
            })
    return sorted(thin, key=lambda entry: entry['entity_id'])


def evaluate(open_gaps, history):
    """RAG for one signal from its open-gap count and prior counts.

    ``history`` is the list of previous open-gap counts for the signal,
    oldest first (not including the current snapshot). Returns
    (rag, reason).
    """
    if open_gaps == 0:
        return 'green', 'no open gaps (every gap is evidence-exhausted or none exist)'
    if not history:
        return 'amber', 'baseline snapshot: open gaps exist, no previous snapshot to trend against'
    if open_gaps > history[-1]:
        return 'red', f'open gaps grew since the previous snapshot ({history[-1]} -> {open_gaps})'
    if len(history) >= 2 and open_gaps == history[-1] == history[-2]:
        return 'red', ('open gaps unchanged across two refreshes '
                       f'({history[-2]} -> {history[-1]} -> {open_gaps})')
    if open_gaps < history[-1]:
        return 'amber', f'open gaps fell since the previous snapshot ({history[-1]} -> {open_gaps})'
    return 'amber', f'open gaps unchanged since the previous snapshot ({history[-1]} -> {open_gaps}); one more unchanged refresh scores red'


def _history_counts(history_doc, signal_id):
    counts = []
    for snapshot in (history_doc or {}).get('snapshots') or []:
        signals = snapshot.get('signals') or {}
        entry = signals.get(signal_id)
        if isinstance(entry, dict) and isinstance(entry.get('open_gaps'), int):
            counts.append(entry['open_gaps'])
    return counts


def build_signals(research, partners, registry, history_doc=None):
    """All five KPI signals for one snapshot of the reviewed data."""
    scopes = {}
    for scope in founder_scopes(research) + partner_scopes(partners):
        scopes[scope['scope_id']] = scope
    exhausted = exhausted_index(registry)
    signals = []
    for signal_id, label, scope_id in COVERAGE_SIGNALS:
        scope = scopes.get(scope_id)
        if scope is None:
            continue
        uncovered = list(scope['uncovered_ids'])
        exhausted_ids = sorted(set(uncovered) & exhausted.get(scope_id, set()))
        open_ids = sorted(set(uncovered) - set(exhausted_ids))
        total = scope['eligible_total']
        covered = scope['counts']['covered']
        rag, reason = evaluate(len(open_ids),
                               _history_counts(history_doc, signal_id))
        signals.append({
            'id': signal_id,
            'label': label,
            'scope_id': scope_id,
            'total': total,
            'covered': covered,
            'pct': round(100.0 * covered / total, 1) if total else 100.0,
            'gaps': len(uncovered),
            'exhausted': len(exhausted_ids),
            'open_gaps': len(open_ids),
            'rag': rag,
            'rag_reason': reason,
            'uncovered_ids': uncovered,
            'exhausted_ids': exhausted_ids,
            'open_ids': open_ids,
        })
    thin = thin_startups(research)
    thin_exhausted = sorted(
        entry['entity_id'] for entry in thin
        if entry['entity_id'] in exhausted.get(THIN_SCOPE_ID, set()))
    thin_open = [entry for entry in thin
                 if entry['entity_id'] not in set(thin_exhausted)]
    rag, reason = evaluate(len(thin_open),
                           _history_counts(history_doc, THIN_SIGNAL_ID))
    signals.append({
        'id': THIN_SIGNAL_ID,
        'label': 'Thin startup records',
        'scope_id': THIN_SCOPE_ID,
        'total': len((research or {}).get('startups') or []),
        'covered': len((research or {}).get('startups') or []) - len(thin),
        'pct': round(100.0 * (len((research or {}).get('startups') or []) - len(thin))
                     / len((research or {}).get('startups') or []), 1)
               if (research or {}).get('startups') else 100.0,
        'gaps': len(thin),
        'exhausted': len(thin_exhausted),
        'open_gaps': len(thin_open),
        'rag': rag,
        'rag_reason': reason,
        'thin': thin,
        'exhausted_ids': thin_exhausted,
        'open_ids': [entry['entity_id'] for entry in thin_open],
    })
    return signals


def build_report(research, partners, registry, *, generated_at,
                 history_doc=None):
    signals = build_signals(research, partners, registry, history_doc)
    return {
        'version': VERSION,
        'generated_at': generated_at,
        'signals': signals,
        'scoreboard': {
            colour: sum(1 for s in signals if s['rag'] == colour)
            for colour in ('green', 'amber', 'red')
        },
    }


def render_summary(report):
    lines = [
        '# KPI coverage signals (C6-C10)',
        '',
        f"Generated: {report['generated_at']}",
        '',
        '| ID | Signal | Covered | % | Gaps | Exhausted | Open | RAG |',
        '|---|---|---|---|---|---|---|---|',
    ]
    for signal in report['signals']:
        lines.append(
            f"| {signal['id']} | {signal['label']} | "
            f"{signal['covered']}/{signal['total']} | {signal['pct']} | "
            f"{signal['gaps']} | {signal['exhausted']} | "
            f"{signal['open_gaps']} | {signal['rag'].upper()} |")
    lines.append('')
    for signal in report['signals']:
        lines.append(f"## {signal['id']} {signal['label']} — {signal['rag_reason']}")
        lines.append('')
        if signal['id'] == THIN_SIGNAL_ID:
            if signal['thin']:
                for entry in signal['thin']:
                    lines.append(
                        f"- {entry['name']}: {entry['funding_rounds']} rounds, "
                        f"{entry['profile_facts']} profile facts, "
                        f"description {'present' if entry['has_description'] else 'missing'} "
                        f"({'; '.join(entry['reasons'])})")
            else:
                lines.append('No thin records.')
        elif signal['open_ids']:
            for entity_id in signal['open_ids']:
                lines.append(f'- {entity_id}')
        else:
            lines.append('No open gaps.')
        lines.append('')
    return '\n'.join(lines)


def append_snapshot(history_doc, report):
    """Return a new history doc with this report's snapshot appended."""
    doc = {'version': VERSION, 'snapshots': list((history_doc or {}).get('snapshots') or [])}
    doc['snapshots'].append({
        'at': report['generated_at'],
        'signals': {
            signal['id']: {
                'covered': signal['covered'],
                'total': signal['total'],
                'gaps': signal['gaps'],
                'exhausted': signal['exhausted'],
                'open_gaps': signal['open_gaps'],
                'rag': signal['rag'],
            } for signal in report['signals']
        },
    })
    return doc


def _load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def _write(path, text):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    os.replace(temporary, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path,
                        default=ROOT / 'data/startup-research.json',
                        help='Reviewed startup research (canonical source)')
    parser.add_argument('--partners', type=Path,
                        default=ROOT / 'data/partners-reviewed.json',
                        help='Reviewed partners (canonical source)')
    parser.add_argument('--exhausted', type=Path,
                        default=ROOT / 'data/coverage-exhausted.json',
                        help='Evidence-exhausted registry (missing file = none)')
    parser.add_argument('--history', type=Path, default=None,
                        help='Trend history JSON: prior snapshots are read '
                             'for RAG trending and the new snapshot is '
                             'appended unless --no-append is given')
    parser.add_argument('--no-append', action='store_true',
                        help='Read history for trending but do not append')
    parser.add_argument('--out', type=Path, default=None,
                        help='Write the JSON report here (default: stdout)')
    parser.add_argument('--summary-md', type=Path, default=None,
                        help='Also write a Markdown summary here')
    args = parser.parse_args(argv)

    research = _load_json(args.research)
    partners = _load_json(args.partners)
    if research is None or partners is None:
        print('error: canonical data files unreadable', file=sys.stderr)
        return 1
    registry = _load_json(args.exhausted) or {'records': []}
    history_doc = _load_json(args.history) if args.history else None
    generated_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    report = build_report(research, partners, registry,
                          generated_at=generated_at, history_doc=history_doc)
    text = json.dumps(report, indent=2, ensure_ascii=False) + '\n'
    if args.out:
        _write(args.out, text)
    else:
        sys.stdout.write(text)
    if args.summary_md:
        _write(args.summary_md, render_summary(report))
    if args.history and not args.no_append:
        _write(args.history, json.dumps(
            append_snapshot(history_doc, report), indent=2,
            ensure_ascii=False) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
