#!/usr/bin/env python3
"""Build a deterministic, attributed graph from reviewed repository data.

Graph format version 2 (additive over version 1 — no existing key is removed
or renamed, so old readers ignore the new fields):

- Entities gain ``canonical_id`` (same as ``id`` today, so a merged ID can be
  traced to its canonical winner) and ``aliases`` (list, default ``[]``).
- Edges gain freshness + confidence fields (see ``scripts/edge_scoring.py``,
  design doc ``docs/KG-CONNECTIVE-TISSUE.md`` §2):
  ``first_seen``, ``last_verified``, ``confidence``, ``confidence_basis``,
  ``stale``.
- Funding edges: a round's ``lead_investor`` emits ``led_round``
  (funder → startup) and each entry of ``participants`` emits
  ``participated_in``. The funder is resolved against the partner leads
  (by slug, or by alias/host via ``data/identity.json`` when present); an
  unmatched funder skips that edge and is counted in the build warnings —
  the build never fails on partial data.
- Identity hook: when ``data/identity.json`` exists, any ``merged_from``
  ID resolves to its canonical winner before edges are emitted (and the
  old ID is kept in the winner's ``aliases``). When it is absent,
  behaviour is unchanged.
- Records carrying ``superseded_by`` (``profile_facts`` / ``funding_rounds``)
  are excluded from the live graph; they stay in the reviewed files, marked.

Relationship vocabulary: ``founded``, ``team_member``, ``supports``,
``supports_programme``, ``offers``, ``programme_relationship``,
``led_round``, ``participated_in``, ``subsidiary_of``, ``integrates_with``,
``listed_in_portfolio``.

Edges from a portfolio are only labelled as the source describes; source text is
not evidence of an investment round or an active provider entitlement.

``last_verified`` sourcing, in order: the source record's ``reviewed_at`` /
``checked`` date; the research file's ``reviewed`` date as a last resort for
research-derived edges; otherwise ``null`` (and the edge is stale). There is
no per-edge crawl-run provenance in this builder's inputs, so the crawl-run
step of the §2 chain does not apply here — no date is invented.
``first_seen`` is the earliest date actually known for the edge; with the
single-date sources available here that is the same date as
``last_verified``, and ``null`` when no date is known.
"""
import json
import os
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import edge_scoring as _edge_scoring
except ImportError:  # subagent B's module not landed yet; use the §2 model below
    _edge_scoring = None

ROOT = Path(__file__).resolve().parents[1]

# Freshness horizon from the design doc (§2): stale after 90 days unverified.
STALE_AFTER_DAYS = 90


def load(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))


def slug(name):
    value = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')


def _host(url):
    """Normalised host for identity/source comparison (lowercase, no www.)."""
    if not url:
        return ''
    host = urlparse(url).netloc.lower()
    if host.startswith('www.'):
        host = host[4:]
    return host.rstrip('.')


def _as_date(value):
    """Parse an ISO date/datetime string to a date, or None when unparseable."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _score_edge_fallback(sources):
    """Faithful local implementation of the §2 scoring model.

    Base 0.50 for a single reviewed source; +0.15 per additional independent
    source (distinct host), capped at 0.95; +0.10 if any source is primary;
    -0.20 if any part of the edge is inferred; a single source caps at 0.80
    (> 0.80 requires >= 2 independent sources agreeing); floor 0.05.
    Scores are rounded to 2 decimals.
    """
    if not sources:
        return 0.05
    hosts = {source.get('host', '') or '' for source in sources}
    score = 0.50
    score += 0.15 * max(0, len(hosts) - 1)
    if any(source.get('type') == 'primary' for source in sources):
        score += 0.10
    if any(source.get('inferred') for source in sources):
        score -= 0.20
    if len(hosts) < 2:
        score = min(score, 0.80)
    return round(max(0.05, min(0.95, score)), 2)


def _stale_fallback(last_verified, today):
    """Stale when last_verified is more than 90 days old or absent."""
    verified = _as_date(last_verified)
    if verified is None:
        return True
    return (today - verified).days > STALE_AFTER_DAYS


def _score(sources):
    if _edge_scoring is not None and hasattr(_edge_scoring, 'score_edge'):
        return _edge_scoring.score_edge(sources)
    return _score_edge_fallback(sources)


def _is_stale(last_verified, today):
    if _edge_scoring is not None and hasattr(_edge_scoring, 'freshness'):
        return bool(_edge_scoring.freshness(last_verified, today)['stale'])
    return _stale_fallback(last_verified, today)


def _identity_maps(identity):
    """Build (merge_map, aliases) from a data/identity.json registry.

    merge_map maps every merged-from ID to its canonical winner; aliases
    maps a canonical ID to its recorded alias list.
    """
    merge_map, aliases = {}, {}
    if not identity:
        return merge_map, aliases
    for entry in identity.get('merges', []) or []:
        if entry.get('from') and entry.get('to'):
            merge_map[entry['from']] = entry['to']
    for canonical, record in (identity.get('entities', {}) or {}).items():
        for old in record.get('merged_from', []) or []:
            merge_map.setdefault(old, canonical)
        if record.get('aliases'):
            aliases[canonical] = list(record['aliases'])
    return merge_map, aliases


def build_graph(profiles, leads, reviewed, catalogue, research, identity=None,
                today=None):
    today = _as_date(today) or date.today()
    merge_map, registry_aliases = _identity_maps(identity)
    research_reviewed = research.get('reviewed')

    def resolve(identity_id):
        seen = set()
        while identity_id in merge_map and identity_id not in seen:
            seen.add(identity_id)
            identity_id = merge_map[identity_id]
        return identity_id

    nodes, edges, rounds, articles = {}, [], [], []
    warnings = []
    # Parallel to edges: the verified date for each edge, from the sourcing
    # chain in the module docstring (None when no date is known).
    edge_verified = []

    def add(kind, name, identity=None, **fields):
        raw_identity = identity or kind + ':' + slug(name)
        identity = resolve(raw_identity)
        if not slug(name):
            raise ValueError(f'Empty entity identity: {name!r}')
        merged = identity != raw_identity
        existing = nodes.get(identity)
        if existing and existing['name'].casefold() != name.casefold() and not merged:
            raise ValueError(f'Ambiguous entity slug: {existing["name"]!r}, {name!r}')
        aliases = set(registry_aliases.get(identity, []))
        if merged:
            aliases.add(raw_identity)
            if existing and name.casefold() != existing['name'].casefold():
                aliases.add(name)
        if existing:
            existing.update({k: v for k, v in fields.items() if v})
            existing['aliases'] = sorted(set(existing.get('aliases', [])) | aliases)
        else:
            nodes[identity] = {'id': identity, 'canonical_id': identity,
                               'aliases': sorted(aliases), 'kind': kind,
                               'name': name, **fields}
        return identity

    def emit(edge, verified):
        edges.append(edge)
        edge_verified.append(verified)

    partner_slugs = {slug(name) for name in leads}
    partner_slugs.update(slug(name) for name in reviewed)
    partner_slugs.update(slug(name) for name in profiles)
    partner_by_alias = {}
    if identity:
        for canonical, record in (identity.get('entities', {}) or {}).items():
            if not canonical.startswith('partner:'):
                continue
            for alias in record.get('aliases', []) or []:
                partner_by_alias[slug(alias)] = canonical
            host = record.get('identity_key') or ''
            if host and '.' in host:
                partner_by_alias[host] = canonical

    def resolve_funder(name):
        """Resolve a funder name to a partner node id, or None when unmatched."""
        candidate = partner_by_alias.get(slug(name))
        if candidate is None:
            candidate = 'partner:' + slug(name)
            if slug(name) not in partner_slugs:
                return None
        candidate = resolve(candidate)
        if candidate not in nodes:
            return None
        return candidate

    for name in leads:
        record = reviewed.get(name, {})

        add('partner', name, summary=record.get('description',''), website=record.get('website',''), source=record.get('source',''))
    for provider in research.get('technology_providers', []):
        add('provider', provider['name'], summary=provider['description'], website=provider['website'],
            source=provider['source'], logo=provider.get('logo',''), logo_source=provider.get('logo_source',''))

    for offer in catalogue['opportunities']:
        provider_id = add('provider', offer['org'])
        # The catalogue identifies the programme operator; it does not imply
        # an entitlement or establish partnerships with unrelated firms.
        if offer.get('url'):
            programme_id = add('programme', offer['name'], identity='programme:' + offer['id'],
                               summary=offer.get('summary', ''), website=offer['url'],
                               source=offer['url'], opportunity_id=offer['id'])
            emit({'from': provider_id, 'to': programme_id, 'kind': 'offers',
                  'description': 'Programme offered by', 'source': offer['url']},
                 offer.get('checked'))
    for partner, profile in profiles.items():
        partner_id = add('partner', partner)
        partner_verified = reviewed.get(partner, {}).get('reviewed_at')
        for person in profile.get('people', []):
            # Team entries are scoped to the firm until their identities have
            # been explicitly reconciled with other people in the graph.
            person_id = add('person', person['name'], identity='person:' + slug(person['name']) + '--' + slug(partner),
                            source=person['source'], logo=person.get('photo', ''),
                            logo_source=person.get('photo_source', ''), socials=person.get('socials', []))
            emit({'from': person_id, 'to': partner_id, 'kind': 'team_member',
                  'description': person.get('role', 'Team member'), 'source': person['source']},
                 person.get('reviewed_at') or partner_verified)
        for company in profile.get('companies', []):
            startup_id = add('startup', company['name'])
            if company.get('logo') and company.get('logo_source'):
                nodes[startup_id]['logo'] = company['logo']
                nodes[startup_id]['logo_source'] = company['logo_source']
            emit({'from': partner_id, 'to': startup_id, 'kind': 'supports',
                  'description': company.get('relationship', 'Listed in portfolio'),
                  'source': company['source']},
                 company.get('reviewed_at') or partner_verified)
        for sponsor in profile.get('sponsors', []):
            sponsor_id = add('provider', sponsor['name'])
            if sponsor.get('logo') and sponsor.get('logo_source'):
                nodes[sponsor_id]['logo'] = sponsor['logo']
                nodes[sponsor_id]['logo_source'] = sponsor['logo_source']
            emit({'from': sponsor_id, 'to': partner_id, 'kind': 'supports_programme',
                  'description': sponsor.get('relationship', 'Programme supporter'),
                  'source': sponsor['source']},
                 sponsor.get('reviewed_at') or partner_verified)
    for startup in research['startups']:

        live_facts = [fact for fact in startup.get('profile_facts', [])
                      if 'superseded_by' not in fact]
        startup_id = add('startup', startup['name'], summary=startup.get('description', ''), website=startup.get('website', ''), source=startup.get('source', ''), **({'founded_year': startup['founded_year']} if 'founded_year' in startup else {}), logo=startup.get('logo', ''), logo_source=startup.get('logo_source', ''), profile_facts=live_facts, socials=startup.get('socials', []))
        for founder in startup.get('founders', []):
            founder_id = add('person', founder['name'], source=founder['source'], website=founder.get('profile_url', ''), logo=founder.get('photo_url', ''), logo_source=founder.get('photo_source', ''), **({'socials': founder['socials']} if founder.get('socials') else {}))
            emit({'from': founder_id, 'to': startup_id, 'kind': 'founded',
                  'description': 'Founder', 'source': founder['source']},
                 founder.get('reviewed_at') or research_reviewed)
        for event in startup.get('funding_rounds', []):
            if 'superseded_by' in event:
                continue
            rounds.append({'startup_id': startup_id, **event})
            articles.append({'startup_id': startup_id, 'title': startup['name'] + ' — ' + event['stage'], 'url': event['source'], 'published_on': event.get('announced_on', ''), 'kind': 'funding source'})
            round_verified = event.get('reviewed_at') or event.get('checked') or research_reviewed
            stage = event.get('stage') or 'funding'
            lead = event.get('lead_investor')
            if lead:
                funder_id = resolve_funder(lead)
                if funder_id is None:
                    warnings.append(
                        f"lead_investor {lead!r} for round {event.get('id')} "
                        f"({startup['name']}) has no matching partner lead; "
                        f"led_round edge skipped")
                else:
                    emit({'from': funder_id, 'to': startup_id, 'kind': 'led_round',
                          'description': f'Led {stage} round', 'source': event['source'],
                          'round_id': event.get('id')}, round_verified)
            for participant in event.get('participants', []) or []:
                funder_id = resolve_funder(participant)
                if funder_id is None:
                    warnings.append(
                        f"participant {participant!r} for round {event.get('id')} "
                        f"({startup['name']}) has no matching partner lead; "
                        f"participated_in edge skipped")
                else:
                    emit({'from': funder_id, 'to': startup_id, 'kind': 'participated_in',
                          'description': f'Participated in {stage} round',
                          'source': event['source'], 'round_id': event.get('id')},
                         round_verified)
        for article in startup.get('articles', []):
            articles.append({'startup_id': startup_id, 'title': article['title'], 'url': article['url'], 'published_on': article.get('published_on', ''), 'kind': article.get('kind', 'news')})

    for startup in research['startups']:
        startup_id = 'startup:' + slug(startup['name'])
        for relation in startup.get('relationships', []):
            target = resolve(relation['target_id'])
            if target not in nodes or target == startup_id:
                raise ValueError(f'Unknown or self relationship target: {relation["target_id"]}')
            emit({'from': startup_id, 'to': target, 'kind': relation['kind'],
                  'description': relation['description'], 'source': relation['source']},
                 relation.get('reviewed_at') or research_reviewed)
    round_ids = [round['id'] for round in rounds]
    if len(round_ids) != len(set(round_ids)):
        raise ValueError('Funding round identifiers must be unique')
    key = lambda x: (x['from'], x['to'], x['kind'], x['source'])
    seen = set()
    unique, unique_verified = [], []
    for edge, verified in sorted(zip(edges, edge_verified), key=lambda pair: key(pair[0])):
        if key(edge) not in seen:
            unique.append(edge)
            unique_verified.append(verified)
            seen.add(key(edge))
    # Enrich every edge with the §2 freshness + confidence fields. A source is
    # primary when it is the subject's own site (source host matches either
    # endpoint's website host); otherwise secondary. Nothing here is inferred.
    enriched = []
    for edge, verified in zip(unique, unique_verified):
        last_verified = _as_date(verified)
        source_host = _host(edge.get('source', ''))
        endpoint_hosts = {_host(nodes[endpoint].get('website', ''))
                          for endpoint in (edge['from'], edge['to'])
                          if endpoint in nodes}
        is_primary = bool(source_host) and source_host in endpoint_hosts
        sources = [{'type': 'primary' if is_primary else 'secondary',
                    'url': edge.get('source', ''), 'reviewed_at': verified}]
        if (_edge_scoring is not None
                and hasattr(_edge_scoring, 'build_confidence_basis')):
            basis = _edge_scoring.build_confidence_basis(sources)
        else:
            basis = {'sources': 1,
                     'source_types': ['primary' if is_primary else 'secondary'],
                     'agreement': False, 'inferred': False}
        edge['first_seen'] = last_verified.isoformat() if last_verified else None
        edge['last_verified'] = last_verified.isoformat() if last_verified else None
        edge['confidence'] = _score(sources)
        edge['confidence_basis'] = basis
        edge['stale'] = _is_stale(last_verified, today)
        enriched.append(edge)
    # An article explicitly supplied by a reviewer can enrich the auto-created funding link.
    unique_articles = {(article['startup_id'], article['url']): article for article in articles}
    return {'version': 2,
            'entities': sorted(nodes.values(), key=lambda n: n['id']),
            'edges': enriched,
            'funding_rounds': sorted(rounds, key=lambda r: r['id']),
            'articles': sorted(unique_articles.values(), key=lambda a: (a['startup_id'], a['url'])),
            'warnings': sorted(warnings)}


def main():
    identity = None
    identity_path = ROOT / 'data' / 'identity.json'
    if identity_path.is_file():
        identity = json.loads(identity_path.read_text(encoding='utf-8'))
    graph = build_graph(load('partner-profiles.json'), load('partner-leads.json'), load('partners-reviewed.json'), load('catalogue.json'), load('startup-research.json'), identity=identity)
    if os.environ.get('ATLAS_SOURCE_REVISION'):
        graph['source_revision'] = os.environ['ATLAS_SOURCE_REVISION']
    content = json.dumps(graph, ensure_ascii=False, indent=2) + '\n'
    for name in ['data/graph.json', 'backend/internal/graph/snapshot.json']:
        target = ROOT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
    print(f"Graph: {len(graph['entities'])} entities, {len(graph['edges'])} sourced edges, {len(graph['funding_rounds'])} funding rounds")
    if graph['warnings']:
        print(f"Build warnings ({len(graph['warnings'])}):")
        for warning in graph['warnings']:
            print(f"  - {warning}")


if __name__ == '__main__':
    main()
