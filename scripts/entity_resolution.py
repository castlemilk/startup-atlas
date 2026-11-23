#!/usr/bin/env python3
"""Shared identity / entity resolution for the Startup Atlas knowledge graph.

Design: docs/KG-CONNECTIVE-TISSUE.md section 1.

Canonical IDs keep the existing scheme from scripts/make-graph.py:
``kind:slug(name)`` (``startup:canva``, ``partner:airtree``,
``person:melanie-perkins``). ``slug()`` is imported from make-graph.py so
the normalisation never drifts between the two modules.

Identity keys (the join key per kind):

- Startup / partner / provider: normalised website host (lowercase, strip
  ``www.``, strip trailing dot). No website means no identity key.
- Person: normalised LinkedIn URL (``linkedin.com/in/<slug>``, lowercase
  host, query params and trailing slash stripped). Otherwise the person
  stays scoped per partner (``person:<slug>--<partner>``), as today.

Matching thresholds (from the design):

- auto-merge >= 0.90, and ONLY with a shared identity key (website host
  or LinkedIn URL). Name similarity alone never auto-merges.
- review band 0.65-0.90 -> the validation queue.
- below 0.65 -> no proposal.

An entry with no website and no LinkedIn gets
``identity_basis: "name-only"`` and ``identity_key: null``: the canonical
ID (``kind:slug(name)``) is its only identifier, and it is never treated
as a shared identity key, so a name-only entry can never auto-merge.
"""
import difflib
import json
import re
import subprocess
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

# Reuse make-graph.py's slug() so canonical IDs never drift. Loaded via
# importlib because scripts/ is not a package (same pattern as the tests).
import importlib.util

def _load_make_graph():
    spec = importlib.util.spec_from_file_location(
        'atlas_make_graph', ROOT / 'scripts' / 'make-graph.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

slug = _load_make_graph().slug

REGISTRY_VERSION = 1
AUTO_MERGE_THRESHOLD = 0.90
REVIEW_MIN_SCORE = 0.65
# A score without a shared identity key is capped below the auto-merge
# threshold: name similarity alone can propose, never merge.
NAME_ONLY_SCORE_CAP = 0.89


def _utcnow():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def normalise_host(value):
    """Normalise a website URL or bare host to a joinable host key.

    Lowercases, strips a leading ``www.``, strips a trailing dot, and
    drops any path, query, fragment, port or userinfo. Returns ``''``
    for an empty/unparseable value.
    """
    if not value:
        return ''
    text = str(value).strip().lower()
    if '://' not in text:
        text = 'https://' + text
    try:
        host = urlparse(text).hostname or ''
    except ValueError:
        host = ''
    if host.startswith('www.'):
        host = host[4:]
    return host.rstrip('.')


def normalise_linkedin(value):
    """Normalise a LinkedIn profile URL to ``linkedin.com/in/<slug>``.

    Lowercases the host, strips query params and trailing slash, and
    collapses locale subdomains (``au.linkedin.com`` -> ``linkedin.com``).
    Returns ``''`` when the value is not a LinkedIn ``/in/`` profile URL.
    """
    if not value:
        return ''
    text = str(value).strip()
    if '://' not in text:
        text = 'https://' + text
    try:
        parsed = urlparse(text)
    except ValueError:
        return ''
    host = (parsed.hostname or '').lower()
    if host.startswith('www.'):
        host = host[4:]
    # Locale subdomains (au., uk., ...) are the same LinkedIn.
    if host.endswith('.linkedin.com'):
        host = 'linkedin.com'
    if host != 'linkedin.com':
        return ''
    path = parsed.path.strip('/').lower()
    match = re.match(r'in/([a-z0-9][a-z0-9\-]*)$', path)
    if not match:
        return ''
    return 'linkedin.com/in/' + match.group(1)


def identity_key_for(kind, website=None, linkedin_url=None):
    """Return ``(identity_key, identity_basis)`` for one entity.

    Persons resolve on their LinkedIn URL; every other kind resolves on
    its website host. With neither, the basis is ``"name-only"`` and the
    key is ``None`` (see the module docstring).
    """
    if kind == 'person':
        key = normalise_linkedin(linkedin_url) if linkedin_url else ''
        if key:
            return key, 'linkedin-url'
        return None, 'name-only'
    key = normalise_host(website) if website else ''
    if key:
        return key, 'website-host'
    return None, 'name-only'


def _name_tokens(name):
    return set(slug(name).split('-')) - {''}


def name_similarity(a, b):
    """Token-based name similarity in [0, 1].

    The max of token Jaccard, token containment (one name's tokens fully
    inside the other's, e.g. ``Canva`` vs ``Canva Pty Ltd``), and a
    character-level ratio on the slugs (catches ``LaunchVic`` vs
    ``Launch Vic``). Similarity alone never auto-merges; it only feeds
    the review band, so erring towards proposing is the safe direction.
    """
    tokens_a, tokens_b = _name_tokens(a), _name_tokens(b)
    if not tokens_a or not tokens_b:
        return 0.0
    shared = tokens_a & tokens_b
    jaccard = len(shared) / len(tokens_a | tokens_b)
    containment = len(shared) / min(len(tokens_a), len(tokens_b))
    char_ratio = difflib.SequenceMatcher(None, slug(a), slug(b)).ratio()
    return max(jaccard, containment, 0.85 * char_ratio)


def match_candidates(name, identity_key, kind, registry):
    """Return scored merge candidates for one entity, best first.

    ``identity_key`` is the entity's own key (a website host for
    startups/partners/providers, a LinkedIn URL for people); it is
    normalised here, so callers may pass a raw URL. ``registry`` is a
    registry dict as produced by :func:`build_registry` (or loaded from
    ``data/identity.json``).

    Each candidate is ``{"id", "name", "score", "basis", "identity_key",
    "auto_merge"}``. Only candidates scoring >= 0.65 are returned. An
    exact identity-key match scores 1.0 and is the only route to
    ``auto_merge``; anything else is capped at 0.89.
    """
    if kind == 'person':
        own_key = normalise_linkedin(identity_key) if identity_key else ''
    else:
        own_key = normalise_host(identity_key) if identity_key else ''
    entities = registry.get('entities', {})
    results = []
    for entity_id, entity in entities.items():
        if entity.get('kind') != kind:
            continue
        other_key = entity.get('identity_key') or ''
        # A shared identity key is an exact key match between two
        # entries that both actually have one. Name-only entries have
        # identity_key None, so they can never match this way.
        shared_key = bool(own_key and other_key and own_key == other_key)
        if shared_key:
            results.append({'id': entity_id, 'name': entity.get('name', ''),
                            'score': 1.0, 'basis': 'identity-key',
                            'identity_key': other_key, 'auto_merge': True})
            continue
        score = name_similarity(name, entity.get('name', ''))
        # Host bonus: same registrable domain under a different
        # subdomain (e.g. blog.example.com vs example.com) is weak
        # evidence — a nudge inside the review band, never a merge.
        if own_key and other_key:
            own_parts, other_parts = own_key.split('.'), other_key.split('.')
            if len(own_parts) >= 2 and len(other_parts) >= 2 \
                    and own_parts[-2:] == other_parts[-2:]:
                score = min(NAME_ONLY_SCORE_CAP, score + 0.10)
        score = min(score, NAME_ONLY_SCORE_CAP)
        if score >= REVIEW_MIN_SCORE:
            results.append({'id': entity_id, 'name': entity.get('name', ''),
                            'score': round(score, 2),
                            'basis': 'name-similarity',
                            'identity_key': other_key or None,
                            'auto_merge': False})
    results.sort(key=lambda c: (-c['score'], c['id']))
    return results


def apply_merge(registry, from_id, to_id, basis, decided_by, decided_at=None):
    """Record a merge of ``from_id`` into ``to_id``.

    Writes the record in both places the design requires: the canonical
    entity's ``entities[to_id]["merged_from"]`` and the top-level
    ``merges[]`` list. The losing entity is kept and marked with
    ``merged_into`` so the graph builder can resolve old edges to the
    winner. The winner inherits the loser's aliases. Raises ``ValueError``
    on unknown IDs, a self-merge, or merging an already-merged entity.
    """
    entities = registry.setdefault('entities', {})
    merges = registry.setdefault('merges', [])
    if from_id not in entities:
        raise ValueError(f'Unknown merge source: {from_id!r}')
    if to_id not in entities:
        raise ValueError(f'Unknown merge target: {to_id!r}')
    if from_id == to_id:
        raise ValueError('Cannot merge an entity into itself')
    if entities[from_id].get('merged_into'):
        raise ValueError(
            f'{from_id!r} already merged into {entities[from_id]["merged_into"]!r}')
    if any(m['from'] == from_id for m in merges):
        raise ValueError(f'{from_id!r} already has a recorded merge')
    decided_at = decided_at or _utcnow()
    winner = entities[to_id]
    loser = entities[from_id]
    loser_name = loser.get('name', '')
    if loser_name and loser_name.casefold() != winner.get('name', '').casefold():
        if loser_name not in winner.setdefault('aliases', []):
            winner['aliases'].append(loser_name)
    for alias in loser.get('aliases', []):
        if alias not in winner.setdefault('aliases', []):
            winner['aliases'].append(alias)
    if from_id not in winner.setdefault('merged_from', []):
        winner['merged_from'].append(from_id)
    winner['updated_at'] = decided_at
    loser['merged_into'] = to_id
    loser['updated_at'] = decided_at
    merges.append({'from': from_id, 'to': to_id, 'basis': basis,
                   'decided_by': decided_by, 'decided_at': decided_at})
    merges.sort(key=lambda m: (m['from'], m['to']))
    return registry


def resolve_canonical_id(registry, entity_id):
    """Follow ``merged_into`` links to the canonical winner of an ID.

    Returns ``entity_id`` unchanged when it is not merged. Follows
    chains (A -> B -> C) and raises ``ValueError`` on a merge cycle.
    """
    entities = registry.get('entities', {})
    seen = set()
    current = entity_id
    while current in entities and entities[current].get('merged_into'):
        if current in seen:
            raise ValueError(f'Merge cycle at {current!r}')
        seen.add(current)
        current = entities[current]['merged_into']
    return current


def _add_entity(entities, kind, name, identity_key, identity_basis,
                aliases=None, updated_at=None):
    entity_id = f'{kind}:{slug(name)}'
    if not slug(name):
        raise ValueError(f'Empty entity identity: {name!r}')
    existing = entities.get(entity_id)
    if existing is not None:
        if existing['name'].casefold() != name.casefold():
            raise ValueError(
                f'Ambiguous entity slug: {existing["name"]!r}, {name!r}')
        # A stronger identity basis replaces a weaker one (a website
        # found later beats an earlier name-only seed); a weaker one
        # never overwrites a stronger one.
        strength = {'name-only': 0, 'website-host': 1, 'linkedin-url': 1}
        if strength[identity_basis] > strength[existing['identity_basis']]:
            existing['identity_key'] = identity_key
            existing['identity_basis'] = identity_basis
        for alias in (aliases or []):
            if alias not in existing['aliases']:
                existing['aliases'].append(alias)
        existing['updated_at'] = updated_at or existing['updated_at']
        return entity_id
    entities[entity_id] = {
        'name': name,
        'kind': kind,
        'aliases': list(aliases or []),
        'identity_key': identity_key,
        'identity_basis': identity_basis,
        'merged_from': [],
        'updated_at': updated_at or _utcnow(),
    }
    return entity_id


def _linkedin_from_socials(socials):
    for social in socials or []:
        url = social.get('url', '') if isinstance(social, dict) else ''
        if normalise_linkedin(url):
            return url
    return None


def _git_revision():
    try:
        out = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT,
            capture_output=True, text=True, timeout=10)
        if out.returncode == 0:
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def build_registry(data_dir=None, source_revision=None, generated_at=None):
    """Seed the identity registry from the reviewed files on disk.

    Reads ``partner-leads.json``, ``partners-reviewed.json``,
    ``partner-profiles.json`` and ``startup-research.json`` from
    ``data_dir`` (default ``<repo>/data``). Nothing is invented: an
    entry with no website and no LinkedIn is seeded ``name-only`` and
    is never auto-merged. Merges are recorded only for exact
    identity-key matches found in this reviewed data — a LinkedIn URL
    shared by a scoped profile person (``person:<slug>--<partner>``)
    and a canonical person entry.
    """
    data_dir = Path(data_dir) if data_dir else ROOT / 'data'
    now = generated_at or _utcnow()

    def load(name):
        return json.loads((data_dir / name).read_text(encoding='utf-8'))

    leads = load('partner-leads.json')
    reviewed = load('partners-reviewed.json')
    profiles = load('partner-profiles.json')
    research = load('startup-research.json')

    entities = {}
    registry = {'version': REGISTRY_VERSION,
                'generated_at': now,
                'source_revision': source_revision or _git_revision(),
                'entities': entities, 'merges': []}

    # Partners: every lead is seeded; reviewed records supply the
    # website host. Unreviewed leads have no website on file, so they
    # are name-only and can never auto-merge.
    for name in leads:
        record = reviewed.get(name, {})
        key, basis = identity_key_for('partner', website=record.get('website'))
        _add_entity(entities, 'partner', name, key, basis, updated_at=now)
    # Reviewed partners not in the leads list (none today, but the
    # seed must not silently drop a reviewed record).
    for name, record in reviewed.items():
        if name not in leads:
            key, basis = identity_key_for(
                'partner', website=record.get('website'))
            _add_entity(entities, 'partner', name, key, basis, updated_at=now)

    # Startups from research first: their websites give the host key,
    # so profile-company rows below enrich rather than duplicate them.
    for startup in research.get('startups', []):
        key, basis = identity_key_for(
            'startup', website=startup.get('website'))
        _add_entity(entities, 'startup', startup['name'], key, basis,
                    updated_at=now)
        for founder in startup.get('founders', []):
            linkedin = _linkedin_from_socials(founder.get('socials')) \
                or founder.get('profile_url')
            key, basis = identity_key_for(
                'person', linkedin_url=linkedin)
            _add_entity(entities, 'person', founder['name'], key, basis,
                        updated_at=now)

    # Partner profiles: people (scoped per partner unless a LinkedIn
    # URL reconciles them), portfolio companies, and sponsors.
    for partner, profile in profiles.items():
        if f'partner:{slug(partner)}' not in entities:
            _add_entity(entities, 'partner', partner, None, 'name-only',
                        updated_at=now)
        for person in profile.get('people', []):
            linkedin = _linkedin_from_socials(person.get('socials'))
            scoped_id = f'person:{slug(person["name"])}--{slug(partner)}'
            if linkedin:
                key, basis = identity_key_for('person', linkedin_url=linkedin)
                # Canonical (unscoped) entry keyed on the LinkedIn URL.
                _add_entity(entities, 'person', person['name'], key, basis,
                            updated_at=now)
                canonical_id = f'person:{slug(person["name"])}'
                # Scoped entry, kept so old edges resolve, then merged
                # into the canonical entry on the shared LinkedIn URL.
                if scoped_id not in entities:
                    entities[scoped_id] = {
                        'name': person['name'], 'kind': 'person',
                        'aliases': [], 'identity_key': key,
                        'identity_basis': basis, 'merged_from': [],
                        'updated_at': now}
                apply_merge(registry, scoped_id, canonical_id,
                            basis='linkedin-url',
                            decided_by='seed:reviewed-data',
                            decided_at=now)
            else:
                if scoped_id not in entities:
                    entities[scoped_id] = {
                        'name': person['name'], 'kind': 'person',
                        'aliases': [], 'identity_key': None,
                        'identity_basis': 'name-only', 'merged_from': [],
                        'updated_at': now}
        for company in profile.get('companies', []):
            company_id = f'startup:{slug(company["name"])}'
            if company_id not in entities:
                _add_entity(entities, 'startup', company['name'], None,
                            'name-only', updated_at=now)
        for sponsor in profile.get('sponsors', []):
            sponsor_id = f'provider:{slug(sponsor["name"])}'
            if sponsor_id not in entities:
                key, basis = identity_key_for(
                    'provider', website=sponsor.get('website'))
                _add_entity(entities, 'provider', sponsor['name'], key,
                            basis, updated_at=now)

    registry['entities'] = dict(sorted(entities.items()))
    registry['merges'] = sorted(registry['merges'],
                                key=lambda m: (m['from'], m['to']))
    return registry


def load_registry(path=None):
    """Load a registry dict from ``data/identity.json`` (default)."""
    path = Path(path) if path else ROOT / 'data' / 'identity.json'
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    registry = build_registry()
    target = ROOT / 'data' / 'identity.json'
    target.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8')
    by_kind = {}
    for entity in registry['entities'].values():
        by_kind[entity['kind']] = by_kind.get(entity['kind'], 0) + 1
    name_only = sum(1 for e in registry['entities'].values()
                    if e['identity_basis'] == 'name-only')
    print(f"Identity registry: {len(registry['entities'])} entities "
          f"({by_kind}), {len(registry['merges'])} merges, "
          f"{name_only} name-only")
    print(f"Wrote {target}")


if __name__ == '__main__':
    main()
