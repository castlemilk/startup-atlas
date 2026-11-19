"""Construct an offline, disclosure-held public candidate from explicit fields.

Never serialize the private review manifest into a public proposal. This helper
does not authenticate a reviewer, classify free text as non-confidential, decide
storage policy, verify actual bytes, or authorize publication.
"""
from __future__ import annotations

from urllib.parse import urlsplit

from scripts import atlas_assets as assets
from contracts.mcp_assets.canonical import (
    canonical_bytes, manifest_revision, parse_strict_json,
)


PUBLIC_SCHEMA = "atlas.asset-public-candidate.v0"
PUBLIC_FIELDS = {"subject_id", "role", "source_page", "attribution", "licence_url"}
REQUIRED_GATES = (
    "authenticated_review_authority",
    "public_field_disclosure_review",
    "private_to_public_review_binding",
    "public_storage_and_manifest_paths",
    "exact_byte_and_current_record_validation",
    "proposal_recovery_and_release_readback",
)


def _fail(code, field, message):
    raise assets.AssetError(code, field, message)


def _public_url(value, field):
    # Reuse the merged source-reference shape check, without any request or DNS.
    assets._url(value, field)
    parsed = urlsplit(value)
    if parsed.query or parsed.fragment or "?" in value or "#" in value:
        _fail("PUBLIC_URL_REVIEW", field,
              "Provide a separately reviewed public reference without query or fragment; do not strip a private URL automatically.")
    return value


def project_public_manifest(private_manifest, public_descriptor,
                            expected_private_revision, *, now=None):
    """Return a held candidate, never the private revision or correspondence.

    The expected private digest is an integrity precondition only. Even approved
    caller attestations leave every external authorization gate unresolved.
    Explicit public text can still be confidential or inaccurate; it needs review.
    """
    frozen = parse_strict_json(canonical_bytes(private_manifest))
    if type(frozen) is not dict or set(frozen) != {"schema", "blob", "provenance"}:
        _fail("INVALID_REVIEW", "manifest", "Expected the exact private review envelope.")
    if frozen["schema"] != assets.SCHEMA:
        _fail("INVALID_REVIEW", "manifest.schema", "Unsupported private review schema.")
    reviewed = assets.validate_provenance(frozen["provenance"], frozen["blob"], now=now)
    if (type(expected_private_revision) is not str
            or not assets.ASSET_REVISION.fullmatch(expected_private_revision)
            or manifest_revision(reviewed) != expected_private_revision):
        _fail("REVIEW_REVISION_CONFLICT", "expected_private_revision",
              "Private review changed; retrieve and inspect the exact intended review.")
    provenance = reviewed["provenance"]
    rights = provenance["rights"]
    if (provenance["identity"]["decision"] != "approved"
            or rights["decision"] != "approved"
            or not rights["public_repository"] or not rights["public_website"]):
        _fail("REVIEW_NOT_READY", "provenance",
              "Identity and both intended public uses must have recorded approval before preparing even a held public candidate.")
    if type(public_descriptor) is not dict or set(public_descriptor) != PUBLIC_FIELDS:
        _fail("PUBLIC_FIELD_ALLOWLIST", "public_descriptor",
              "Only subject_id, role, source_page, attribution and licence_url are accepted; no evidence, reviewer or private correspondence fields.")
    public = parse_strict_json(canonical_bytes(public_descriptor))
    if (public["subject_id"] != provenance["subject_id"]
            or public["role"] != provenance["role"]):
        _fail("PUBLIC_SUBJECT_CONFLICT", "public_descriptor",
              "Public subject and role must exactly match the reviewed asset use.")
    _public_url(public["source_page"], "public_descriptor.source_page")
    assets._text(public["attribution"], "public_descriptor.attribution", 2000, False)
    if rights["basis"] == "licence":
        if public["licence_url"] is None:
            _fail("PUBLIC_LICENCE_REQUIRED", "public_descriptor.licence_url",
                  "A separately reviewed public licence reference is required for a licence-based candidate.")
        _public_url(public["licence_url"], "public_descriptor.licence_url")
    elif public["licence_url"] is not None:
        _fail("PUBLIC_PERMISSION_CORRESPONDENCE", "public_descriptor.licence_url",
              "Owned or privately permitted candidates do not expose a permission URL through the public licence field.")

    blob = reviewed["blob"]
    # Construct every public member. Do not spread, redact, filter recursively,
    # include the private digest, or copy even ostensibly public source URLs.
    public_manifest = {
        "schema": PUBLIC_SCHEMA,
        "asset": {
            key: blob[key] for key in (
                "asset_id", "sha256", "bytes", "mime", "width", "height",
                "bit_depth", "color_type", "validation",
            )
        },
        "subject": {"id": public["subject_id"], "role": public["role"]},
        "source_page": public["source_page"],
        "attribution": public["attribution"],
        "licence_url": public["licence_url"],
    }
    return {
        "status": "projection_candidate",
        "authorization": "none",
        "published": False,
        "public_manifest": public_manifest,
        "public_manifest_revision": manifest_revision(public_manifest),
        "required_gates": list(REQUIRED_GATES),
    }
