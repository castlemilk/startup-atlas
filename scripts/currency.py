#!/usr/bin/env python3
"""Parse money mentions and normalise them to USD.

Amounts in the crawl and catalogue mix currencies freely — A$, US$, bare "$",
EUR, GBP and others — so they cannot be compared or totalled as written.
This module is the single place that understands them:

* :func:`parse_amount` reads one mention (``A$1.05B``, ``$250K-$5M``,
  ``~US$740M``, ``over A$12B``) into a structured record.
* :func:`normalise_mention` converts that record to USD with the FX rate
  actually used, its date and its source.
* :func:`get_rates` fetches live rates from Frankfurter (free, no key) when
  the network is available and otherwise falls back to the committed table
  in ``data/fx-rates.json``. It never raises: a crawl must not fail because
  rates could not be fetched.

Rules (see ``docs/CURRENCY.md`` for the full decision record):

* The original figure is always preserved next to the USD figure, with the
  rate, rate date and rate source. An original is never silently overwritten.
* A bare ``$`` is ambiguous. It is only resolved when the caller supplies a
  context country (AU -> AUD, NZ -> NZD, SG -> SGD, CA -> CAD, US -> USD)
  and the assumption is recorded on the record (``status: assumed``).
  Without context the amount stays unconverted (``status: ambiguous``).
* Qualifiers (``~``, ``over``, ``up to``) and ranges (``$250K-$5M``) are
  preserved, not flattened into a single point figure.
* USD is the standard reporting currency: the global VC lingua franca, and
  the currency most fund announcements already quote an equivalent in.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TABLE = ROOT / "data" / "fx-rates.json"

BASE_CURRENCY = "USD"

# Markers as they appear in text, in match order (longest/most specific first).
MARKERS = {
    "A$": "AUD", "AU$": "AUD",
    "US$": "USD", "USD$": "USD",
    "S$": "SGD", "SG$": "SGD",
    "NZ$": "NZD", "C$": "CAD", "CA$": "CAD", "HK$": "HKD",
    "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR",
    "$": None,  # bare dollar: ambiguous unless context resolves it
    "USD": "USD", "AUD": "AUD", "EUR": "EUR", "GBP": "GBP",
    "JPY": "JPY", "SGD": "SGD", "CAD": "CAD", "NZD": "NZD",
    "HKD": "HKD", "CNY": "CNY", "INR": "INR",
}

# Currency words that can follow a number ("82 million dollars").
WORD_CURRENCIES = {
    "dollar": "USD", "dollars": "USD",
    "euro": "EUR", "euros": "EUR",
    "pound": "GBP", "pounds": "GBP",
    "yen": "JPY", "yuan": "CNY", "renminbi": "CNY",
    "rupee": "INR", "rupees": "INR",
}

# Bare "$" resolved from the firm's HQ country. Only countries whose dollar
# is unambiguous in context are listed; anything else stays ambiguous.
BARE_DOLLAR_COUNTRIES = {"AU": "AUD", "NZ": "NZD", "SG": "SGD", "CA": "CAD", "US": "USD"}

MAGNITUDES = {
    "k": 1e3, "thousand": 1e3,
    "m": 1e6, "million": 1e6,
    "b": 1e9, "billion": 1e9,
}

QUALIFIERS = {
    "~": "approximate", "approx": "approximate", "approximately": "approximate",
    "about": "approximate", "around": "approximate", "roughly": "approximate",
    "over": "minimum", "more than": "minimum", "at least": "minimum",
    "above": "minimum", "exceeding": "minimum",
    "up to": "maximum", "less than": "maximum", "under": "maximum",
    "below": "maximum", "at most": "maximum",
}

_NUMBER = r"(?:[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)"
_MARKER = r"(?:A\$|AU\$|US\$|USD\$|S\$|SG\$|NZ\$|C\$|CA\$|HK\$|[€£¥₹\$]|USD|AUD|EUR|GBP|JPY|SGD|CAD|NZD|HKD|CNY|INR)"
_QUAL = r"(?:~|approx(?:imately)?|about|around|roughly|over|more than|at least|above|exceeding|up to|less than|under|below|at most)"
_MAG = r"(?:thousand|million|billion|[kKmMbB])"
_WORDCUR = r"(?:dollars?|euros?|pounds?|yen|yuan|renminbi|rupees?)"

# One amount: [qualifier] [marker] number [magnitude] [currency word].
# Anchored at the start only: a mention may carry trailing prose
# ("US$1,000 to start"), which is ignored after the amount itself.
_SINGLE = re.compile(
    rf"^\s*(?P<qual>{_QUAL})?\s*(?P<marker>{_MARKER})?\s*(?P<num>{_NUMBER})"
    rf"(?:\s*(?P<mag>{_MAG}))?(?:\s*(?P<wordcur>{_WORDCUR}))?", re.I)
# A range: amount ( - | – | — | to | between..and ) amount.
_RANGE_SEP = re.compile(r"\s*(?:-|–|—|\bto\b)\s*", re.I)
_BETWEEN = re.compile(rf"^\s*between\s+(?P<rest>.+)$", re.I)

_RATES_CACHE = None


def _clean(text):
    return " ".join(str(text).replace("\u00a0", " ").split())


def _magnitude_factor(mag):
    if not mag:
        return 1.0
    return MAGNITUDES[mag.lower()]


def _parse_single(text):
    """Parse one amount string; returns a partial record or None."""
    match = _SINGLE.match(_clean(text))
    if not match:
        return None
    marker = match.group("marker")
    currency = MARKERS.get(marker.upper(), MARKERS.get(marker)) if marker else None
    wordcur = match.group("wordcur")
    if currency is None and wordcur:
        currency = WORD_CURRENCIES[wordcur.lower()]
    number = float(match.group("num").replace(",", ""))
    value = number * _magnitude_factor(match.group("mag"))
    qual = match.group("qual")
    qualifier = QUALIFIERS[qual.lower().rstrip(".")] if qual else None
    return {"currency": currency, "value": value, "qualifier": qualifier,
            "bare_dollar": marker == "$"}


def _resolve_bare_dollar(parsed, context_country):
    """Resolve a bare-$ amount from HQ country; returns (currency, assumption)."""
    if not parsed["bare_dollar"] or parsed["currency"] is not None:
        return parsed["currency"], None
    code = BARE_DOLLAR_COUNTRIES.get((context_country or "").upper())
    if code:
        return code, f"bare $ read as {code} from {context_country.upper()} context"
    return None, None


def parse_amount(text, context_country=None):
    """Parse one money mention into a structured record.

    ``context_country`` is an ISO country code (e.g. ``AU``) used only to
    resolve a bare ``$``; the assumption is recorded on the result.
    """
    original = _clean(text)
    between = _BETWEEN.match(original)
    if between:
        parts = re.split(r"\s+and\s+", between.group("rest"), maxsplit=1)
    else:
        parts = _RANGE_SEP.split(original)
    if len(parts) == 2 and all(p.strip() for p in parts):
        low = _parse_single(parts[0])
        high = _parse_single(parts[1])
        if low and high:
            if low["currency"] is None and high["currency"] is not None:
                low["currency"] = high["currency"]
                low["bare_dollar"] = low["bare_dollar"] and high["bare_dollar"]
            if high["currency"] is None and low["currency"] is not None:
                high["currency"] = low["currency"]
            currency = low["currency"] or high["currency"]
            qualifier = low["qualifier"] or high["qualifier"]
            low_cur, assumption = _resolve_bare_dollar(
                {"bare_dollar": low["bare_dollar"], "currency": currency}, context_country)
            currency = low_cur
            status = "parsed" if currency else "ambiguous"
            return {"original": original, "currency": currency,
                    "value": {"low": low["value"], "high": high["value"]},
                    "qualifier": qualifier, "assumption": assumption,
                    "status": status}
    single = _parse_single(original)
    if single is None:
        return {"original": original, "currency": None, "value": None,
                "qualifier": None, "assumption": None, "status": "unparsed"}
    currency, assumption = _resolve_bare_dollar(single, context_country)
    status = "parsed" if currency else "ambiguous"
    return {"original": original, "currency": currency, "value": single["value"],
            "qualifier": single["qualifier"], "assumption": assumption,
            "status": status}


def _round_sig(value, sig=3):
    if value == 0:
        return 0
    from math import floor, log10
    places = sig - 1 - floor(log10(abs(value)))
    return round(value, places)


def format_usd(usd):
    """Format a USD value the way reviewed descriptions write it."""
    if isinstance(usd, dict):
        return f"{format_usd(usd['low'])}–{format_usd(usd['high'])}"
    if usd is None:
        return None
    for threshold, suffix, divisor in ((1e9, "B", 1e9), (1e6, "M", 1e6), (1e3, "K", 1e3)):
        if abs(usd) >= threshold:
            number = usd / divisor
            text = f"{number:.3g}"
            return f"US${text}{suffix}"
    return f"US${usd:,.0f}"


def _convert_value(value, rate):
    if isinstance(value, dict):
        return {"low": _round_sig(value["low"] * rate),
                "high": _round_sig(value["high"] * rate)}
    return _round_sig(value * rate)


def load_fallback_table(table_path=None):
    """Read the committed fallback rate table (USD per 1 unit)."""
    path = Path(table_path) if table_path else DEFAULT_TABLE
    with path.open(encoding="utf-8") as handle:
        table = json.load(handle)
    return {"to_usd": {code: float(rate) for code, rate in table["to_usd"].items()},
            "date": table["date"], "source": "fallback-table"}


def fetch_live_rates(timeout=5):
    """Fetch current rates from Frankfurter (free, no key). Returns None on failure."""
    for base in ("https://api.frankfurter.dev/v1/latest",
                 "https://api.frankfurter.app/v1/latest"):
        try:
            request = urllib.request.Request(
                base + "?base=USD",
                headers={"User-Agent": "StartupAtlasResearchBot/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            rates = payload.get("rates") or {}
            to_usd = {code: round(1.0 / float(per_usd), 6)
                      for code, per_usd in rates.items() if per_usd}
            to_usd["USD"] = 1.0
            return {"to_usd": to_usd,
                    "date": payload.get("date") or "",
                    "source": "frankfurter-live"}
        except Exception:
            continue
    return None


def get_rates(table_path=None, timeout=5):
    """Live rates when the network is available, else the fallback table.

    Result is cached per process so a crawl fetches at most once. Never
    raises: without live rates and without a table, only USD converts.
    """
    global _RATES_CACHE
    if _RATES_CACHE is not None:
        return _RATES_CACHE
    bundle = fetch_live_rates(timeout=timeout)
    if bundle is None:
        try:
            bundle = load_fallback_table(table_path)
        except Exception:
            bundle = {"to_usd": {"USD": 1.0}, "date": "", "source": "no-rates"}
    _RATES_CACHE = bundle
    return bundle


def reset_rates_cache():
    global _RATES_CACHE
    _RATES_CACHE = None


def normalise_mention(mention, context_country=None, rate_bundle=None):
    """Parse one mention and convert it to USD.

    The returned record always keeps the original figure next to the USD
    figure, the rate used, its date and its source. ``status`` is one of:
    ``converted`` (explicit currency), ``assumed`` (bare $ resolved from
    context country), ``ambiguous`` (bare $ with no context), ``unconverted``
    (currency known but no rate available), ``unparsed`` (no amount found).
    """
    bundle = rate_bundle if rate_bundle is not None else get_rates()
    parsed = parse_amount(mention, context_country=context_country)
    record = {"original": parsed["original"], "currency": parsed["currency"],
              "value": parsed["value"], "qualifier": parsed["qualifier"],
              "assumption": parsed["assumption"], "usd": None,
              "usd_display": None, "rate": None,
              "rate_date": bundle.get("date") or None,
              "rate_source": bundle.get("source"),
              "status": parsed["status"]}
    if parsed["status"] == "parsed":
        rate = bundle.get("to_usd", {}).get(parsed["currency"])
        if rate is None:
            record["status"] = "unconverted"
        else:
            record["usd"] = _convert_value(parsed["value"], rate)
            record["usd_display"] = format_usd(record["usd"])
            record["rate"] = rate
            record["status"] = "assumed" if parsed["assumption"] else "converted"
    return record


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Parse money mentions and normalise them to USD.")
    parser.add_argument("mentions", nargs="+", help="Amount mention to normalise")
    parser.add_argument("--country", default=None,
                        help="ISO country code used to resolve a bare $ (e.g. AU)")
    parser.add_argument("--rates", default=None,
                        help="Path to a fallback rate table (default data/fx-rates.json)")
    parser.add_argument("--no-live", action="store_true",
                        help="Skip the live Frankfurter fetch; use the table only")
    args = parser.parse_args(argv)
    if args.no_live:
        bundle = load_fallback_table(args.rates)
    else:
        bundle = get_rates(table_path=args.rates)
    records = [normalise_mention(m, context_country=args.country, rate_bundle=bundle)
               for m in args.mentions]
    print(json.dumps(records, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
