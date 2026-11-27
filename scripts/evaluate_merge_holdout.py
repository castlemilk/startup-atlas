#!/usr/bin/env python3
"""Evaluate the entity matcher against the #88 labelled holdout.

Replays every case in ``data/merge-holdout.json`` through
``entity_resolution.match_candidates`` in isolation — the candidate
is the only entity in a one-entry registry, so no other registry
state can leak into the score — and classifies the outcome:

- ``auto``   — the matcher would auto-merge the pair (score 1.0,
  shared identity key, equivalent names);
- ``review`` — the pair lands in the review band (>= 0.65);
- ``none``   — the matcher would not propose the pair at all.

Metrics (printed, and written to ``docs/MERGE-HOLDOUT.md`` with
``--write-report``):

- **band precision** — of the pairs the matcher proposes (auto or
  review), the share labelled ``same``;
- **review rate** — the share of all labelled pairs the matcher
  proposes for at least human review;
- **false-merge rate** — auto-merges of ``distinct`` pairs as a
  share of all auto-merges (undefined, reported as ``n/a``, when
  the matcher auto-merges nothing);
- **same recall** — the share of ``same`` pairs proposed at all;
- **distinct containment** — the share of ``distinct`` pairs kept
  out of the auto-merge path (must be 1.0; a false auto-merge is
  the one failure this project cannot undo cheaply, so the script
  exits non-zero when one appears).

The holdout's known bias (post-merge registry state; see
``scripts/build_merge_holdout.py``) means the auto-merge path is
rarely exercised here — it is covered by the unit tests in
``tests/test_entity_resolution.py``. This evaluation measures the
review band the holdout labels actually describe.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))

import entity_resolution as er  # noqa: E402


def evaluate_case(case):
    """Replay one holdout case; return 'auto' | 'review' | 'none'."""
    subject, candidate = case['subject'], case['candidate']
    registry = {'entities': {candidate['id']: {
        'kind': candidate['kind'],
        'name': candidate['name'],
        'identity_key': candidate['identity_key'],
    }}}
    results = er.match_candidates(
        subject['name'], subject['identity_key'], subject['kind'], registry)
    if not results:
        return 'none'
    return 'auto' if results[0]['auto_merge'] else 'review'


def evaluate(holdout):
    """Return the metrics dict for a holdout dict."""
    rows = [(c['label'], evaluate_case(c)) for c in holdout['cases']]
    total = len(rows)
    proposed = [r for r in rows if r[1] != 'none']
    autos = [r for r in rows if r[1] == 'auto']
    same = [r for r in rows if r[0] == 'same']
    distinct = [r for r in rows if r[0] == 'distinct']
    false_merges = [r for r in autos if r[0] == 'distinct']
    return {
        'cases': total,
        'same': len(same),
        'distinct': len(distinct),
        'proposed': len(proposed),
        'auto_merges': len(autos),
        'false_merges': len(false_merges),
        'band_precision': (sum(1 for r in proposed if r[0] == 'same')
                           / len(proposed)) if proposed else None,
        'review_rate': len(proposed) / total if total else None,
        'false_merge_rate': (len(false_merges) / len(autos)) if autos else None,
        'same_recall': (sum(1 for r in same if r[1] != 'none')
                        / len(same)) if same else None,
        'distinct_containment': (sum(1 for r in distinct if r[1] != 'auto')
                                 / len(distinct)) if distinct else None,
        'rows': rows,
    }


def _pct(value):
    return 'n/a' if value is None else f'{value * 100:.1f}%'


def render_report(holdout, metrics):
    lines = [
        '# Merge matcher holdout (#88)',
        '',
        'Labelled set: every decided `merge` entry in '
        '`data/review-queue.json`, frozen in `data/merge-holdout.json` '
        f"({metrics['cases']} pairs: {metrics['same']} same-entity, "
        f"{metrics['distinct']} distinct). Regenerate with "
        '`python3 scripts/build_merge_holdout.py`, re-measure with '
        '`npm run report:merge-holdout`.',
        '',
        '| Metric | Value |',
        '| --- | --- |',
        f"| Band precision (proposed pairs that are truly the same entity) "
        f"| {_pct(metrics['band_precision'])} "
        f"({sum(1 for r in metrics['rows'] if r[1] != 'none' and r[0] == 'same')}"
        f"/{metrics['proposed']}) |",
        f"| Review rate (labelled pairs proposed at all) "
        f"| {_pct(metrics['review_rate'])} |",
        f"| Same-entity recall (same pairs proposed) "
        f"| {_pct(metrics['same_recall'])} |",
        f"| Auto-merges in replay | {metrics['auto_merges']} |",
        f"| False merges (distinct pairs auto-merged) "
        f"| {metrics['false_merges']} |",
        f"| False-merge rate | {_pct(metrics['false_merge_rate'])} |",
        f"| Distinct containment (distinct pairs kept out of auto-merge) "
        f"| {_pct(metrics['distinct_containment'])} |",
        '',
        'Known bias: the registry is post-merge state, so a merged-away '
        "subject's pre-merge identity key is not always recoverable and "
        'the auto-merge path is rarely exercised by this replay; it is '
        'covered by the unit tests in `tests/test_entity_resolution.py`. '
        'This holdout measures the review band the labels describe. '
        'Cases whose name is marked `subject-key-slug` in the holdout '
        'file are reconstructed from the queue subject key; the matcher '
        'tokenises names through the same slug function, so the '
        'reconstruction is exact for scoring.',
        '',
    ]
    return '\n'.join(lines)


def main():
    holdout = json.loads((ROOT / 'data' / 'merge-holdout.json').read_text())
    metrics = evaluate(holdout)
    print(json.dumps({k: v for k, v in metrics.items() if k != 'rows'},
                     indent=1))
    if '--write-report' in sys.argv:
        (ROOT / 'docs' / 'MERGE-HOLDOUT.md').write_text(
            render_report(holdout, metrics))
        print('wrote docs/MERGE-HOLDOUT.md')
    if metrics['false_merges']:
        print('FAIL: false auto-merge(s) in holdout replay', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
