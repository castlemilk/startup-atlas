"""OFFLINE request-body arithmetic and fixtures; no upload or MCP implementation.

The existing hosted worker rejects a streamed body above 131072 bytes before JSON
parsing. This module neither changes that limit nor adds a tool or an ingress path.
Its generic caller-supplied envelope includes every request ID, wrapper, metadata
field and one explicitly selected empty base64 string. Unknown fields are counted,
not approved: a future runtime adapter must validate its own complete schema.

For this module's transport-only compact UTF-8 JSON serializer, the empty-slot
envelope has E bytes and the exact raw capacity is 3 * floor((131072 - E) / 4).
Base64 adds 4 * ceil(raw_length / 3) bytes, including padding. Other serializers
can add whitespace or escapes: validate_wire_body measures their actual complete
wire bytes independently. This serializer is not the asset-manifest or record-
revision canonicalization contract, and no equivalence with JSON.stringify is
assumed. It accepts JSON objects/arrays/strings/booleans/null and safe integers;
floating numbers and excessive nesting are explicitly outside this offline profile.

Strict UTF-8, duplicate-key and canonical-base64 checks here are offline contract
requirements, not claims about checks already deployed in the hosted worker.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json


REQUEST_LIMIT_BYTES = 131_072
MAX_POSSIBLE_RAW_BYTES = 3 * (REQUEST_LIMIT_BYTES // 4)
MAX_JSON_DEPTH = 64
MAX_SAFE_INTEGER = 2**53 - 1
CONTRACT = 'atlas.offline-asset-transport.v0'
SERIALIZER = 'transport-compact-utf8-sorted-keys-v0'


class TransportError(ValueError):
    def __init__(self, code, field, message, **details):
        super().__init__(message)
        self.code, self.field, self.message, self.details = code, field, message, details

    def as_dict(self):
        result = {'code': self.code, 'field': self.field, 'message': self.message}
        if self.details:
            result['details'] = self.details
        return result


def _fail(code, field, message, **details):
    raise TransportError(code, field, message, **details)


def _string_bytes(value, field):
    if len(value) > REQUEST_LIMIT_BYTES:
        _fail('REQUEST_TOO_LARGE', field, 'String alone exceeds the request byte budget.', limit_bytes=REQUEST_LIMIT_BYTES)
    if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
        _fail('INVALID_UNICODE', field, 'Use Unicode scalar values; lone or explicit surrogate code units are not supported.')
    # Quoting and control/backslash escapes are part of the measured JSON bytes.
    return json.dumps(value, ensure_ascii=False).encode('utf-8')


def serialize_request(envelope):
    """Return bounded transport-only JSON bytes, with no I/O or schema approval."""
    if type(envelope) is not dict:
        _fail('INVALID_ENVELOPE', 'envelope', 'Provide a complete JSON object envelope.')
    output = bytearray()
    active = set()

    def emit(payload):
        if len(output) + len(payload) > REQUEST_LIMIT_BYTES:
            _fail('REQUEST_TOO_LARGE', 'envelope', 'The complete serialized envelope exceeds the hosted body cap.',
                  limit_bytes=REQUEST_LIMIT_BYTES, measured_at_least_bytes=len(output) + len(payload))
        output.extend(payload)

    def visit(value, field, depth):
        if depth > MAX_JSON_DEPTH:
            _fail('UNSUPPORTED_JSON_DEPTH', field, 'Envelope exceeds the bounded offline serialization depth.', max_depth=MAX_JSON_DEPTH)
        if value is None:
            emit(b'null')
        elif type(value) is bool:
            emit(b'true' if value else b'false')
        elif type(value) is int:
            if not -MAX_SAFE_INTEGER <= value <= MAX_SAFE_INTEGER:
                _fail('UNSUPPORTED_JSON_NUMBER', field, 'Use a JavaScript-safe integer or an explicit string.')
            emit(str(value).encode('ascii'))
        elif type(value) is str:
            emit(_string_bytes(value, field))
        elif type(value) in (dict, list):
            if len(value) > REQUEST_LIMIT_BYTES:
                _fail('REQUEST_TOO_LARGE', field, 'Container alone exceeds the possible request item budget.')
            identity = id(value)
            if identity in active:
                _fail('INVALID_ENVELOPE', field, 'Cyclic values are not JSON.')
            active.add(identity)
            try:
                if type(value) is dict:
                    if any(type(key) is not str for key in value):
                        _fail('INVALID_ENVELOPE', field, 'Every object key must be a string; coercion is not allowed.')
                    emit(b'{')
                    for index, key in enumerate(sorted(value)):
                        if index:
                            emit(b',')
                        emit(_string_bytes(key, field + '.<key>'))
                        emit(b':')
                        visit(value[key], field + '.<value>', depth + 1)
                    emit(b'}')
                else:
                    emit(b'[')
                    for index, item in enumerate(value):
                        if index:
                            emit(b',')
                        visit(item, field + f'[{index}]', depth + 1)
                    emit(b']')
            finally:
                active.remove(identity)
        else:
            _fail('UNSUPPORTED_JSON_VALUE', field, 'Only plain JSON containers, strings, booleans, null and safe integers are supported.')

    visit(envelope, 'envelope', 0)
    return bytes(output)


def _slot(envelope, slot, empty=False):
    if type(slot) not in (tuple, list) or not 1 <= len(slot) <= MAX_JSON_DEPTH:
        _fail('INVALID_SLOT', 'slot', 'Provide a nonempty sequence of existing object keys.')
    if any(type(key) is not str or not key or len(key) > REQUEST_LIMIT_BYTES for key in slot):
        _fail('INVALID_SLOT', 'slot', 'Slot path elements must be nonempty string keys.')
    current = envelope
    for index, key in enumerate(slot):
        if type(current) is not dict or key not in current:
            _fail('INVALID_SLOT', f'slot[{index}]', 'The selected base64 slot is missing or does not traverse objects.')
        if index == len(slot) - 1:
            value = current[key]
            if type(value) is not str or (empty and value != ''):
                _fail('INVALID_SLOT', 'slot', 'Budgeting requires an existing empty-string base64 slot.' if empty else 'The base64 slot must contain a string.')
            return current, key, value
        current = current[key]
    raise AssertionError('Nonempty slot traversal must return.')


def request_budget(envelope, slot):
    """Measure every envelope field; omitted future fields invalidate this budget."""
    _slot(envelope, slot, empty=True)
    encoded = serialize_request(envelope)
    available = REQUEST_LIMIT_BYTES - len(encoded)
    return {'contract': CONTRACT, 'serializer': SERIALIZER, 'schema_validated': False,
            'request_limit_bytes': REQUEST_LIMIT_BYTES, 'envelope_bytes': len(encoded),
            'max_base64_bytes': 4 * (available // 4),
            'max_raw_bytes': 3 * (available // 4), 'alignment_slack_bytes': available % 4,
            'slot': list(slot), 'sent': False}


def encode_request(raw_bytes, envelope, slot):
    """Prepare exact complete wire bytes for an OFFLINE fixture; never send them."""
    if type(raw_bytes) not in (bytes, bytearray):
        _fail('INVALID_BYTES', 'raw_bytes', 'Supply binary bytes, not base64 text or a data URL.')
    if len(raw_bytes) > MAX_POSSIBLE_RAW_BYTES:
        _fail('RAW_BYTES_TOO_LARGE', 'raw_bytes', 'Raw bytes cannot fit even before envelope overhead.',
              raw_bytes=len(raw_bytes), absolute_raw_upper_bound=MAX_POSSIBLE_RAW_BYTES)
    data = bytes(raw_bytes)
    # Snapshot via the same serializer so no caller-owned envelope is modified.
    encoded_empty = serialize_request(envelope)
    snapshot = json.loads(encoded_empty)
    budget = request_budget(snapshot, slot)
    if len(data) > budget['max_raw_bytes']:
        _fail('RAW_BYTES_TOO_LARGE', 'raw_bytes', 'Raw bytes exceed this complete envelope budget.',
              raw_bytes=len(data), max_raw_bytes=budget['max_raw_bytes'], envelope_bytes=budget['envelope_bytes'])
    parent, key, _ = _slot(snapshot, slot, empty=True)
    parent[key] = base64.b64encode(data).decode('ascii')
    body = serialize_request(snapshot)
    predicted = len(encoded_empty) + 4 * ((len(data) + 2) // 3)
    if len(body) != predicted:
        _fail('SERIALIZATION_MISMATCH', 'body', 'Complete request size differs from the measured serializer profile.')
    # Independent complete-body checking is intentional; no prefix-only check.
    validate_wire_body(body, slot)
    return body


def _pairs(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            _fail('DUPLICATE_JSON_KEY', 'body', 'Duplicate object keys are ambiguous and rejected, including escaped aliases.')
        output[key] = value
    return output


def _integer(token):
    if token == '-0' or len(token) > 17:
        _fail('UNSUPPORTED_JSON_NUMBER', 'body', 'Use an unambiguous JavaScript-safe integer or a string.')
    result = int(token)
    if not -MAX_SAFE_INTEGER <= result <= MAX_SAFE_INTEGER:
        _fail('UNSUPPORTED_JSON_NUMBER', 'body', 'Integer exceeds JavaScript-safe precision.')
    return result


def _no_float(_):
    _fail('UNSUPPORTED_JSON_NUMBER', 'body', 'Floating-point, exponent and non-finite numbers are outside this offline profile.')


def strict_base64(value):
    """Decode one bounded canonical standard-base64 string, including pad bits."""
    if type(value) is not str or not value.isascii():
        _fail('INVALID_BASE64', 'slot', 'Base64 must be an ASCII string.')
    if len(value) > REQUEST_LIMIT_BYTES or len(value) % 4:
        _fail('INVALID_BASE64', 'slot', 'Base64 must fit the body cap and use complete padded groups of four.')
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        _fail('INVALID_BASE64', 'slot', 'Use standard base64 without whitespace, URL-safe alphabet or data-URL prefixes.')
    if base64.b64encode(decoded).decode('ascii') != value:
        _fail('INVALID_BASE64', 'slot', 'Base64 must use canonical padding and zero unused pad bits.')
    return decoded


def validate_wire_body(body, slot):
    """Check actual complete wire bytes, independent of serializer whitespace.

    Byte measurement precedes strict UTF-8/JSON parsing. Passing this function is
    a transport fixture result, never tool-schema approval or a server response.
    """
    if type(body) not in (bytes, bytearray):
        _fail('INVALID_BYTES', 'body', 'Supply the exact encoded HTTP body as bytes.')
    if len(body) > REQUEST_LIMIT_BYTES:
        _fail('REQUEST_TOO_LARGE', 'body', 'Complete wire bytes exceed the unchanged hosted request cap.',
              actual_bytes=len(body), limit_bytes=REQUEST_LIMIT_BYTES)
    body = bytes(body)
    try:
        text = body.decode('utf-8', errors='strict')
    except UnicodeError:
        _fail('INVALID_UTF8', 'body', 'Body is not valid UTF-8.')
    try:
        envelope = json.loads(text, object_pairs_hook=_pairs, parse_int=_integer,
                              parse_float=_no_float, parse_constant=_no_float)
    except TransportError:
        raise
    except (ValueError, RecursionError):
        _fail('INVALID_JSON', 'body', 'Body is not one complete bounded JSON value.')
    compact = serialize_request(envelope)
    _, _, value = _slot(envelope, slot)
    decoded = strict_base64(value)
    return {'contract': CONTRACT, 'request_limit_bytes': REQUEST_LIMIT_BYTES,
            'wire_bytes': len(body), 'raw_bytes': len(decoded), 'base64_characters': len(value),
            'asset_sha256': hashlib.sha256(decoded).hexdigest(), 'body_sha256': hashlib.sha256(body).hexdigest(),
            'matches_offline_serializer': body == compact, 'schema_validated': False, 'sent': False}
