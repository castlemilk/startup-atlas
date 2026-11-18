"""Restricted asset-manifest serialization, not the record revision algorithm.

This offline profile preserves the merged atlas.asset-review.v0 bytes. It is not
RFC 8785 or a general-purpose JSON canonicalizer: keys are ASCII identifiers and
numbers are nonnegative JavaScript-safe integers. Strings are not normalized.
"""
from __future__ import annotations

import hashlib
import json
import re


PROFILE = "atlas.asset-canonical.v0"
MAX_JSON_BYTES = 32_768
MAX_DEPTH = 16
MAX_NODES = 4096
MAX_SAFE_INTEGER = 9_007_199_254_740_991
KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")


class CanonicalError(ValueError):
    code = "CANONICAL_PROFILE"


def _string(value):
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise CanonicalError("Unpaired Unicode surrogates are outside the asset profile.")
    if len(value.encode("utf-8")) > MAX_JSON_BYTES:
        raise CanonicalError("String exceeds the bounded asset profile.")


def _check(value, depth=0, counter=None, ancestors=None):
    counter = [0] if counter is None else counter
    ancestors = set() if ancestors is None else ancestors
    counter[0] += 1
    if counter[0] > MAX_NODES or depth > MAX_DEPTH:
        raise CanonicalError("Asset JSON exceeds its depth or node bound.")
    if value is None or type(value) is bool:
        return
    if type(value) is int:
        if not 0 <= value <= MAX_SAFE_INTEGER:
            raise CanonicalError("Only nonnegative JavaScript-safe integers are supported.")
        return
    if type(value) is str:
        _string(value)
        return
    if type(value) not in (dict, list):
        raise CanonicalError("Only exact JSON types and integer numbers are supported.")
    identity = id(value)
    if identity in ancestors:
        raise CanonicalError("Cyclic values are not JSON.")
    ancestors.add(identity)
    try:
        if type(value) is dict:
            for key, item in value.items():
                if type(key) is not str or not KEY.fullmatch(key):
                    raise CanonicalError("Object keys must be bounded ASCII identifiers.")
                _check(item, depth + 1, counter, ancestors)
        else:
            for item in value:
                _check(item, depth + 1, counter, ancestors)
    finally:
        ancestors.remove(identity)


def canonical_bytes(value):
    """Serialize the restricted profile; this does not validate a manifest schema."""
    _check(value)
    encoded = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")
    if len(encoded) > MAX_JSON_BYTES:
        raise CanonicalError("Canonical asset JSON exceeds 32768 bytes.")
    return encoded


def manifest_revision(value):
    return "sha256:" + hashlib.sha256(canonical_bytes(value)).hexdigest()


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CanonicalError("Duplicate JSON keys are forbidden, including escaped duplicates.")
        result[key] = value
    return result


def _integer(token):
    if token.startswith("-"):
        raise CanonicalError("Negative integers and negative zero are unsupported.")
    if len(token) > 16:
        raise CanonicalError("Integer is outside the JavaScript-safe range.")
    result = int(token)
    if result > MAX_SAFE_INTEGER:
        raise CanonicalError("Integer is outside the JavaScript-safe range.")
    return result


def _noninteger(_token):
    raise CanonicalError("Fractional, exponent and non-finite numbers are unsupported.")


def parse_strict_json(source):
    """Read bounded UTF-8 JSON without duplicate keys or ambiguous numeric forms."""
    if type(source) is bytes:
        if len(source) > MAX_JSON_BYTES:
            raise CanonicalError("Input JSON exceeds 32768 bytes.")
        try:
            source = source.decode("utf-8", errors="strict")
        except UnicodeDecodeError as error:
            raise CanonicalError("Input must be valid UTF-8.") from error
    if type(source) is not str:
        raise CanonicalError("Supply UTF-8 bytes or JSON text.")
    _string(source)
    if source.startswith("\ufeff"):
        raise CanonicalError("A UTF-8 BOM is not accepted.")
    try:
        value = json.loads(
            source, object_pairs_hook=_pairs, parse_int=_integer,
            parse_float=_noninteger, parse_constant=_noninteger,
        )
    except (json.JSONDecodeError, RecursionError) as error:
        raise CanonicalError("Malformed or excessively nested JSON.") from error
    canonical_bytes(value)
    return value
