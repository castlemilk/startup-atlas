#!/usr/bin/env python3
"""Generate columnar Parquet tables for the in-browser DuckDB query console.

Reads only the reviewed, published JSON files under data/ and writes one
Parquet file per table plus a manifest into dist/data/query/ (or --out).
The query page loads these files lazily with DuckDB-WASM running in a
worker; nothing here fetches live data and no unreviewed file is included.

Requires pyarrow: ``pip install pyarrow``. The Pages workflow installs it
before ``npm run build``; without it this script fails with a clear error
instead of silently publishing a stale or missing dataset.
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except ImportError as exc:  # pragma: no cover - exercised by the skip test
    print(
        'build-query-parquet.py needs pyarrow (pip install pyarrow). '
        'Install it and re-run the build.',
        file=sys.stderr,
    )
    raise SystemExit(2) from exc

ROOT = Path(__file__).resolve().parents[1]

# Explicitly list public inputs. An unreviewed file added under data/ must not
# accidentally become queryable just because it has a familiar extension.
PUBLIC_DATA_FILES = (
    'catalogue.json',
    'partners-reviewed.json',
    'partner-profiles.json',
    'startup-research.json',
)


def git_revision():
    revision = os.environ.get('ATLAS_SOURCE_REVISION') or os.environ.get('GITHUB_SHA')
    if revision:
        return revision
    try:
        return subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True
        ).strip()
    except Exception:
        return ''


def _str(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f'expected a string, got {type(value).__name__}: {value!r}')
    return value


def _int(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f'expected an integer, got {type(value).__name__}: {value!r}')
    return value


def _str_list(value):
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f'expected a list of strings, got {value!r}')
    return value


def _json_text(value):
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def build_tables(data_dir):
    documents = {}
    for name in PUBLIC_DATA_FILES:
        documents[name] = json.loads((data_dir / name).read_text(encoding='utf-8'))

    catalogue = documents['catalogue.json']
    partners_reviewed = documents['partners-reviewed.json']
    partner_profiles = documents['partner-profiles.json']
    startups = documents['startup-research.json']['startups']

    opportunities = [
        {
            'id': _str(item['id']),
            'name': _str(item['name']),
            'org': _str(item['org']),
            'kind': _str(item['kind']),
            'access': _str(item['access']),
            'scope': _str_list(item.get('scope')),
            'value': _str(item.get('value')),
            'summary': _str(item.get('summary')),
            'eligibility': _str(item.get('eligibility')),
            'limits': _str(item.get('limits')),
            'url': _str(item.get('url')),
            'status': _str(item.get('status')),
            'checked': _str(item.get('checked')),
            'extra': _str_list(item.get('extra')),
            'facts': _json_text(item.get('facts')),
        }
        for item in catalogue['opportunities']
    ]

    partners = [
        {
            'name': name,
            'website': _str(record.get('website')),
            'description': _str(record.get('description')),
            'source': _str(record.get('source')),
            'reviewed_at': _str(record.get('reviewed_at')),
            'type': _str((partner_profiles.get(name) or {}).get('type')),
            'geography': _str((partner_profiles.get(name) or {}).get('geography')),
            'has_profile': name in partner_profiles,
        }
        for name, record in partners_reviewed.items()
    ]

    related = catalogue.get('relatedPartners') or {}
    partner_leads = [
        {
            'name': name,
            'reviewed': name in partners_reviewed or name in related,
            'canonical_name': _str(related.get(name)),
        }
        for name in catalogue['partnerLeads']
    ]

    startup_rows = []
    funding_rows = []
    article_rows = []
    fact_rows = []
    founder_rows = []
    social_rows = []
    for startup in startups:
        name = _str(startup['name'])
        startup_rows.append(
            {
                'name': name,
                'website': _str(startup.get('website')),
                'description': _str(startup.get('description')),
                'source': _str(startup.get('source')),
                'founded_year': _int(startup.get('founded_year')),
                'reviewed_at': _str(startup.get('reviewed_at')),
            }
        )
        for round_ in startup.get('funding_rounds') or []:
            funding_rows.append(
                {
                    'startup': name,
                    'id': _str(round_['id']),
                    'stage': _str(round_.get('stage')),
                    'announced_on': _str(round_.get('announced_on')),
                    'amount': _int(round_.get('amount')),
                    'currency': _str(round_.get('currency')),
                    'amount_text': _str(round_.get('amount_text')),
                    'valuation': _int(round_.get('valuation')),
                    'valuation_currency': _str(round_.get('valuation_currency')),
                    'note': _str(round_.get('note')),
                    'source': _str(round_.get('source')),
                }
            )
        for article in startup.get('articles') or []:
            article_rows.append(
                {
                    'startup': name,
                    'title': _str(article['title']),
                    'url': _str(article['url']),
                    'published_on': _str(article.get('published_on')),
                    'kind': _str(article.get('kind')),
                }
            )
        for fact in startup.get('profile_facts') or []:
            fact_rows.append(
                {
                    'startup': name,
                    'key': _str(fact['key']),
                    'label': _str(fact.get('label')),
                    'value': _str(fact.get('value')),
                    'source': _str(fact.get('source')),
                    'reviewed_at': _str(fact.get('reviewed_at')),
                }
            )
        for founder in startup.get('founders') or []:
            founder_rows.append(
                {
                    'startup': name,
                    'name': _str(founder['name']),
                    'source': _str(founder.get('source')),
                }
            )
        for social in startup.get('socials') or []:
            social_rows.append(
                {
                    'startup': name,
                    'label': _str(social['label']),
                    'url': _str(social['url']),
                    'source': _str(social.get('source')),
                    'reviewed_at': _str(social.get('reviewed_at')),
                }
            )

    string = pa.string()
    int64 = pa.int64()
    bool_ = pa.bool_()
    str_list = pa.list_(pa.string())
    schemas = {
        'opportunities': pa.schema([
            ('id', string), ('name', string), ('org', string), ('kind', string),
            ('access', string), ('scope', str_list), ('value', string),
            ('summary', string), ('eligibility', string), ('limits', string),
            ('url', string), ('status', string), ('checked', string),
            ('extra', str_list), ('facts', string),
        ]),
        'partners': pa.schema([
            ('name', string), ('website', string), ('description', string),
            ('source', string), ('reviewed_at', string), ('type', string),
            ('geography', string), ('has_profile', bool_),
        ]),
        'partner_leads': pa.schema([
            ('name', string), ('reviewed', bool_), ('canonical_name', string),
        ]),
        'startups': pa.schema([
            ('name', string), ('website', string), ('description', string),
            ('source', string), ('founded_year', int64), ('reviewed_at', string),
        ]),
        'funding_rounds': pa.schema([
            ('startup', string), ('id', string), ('stage', string),
            ('announced_on', string), ('amount', int64), ('currency', string),
            ('amount_text', string), ('valuation', int64),
            ('valuation_currency', string), ('note', string), ('source', string),
        ]),
        'articles': pa.schema([
            ('startup', string), ('title', string), ('url', string),
            ('published_on', string), ('kind', string),
        ]),
        'profile_facts': pa.schema([
            ('startup', string), ('key', string), ('label', string),
            ('value', string), ('source', string), ('reviewed_at', string),
        ]),
        'founders': pa.schema([
            ('startup', string), ('name', string), ('source', string),
        ]),
        'socials': pa.schema([
            ('startup', string), ('label', string), ('url', string),
            ('source', string), ('reviewed_at', string),
        ]),
    }
    rows = {
        'opportunities': opportunities,
        'partners': partners,
        'partner_leads': partner_leads,
        'startups': startup_rows,
        'funding_rounds': funding_rows,
        'articles': article_rows,
        'profile_facts': fact_rows,
        'founders': founder_rows,
        'socials': social_rows,
    }
    # Build column by column: Table.from_pylist probes for pandas, and a
    # system pandas built against another NumPy breaks the import. Explicit
    # arrays keep the generator independent of pandas entirely.
    tables = {}
    for name, schema in schemas.items():
        columns = [
            pa.array([row[field.name] for row in rows[name]], type=field.type)
            for field in schema
        ]
        tables[name] = pa.Table.from_arrays(columns, schema=schema)
    return tables


def build(out, data_dir=None):
    data_dir = data_dir or ROOT / 'data'
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    tables = build_tables(data_dir)
    manifest_tables = {}
    for name, table in tables.items():
        filename = f'{name}.parquet'
        pq.write_table(table, out / filename, compression='zstd')
        manifest_tables[name] = {
            'file': filename,
            'rows': table.num_rows,
            'columns': table.column_names,
        }
    manifest = {
        'version': 1,
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'source_revision': git_revision(),
        'tables': manifest_tables,
    }
    (out / 'manifest.json').write_text(
        json.dumps(manifest, indent=2) + '\n', encoding='utf-8'
    )
    # The pointer the query page follows first. The live indexer writes the
    # same shape (see scripts/atlas_corpus.py latest_pointer) with a
    # versioned manifest path, so the page speaks one protocol whether the
    # tables came from this static build or from the live index bucket.
    latest = {
        'version': (
            f"static-{manifest['source_revision'][:12]}"
            if manifest['source_revision'] else 'static-local'
        ),
        'manifest': 'manifest.json',
        'generated_at': manifest['generated_at'],
        'source_revision': manifest['source_revision'],
        'tables': {name: info['rows'] for name, info in manifest_tables.items()},
    }
    (out / 'latest.json').write_text(
        json.dumps(latest, indent=2) + '\n', encoding='utf-8'
    )
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / 'dist/data/query')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data')
    args = parser.parse_args()
    manifest = build(args.out, args.data_dir)
    total = sum(table['rows'] for table in manifest['tables'].values())
    print(f"Wrote {len(manifest['tables'])} Parquet tables ({total} rows) to {args.out}")


if __name__ == '__main__':
    main()
