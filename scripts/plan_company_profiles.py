#!/usr/bin/env python3
"""Offline, input-pinned work inventory for the existing company-profile collector.

No networking, seed approval, collection completion, or factual review occurs here.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

try:
    from .crawl import CrawlError, parse_approved_rows, normalize_request_url
except ImportError:
    from crawl import CrawlError, parse_approved_rows, normalize_request_url

MAX_BYTES = 8 * 1024 * 1024
MAX_STARTUPS = 10_000
DIMENSIONS = ('description', 'founded_year', 'founders', 'funding_rounds', 'profile_facts', 'socials', 'articles')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_input(path):
    with Path(path).open('rb') as handle:
        data = handle.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Input exceeds 8 MiB bound')
    return data


def website_host(value):
    if not isinstance(value, str) or not value or value != value.strip():
        return None
    try:
        parts = urlsplit(normalize_request_url(value))
        if (parts.scheme != 'https' or not parts.hostname or parts.username is not None
                or parts.password is not None or parts.port not in (None, 443)):
            return None
        try:
            ipaddress.ip_address(parts.hostname)
        except ValueError:
            pass
        else:
            return None
        return parts.hostname
    except (ValueError, CrawlError):
        return None


def build_plan(overlay_path, seeds_path, revision, limit=10, cursor=None):
    if not isinstance(revision, str) or not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('revision must be an exact lowercase 40-character Git SHA')
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError('limit must be an integer between 1 and 100')
    overlay_bytes, seed_bytes = read_input(overlay_path), read_input(seeds_path)
    overlay = json.loads(overlay_bytes)
    startups = overlay.get('startups') if isinstance(overlay, dict) else None
    if not isinstance(startups, list) or len(startups) > MAX_STARTUPS:
        raise ValueError('Expected bounded startups array')
    names = []
    for row in startups:
        name = row.get('name') if isinstance(row, dict) else None
        if (not isinstance(name, str) or not name or name != name.strip() or len(name) > 256
                or any(ord(c) < 32 or ord(c) == 127 for c in name)):
            raise ValueError('Each startup needs an exact nonempty source-record name')
        names.append(name)
    if len(set(names)) != len(names):
        raise ValueError('Duplicate source-record names require identity review')
    approved = approved_from_bytes(seed_bytes, set(names))
    binding = {'version': 1, 'revision': revision, 'overlay_sha256': digest(overlay_bytes),
               'seeds_sha256': digest(seed_bytes), 'order': 'exact-source-name-codepoint', 'limit': limit}
    plan_id = digest(json.dumps(binding, sort_keys=True, separators=(',', ':')).encode())
    offset = 0
    if cursor is not None:
        if not isinstance(cursor, str) or len(cursor) > 100:
            raise ValueError('Malformed cursor')
        match = re.fullmatch(r'v1:([0-9a-f]{64}):([0-9]{1,5})', cursor)
        if not match or match[1] != plan_id:
            raise ValueError('Cursor does not match revision, input bytes, batch size or planner version')
        offset = int(match[2])
        if not 0 < offset < len(startups) or offset % limit:
            raise ValueError('Cursor is outside an inventory page boundary')
    items = []
    for row in sorted(startups, key=lambda item: item['name']):
        name = row['name']; website = row.get('website'); host = website_host(website)
        seed = approved.get(name)
        if not website:
            state = 'missing_reviewed_website'
        elif host is None:
            state = 'invalid_reviewed_website'
        elif seed is None:
            state = 'seed_review_required'
        elif website_host(seed['url']) is None:
            state = 'seed_url_blocked'
        elif website_host(seed['url']) != host:
            state = 'seed_host_mismatch'
        else:
            state = 'approved_seed_ready'
        items.append({'source_record_name': name, 'seed_state': state,
                      'approved_url': seed['url'] if state == 'approved_seed_ready' else None,
                      'collection_state': 'not_assessed',
                      'field_presence': {key: 'present' if row.get(key) not in (None, '', [], {}) else 'absent'
                                         for key in DIMENSIONS}})
    counts = {state: sum(item['seed_state'] == state for item in items) for state in (
        'approved_seed_ready', 'seed_review_required', 'missing_reviewed_website',
        'invalid_reviewed_website', 'seed_url_blocked', 'seed_host_mismatch')}
    end = min(offset + limit, len(items))
    return {**binding, 'plan_id': plan_id, 'snapshot_kind': 'input_files',
            'population': {'scope': 'all records in the supplied startup-research overlay',
                           'source_records': len(items), 'seed_states': counts},
            'field_presence_totals': {key: sum(item['field_presence'][key] == 'present' for item in items)
                                      for key in DIMENSIONS},
            'items': items[offset:end], 'offset': offset, 'returned': end - offset,
            'next_cursor': f'v1:{plan_id}:{end}' if end < len(items) else None,
            'inventory_exhausted': end == len(items),
            'warning': 'Inventory pagination only, not crawl completion. Source-record names are not graph IDs. '
                       'Field presence is not factual verification, freshness or completeness. Input hashes bind '
                       'these bytes but do not prove they belong to the caller-supplied Git revision. '
                       'Ready seeds still require current identity/access review and the existing collector transport guards.'}


def approved_from_bytes(data, names):
    reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig'), newline=''))
    if not {'partner', 'official_website', 'approved'}.issubset(reader.fieldnames or []):
        raise ValueError('Seed CSV requires partner, official_website and approved columns')
    if len(reader.fieldnames) != len(set(reader.fieldnames)):
        raise ValueError('Ambiguous duplicate seed CSV columns')
    rows = list(reader)
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError('Seed CSV row width does not match header')
    return {seed['name']: seed for seed in parse_approved_rows(rows, names, require_qid=False)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--overlay', type=Path, required=True)
    parser.add_argument('--approved', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--cursor')
    args = parser.parse_args(argv)
    try:
        result = build_plan(args.overlay, args.approved, args.revision, args.limit, args.cursor)
    except (OSError, UnicodeError, ValueError, CrawlError) as exc:
        parser.exit(1, f'Planning failed: {exc}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
