#!/usr/bin/env python3
"""Offline country packet discovery index, never a production import or crawl queue."""
from __future__ import annotations
import argparse
import csv
import io
import hashlib
import json
from pathlib import Path
import re

try:
    from .plan_company_profiles import approved_from_bytes, website_host, read_input, CrawlError
    from .replay_company_profiles import no_duplicate_keys
except ImportError:
    from plan_company_profiles import approved_from_bytes, website_host, read_input, CrawlError
    from replay_company_profiles import no_duplicate_keys

MAX_FILES = 3000
MAX_TOTAL_BYTES = 128 * 1024 * 1024
MAX_NODES = 500000


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def pointer_key(key):
    return str(key).replace('~', '~0').replace('/', '~1')


def walk(value, pointer='', depth=0):
    if depth > 64:
        raise ValueError('JSON depth exceeds bound')
    yield pointer, value
    if isinstance(value, dict):
        for key in sorted(value):
            yield from walk(value[key], pointer + '/' + pointer_key(key), depth + 1)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk(item, pointer + '/' + str(index), depth + 1)


def build_index(root, seeds, revision, limit=100, cursor=None, query=''):
    if not re.fullmatch(r'[0-9a-f]{40}', revision or ''):
        raise ValueError('An exact lowercase Git revision is required')
    if type(limit) is not int or not 1 <= limit <= 500:
        raise ValueError('limit must be between 1 and 500')
    if not isinstance(query, str) or len(query) > 256:
        raise ValueError('query exceeds bound')
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Expected a real country research directory')
    documents, records, sources = [], [], {}
    total = nodes = 0
    # Refuse links rather than following research-controlled paths outside the packet.
    paths = []
    for path in root.rglob('*'):
        if path.is_symlink():
            raise ValueError('Symlinks are not accepted in research packets')
        if path.is_file():
            paths.append(path)
            if len(paths) > MAX_FILES:
                raise ValueError('File count exceeds bound')
    for path in sorted(paths):
        data = read_input(path)
        total += len(data)
        if total > MAX_TOTAL_BYTES:
            raise ValueError('Total packet bytes exceed bound')
        relative = path.relative_to(root).as_posix()
        document = {'path': relative, 'sha256': sha(data), 'bytes': len(data)}
        documents.append(document)
        if path.suffix.lower() != '.json':
            continue
        value = json.loads(data, object_pairs_hook=no_duplicate_keys,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
        for pointer, item in walk(value):
            nodes += 1
            if nodes > MAX_NODES:
                raise ValueError('JSON node count exceeds bound')
            ref = {'path': relative, 'pointer': pointer, 'document_sha256': document['sha256']}
            if isinstance(item, str) and item.startswith(('https://', 'http://')):
                sources.setdefault(item, []).append(ref)
            if not isinstance(item, dict):
                continue
            name = item.get('canonical_name') or item.get('name')
            website = item.get('website')
            if not isinstance(name, str) or not isinstance(website, str):
                continue
            # The pointer is source identity; an id inside the document is only a claim.
            key = relative + '#' + pointer
            records.append({'source_record_key': key, 'provenance': ref,
                            'country_path': relative.split('/')[0], 'name': name,
                            'website': website, 'host': website_host(website),
                            'record_sha256': sha(canonical(item).encode()),
                            'record': item,
                            'admission': 'research_only_requires_identity_and_claim_review',
                            'crawl_state': 'not_scheduled'})
    seed_bytes = read_input(seeds)
    seed_names = {row.get('partner') for row in csv.DictReader(io.StringIO(seed_bytes.decode('utf-8-sig')))}
    approved = approved_from_bytes(seed_bytes, seed_names)
    groups = {}
    for record in records:
        host = record['host']
        if host:
            # www is a collision hint only, never an authority or identity equivalence.
            groups.setdefault(host.removeprefix('www.'), []).append(record['source_record_key'])
        seed = approved.get(record['name'])
        record['seed_match'] = ('exact_name_and_url_candidate' if seed and seed['url'] == record['website']
                                else 'no_exact_approved_seed_match')
        record['next_step'] = 'Review original packet holds, canonical identity and exact source approval; then use existing planner'
    binding = {'version': 1, 'revision': revision, 'documents': documents,
               'seeds_sha256': sha(seed_bytes), 'query': query, 'limit': limit}
    index_id = sha(canonical(binding).encode())
    selected = [r for r in records if query.casefold() in canonical(r['record']).casefold()]
    offset = 0
    if cursor is not None:
        match = re.fullmatch(r'v1:([0-9a-f]{64}):([0-9]+)', cursor)
        if not match or match[1] != index_id:
            raise ValueError('Cursor differs from pinned inputs, revision, query or page size')
        offset = int(match[2])
        if not 0 < offset < len(selected) or offset % limit:
            raise ValueError('Cursor is not a valid page boundary')
    end = min(offset + limit, len(selected))
    return {**binding, 'index_id': index_id, 'snapshot_kind': 'input_files',
            'counts': {'documents': len(documents), 'source_record_occurrences': len(records),
                       'matching_occurrences': len(selected), 'distinct_url_strings': len(sources),
                       'scheduled_crawls': 0, 'production_admissions': 0},
            'items': selected[offset:end], 'offset': offset,
            'next_cursor': f'v1:{index_id}:{end}' if end < len(selected) else None,
            'host_collision_groups': [{'host_hint': host, 'source_record_keys': keys,
                                       'decision': 'identity_review_required_no_merge'}
                                      for host, keys in sorted(groups.items()) if len(keys) > 1],
            'source_url_occurrences': [{'url': url, 'references': refs, 'access_state': 'not_assessed'}
                                       for url, refs in sorted(sources.items())],
            'warning': 'Index of supplied files, not proof of merge, factual acceptance, crawl eligibility, freshness '
                       'or national coverage. Embedded records retain packet-specific holds and provenance. '
                       'URLs include evidence and discovery leads, not approved crawl targets. Pagination is not '
                       'collection progress. No network, robots requests, approvals or production writes occur.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--approved', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--cursor')
    parser.add_argument('--query', default='')
    args = parser.parse_args()
    try:
        result = build_index(args.root, args.approved, args.revision, args.limit, args.cursor, args.query)
    except (OSError, UnicodeError, ValueError, RecursionError, CrawlError) as exc:
        parser.exit(1, f'Index failed: {exc}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
