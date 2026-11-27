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
adds the scopes the health check does not track, in the same scope-entry
shape: people with no recorded socials (graph level), and -- because the
manual coverage waves of Nov 2026 showed aggregate counts do not get
worked -- per-entity field scopes over the reviewed data files:
founder rows missing a photo or a LinkedIn profile (from
startup-research.json) and reviewed partners missing a logo or a
LinkedIn company page (from partners-reviewed.json). Those scopes name
every uncovered entity, so the daily crawl's gap list is a worklist,
not a statistic.
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


def _slug(name):
    """Row-reference slug, matching build-review-queue's ``slug``."""
    import re
    return re.sub(r'[^a-z0-9]+', '-', str(name).casefold()).strip('-')


def _founder_has_linkedin(founder):
    """A founder row records LinkedIn via the field or a socials entry."""
    if founder.get('linkedin'):
        return True
    for social in founder.get('socials') or []:
        if not isinstance(social, dict):
            continue
        url = social.get('url') or ''
        host = url.split('/')[2] if '://' in url else ''
        if host.endswith('linkedin.com') and '/in/' in url:
            return True
    return False


def founder_scopes(research):
    """Per-founder photo / LinkedIn scopes over startup-research rows.

    The graph-level person-headshots and person-socials scopes cannot
    say *which field* a given founder is missing (any social covers the
    socials scope; the graph portrait can lag the founder row). These
    scopes name every uncovered founder row as
    ``founder:<startup-slug>:<founder-slug>`` so the gap list is the
    worklist for the headshot and socials producers.
    """
    startups = (research or {}).get('startups') or []
    rows = []
    for startup in startups:
        if not isinstance(startup, dict):
            continue
        for founder in startup.get('founders') or []:
            if isinstance(founder, dict) and founder.get('name'):
                rows.append((startup.get('name') or '', founder))
    if not rows:
        return []
    scopes = []
    for scope_id, covered_fn in (
            ('founder-photos', lambda f: bool(f.get('photo_url'))),
            ('founder-linkedin', _founder_has_linkedin)):
        uncovered = sorted(
            f'founder:{_slug(company)}:{_slug(founder["name"])}'
            for company, founder in rows if not covered_fn(founder))
        ratio = (len(rows) - len(uncovered)) / len(rows)
        scopes.append({
            'scope_id': scope_id,
            'entity_kind': 'founder',
            'eligible_total': len(rows),
            'counts': {'covered': len(rows) - len(uncovered),
                       'uncovered': len(uncovered)},
            'verification_ratio': ratio,
            'completion': 'complete' if ratio == 1 else 'partial',
            'uncovered_ids': uncovered,
        })
    return scopes


def partner_scopes(partners):
    """Per-partner logo / LinkedIn scopes over partners-reviewed rows.

    Partner records carry optional ``logo`` and ``linkedin`` fields
    (additive; absence is the gap). Uncovered partners are named as
    ``partner:<slug>``.
    """
    rows = [(name, record) for name, record in (partners or {}).items()
            if isinstance(record, dict)]
    if not rows:
        return []
    scopes = []
    for scope_id, field in (('partner-logos', 'logo'),
                            ('partner-linkedin', 'linkedin')):
        uncovered = sorted(f'partner:{_slug(name)}'
                           for name, record in rows
                           if not record.get(field))
        ratio = (len(rows) - len(uncovered)) / len(rows)
        scopes.append({
            'scope_id': scope_id,
            'entity_kind': 'partner',
            'eligible_total': len(rows),
            'counts': {'covered': len(rows) - len(uncovered),
                       'uncovered': len(uncovered)},
            'verification_ratio': ratio,
            'completion': 'complete' if ratio == 1 else 'partial',
            'uncovered_ids': uncovered,
        })
    return scopes


def build_report(graph, *, generated_at, catalogue_revision=None,
                 research=None, partners=None):
    """Structured gap report for one graph snapshot.

    ``research`` (startup-research.json) and ``partners``
    (partners-reviewed.json) are optional: when supplied, the report
    gains the per-entity founder and partner field scopes. The CLI
    passes the committed files by default, so the workflow's existing
    invocation emits them with no workflow change.
    """
    scopes = gap_scopes(graph)
    if research is not None:
        scopes.extend(founder_scopes(research))
    if partners is not None:
        scopes.extend(partner_scopes(partners))
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
    parser.add_argument('--research', type=Path,
                        default=ROOT / 'data/startup-research.json',
                        help='Reviewed startup research for the founder '
                             'field scopes (skipped when unreadable)')
    parser.add_argument('--partners', type=Path,
                        default=ROOT / 'data/partners-reviewed.json',
                        help='Reviewed partners for the partner field '
                             'scopes (skipped when unreadable)')
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
    def _optional_json(path):
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            return data if isinstance(data, dict) else None
        except (OSError, ValueError):
            return None

    report = build_report(graph, generated_at=generated_at,
                          catalogue_revision=args.catalogue_revision,
                          research=_optional_json(args.research),
                          partners=_optional_json(args.partners))
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
