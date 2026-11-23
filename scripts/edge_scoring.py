"""Edge freshness + confidence scoring (KG connective tissue, section 2).

Pure, deterministic functions. No I/O, no state, no network.

Model (``score_edge``)
-------------------
Each source is a dict ``{"type": "primary" | "secondary" | "inferred",
"url": ..., "reviewed_at": ...}``:

- Base **0.50** for a single reviewed source.
- **+0.15** per additional *independent* source — independence means a
  distinct normalised host (lowercase, ``www.`` stripped, trailing dot
  stripped). Two sources on the same host add nothing.
- **+0.10** if any source is primary (official site, filing, the
  company's own announcement).
- **-0.20** if any part of the edge is inferred (a source of type
  ``"inferred"`` — slug-derived name, backfilled field, fuzzy match).
- **> 0.80 requires >= 2 independent sources agreeing.** A single
  independent source caps at 0.80 no matter what.
- Total is capped at **0.95** and floored at **0.05**. Scores are rounded
  to 2 decimals.

An empty source list scores the floor (0.05): there is no evidence at
all. A source without a usable URL counts under one shared "unknown"
host, so sourceless entries can never inflate confidence by agreeing
with each other.

Freshness (``freshness``)
-------------------------
Stale when ``last_verified`` is more than **90 days** old or absent
(``None``). Stale edges are flagged, never silently dropped; a missing
date is never invented, so ``last_verified`` stays ``None`` and the edge
is stale.

``confidence_basis`` (``build_confidence_basis``)
-----------------------------------------------
The stated basis for a score, as stored on the edge::

    {"sources": 1, "source_types": ["secondary"],
     "agreement": False, "inferred": False}

- ``sources``: number of sources.
- ``source_types``: sorted distinct source types present.
- ``agreement``: True when >= 2 independent (distinct-host) sources
  are present — i.e. the edge is corroborated, not single-sourced.
- ``inferred``: True when any source is of type ``"inferred"``.
"""

from __future__ import annotations

from datetime import date, datetime
from urllib.parse import urlparse

BASE_SCORE = 0.50
PER_ADDITIONAL_SOURCE = 0.15
PRIMARY_BONUS = 0.10
INFERRED_PENALTY = 0.20
SINGLE_SOURCE_CAP = 0.80
SCORE_CEILING = 0.95
SCORE_FLOOR = 0.05
STALE_AFTER_DAYS = 90


def _normalise_host(url):
    """Normalised host for a source URL, or "" when there is none usable.

    Lowercase, strip a leading ``www.`` and any trailing dot, mirroring
    the identity-key host normalisation in section 1.
    """
    if not url or not isinstance(url, str):
        return ""
    try:
        host = urlparse(url).hostname or ""
    except ValueError:  # pragma: no cover - urlparse rarely raises
        host = ""
    host = host.lower()
    if host.startswith("www."):
        host = host[4:]
    return host.rstrip(".")


def _independent_source_count(sources):
    """Number of distinct hosts among the sources (0 when there are none)."""
    return len({_normalise_host(source.get("url")) for source in sources})


def build_confidence_basis(sources):
    """Build the ``confidence_basis`` dict for a list of sources.

    ``sources`` is a list of ``{"type": ..., "url": ...,
    "reviewed_at": ...}`` dicts. Returns ``{"sources": int,
    "source_types": [str, ...], "agreement": bool, "inferred": bool}``.
    """
    sources = list(sources or [])
    source_types = sorted({source.get("type") for source in sources
                           if source.get("type")})
    return {
        "sources": len(sources),
        "source_types": source_types,
        "agreement": _independent_source_count(sources) >= 2,
        "inferred": any(source.get("type") == "inferred"
                        for source in sources),
    }


def score_edge(sources):
    """Score an edge from its sources, per the model in the docstring.

    Returns a float rounded to 2 decimals, in [0.05, 0.95].
    """
    sources = list(sources or [])
    if not sources:
        return SCORE_FLOOR
    basis = build_confidence_basis(sources)
    independent = _independent_source_count(sources)
    score = BASE_SCORE + PER_ADDITIONAL_SOURCE * (independent - 1)
    if "primary" in basis["source_types"]:
        score += PRIMARY_BONUS
    if basis["inferred"]:
        score -= INFERRED_PENALTY
    if independent < 2:
        score = min(score, SINGLE_SOURCE_CAP)
    score = min(max(score, SCORE_FLOOR), SCORE_CEILING)
    return round(score, 2)


def _as_date(value):
    """Coerce an ISO date/datetime string, date or datetime to a date.

    Returns None for None or anything unparseable — a bad date is
    treated the same as an absent one (stale, never invented).
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            try:
                return datetime.fromisoformat(text).date()
            except ValueError:
                return None
    return None


def freshness(last_verified, today=None):
    """Freshness of an edge given its last verification date.

    ``last_verified`` is a date, datetime, or ISO date string (or None).
    ``today`` defaults to ``date.today()`` and is injectable for tests.
    Returns ``{"days_since_verified": int | None, "stale": bool}``:
    stale when ``last_verified`` is more than 90 days old or absent.
    """
    today = _as_date(today) or date.today()
    verified = _as_date(last_verified)
    if verified is None:
        return {"days_since_verified": None, "stale": True}
    days = (today - verified).days
    return {"days_since_verified": days, "stale": days > STALE_AFTER_DAYS}
