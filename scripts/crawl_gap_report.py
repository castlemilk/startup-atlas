#!/usr/bin/env python3
"""Post-crawl completeness gap report (issue #532).

The crawl counts pages and candidates, never entity completeness, so
catalogue gaps -- startups with zero funding rounds, cohort members
whose accelerator participation never became a round, missing logos and
headshots, people with no socials, rounds with no lead investor -- were
only ever found by hand (25 Nov 2026 crawler self-critique). This script
is the crawl pipeline's mandatory gap-report step: it computes the gaps
from the committed graph and emits a structured report (JSON, plus an
optional Markdown summary) that the partner-research workflow records
into the crawl artifact alongside the run registry (issue #538), so a
crawl run's bookkeeping always carries the current gap list. A crawl
does not count as done until this report runs clean or its gaps are
filed.

The scope math is not duplicated here: the five graph scopes come from
``loop_health_check.coverage_scopes`` (the #537 coverage signal, whose
denominators follow docs/COLLECTION-COVERAGE-CONTRACT.md). This script
adds the one scope the health check does not track -- people with no
recorded socials -- in the same scope-entry shape.
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

from loop_health_check import coverage_scopes  # noqa: E402

VERSION = 1


def socials_scope(graph):
    """People with no recorded socials, in the coverage_scopes shape.

    A person counts as covered when their graph entity carries at least
    one socials entry (the reviewed founder-enrichment field); an empty
    or missing list is a gap.
    """
    entities = [e for e in graph.get('entities') or [] if isinstance(e, dict)]
    people = {e.get('id') for e in entities if e.get('kind') == 'person'}
    people.discard(None)
    if not people:
        return None
    covered = {e.get('id') for e in entities
               if e.get('kind') == 'person' and e.get('socials')}
    covered &= people
    uncovered = people - covered
    ratio = len(covered) / len(people)
    return {
        'scope_id': 'person-socials',
        'entity_kind': 'person',
        'eligible_total': len(people),
        'counts': {'covered': len(covered), 'uncovered': len(uncovered)},
        'verification_ratio': ratio,
        'completion': 'complete' if ratio == 1 else 'partial',
        'uncovered_ids': sorted(uncovered),
    }


def gap_scopes(graph):
    """All gap scopes over the graph: the #537 scopes plus socials."""
    scopes = coverage_scopes(graph)
    socials = socials_scope(graph)
    if socials is not None:
        scopes.append(socials)
    return scopes


def build_report(graph, *, generated_at, catalogue_revision=None):
    """Structured gap report for one graph snapshot."""
    scopes = gap_scopes(graph)
    return {
        'version': VERSION,
        'generated_at': generated_at,
        'catalogue_revision': catalogue_revision,
        'scopes': scopes,
        'totals': {
            'eligible': sum(s['eligible_total'] for s in scopes),
            'covered': sum(s['counts']['covered'] for s in scopes),
            'uncovered': sum(s['counts']['uncovered'] for s in scopes),
        },
    }


def render_summary(report):
    """Readable Markdown summary, in the crawl artifact next to the JSON."""
    totals = report['totals']
    lines = [
        '# Crawl gap report',
        '',
        f"Generated: {report['generated_at']}",
    ]
    if report.get('catalogue_revision'):
        lines.append(f"Catalogue revision: {report['catalogue_revision']}")
    lines += [
        '',
        f"**{totals['uncovered']} gaps** across {len(report['scopes'])} "
        f"scopes ({totals['covered']} of {totals['eligible']} eligible "
        'entities covered). A crawl does not count as done until this '
        'report runs clean or the gaps below are filed.',
        '',
    ]
    for scope in report['scopes']:
        counts = scope['counts']
        lines.append(
            f"## {scope['scope_id']} — {counts['covered']} of "
            f"{scope['eligible_total']} covered, {counts['uncovered']} gaps")
        lines.append('')
        if scope['uncovered_ids']:
            for entity_id in scope['uncovered_ids']:
                lines.append(f'- {entity_id}')
        else:
            lines.append('No gaps.')
        lines.append('')
    return '\n'.join(lines)


def _write(path, text):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    os.replace(temporary, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--graph', type=Path, default=ROOT / 'data/graph.json',
                        help='Committed graph the gaps are computed from')
    parser.add_argument('--out', type=Path, default=None,
                        help='Write the JSON report here (default: stdout)')
    parser.add_argument('--summary-md', type=Path, default=None,
                        help='Also write a Markdown summary here')
    parser.add_argument('--catalogue-revision', default=None,
                        help='Main commit the crawl was based on (github.sha)')
    parser.add_argument('--generated-at', default=None,
                        help='ISO timestamp for the report (defaults to now, UTC)')
    args = parser.parse_args(argv)
    generated_at = args.generated_at or datetime.now(timezone.utc).strftime(
        '%Y-%m-%dT%H:%M:%SZ')
    try:
        graph = json.loads(args.graph.read_text(encoding='utf-8'))
        if not isinstance(graph, dict):
            raise ValueError(f'{args.graph} is not a graph object')
    except (OSError, ValueError) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 2
    report = build_report(graph, generated_at=generated_at,
                          catalogue_revision=args.catalogue_revision)
    text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if args.out is not None:
        _write(args.out, text)
    else:
        print(text, end='')
    if args.summary_md is not None:
        _write(args.summary_md, render_summary(report))
    for scope in report['scopes']:
        print(f"{scope['scope_id']}: {scope['counts']['covered']} of "
              f"{scope['eligible_total']} covered, "
              f"{scope['counts']['uncovered']} gaps")
    print(f"total: {report['totals']['uncovered']} gaps across "
          f"{len(report['scopes'])} scopes")
    return 0


if __name__ == '__main__':
    sys.exit(main())
