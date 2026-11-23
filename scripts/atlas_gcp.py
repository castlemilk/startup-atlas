#!/usr/bin/env python3
"""GCS backend for the Atlas live-index corpus (Application Default Credentials).

The live-index pipeline was built against an S3-compatible API
(scripts/atlas_corpus.py, SigV4). Ben re-scoped the infra to GCP
(23 Nov 2026): the same corpus/index layouts and latest.json protocol, but
storage is Google Cloud Storage and auth is Application Default Credentials
— no long-lived keys anywhere.

This module is the GCP half. It mirrors the S3Client method surface
(put_object / put_json / get_object / get_json / head_object / exists) so
callers switch backend with one line — ``client_for(config)`` — and keep
working unchanged. ``GCSClient`` speaks the GCS JSON API with a Bearer
access token resolved from ADC:

    1. ATLAS_GCP_ACCESS_TOKEN (explicit; GitHub Actions gets it from the
       google-github-actions/auth token output)
    2. The GCE metadata server (Cloud Run Job, GCE, Cloud Shell)
    3. The ADC file (~/.config/gcloud/application_default_credentials.json
       or GOOGLE_APPLICATION_CREDENTIALS): authorized_user refresh-token
       exchange. service_account keys cannot be used here — the stdlib
       cannot sign RS256 JWTs — so they fall through to gcloud.
    4. `gcloud auth application-default print-access-token` (local dev)

The token is cached per client and refreshed once on a 401. Tokens never
appear in logs, error messages, or the repo.

Configuration (environment only, never in the repo):

    ATLAS_CORPUS_BACKEND       gcs (default s3 — the R2/S3 path is untouched)
    ATLAS_CORPUS_BUCKET        e.g. <project>-atlas-corpus
    ATLAS_CORPUS_INDEX_BUCKET  e.g. <project>-atlas-index
    ATLAS_GCP_PROJECT          GCP project id
    ATLAS_GCP_ACCESS_TOKEN     optional explicit token (see 1 above)

Created by the Terraform bootstrap (infra/terraform/): the buckets, the
least-privilege service accounts, Workload Identity Federation for GitHub,
the Cloud Run Job and the 15-minute Cloud Scheduler trigger. Runbook:
infra/GCP-BOOTSTRAP.md.
"""
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from atlas_corpus import CorpusError, S3Client  # noqa: F401  (re-exported for callers)

GCS_API_BASE = 'https://storage.googleapis.com'
GCS_UPLOAD_BASE = 'https://storage.googleapis.com/upload/storage/v1'
METADATA_BASE = 'http://metadata.google.internal'
OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'

# The ADC file locations `gcloud auth application-default login` writes.
_ADC_ENV_VAR = 'GOOGLE_APPLICATION_CREDENTIALS'
_ADC_WELL_KNOWN = Path.home() / '.config' / 'gcloud' / 'application_default_credentials.json'


class GCSConfig:
    """GCP-side corpus configuration read from the environment."""

    def __init__(self, backend=None, bucket=None, index_bucket=None, project=None):
        self.backend = (backend or 's3').lower()
        self.bucket = bucket or ''
        self.index_bucket = index_bucket or ''
        self.project = project or ''

    @classmethod
    def from_env(cls, environ=None):
        env = environ if environ is not None else os.environ
        return cls(
            backend=env.get('ATLAS_CORPUS_BACKEND', 's3'),
            bucket=env.get('ATLAS_CORPUS_BUCKET'),
            index_bucket=env.get('ATLAS_CORPUS_INDEX_BUCKET'),
            project=env.get('ATLAS_GCP_PROJECT'),
        )

    @property
    def configured(self):
        """True when the GCS backend is selected and a corpus bucket is set."""
        return self.backend == 'gcs' and bool(self.bucket)


def is_configured(config, gcp=None):
    """Backend-aware version of ``CorpusConfig.configured``.

    ``config`` is the atlas_corpus CorpusConfig; ``gcp`` defaults to
    GCSConfig.from_env(). GCS needs only a bucket (the token resolves
    lazily from ADC); S3 keeps its endpoint + keys requirement.
    """
    gcp = gcp if gcp is not None else GCSConfig.from_env()
    if gcp.backend == 'gcs':
        return gcp.configured
    return config.configured


def _metadata_token(opener, metadata_base):
    """Access token from the GCE metadata server, or None."""
    url = f'{metadata_base}/computeMetadata/v1/instance/service-accounts/default/token'
    request = urllib.request.Request(
        url, headers={'Metadata-Flavor': 'Google'}, method='GET')
    try:
        with opener.open(request, timeout=2) as response:
            return json.loads(response.read().decode('utf-8'))['access_token']
    except Exception:
        return None


def _adc_file_token(opener, adc_path, token_url):
    """Access token from an authorized_user ADC file, or None.

    service_account ADC files are deliberately unsupported here (RS256 JWT
    signing needs a crypto library); they fall through to the gcloud CLI.
    external_account files (what google-github-actions/auth writes) are
    also skipped — the Actions workflows pass ATLAS_GCP_ACCESS_TOKEN
    instead.
    """
    try:
        credentials = json.loads(Path(adc_path).read_text(encoding='utf-8'))
    except Exception:
        return None
    if credentials.get('type') != 'authorized_user':
        return None
    payload = urllib.parse.urlencode({
        'grant_type': 'refresh_token',
        'client_id': credentials.get('client_id', ''),
        'client_secret': credentials.get('client_secret', ''),
        'refresh_token': credentials.get('refresh_token', ''),
    }).encode('utf-8')
    request = urllib.request.Request(
        token_url, data=payload, method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with opener.open(request, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))['access_token']
    except Exception:
        return None


def _gcloud_token(run_gcloud=None):
    """Access token from the gcloud CLI, or None when it is absent/fails."""
    run = run_gcloud or (lambda: subprocess.run(
        ['gcloud', 'auth', 'application-default', 'print-access-token'],
        capture_output=True, text=True, timeout=30))
    try:
        result = run()
    except Exception:
        return None
    token = (result.stdout or '').strip()
    return token or None


def get_access_token(environ=None, opener=None, metadata_base=None,
                     adc_path=None, token_url=None, run_gcloud=None):
    """Resolve an ADC access token, or None when no source yields one.

    Order: ATLAS_GCP_ACCESS_TOKEN -> metadata server -> authorized_user
    ADC file -> gcloud CLI. The injectable arguments exist for tests.
    The token is returned, never logged.
    """
    env = environ if environ is not None else os.environ
    token = (env.get('ATLAS_GCP_ACCESS_TOKEN') or '').strip()
    if token:
        return token
    opener = opener or urllib.request.build_opener()
    token = _metadata_token(opener, metadata_base or METADATA_BASE)
    if token:
        return token
    adc = adc_path
    if adc is None:
        adc = env.get(_ADC_ENV_VAR) or str(_ADC_WELL_KNOWN)
    token = _adc_file_token(opener, adc, token_url or OAUTH_TOKEN_URL)
    if token:
        return token
    return _gcloud_token(run_gcloud)


def _sha256_hex(data):
    import hashlib
    return hashlib.sha256(data).hexdigest()


class GCSClient:
    """Minimal GCS JSON API client: POST / GET / HEAD against one bucket.

    Same method surface as atlas_corpus.S3Client so callers can swap
    backends. ``bucket`` defaults to the corpus bucket; pass
    ``config.index_bucket`` for index publishes.

    Note: the media-upload endpoint (``/upload/storage/v1/b/<bucket>/o``)
    only accepts POST — a PUT there returns 404 "Not Found", which is
    what the first live-indexer run hit. Keep uploads on POST.
    """

    def __init__(self, config, bucket=None, opener=None, token_provider=None,
                 api_base=None, upload_base=None):
        self.config = config
        self.bucket = bucket or config.bucket
        self._opener = opener or urllib.request.build_opener()
        self._token_provider = token_provider or get_access_token
        self._cached_token = None
        # Overridable for tests (a local stub stands in for storage.googleapis.com).
        self._api_base = (api_base or GCS_API_BASE).rstrip('/')
        self._upload_base = (upload_base or GCS_UPLOAD_BASE).rstrip('/')

    def _token(self):
        if self._cached_token is None:
            self._cached_token = self._token_provider()
        return self._cached_token

    def _request(self, method, key, body=b'', content_type=None,
                 bucket=None, media=False):
        bucket = bucket or self.bucket
        encoded = urllib.parse.quote(key, safe='')
        if method == 'POST':
            url = (f'{self._upload_base}/b/{bucket}/o'
                   f'?uploadType=media&name={encoded}')
        elif media:
            url = (f'{self._api_base}/storage/v1/b/{bucket}/o/{encoded}'
                   f'?alt=media')
        else:
            url = f'{self._api_base}/storage/v1/b/{bucket}/o/{encoded}'
        token = self._token()
        if not token:
            raise CorpusError(
                'GCS is not authenticated: no Application Default '
                'Credentials found. Run `gcloud auth application-default '
                'login`, set ATLAS_GCP_ACCESS_TOKEN, or run on GCP.')
        headers = {'Authorization': f'Bearer {token}'}
        if content_type:
            headers['Content-Type'] = content_type
        request = urllib.request.Request(
            url, data=body or None, headers=headers, method=method)
        try:
            with self._opener.open(request) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 401 and self._cached_token is not None:
                # Token may have expired: resolve once more and retry once.
                self._cached_token = None
                token = self._token()
                if token:
                    headers['Authorization'] = f'Bearer {token}'
                    retry = urllib.request.Request(
                        url, data=body or None, headers=headers, method=method)
                    try:
                        with self._opener.open(retry) as response:
                            return response.status, response.read()
                    except urllib.error.HTTPError as retry_exc:
                        raise CorpusError(
                            f'GCS {method} {bucket}/{key} failed '
                            f'(HTTP {retry_exc.code})'
                        ) from retry_exc
            raise CorpusError(
                f'GCS {method} {bucket}/{key} failed (HTTP {exc.code})'
            ) from exc
        except urllib.error.URLError as exc:
            raise CorpusError(
                f'GCS {method} {bucket}/{key} failed: {exc.reason}'
            ) from exc

    def put_object(self, key, data, content_type='application/octet-stream'):
        if isinstance(data, str):
            data = data.encode('utf-8')
        self._request('POST', key, data, content_type)
        return {'key': key, 'sha256': _sha256_hex(data), 'bytes': len(data)}

    def put_json(self, key, obj):
        return self.put_object(
            key, json.dumps(obj, indent=2) + '\n', 'application/json'
        )

    def get_object(self, key):
        status, body = self._request('GET', key, media=True)
        if status != 200:
            raise CorpusError(f'GCS GET {self.bucket}/{key} returned HTTP {status}')
        return body

    def get_json(self, key):
        return json.loads(self.get_object(key).decode('utf-8'))

    def head_object(self, key):
        """Return response metadata, or None when the object does not exist."""
        try:
            status, _ = self._request('GET', key)
            return {'exists': status == 200}
        except CorpusError as exc:
            if 'HTTP 404' in str(exc):
                return None
            raise

    def exists(self, key):
        return self.head_object(key) is not None


def client_for(config, gcp=None, **kwargs):
    """Return the corpus client for the configured backend.

    ``config`` is the atlas_corpus CorpusConfig; ``gcp`` defaults to
    GCSConfig.from_env(). 'gcs' -> GCSClient, anything else -> S3Client.
    """
    gcp = gcp if gcp is not None else GCSConfig.from_env()
    if gcp.backend == 'gcs':
        return GCSClient(gcp, **kwargs)
    return S3Client(config, **kwargs)
