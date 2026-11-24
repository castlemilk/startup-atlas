"""Unit tests for scripts/latest_value.py and its graph integration (#414).

The derivation is the single place the headline company figure is
computed, so the honesty gates are pinned here: https source, valid
date, ISO currency, positive amount, market-cap calculation validation,
latest-dated precedence (the stale-round trap) and subsidiary handling.
"""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import latest_value as lv  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


graph = _load('atlas_graph_latest_value', 'scripts/make-graph.py')

FX = {'to_usd': {'USD': 1.0, 'AUD': 0.5}, 'date': '2026-11-21',
      'source': 'fallback-table'}

OWNER = {'status': 'private', 'observed_on': '2026-06-30',
         'source': 'https://example.com/ownership', 'detail': 'Private.'}


def evidence(**parts):
    doc = {'version': 1, 'technology': {}, 'market_caps': [],
           'ownership': {}, 'private_valuations': []}
    doc.update(parts)
    return doc


def round_event(amount=40e9, currency='USD', when='2021-09-15',
                source='https://example.com/round', **extra):
    return {'id': 'r1', 'stage': 'Series F', 'announced_on': when,
            'amount': 200e6, 'currency': 'USD', 'valuation': amount,
            'valuation_currency': currency, 'source': source, **extra}


class DeriveTests(unittest.TestCase):
    def test_stale_round_trap_latest_dated_wins(self):
        # Canva shape: 2021 round at US$40B vs 2025 secondary at US$42B.
        doc = evidence(
            ownership={'startup:canva': OWNER},
            private_valuations=[{
                'id': 'canva-2025-secondary', 'startup_id': 'startup:canva',
                'announced_on': '2025-08-25', 'stage': 'Investor-led secondary share sale',
                'valuation': 42e9, 'valuation_currency': 'USD',
                'source': 'https://example.com/secondary', 'approximate': True}])
        value, listing = lv.derive_latest_value([round_event()], doc, 'startup:canva', FX)
        self.assertEqual(value['amount'], 42e9)
        self.assertEqual(value['basis'], 'secondary_sale')
        self.assertEqual(value['as_of'], '2025-08-25')
        self.assertTrue(value['approximate'])
        self.assertEqual(value['amount_usd'], 42e9)
        self.assertEqual(listing, {'status': 'private'})

    def test_public_prefers_latest_market_cap(self):
        cap = {'startup_id': 'startup:wise', 'ticker': 'WSE', 'exchange': 'Nasdaq',
               'observed_on': '2026-11-20', 'currency': 'USD', 'amount': 10.8e9,
               'source': 'https://example.com/stock'}
        older = {**cap, 'observed_on': '2026-11-19', 'amount': 10.6e9}
        doc = evidence(ownership={'startup:wise': {**OWNER, 'status': 'public'}},
                       market_caps=[older, cap])
        value, listing = lv.derive_latest_value([round_event(9e9)], doc, 'startup:wise', FX)
        self.assertEqual(value['basis'], 'listed_market_cap')
        self.assertEqual(value['amount'], 10.8e9)
        self.assertEqual(listing, {'status': 'public', 'exchange': 'Nasdaq', 'ticker': 'WSE'})

    def test_public_without_cap_has_no_value(self):
        doc = evidence(ownership={'startup:x': {**OWNER, 'status': 'public'}})
        value, listing = lv.derive_latest_value([round_event()], doc, 'startup:x', FX)
        self.assertIsNone(value)
        self.assertEqual(listing, {'status': 'public'})

    def test_subsidiary_has_no_standalone_value(self):
        doc = evidence(ownership={'startup:eucalyptus': {**OWNER, 'status': 'subsidiary'}})
        value, listing = lv.derive_latest_value([round_event()], doc, 'startup:eucalyptus', FX)
        self.assertIsNone(value)
        self.assertEqual(listing, {'status': 'subsidiary'})

    def test_unknown_ownership_still_derives_from_rounds(self):
        value, listing = lv.derive_latest_value([round_event()], evidence(), 'startup:new', FX)
        self.assertEqual(value['amount'], 40e9)
        self.assertEqual(value['basis'], 'last_round_post_money')
        self.assertEqual(listing, {'status': 'unknown'})

    def test_currency_normalisation_records_rate_and_date(self):
        value, _ = lv.derive_latest_value(
            [round_event(100.0, 'AUD', '2026-01-10')], evidence(), 'startup:aud', FX)
        self.assertEqual(value['amount'], 100.0)
        self.assertEqual(value['amount_usd'], 50.0)
        self.assertEqual(value['fx_rate'], 0.5)
        self.assertEqual(value['fx_date'], '2026-11-21')

    def test_gates_reject_unsourced_zero_undated_and_text_amounts(self):
        bad = [
            round_event(source='http://example.com/insecure'),
            round_event(amount=0),
            round_event(amount='40B'),
            round_event(when='15 Sep 2021'),
            round_event(currency='US'),
            round_event(when='2021-02-30'),
        ]
        for event in bad:
            value, _ = lv.derive_latest_value([event], evidence(), 'startup:g', FX)
            self.assertIsNone(value, event)

    def test_superseded_round_is_ignored(self):
        value, _ = lv.derive_latest_value(
            [round_event(superseded_by='r2')], evidence(), 'startup:s', FX)
        self.assertIsNone(value)

    def test_market_cap_calculation_must_reconcile(self):
        cap = {'startup_id': 'startup:bad', 'ticker': 'BAD', 'exchange': 'NYSE',
               'observed_on': '2026-11-20', 'currency': 'USD', 'amount': 999.0,
               'source': 'https://example.com/stock',
               'calculation': {'close': 10.0, 'shares': 50,
                               'shares_as_of': '2026-11-19',
                               'shares_source': 'https://example.com/shares'}}
        doc = evidence(ownership={'startup:bad': {**OWNER, 'status': 'public'}},
                       market_caps=[cap])
        value, _ = lv.derive_latest_value([], doc, 'startup:bad', FX)
        self.assertIsNone(value)

    def test_no_evidence_no_value(self):
        value, listing = lv.derive_latest_value([], None, 'startup:none', FX)
        self.assertIsNone(value)
        self.assertEqual(listing, {'status': 'unknown'})


class GraphIntegrationTests(unittest.TestCase):
    def _graph(self, evidence_doc):
        startup = {'name': 'Canva', 'description': '', 'website': 'https://canva.com',
                   'source': 'https://example.com/canva', 'founders': [],
                   'funding_rounds': [round_event()], 'profile_facts': [],
                   'articles': [], 'socials': []}
        return graph.build_graph({}, [], {}, {'opportunities': []},
                                 {'startups': [startup]}, evidence=evidence_doc,
                                 fx_table=FX)

    def test_graph_entity_carries_derived_fields(self):
        doc = evidence(ownership={'startup:canva': OWNER})
        result = self._graph(doc)
        entity = next(e for e in result['entities'] if e['id'] == 'startup:canva')
        self.assertEqual(entity['latest_value']['amount'], 40e9)
        self.assertEqual(entity['listing'], {'status': 'private'})

    def test_graph_without_evidence_is_unchanged(self):
        result = self._graph(None)
        entity = next(e for e in result['entities'] if e['id'] == 'startup:canva')
        self.assertNotIn('latest_value', entity)
        self.assertNotIn('listing', entity)


if __name__ == '__main__':
    unittest.main()
