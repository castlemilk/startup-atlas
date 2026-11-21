#!/usr/bin/env python3
"""Offline image review and private staging; no network, MCP or record writes.

This prototype accepts a deliberately small PNG subset, a safety-checked SVG
subset, and Pillow conversions from WebP, ICO, JPEG, GIF and non-strict PNG
into strict PNG. It validates the complete PNG/zlib stream, not all image
formats or every conceivable decoder vulnerability. Provenance is caller
attestation: a digest binds its text, but does not authenticate the reviewer,
prove identity, clear rights or authorize publication.

A conversion preserves the original digest alongside the derivative digest;
it never relabels a file or strips licence-bearing metadata to make it pass.
SVG is published only after the safety checks in inspect_svg; it is never
rasterized by this helper, which has no approved SVG rasterizer.

An explicit private store must be outside Git checkouts. Immutable blobs are
deduplicated independently from review manifests. A durable intent precedes writes;
an interrupted intent is never silently completed. A complete receipt is returned
again only after readback. No operation writes a public tree or attaches a record.
The local account and its filesystem are trusted; this is not a multi-user service.
"""
from __future__ import annotations

import argparse
import binascii
import datetime as dt
import hashlib
import io
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import stat
import struct
import sys
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
import zlib


MAX_BYTES = 1_000_000
MAX_DIMENSION = 4096
MAX_PIXELS = 16_000_000
MAX_CHUNKS = 256
MAX_MANIFEST_BYTES = 32_768
SCHEMA = 'atlas.asset-review.v0'
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
HEX = re.compile(r'^[a-f0-9]{64}$')
ASSET_ID = re.compile(r'^asset:sha256:([a-f0-9]{64})$')
ASSET_REVISION = re.compile(r'^sha256:([a-f0-9]{64})$')
# Existing graph people can be partner-scoped with a double-hyphen separator.
# Accept the exact shape; never split, derive, normalize or resolve the identity.
SUBJECT_ID = re.compile(r'^(?:(?:startup|partner|provider):[a-z0-9]+(?:-[a-z0-9]+)*|person:[a-z0-9]+(?:-{1,2}[a-z0-9]+)*)$')
HOST = re.compile(r'(?=.{1,253}\Z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\Z')


class AssetError(Exception):
    def __init__(self, code, field, message):
        super().__init__(message)
        self.code, self.field, self.message = code, field, message

    def as_dict(self):
        return {'code': self.code, 'field': self.field, 'message': self.message}


def _fail(code, field, message):
    raise AssetError(code, field, message)


def _canonical_bytes(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(',', ':'),
                          ensure_ascii=False, allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, UnicodeError) as exc:
        _fail('VALIDATION_ERROR', 'manifest', f'Manifest is not canonical JSON: {exc}')


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _object(value, fields, field, optional=()):
    if type(value) is not dict:
        _fail('VALIDATION_ERROR', field, 'Expected a JSON object.')
    missing = set(fields) - value.keys()
    extra = value.keys() - set(fields) - set(optional)
    if missing or extra:
        _fail('VALIDATION_ERROR', field,
              f'Incorrect fields; missing={sorted(missing)}, unknown={sorted(extra)}.')


def _text(value, field, maximum, nonempty=True):
    if type(value) is not str or len(value) > maximum or (nonempty and not value.strip()):
        _fail('VALIDATION_ERROR', field, f'Expected {"nonempty " if nonempty else ""}text of at most {maximum} characters.')
    if any((ord(c) < 32 and c not in '\n\t') or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in value):
        _fail('VALIDATION_ERROR', field, 'Text contains unsupported control or surrogate characters.')
    return value


def _choice(value, choices, field):
    if type(value) is not str or value not in choices:
        _fail('VALIDATION_ERROR', field, f'Expected one of {", ".join(sorted(choices))}.')
    return value


def _host(value, field):
    if type(value) is not str or not HOST.fullmatch(value) or value != value.lower():
        _fail('VALIDATION_ERROR', field, 'Provide a lower-case exact DNS hostname, without a port, wildcard or URL.')
    if value.endswith(('.local', '.localhost', '.internal', '.test', '.invalid')):
        _fail('VALIDATION_ERROR', field, 'Local or non-public hostname shapes are not supported.')
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return value
    _fail('VALIDATION_ERROR', field, 'IP-literal hosts are not supported.')


def _url(value, field, expected_host=None):
    _text(value, field, 2048)
    if any(c.isspace() for c in value) or '\\' in value or not value.isascii():
        _fail('VALIDATION_ERROR', field, 'Use an ASCII HTTPS URL with percent-encoded paths, without whitespace or backslashes.')
    if re.search(r'%(?![a-fA-F0-9]{2})', value) or re.search(r'%(?:0[0-9a-f]|1[0-9a-f]|7f)', value, re.I):
        _fail('VALIDATION_ERROR', field, 'URL has invalid percent encoding or encoded controls.')
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        _fail('VALIDATION_ERROR', field, 'Malformed URL.')
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username is not None or parsed.password is not None or port not in (None, 443):
        _fail('VALIDATION_ERROR', field, 'A public-shaped HTTPS URL without credentials and with default HTTPS port is required.')
    # This module never fetches URLs, but proposed references retain the collector's
    # source-access prohibition so a later adapter cannot mistake them for seeds.
    path = parsed.path
    for _ in range(16):
        decoded = unquote(path)
        if decoded == path:
            break
        path = decoded
    else:
        _fail('VALIDATION_ERROR', field, 'URL path encoding exceeds the source-policy bound.')
    if any(part.split(';', 1)[0].rstrip(' .').casefold() == 'robots.txt'
           for part in path.replace('\\', '/').split('/')):
        _fail('VALIDATION_ERROR', field, 'robots.txt source references are excluded by repository policy.')
    hostname = _host(parsed.hostname, field)
    if expected_host is not None and hostname != expected_host:
        _fail('VALIDATION_ERROR', field, 'Asset URL must use the exact approved asset hostname.')
    return value


def _timestamp(value, field, now):
    if type(value) is not str or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', value):
        _fail('VALIDATION_ERROR', field, 'Use a UTC timestamp in YYYY-MM-DDTHH:MM:SSZ form.')
    try:
        parsed = dt.datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
    except ValueError:
        _fail('VALIDATION_ERROR', field, 'Timestamp is not a valid calendar time.')
    if parsed > now:
        _fail('VALIDATION_ERROR', field, 'Timestamp cannot be in the future.')
    return value


def _image_bytes(data):
    if not isinstance(data, (bytes, bytearray)):
        _fail('VALIDATION_ERROR', 'bytes', 'Supply binary bytes.')
    if not 0 < len(data) <= MAX_BYTES:
        _fail('INVALID_PNG', 'bytes', f'File must contain 1 to {MAX_BYTES} bytes.')
    return bytes(data)


def inspect_png(data, declared_mime='image/png', observed_mime=None, expected_sha256=None):
    """Measure complete, non-interlaced, 8-bit RGB/RGBA PNG bytes without I/O.

    Only IHDR, consecutive IDAT chunks and IEND are supported. Ancillary chunks,
    palettes, animation and every other format are intentionally unsupported.
    `observed_mime` is separately supplied acquisition metadata, never inferred.
    """
    data = _image_bytes(data)
    if declared_mime != 'image/png' or (observed_mime is not None and observed_mime != 'image/png'):
        _fail('MIME_MISMATCH', 'mime', 'Declared and available observed MIME must each be image/png.')
    if expected_sha256 is not None and (type(expected_sha256) is not str or not HEX.fullmatch(expected_sha256)):
        _fail('VALIDATION_ERROR', 'expected_sha256', 'Expected a lower-case SHA-256 hex digest.')
    digest = _digest(data)
    if expected_sha256 is not None and digest != expected_sha256:
        _fail('DIGEST_MISMATCH', 'expected_sha256', 'Supplied bytes do not match the expected digest.')
    if not data.startswith(PNG_SIGNATURE):
        _fail('UNSUPPORTED_IMAGE', 'bytes', 'Only the strict PNG subset is supported; SVG and other formats are rejected.')
    offset, chunks, width, height, color_type = 8, 0, None, None, None
    idat, ended = [], False
    while offset < len(data):
        chunks += 1
        if chunks > MAX_CHUNKS:
            _fail('INVALID_PNG', 'chunks', f'PNG exceeds {MAX_CHUNKS} chunks.')
        if offset + 12 > len(data):
            _fail('INVALID_PNG', 'chunks', 'Truncated PNG chunk header or CRC.')
        length = int.from_bytes(data[offset:offset + 4], 'big')
        kind = data[offset + 4:offset + 8]
        if length > len(data) - offset - 12:
            _fail('INVALID_PNG', 'chunks', 'Chunk length extends beyond the file.')
        payload = data[offset + 8:offset + 8 + length]
        crc = int.from_bytes(data[offset + 8 + length:offset + 12 + length], 'big')
        if (binascii.crc32(kind + payload) & 0xffffffff) != crc:
            _fail('INVALID_PNG', 'crc', 'Chunk CRC does not match.')
        offset += length + 12
        if kind == b'IHDR':
            if chunks != 1 or length != 13:
                _fail('INVALID_PNG', 'IHDR', 'Exactly one 13-byte IHDR must be first.')
            width, height, depth, color_type, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            if not 1 <= width <= MAX_DIMENSION or not 1 <= height <= MAX_DIMENSION or width * height > MAX_PIXELS:
                _fail('INVALID_PNG', 'dimensions', f'Dimensions must be 1–{MAX_DIMENSION}, with at most {MAX_PIXELS} pixels.')
            if (depth, color_type, compression, filtering, interlace) not in ((8, 2, 0, 0, 0), (8, 6, 0, 0, 0)):
                _fail('UNSUPPORTED_IMAGE', 'IHDR', 'Only non-interlaced 8-bit RGB or RGBA with standard compression/filtering is supported.')
        elif kind == b'IDAT':
            if width is None:
                _fail('INVALID_PNG', 'IDAT', 'IDAT must follow IHDR.')
            idat.append(payload)
        elif kind == b'IEND':
            if width is None or not idat or length != 0:
                _fail('INVALID_PNG', 'IEND', 'An empty IEND must follow image data.')
            if offset != len(data):
                _fail('INVALID_PNG', 'bytes', 'Trailing bytes or chunks after IEND are rejected.')
            ended = True
            break
        else:
            _fail('UNSUPPORTED_IMAGE', 'chunks', 'Ancillary, unknown, palette and animation chunks are unsupported.')
    if not ended:
        _fail('INVALID_PNG', 'IEND', 'PNG has no complete IEND.')
    stride = width * (3 if color_type == 2 else 4) + 1
    expected_length = height * stride
    inflater = zlib.decompressobj()
    try:
        decoded = inflater.decompress(b''.join(idat), expected_length + 1)
    except zlib.error:
        _fail('INVALID_PNG', 'IDAT', 'Invalid zlib image stream.')
    if len(decoded) != expected_length or not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        _fail('INVALID_PNG', 'IDAT', 'Image stream is truncated, oversized, concatenated or has trailing compressed data.')
    if any(decoded[row * stride] > 4 for row in range(height)):
        _fail('INVALID_PNG', 'filters', 'Each scanline requires a filter byte from 0 through 4.')
    return {'asset_id': 'asset:sha256:' + digest, 'sha256': digest, 'bytes': len(data),
            'mime': 'image/png', 'declared_mime': declared_mime, 'observed_mime': observed_mime,
            'width': width, 'height': height, 'bit_depth': 8, 'color_type': color_type,
            'validation': 'png-rgb8-v0'}


def _svg_dimension(value):
    """Parse an SVG length (number, optionally with a px suffix) or return None."""
    if value is None:
        return None
    text = value.strip()
    if text.endswith('px'):
        text = text[:-2]
    try:
        number = float(text)
    except ValueError:
        return None
    if number != number or number in (float('inf'), float('-inf')):
        return None
    return number


# Tags and attributes that can execute code, embed foreign content or fetch
# remote resources. The same rules are enforced for published files by
# tests/logos.test.js; keep both in sync.
_SVG_FORBIDDEN_TAGS = {'script', 'foreignobject', 'image', 'iframe', 'object',
                       'embed', 'link', 'meta', 'base', 'audio', 'video'}
# <use> is allowed only with a local fragment href; the attribute check below
# rejects every other reference. <image> stays forbidden: a published SVG must
# not smuggle in raster bytes that the vector checks cannot see.
_SVG_FORBIDDEN_ATTRS = ('on',)
_SVG_MAX_ELEMENTS = 2000


def inspect_svg(data, declared_mime='image/svg+xml', observed_mime=None, expected_sha256=None):
    """Safety-check an SVG as static vector bytes; never rasterize or fetch it.

    Accepts well-formed SVG with a root <svg>, bounded dimensions and only
    local fragment references. Rejects scripts, foreign content, event-handler
    attributes, external references, stylesheets/imports, DOCTYPE/entity
    declarations and embedded raster images. Dimensions come from width/height
    attributes, falling back to the viewBox.
    """
    data = _image_bytes(data)
    if declared_mime != 'image/svg+xml' or (observed_mime is not None and observed_mime != 'image/svg+xml'):
        _fail('MIME_MISMATCH', 'mime', 'Declared and available observed MIME must each be image/svg+xml.')
    if expected_sha256 is not None and (type(expected_sha256) is not str or not HEX.fullmatch(expected_sha256)):
        _fail('VALIDATION_ERROR', 'expected_sha256', 'Expected a lower-case SHA-256 hex digest.')
    digest = _digest(data)
    if expected_sha256 is not None and digest != expected_sha256:
        _fail('DIGEST_MISMATCH', 'expected_sha256', 'Supplied bytes do not match the expected digest.')
    lowered = data.lower()
    if b'<!doctype' in lowered or b'<!entity' in lowered:
        _fail('UNSUPPORTED_IMAGE', 'svg', 'DOCTYPE and entity declarations are rejected.')
    if b'<script' in lowered or b'javascript:' in lowered:
        _fail('UNSUPPORTED_IMAGE', 'svg', 'Script content is rejected.')
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        _fail('INVALID_SVG', 'svg', 'SVG is not well-formed XML.')
    tag = root.tag.rsplit('}', 1)[-1].lower()
    if tag != 'svg':
        _fail('UNSUPPORTED_IMAGE', 'svg', 'Root element must be <svg>.')
    width = _svg_dimension(root.get('width'))
    height = _svg_dimension(root.get('height'))
    if (width is None or height is None) and root.get('viewBox'):
        try:
            parts = [float(part) for part in root.get('viewBox').split()]
        except ValueError:
            parts = []
        if len(parts) == 4 and parts[2] > 0 and parts[3] > 0:
            width, height = parts[2], parts[3]
    if width is None or height is None:
        _fail('INVALID_SVG', 'dimensions', 'SVG needs width/height attributes or a viewBox.')
    if not 1 <= width <= MAX_DIMENSION or not 1 <= height <= MAX_DIMENSION or width * height > MAX_PIXELS:
        _fail('INVALID_SVG', 'dimensions', f'Dimensions must be 1–{MAX_DIMENSION}, with at most {MAX_PIXELS} pixels.')
    elements = 0
    for element in root.iter():
        elements += 1
        if elements > _SVG_MAX_ELEMENTS:
            _fail('INVALID_SVG', 'svg', f'SVG exceeds {_SVG_MAX_ELEMENTS} elements.')
        name = element.tag.rsplit('}', 1)[-1].lower()
        if name in _SVG_FORBIDDEN_TAGS:
            _fail('UNSUPPORTED_IMAGE', 'svg', f'<{name}> is not allowed in a published SVG.')
        for key, value in element.attrib.items():
            attr = key.rsplit('}', 1)[-1].lower()
            if attr.startswith(_SVG_FORBIDDEN_ATTRS):
                _fail('UNSUPPORTED_IMAGE', 'svg', f'Event-handler attribute {attr} is not allowed.')
            if attr in ('href', 'xlink:href', 'src'):
                if not value.startswith('#'):
                    _fail('UNSUPPORTED_IMAGE', 'svg', 'Only local fragment references are allowed.')
            if attr == 'style' and ('url(' in value.lower() or '@import' in value.lower() or 'http' in value.lower()):
                _fail('UNSUPPORTED_IMAGE', 'svg', 'External references in inline styles are not allowed.')
        if name == 'style':
            style = (element.text or '').lower()
            if 'url(' in style or '@import' in style or 'http' in style:
                _fail('UNSUPPORTED_IMAGE', 'svg', 'External references in <style> are not allowed.')
    return {'asset_id': 'asset:sha256:' + digest, 'sha256': digest, 'bytes': len(data),
            'mime': 'image/svg+xml', 'declared_mime': declared_mime, 'observed_mime': observed_mime,
            'width': int(width), 'height': int(height), 'bit_depth': None, 'color_type': None,
            'validation': 'svg-safe-v0'}


def inspect_image(data, declared_mime='image/png', observed_mime=None, expected_sha256=None):
    """Dispatch to the PNG or SVG inspector by declared MIME."""
    if declared_mime == 'image/svg+xml':
        return inspect_svg(data, declared_mime, observed_mime, expected_sha256)
    return inspect_png(data, declared_mime, observed_mime, expected_sha256)


def _validate_blob(blob):
    _object(blob, ('asset_id', 'sha256', 'bytes', 'mime', 'declared_mime', 'observed_mime',
                   'width', 'height', 'bit_depth', 'color_type', 'validation'), 'blob')
    if type(blob['sha256']) is not str or not HEX.fullmatch(blob['sha256']) or blob['asset_id'] != 'asset:sha256:' + blob['sha256']:
        _fail('VALIDATION_ERROR', 'blob.sha256', 'Blob identifier must match its full SHA-256 digest.')
    for key, maximum in (('bytes', MAX_BYTES), ('width', MAX_DIMENSION), ('height', MAX_DIMENSION)):
        if type(blob[key]) is not int or not 1 <= blob[key] <= maximum:
            _fail('VALIDATION_ERROR', 'blob.' + key, 'Invalid measured integer.')
    if blob['width'] * blob['height'] > MAX_PIXELS:
        _fail('VALIDATION_ERROR', 'blob.dimensions', 'Pixel limit exceeded.')
    if blob['validation'] == 'svg-safe-v0':
        if blob['mime'] != 'image/svg+xml' or blob['declared_mime'] != 'image/svg+xml' or blob['observed_mime'] not in (None, 'image/svg+xml'):
            _fail('VALIDATION_ERROR', 'blob', 'Unsupported SVG validation profile or MIME metadata.')
        if blob['bit_depth'] is not None or blob['color_type'] is not None:
            _fail('VALIDATION_ERROR', 'blob', 'SVG blobs carry no PNG bit depth or colour type.')
        return
    if type(blob['bit_depth']) is not int or blob['bit_depth'] != 8 or type(blob['color_type']) is not int or blob['color_type'] not in (2, 6):
        _fail('VALIDATION_ERROR', 'blob', 'Unsupported measured PNG parameters.')
    if blob['mime'] != 'image/png' or blob['declared_mime'] != 'image/png' or blob['observed_mime'] not in (None, 'image/png') or blob['validation'] != 'png-rgb8-v0':
        _fail('VALIDATION_ERROR', 'blob', 'Unsupported validation profile or MIME metadata.')


def validate_provenance(provenance, blob, now=None):
    """Validate and bind caller attestations, without fetching or certifying them."""
    _validate_blob(blob)
    if now is None:
        now = dt.datetime.now(dt.timezone.utc)
    if not isinstance(now, dt.datetime) or now.tzinfo is None:
        _fail('VALIDATION_ERROR', 'now', 'The reference clock must be a timezone-aware datetime.')
    _object(provenance, ('subject_id', 'role', 'source_page', 'source_asset_url', 'final_url',
                        'approved_asset_host', 'host_evidence_url', 'acquired_at', 'acquisition',
                        'source_kind', 'identity', 'rights'), 'provenance', ('redirects', 'conversion'))
    subject = _text(provenance['subject_id'], 'subject_id', 240)
    if not SUBJECT_ID.fullmatch(subject):
        _fail('VALIDATION_ERROR', 'subject_id', 'Supply the exact existing canonical-shaped subject ID; no name-to-ID inference is performed.')
    role = _choice(provenance['role'], ('logo', 'portrait'), 'role')
    if (role == 'portrait') != subject.startswith('person:'):
        _fail('VALIDATION_ERROR', 'role', 'Portraits require a person subject; logos require an organisation subject.')
    kind = _choice(provenance['source_kind'], ('official-brand', 'labelled-portrait', 'social-preview', 'other'), 'source_kind')
    if role == 'logo' and kind == 'social-preview':
        _fail('VALIDATION_ERROR', 'source_kind', 'A social preview must not be attached as a logo.')
    _choice(provenance['acquisition'], ('crawler', 'manual', 'synthetic-fixture'), 'acquisition')
    host = _host(provenance['approved_asset_host'], 'approved_asset_host')
    for key in ('source_page', 'host_evidence_url'):
        _url(provenance[key], key)
    for key in ('source_asset_url', 'final_url'):
        _url(provenance[key], key, host)
    redirects = provenance.get('redirects', [])
    if type(redirects) is not list or len(redirects) > 6:
        _fail('VALIDATION_ERROR', 'redirects', 'Expected at most six redirect URL observations.')
    for index, url in enumerate(redirects):
        _url(url, f'redirects[{index}]', host)
    _timestamp(provenance['acquired_at'], 'acquired_at', now)
    identity = provenance['identity']
    _object(identity, ('decision', 'evidence', 'reviewer', 'reviewed_at'), 'identity')
    _choice(identity['decision'], ('approved', 'unreviewed', 'rejected'), 'identity.decision')
    reviewed = identity['decision'] in ('approved', 'rejected')
    _text(identity['evidence'], 'identity.evidence', 4000, reviewed)
    _text(identity['reviewer'], 'identity.reviewer', 200, reviewed)
    if identity['reviewed_at'] is not None or reviewed:
        _timestamp(identity['reviewed_at'], 'identity.reviewed_at', now)
    rights = provenance['rights']
    _object(rights, ('decision', 'basis', 'evidence_url', 'evidence', 'attribution', 'reviewer',
                     'reviewed_at', 'public_repository', 'public_website'), 'rights')
    _choice(rights['decision'], ('approved', 'unknown', 'rejected'), 'rights.decision')
    # 'nominative' is display of the subject's own published brand mark (or a
    # person's own published portrait) with attribution and a source link,
    # without implying endorsement and without a located licence or permission.
    # The owner approves that use by merging the publishing PR.
    _choice(rights['basis'], ('owned', 'licence', 'permission', 'nominative', 'unresolved'), 'rights.basis')
    rights_reviewed = rights['decision'] in ('approved', 'rejected')
    _text(rights['evidence'], 'rights.evidence', 4000, rights_reviewed)
    _text(rights['reviewer'], 'rights.reviewer', 200, rights_reviewed)
    _text(rights['attribution'], 'rights.attribution', 2000, False)
    if rights['reviewed_at'] is not None or rights_reviewed:
        _timestamp(rights['reviewed_at'], 'rights.reviewed_at', now)
    if rights['evidence_url'] is not None:
        _url(rights['evidence_url'], 'rights.evidence_url')
    if rights['decision'] == 'approved' and (rights['basis'] == 'unresolved' or rights['evidence_url'] is None):
        _fail('VALIDATION_ERROR', 'rights', 'Approved rights need an explicit basis and evidence URL.')
    for key in ('public_repository', 'public_website'):
        if type(rights[key]) is not bool:
            _fail('VALIDATION_ERROR', 'rights.' + key, 'Expected an explicit boolean.')
        if rights[key] and rights['decision'] != 'approved':
            _fail('VALIDATION_ERROR', 'rights.' + key, 'Unresolved or rejected rights cannot assert public use approval.')
    conversion = provenance.get('conversion')
    if conversion is not None:
        _object(conversion, ('original_sha256', 'original_format', 'derivative_sha256',
                             'transformation', 'tool'), 'conversion')
        if type(conversion['original_sha256']) is not str or not HEX.fullmatch(conversion['original_sha256']):
            _fail('VALIDATION_ERROR', 'conversion.original_sha256', 'Expected a lower-case SHA-256 hex digest.')
        if conversion['derivative_sha256'] != blob['sha256']:
            _fail('VALIDATION_ERROR', 'conversion.derivative_sha256', 'The derivative digest must match the validated bytes.')
        _choice(conversion['original_format'], ('png', 'webp', 'ico', 'jpeg', 'gif'), 'conversion.original_format')
        _choice(conversion['transformation'], ('png-strict-reencode', 'webp-to-png', 'ico-to-png',
                                               'jpeg-to-png', 'gif-to-png'), 'conversion.transformation')
        _text(conversion['tool'], 'conversion.tool', 200)
        if blob['mime'] != 'image/png':
            _fail('VALIDATION_ERROR', 'conversion', 'A conversion record belongs to a PNG derivative.')
    manifest = {'schema': SCHEMA, 'blob': blob, 'provenance': provenance}
    encoded = _canonical_bytes(manifest)
    if len(encoded) > MAX_MANIFEST_BYTES:
        _fail('VALIDATION_ERROR', 'manifest', 'Manifest exceeds the bounded review size.')
    return json.loads(encoded)


def validate_asset(data, provenance, declared_mime='image/png', observed_mime=None, expected_sha256=None):
    """Read-only preflight: retain these references before invoking stage().

    Repeating this function with the identical bytes and provenance reproduces the
    references needed to inspect an interrupted first write, without touching a
    store or assuming that any previous stage operation completed.
    """
    blob = inspect_image(data, declared_mime, observed_mime, expected_sha256)
    manifest = validate_provenance(provenance, blob)
    return {'schema': 'atlas.asset-validation.v0', 'asset_id': blob['asset_id'],
            'asset_revision': 'sha256:' + _digest(_canonical_bytes(manifest)),
            'state': 'validated', 'published': False, 'manifest': manifest}


_CONVERT_FORMATS = {'png': 'PNG', 'webp': 'WEBP', 'ico': 'ICO', 'jpeg': 'JPEG', 'gif': 'GIF'}
_CONVERT_TRANSFORMATIONS = {'png': 'png-strict-reencode', 'webp': 'webp-to-png', 'ico': 'ico-to-png',
                            'jpeg': 'jpeg-to-png', 'gif': 'gif-to-png'}


def convert_image(data, source_format):
    """Decode a raster image and re-encode it as strict PNG.

    Pixels are preserved; the container is rebuilt with only IHDR, IDAT and
    IEND chunks, so real-world PNGs with ancillary chunks or interlacing pass
    the strict validator. Returns (png_bytes, conversion_record) where the
    record binds the original digest to the derivative digest. SVG is rejected:
    this helper has no approved SVG rasterizer.
    """
    try:
        from PIL import Image
    except ImportError:
        _fail('UNSUPPORTED_IMAGE', 'conversion', 'Pillow is required to convert raster images; it is not installed.')
    if source_format not in _CONVERT_FORMATS:
        _fail('UNSUPPORTED_IMAGE', 'conversion', 'Conversion supports PNG, WebP, ICO, JPEG and GIF only; SVG needs a separately reviewed rasterizer.')
    data = _image_bytes(data)
    original_sha256 = _digest(data)
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != _CONVERT_FORMATS[source_format]:
                _fail('UNSUPPORTED_IMAGE', 'conversion', f'Decoded format {image.format} does not match declared {source_format}.')
            image.load()
            if not 1 <= image.size[0] <= MAX_DIMENSION or not 1 <= image.size[1] <= MAX_DIMENSION \
                    or image.size[0] * image.size[1] > MAX_PIXELS:
                _fail('INVALID_IMAGE', 'conversion', 'Decoded dimensions exceed the asset policy.')
            if image.mode in ('RGBA', 'LA', 'PA') or (image.mode == 'P' and 'transparency' in image.info):
                converted = image.convert('RGBA')
            else:
                converted = image.convert('RGB')
            width, height = converted.size
            buffer = io.BytesIO()
            converted.save(buffer, format='PNG')
            png_bytes = buffer.getvalue()
    except AssetError:
        raise
    except Exception:
        _fail('INVALID_IMAGE', 'conversion', 'Source bytes could not be decoded.')
    blob = inspect_png(png_bytes)
    record = {'original_sha256': original_sha256, 'original_format': source_format,
              'derivative_sha256': blob['sha256'], 'derivative_bytes': blob['bytes'],
              'width': width, 'height': height,
              'transformation': _CONVERT_TRANSFORMATIONS[source_format],
              'tool': 'Pillow ' + Image.__version__}
    return png_bytes, record


def _absolute(path):
    return Path(os.path.abspath(os.fspath(path)))


def _directory_fd(path):
    """Walk an absolute path with O_NOFOLLOW, retaining directory descriptors."""
    path = _absolute(path)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open('/', flags)
    try:
        for part in path.parts[1:]:
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _write_new(path, payload):
    """Durably create immutable bytes, without replacing any existing name.

    The temporary name and destination are in the same private directory. link()
    supplies atomic no-overwrite publication; no rename/replacement is attempted.
    This helper is the deterministic fault-injection seam for interruption tests.
    """
    directory = _directory_fd(path.parent)
    temporary = '.pending-' + secrets.token_hex(16)
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        try:
            view = memoryview(payload)
            while view:
                count = os.write(fd, view)
                if count <= 0:
                    raise OSError('Short write while staging an asset.')
                view = view[count:]
            os.fsync(fd)
        finally:
            os.close(fd)
        os.link(temporary, path.name, src_dir_fd=directory, dst_dir_fd=directory, follow_symlinks=False)
        os.fsync(directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
            os.fsync(directory)
        except FileNotFoundError:
            pass
        finally:
            os.close(directory)


def _read_file(path, limit):
    directory = _directory_fd(path.parent)
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_uid != os.geteuid():
                _fail('UNSAFE_STORE', 'store', 'Stored objects must be private regular files with one link, owned by the local user.')
            if info.st_size > limit:
                _fail('INTEGRITY_ERROR', 'store', 'Stored object exceeds its size bound.')
            output = bytearray()
            while len(output) <= limit:
                block = os.read(fd, min(65536, limit + 1 - len(output)))
                if not block:
                    break
                output.extend(block)
            if len(output) > limit:
                _fail('INTEGRITY_ERROR', 'store', 'Stored object exceeds its size bound.')
            return bytes(output)
        finally:
            os.close(fd)
    finally:
        os.close(directory)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _fail('VALIDATION_ERROR', 'json', 'Duplicate object keys are rejected.')
        result[key] = value
    return result


def _json_bytes(payload):
    try:
        return json.loads(payload, object_pairs_hook=_unique_object,
                          parse_constant=lambda _: _fail('VALIDATION_ERROR', 'json', 'Non-finite JSON numbers are rejected.'))
    except (ValueError, UnicodeError, RecursionError) as exc:
        _fail('INTEGRITY_ERROR', 'json', f'Invalid UTF-8 JSON: {exc}')


class StageStore:
    """Private, local, immutable review storage. No publication or record API."""
    def __init__(self, root):
        self.root = _absolute(root)
        self._check_location()

    def _check_location(self):
        # Refuse checkout roots and descendants, including worktree .git files.
        for parent in (self.root, *self.root.parents):
            if os.path.lexists(parent / '.git'):
                _fail('UNSAFE_STORE', 'store', 'Private staging must be outside every Git checkout.')
        current = Path('/')
        for part in self.root.parts[1:]:
            current = current / part
            try:
                mode = current.lstat().st_mode
            except FileNotFoundError:
                continue
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                _fail('UNSAFE_STORE', 'store', 'Store paths and ancestors must be real directories, never symlinks.')

    def _layout(self, create=False):
        self._check_location()
        paths = (self.root, *(self.root / name for name in ('blobs', 'reviews', 'receipts', 'intents')))
        for path in paths:
            if create:
                # Do not create unspecified ancestor trees or chmod existing paths.
                parent = _directory_fd(path.parent)
                try:
                    try:
                        os.mkdir(path.name, 0o700, dir_fd=parent)
                        os.fsync(parent)
                    except FileExistsError:
                        pass
                finally:
                    os.close(parent)
            directory = _directory_fd(path)
            try:
                info = os.fstat(directory)
                if info.st_mode & 0o077 or info.st_uid != os.geteuid():
                    _fail('UNSAFE_STORE', 'store', 'The store and child directories must be private and owned by the local user.')
            finally:
                os.close(directory)

    def _refs(self, asset_id, asset_revision):
        asset = ASSET_ID.fullmatch(asset_id) if type(asset_id) is str else None
        review = ASSET_REVISION.fullmatch(asset_revision) if type(asset_revision) is str else None
        if asset is None or review is None:
            _fail('VALIDATION_ERROR', 'asset_reference', 'Supply an exact asset:sha256 ID and sha256 review revision.')
        return asset.group(1), review.group(1)

    @staticmethod
    def _receipt(asset_id, asset_revision):
        return {'schema': 'atlas.asset-stage-receipt.v0', 'asset_id': asset_id,
                'asset_revision': asset_revision, 'state': 'staged', 'published': False}

    def _optional(self, path, limit):
        try:
            return _read_file(path, limit)
        except FileNotFoundError:
            return None

    def stage(self, data, provenance, *, declared_mime='image/png', observed_mime=None, expected_sha256=None):
        # Freeze mutable caller input before validation; every later write and
        # duplicate comparison uses this same measured byte sequence.
        data = _image_bytes(data)
        validated = validate_asset(data, provenance, declared_mime, observed_mime, expected_sha256)
        manifest = validated['manifest']
        blob = manifest['blob']
        encoded = _canonical_bytes(manifest)
        asset_id, revision = validated['asset_id'], validated['asset_revision']
        revision_digest = revision.removeprefix('sha256:')
        receipt = self._receipt(asset_id, revision)
        receipt_bytes = _canonical_bytes(receipt)
        intent = _canonical_bytes({'schema': 'atlas.asset-stage-intent.v0', 'asset_id': asset_id,
                                   'asset_revision': revision, 'manifest_sha256': revision_digest})
        try:
            self._layout(create=True)
            receipt_path = self.root / 'receipts' / (revision_digest + '.json')
            intent_path = self.root / 'intents' / (revision_digest + '.json')
            if self._optional(receipt_path, MAX_MANIFEST_BYTES) is not None:
                return self.get(asset_id, revision)
            if self._optional(intent_path, MAX_MANIFEST_BYTES) is not None:
                _fail('STAGE_UNCERTAIN', 'asset_revision', 'An incomplete intent exists. Inspect the private store; do not replay or complete it automatically.')
            try:
                _write_new(intent_path, intent)
            except FileExistsError:
                _fail('STAGE_BUSY', 'asset_revision', 'Another writer owns this intent. Inspect its result before retrying.')
            blob_path = self.root / 'blobs' / (blob['sha256'] + ('.svg' if blob['mime'] == 'image/svg+xml' else '.png'))
            try:
                _write_new(blob_path, data)
            except FileExistsError:
                if _read_file(blob_path, MAX_BYTES) != data:
                    _fail('INTEGRITY_ERROR', 'blob', 'Existing digest path does not contain the exact expected bytes.')
            review_path = self.root / 'reviews' / (revision_digest + '.json')
            if self._optional(review_path, MAX_MANIFEST_BYTES) is not None:
                _fail('STAGE_UNCERTAIN', 'asset_revision', 'A review exists without a confirmed receipt. Manual reconciliation is required.')
            _write_new(review_path, encoded)
            _write_new(receipt_path, receipt_bytes)
            # Retain the immutable intent as audit evidence. A verified final receipt
            # supersedes it; a partial intent is never completed by a retry.
            return self.get(asset_id, revision)
        except AssetError:
            raise
        except OSError as exc:
            _fail('STAGE_UNCERTAIN', 'store', f'Staging did not return a verified result ({exc.__class__.__name__}). Use the saved preflight references, or reproduce them with read-only validate, then get the exact result before retrying.')

    def get(self, asset_id, asset_revision):
        digest, revision_digest = self._refs(asset_id, asset_revision)
        try:
            self._layout()
            receipt_bytes = _read_file(self.root / 'receipts' / (revision_digest + '.json'), MAX_MANIFEST_BYTES)
            receipt = _json_bytes(receipt_bytes)
            expected = self._receipt(asset_id, asset_revision)
            if receipt != expected or receipt_bytes != _canonical_bytes(expected):
                _fail('ASSET_REVISION_MISMATCH', 'asset_reference', 'Receipt does not match the exact requested asset and review revision.')
            manifest_bytes = _read_file(self.root / 'reviews' / (revision_digest + '.json'), MAX_MANIFEST_BYTES)
            if _digest(manifest_bytes) != revision_digest:
                _fail('INTEGRITY_ERROR', 'asset_revision', 'Stored manifest bytes do not match the review digest.')
            manifest = _json_bytes(manifest_bytes)
            _object(manifest, ('schema', 'blob', 'provenance'), 'manifest')
            if manifest['schema'] != SCHEMA:
                _fail('INTEGRITY_ERROR', 'manifest.schema', 'Unsupported review schema.')
            _validate_blob(manifest['blob'])
            if manifest['blob']['asset_id'] != asset_id:
                _fail('ASSET_REVISION_MISMATCH', 'asset_reference', 'The review belongs to a different byte identity.')
            data = _read_file(self.root / 'blobs' / (digest + ('.svg' if manifest['blob']['mime'] == 'image/svg+xml' else '.png')), MAX_BYTES)
            blob = inspect_image(data, manifest['blob']['declared_mime'], manifest['blob']['observed_mime'], digest)
            canonical_manifest = validate_provenance(manifest['provenance'], blob)
            if manifest_bytes != _canonical_bytes(canonical_manifest):
                _fail('INTEGRITY_ERROR', 'manifest', 'Stored metadata differs from measured bytes or canonical provenance.')
            intent_bytes = _read_file(self.root / 'intents' / (revision_digest + '.json'), MAX_MANIFEST_BYTES)
            intent = {'schema': 'atlas.asset-stage-intent.v0', 'asset_id': asset_id,
                      'asset_revision': asset_revision, 'manifest_sha256': revision_digest}
            if intent_bytes != _canonical_bytes(intent):
                _fail('INTEGRITY_ERROR', 'intent', 'Stored intent does not match the completed receipt.')
            return {**receipt, 'manifest': canonical_manifest}
        except AssetError:
            raise
        except FileNotFoundError:
            _fail('NOT_FOUND', 'asset_reference', 'No complete receipt and verified objects exist for this exact asset revision.')
        except OSError as exc:
            _fail('UNSAFE_STORE', 'store', f'Stored objects could not be read safely ({exc.__class__.__name__}).')

    def read_bytes(self, asset_id, asset_revision):
        """Return the exact verified bytes for a staged asset.

        Re-reads the stored blob after get() has verified the receipt,
        manifest and byte digest, so a later adapter copies measured bytes.
        """
        packet = self.get(asset_id, asset_revision)
        blob = packet['manifest']['blob']
        digest = blob['sha256']
        extension = '.svg' if blob['mime'] == 'image/svg+xml' else '.png'
        data = _read_file(self.root / 'blobs' / (digest + extension), MAX_BYTES)
        if _digest(data) != digest:
            _fail('INTEGRITY_ERROR', 'blob', 'Stored bytes do not match the manifest digest.')
        return data

    def prepare_public_export(self, asset_id, asset_revision, *, subject_id, role):
        """Return a pathless, verified packet; never write or authorize publication.

        A later separately reviewed adapter must resolve this packet at an exact
        repository commit and enforce its own expected record revision. This
        prototype performs neither that integration nor record identity resolution.
        """
        packet = self.get(asset_id, asset_revision)
        provenance = packet['manifest']['provenance']
        if subject_id != provenance['subject_id']:
            _fail('SUBJECT_MISMATCH', 'subject_id', 'The asset review belongs to a different subject.')
        if role != provenance['role']:
            _fail('ROLE_MISMATCH', 'role', 'The asset review belongs to a different image role.')
        rights = provenance['rights']
        if provenance['identity']['decision'] != 'approved' or rights['decision'] != 'approved' or not rights['public_repository'] or not rights['public_website']:
            _fail('PUBLIC_EXPORT_BLOCKED', 'provenance', 'Explicit identity and rights attestations for both public GitHub storage and public website use are required.')
        return {**packet, 'prepared': True, 'authorization': 'caller-attestation-only',
                'record_attached': False, 'public_write_performed': False}


def _input_file(path, limit):
    # CLI input is explicitly user-selected; it is never taken from a manifest.
    # Reject symlinks and special files with the same descriptor-based reader.
    # Unlike private store objects, input files may legitimately be readable by others.
    path = _absolute(path)
    directory = _directory_fd(path.parent)
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
                _fail('VALIDATION_ERROR', 'input', 'Expected a bounded regular input file.')
            chunks, total = [], 0
            while True:
                chunk = os.read(fd, min(65536, limit + 1 - total))
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
                if total > limit:
                    _fail('VALIDATION_ERROR', 'input', 'Input exceeds the byte limit.')
            return b''.join(chunks)
        finally:
            os.close(fd)
    finally:
        os.close(directory)


class _ArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        _fail('ARGUMENT_ERROR', 'arguments', message)


def main(argv=None):
    parser = _ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('inspect', 'validate', 'stage'):
        command = commands.add_parser(name)
        command.add_argument('--file', required=True)
        command.add_argument('--declared-mime', default='image/png')
        command.add_argument('--observed-mime')
        command.add_argument('--expected-sha256')
        if name in ('validate', 'stage'):
            command.add_argument('--provenance', required=True)
        if name == 'stage':
            command.add_argument('--store', required=True)
    convert = commands.add_parser('convert')
    convert.add_argument('--file', required=True)
    convert.add_argument('--from', required=True, dest='source_format', choices=tuple(_CONVERT_FORMATS))
    convert.add_argument('--out', required=True)
    for name in ('get', 'prepare'):
        command = commands.add_parser(name)
        command.add_argument('--store', required=True)
        command.add_argument('--asset-id', required=True)
        command.add_argument('--asset-revision', required=True)
        if name == 'prepare':
            command.add_argument('--subject-id', required=True)
            command.add_argument('--role', required=True, choices=('logo', 'portrait'))
    try:
        args = parser.parse_args(argv)
        if args.command == 'convert':
            data = _input_file(args.file, MAX_BYTES)
            png_bytes, record = convert_image(data, args.source_format)
            out = _absolute(args.out)
            parent = _directory_fd(out.parent)
            try:
                fd = os.open(out.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
            finally:
                os.close(parent)
            try:
                view = memoryview(png_bytes)
                while view:
                    count = os.write(fd, view)
                    if count <= 0:
                        raise OSError('Short write while converting an asset.')
                    view = view[count:]
                os.fsync(fd)
            finally:
                os.close(fd)
            result = {'converted': True, 'out': str(out), **record}
        elif args.command in ('inspect', 'validate', 'stage'):
            data = _input_file(args.file, MAX_BYTES)
            options = {'declared_mime': args.declared_mime, 'observed_mime': args.observed_mime,
                       'expected_sha256': args.expected_sha256}
            if args.command == 'inspect':
                result = inspect_image(data, **options)
            else:
                provenance = _json_bytes(_input_file(args.provenance, MAX_MANIFEST_BYTES))
                if args.command == 'validate':
                    result = validate_asset(data, provenance, **options)
                else:
                    result = StageStore(args.store).stage(data, provenance, **options)
        elif args.command == 'get':
            result = StageStore(args.store).get(args.asset_id, args.asset_revision)
        else:
            result = StageStore(args.store).prepare_public_export(args.asset_id, args.asset_revision,
                                                                  subject_id=args.subject_id, role=args.role)
        print(json.dumps({'ok': True, 'result': result}, sort_keys=True, ensure_ascii=False))
        return 0
    except AssetError as exc:
        print(json.dumps({'ok': False, 'error': exc.as_dict()}, sort_keys=True))
        return 1
    except OSError as exc:
        print(json.dumps({'ok': False, 'error': {'code': 'IO_ERROR', 'field': 'input',
                                               'message': f'Local I/O failed ({exc.__class__.__name__}).'}}, sort_keys=True))
        return 1


if __name__ == '__main__':
    sys.exit(main())
