#!/usr/bin/env python3
"""Minimal S3-compatible object-store client for the Atlas live-index corpus.

The crawl and the indexer push data to static object storage (Cloudflare R2
recommended, S3 as a drop-in fallback) and the async indexer reads it back.
Both speak the same S3 REST API, so this client is deliberately small and
dependency-free: SigV4 signing with the standard library only, no boto3.
Credentials come from the environment and are never logged.

Configuration (all optional; ``from_env`` reports ``configured`` False when
any of endpoint/bucket/keys is missing, and callers must skip cleanly):

    ATLAS_CORPUS_ENDPOINT   e.g. https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    ATLAS_CORPUS_BUCKET     startup-atlas-corpus
    ATLAS_CORPUS_INDEX_BUCKET  startup-atlas-index
    ATLAS_CORPUS_REGION     auto for R2, e.g. ap-southeast-2 for S3
    ATLAS_CORPUS_ACCESS_KEY_ID / ATLAS_CORPUS_SECRET_ACCESS_KEY

Corpus layout (see docs/LIVE-INDEX.md for the full design):

    corpus/v1/crawl/<mode>/<run-id>.json   raw crawl snapshot, immutable
    corpus/v1/crawl/<mode>/latest.json     pointer to the newest snapshot
    corpus/v1/reviewed/<file>.json         published data file
    corpus/v1/reviewed/manifest.json       {generated_at, source_revision, files}

Index layout (public bucket; the bucket root is the index base the browser
fetches latest.json from):

    latest.json                            pointer to the newest index version
    v1/<version>/manifest.json             versioned index manifest
    v1/<version>/<table>.parquet           versioned Parquet tables
"""
import hashlib
import hmac
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

CORPUS_PREFIX = 'corpus/v1'
INDEX_PREFIX = 'v1'

# The four reviewed files that are the indexer's input. This list must match
# PUBLIC_DATA_FILES in scripts/build-query-parquet.py.
REVIEWED_FILES = (
    'catalogue.json',
    'partners-reviewed.json',
    'partner-profiles.json',
    'startup-research.json',
)


class CorpusError(Exception):
    """Raised for object-store failures; never carries credential values."""


class CorpusConfig:
    """Object-store configuration read from the environment."""

    def __init__(self, endpoint=None, bucket=None, index_bucket=None,
                 region=None, access_key=None, secret_key=None):
        self.endpoint = (endpoint or '').rstrip('/')
        self.bucket = bucket or ''
        self.index_bucket = index_bucket or ''
        self.region = region or 'auto'
        self.access_key = access_key or ''
        self.secret_key = secret_key or ''

    @classmethod
    def from_env(cls, environ=None):
        env = environ if environ is not None else os.environ
        return cls(
            endpoint=env.get('ATLAS_CORPUS_ENDPOINT'),
            bucket=env.get('ATLAS_CORPUS_BUCKET'),
            index_bucket=env.get('ATLAS_CORPUS_INDEX_BUCKET'),
            region=env.get('ATLAS_CORPUS_REGION'),
            access_key=env.get('ATLAS_CORPUS_ACCESS_KEY_ID'),
            secret_key=env.get('ATLAS_CORPUS_SECRET_ACCESS_KEY'),
        )

    @property
    def configured(self):
        return bool(
            self.endpoint and self.bucket and self.access_key and self.secret_key
        )

    def require_configured(self):
        if not self.configured:
            raise CorpusError(
                'Object storage is not configured: set ATLAS_CORPUS_ENDPOINT, '
                'ATLAS_CORPUS_BUCKET, ATLAS_CORPUS_ACCESS_KEY_ID and '
                'ATLAS_CORPUS_SECRET_ACCESS_KEY.'
            )


def _sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


def _hmac(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()


def sign_request(method, url, headers, body, access_key, secret_key, region,
                 service='s3', now=None):
    """Return the headers with an AWS Signature Version 4 Authorization added.

    Pure function (no I/O) so the signing logic is unit-testable. ``now`` is
    a datetime for tests; defaults to UTC now.
    """
    now = now or datetime.now(timezone.utc)
    amz_date = now.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = now.strftime('%Y%m%d')
    parsed = urllib.parse.urlparse(url)
    canonical_uri = urllib.parse.quote(parsed.path or '/', safe='/~')
    canonical_query = parsed.query
    payload_hash = _sha256_hex(body)
    signed_headers = sorted(
        [name.lower() for name in headers] + ['host', 'x-amz-content-sha256', 'x-amz-date']
    )
    all_headers = dict(
        (name.lower(), value.strip()) for name, value in headers.items()
    )
    all_headers['host'] = parsed.netloc
    all_headers['x-amz-content-sha256'] = payload_hash
    all_headers['x-amz-date'] = amz_date
    canonical_headers = ''.join(
        f'{name}:{all_headers[name]}\n' for name in signed_headers
    )
    canonical_request = '\n'.join([
        method, canonical_uri, canonical_query, canonical_headers,
        ';'.join(signed_headers), payload_hash,
    ])
    scope = f'{date_stamp}/{region}/{service}/aws4_request'
    string_to_sign = '\n'.join([
        'AWS4-HMAC-SHA256', amz_date, scope,
        _sha256_hex(canonical_request.encode('utf-8')),
    ])
    signing_key = _hmac(
        _hmac(
            _hmac(_hmac(('AWS4' + secret_key).encode('utf-8'), date_stamp), region),
            service),
        'aws4_request')
    signature = hmac.new(
        signing_key, string_to_sign.encode('utf-8'), hashlib.sha256
    ).hexdigest()
    signed = dict(headers)
    signed['x-amz-date'] = amz_date
    signed['x-amz-content-sha256'] = payload_hash
    signed['Authorization'] = (
        f'AWS4-HMAC-SHA256 Credential={access_key}/{scope}, '
        f'SignedHeaders={";".join(signed_headers)}, Signature={signature}'
    )
    return signed


class S3Client:
    """Minimal SigV4 client: PUT / GET / HEAD against one bucket."""

    def __init__(self, config, bucket=None, opener=None):
        self.config = config
        self.bucket = bucket or config.bucket
        self._opener = opener or urllib.request.build_opener()

    def _url(self, key):
        return f'{self.config.endpoint}/{self.bucket}/{key}'

    def _request(self, method, key, body=b'', content_type=None):
        url = self._url(key)
        headers = {}
        if content_type:
            headers['Content-Type'] = content_type
        signed = sign_request(
            method, url, headers, body,
            self.config.access_key, self.config.secret_key, self.config.region,
        )
        request = urllib.request.Request(url, data=body or None, headers=signed, method=method)
        try:
            with self._opener.open(request) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            raise CorpusError(
                f'Object store {method} {self.bucket}/{key} failed '
                f'(HTTP {exc.code})'
            ) from exc
        except urllib.error.URLError as exc:
            raise CorpusError(
                f'Object store {method} {self.bucket}/{key} failed: {exc.reason}'
            ) from exc

    def put_object(self, key, data, content_type='application/octet-stream'):
        if isinstance(data, str):
            data = data.encode('utf-8')
        self._request('PUT', key, data, content_type)
        return {'key': key, 'sha256': _sha256_hex(data), 'bytes': len(data)}

    def put_json(self, key, obj):
        return self.put_object(
            key, json.dumps(obj, indent=2) + '\n', 'application/json'
        )

    def get_object(self, key):
        status, body = self._request('GET', key)
        if status != 200:
            raise CorpusError(f'Object store GET {self.bucket}/{key} returned HTTP {status}')
        return body

    def get_json(self, key):
        return json.loads(self.get_object(key).decode('utf-8'))

    def head_object(self, key):
        """Return response headers, or None when the object does not exist."""
        try:
            status, _ = self._request('HEAD', key)
            return {'exists': status == 200}
        except CorpusError as exc:
            if 'HTTP 404' in str(exc):
                return None
            raise

    def exists(self, key):
        return self.head_object(key) is not None


# --- corpus key layout -----------------------------------------------------

def crawl_snapshot_key(mode, run_id):
    return f'{CORPUS_PREFIX}/crawl/{mode}/{run_id}.json'


def crawl_latest_key(mode):
    return f'{CORPUS_PREFIX}/crawl/{mode}/latest.json'


def reviewed_key(filename):
    return f'{CORPUS_PREFIX}/reviewed/{filename}'


def reviewed_manifest_key():
    return f'{CORPUS_PREFIX}/reviewed/manifest.json'


def index_version_dir(version):
    return f'{INDEX_PREFIX}/{version}'


def index_manifest_key(version):
    return f'{INDEX_PREFIX}/{version}/manifest.json'


def index_table_key(version, table):
    return f'{INDEX_PREFIX}/{version}/{table}.parquet'


def index_latest_key():
    return 'latest.json'


def make_index_version(generated_at, reviewed_manifest_sha256):
    """Content-addressed version: same inputs always yield the same version."""
    stamp = generated_at.strftime('%Y%m%dT%H%M%SZ')
    return f'{stamp}-{reviewed_manifest_sha256[:8]}'


def reviewed_manifest(files, source_revision='', generated_at=None):
    """Build the reviewed manifest from {name: bytes} of the reviewed files.

    ``files`` maps filename -> raw bytes. The manifest ``sha256`` is a pure
    content hash over the per-file entries only (not ``generated_at`` or
    ``source_revision``), so the same file bytes always yield the same sha
    and the indexer can tell "unchanged" from "rebuilt at a new time".
    """
    generated = generated_at or datetime.now(timezone.utc)
    entries = {
        name: {'sha256': _sha256_hex(data), 'bytes': len(data)}
        for name, data in sorted(files.items())
    }
    manifest = {
        'version': 1,
        'generated_at': generated.isoformat().replace('+00:00', 'Z'),
        'source_revision': source_revision,
        'files': entries,
    }
    canonical = json.dumps(entries, sort_keys=True).encode('utf-8')
    manifest['sha256'] = _sha256_hex(canonical)
    return manifest


def latest_pointer(version, manifest_key, generated_at, source_revision, tables):
    """The small pointer the browser fetches first: version + manifest path."""
    return {
        'version': version,
        'manifest': manifest_key,
        'generated_at': generated_at,
        'source_revision': source_revision,
        'tables': {name: info['rows'] for name, info in tables.items()},
    }
