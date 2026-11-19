"""Offline regressions for Wikidata search versus entity-metadata outcomes."""
import contextlib
import csv
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit


spec = importlib.util.spec_from_file_location(
    'atlas_wikidata_crawl', Path(__file__).resolve().parents[1] / 'scripts/crawl.py')
crawl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crawl)

CHECKED_AT = '2026-11-17T05:00:00+00:00'


def search_result(*qids):
    return {'search': [{'id': qid, 'label': 'Example ' + qid} for qid in qids]}


def website_claim(url='https://example.com/'):
    return {'P856': [{'mainsnak': {'datavalue': {'value': url}}}]}


class ScriptedApiTransport:
    """Return HTTP/API fixtures without allowing a real network request."""
    def __init__(self, searches, metadata=()):
        self.responses = {
            'wbsearchentities': list(searches),
            'wbgetentities': list(metadata),
        }
        self.requests = []

    def request(self, url, allowed_host=None, **kwargs):
        parts = urlsplit(url)
        if parts.hostname != 'www.wikidata.org' or parts.path != '/w/api.php':
            raise AssertionError('Unexpected request: ' + url)
        if allowed_host != 'www.wikidata.org':
            raise AssertionError('Wikidata request lost its approved-host restriction')
        action = parse_qs(parts.query)['action'][0]
        self.requests.append((action, url))
        response = self.responses[action].pop(0)
        if isinstance(response, Exception):
            raise response
        if isinstance(response, tuple):
            status, body = response
        else:
            status, body = 200, json.dumps(response).encode()
        return status, {'Content-Type': 'application/json'}, body, url

    @property
    def metadata_urls(self):
        return [url for action, url in self.requests if action == 'wbgetentities']


class WikidataMetadataTests(unittest.TestCase):
    def discover(self, transport, names=('Example',)):
        args = types.SimpleNamespace(
            partner=None, limit=0, candidates=10, leads=None)
        with patch.object(crawl, 'utc_now', return_value=CHECKED_AT), contextlib.redirect_stderr(io.StringIO()):
            return crawl.discover({'partnerLeads': list(names)}, args, transport)

    def assert_coverage(self, result, *, status, requested, succeeded, failed,
                        unavailable, references, reused, operations):
        coverage = result['metadata_coverage']
        expected = {
            'fetch_status': status,
            'entities_requested': requested,
            'entities_succeeded': succeeded,
            'entities_failed': failed,
            'entities_unavailable': unavailable,
            'candidate_references': references,
            'reused_candidate_references': reused,
            'api_operations': operations,
        }
        for key, value in expected.items():
            self.assertEqual(coverage[key], value, key)

    def test_failed_metadata_keeps_search_lead_without_claiming_empty_properties(self):
        transport = ScriptedApiTransport(
            [search_result('Q1')], [crawl.CrawlError('DNS lookup failed')])
        result = self.discover(transport)
        row = result['results'][0]
        candidate = row['candidates'][0]
        self.assertEqual(row['status'], 'candidates')
        self.assertNotIn('properties', candidate)
        self.assertEqual(candidate['metadata_fetch'], {
            'status': 'failed', 'checked_at': CHECKED_AT,
            'source': transport.metadata_urls[0], 'reason': 'DNS lookup failed',
        })
        self.assert_coverage(
            result, status='none_succeeded', requested=1, succeeded=0,
            failed=1, unavailable=0, references=1, reused=0,
            operations={'attempted': 1, 'succeeded': 0, 'failed': 1})

    def test_successful_empty_claims_are_distinct_from_unretrieved_metadata(self):
        transport = ScriptedApiTransport([search_result('Q1', 'Q2')], [{
            'entities': {'Q1': {'id': 'Q1', 'claims': {}},
                         'Q2': {'id': 'Q2', 'claims': []}},
        }])
        result = self.discover(transport)
        for candidate in result['results'][0]['candidates']:
            self.assertEqual(candidate['properties'], {})
            self.assertEqual(candidate['metadata_fetch']['status'], 'ok')
            self.assertEqual(candidate['metadata_fetch']['checked_at'], CHECKED_AT)
            self.assertEqual(candidate['metadata_fetch']['source'], transport.metadata_urls[0])
        self.assert_coverage(
            result, status='all_succeeded', requested=2, succeeded=2,
            failed=0, unavailable=0, references=2, reused=0,
            operations={'attempted': 1, 'succeeded': 1, 'failed': 0})

    def test_unusable_selected_values_are_unavailable_after_structured_extraction(self):
        values = [
            {}, [], [{}], {'unexpected': 'value'},
            {'id': {'id': 'Q2'}}, {'id': ['Q2']},
            {'time': ['+2020-01-01T00:00:00Z']}, {'text': {'text': 'nested'}},
            {'amount': [25]}, True, False, {'amount': True},
        ]
        for value in values:
            with self.subTest(value=value):
                transport = ScriptedApiTransport([search_result('Q1', 'Q2')], [{
                    'entities': {
                        'Q1': {'claims': website_claim()},
                        'Q2': {'claims': website_claim(value)},
                    },
                }])
                result = self.discover(transport)
                good, malformed = result['results'][0]['candidates']
                self.assertEqual(good['metadata_fetch']['status'], 'ok')
                self.assertEqual(good['properties']['official_website'], ['https://example.com/'])
                self.assertEqual(malformed['metadata_fetch']['status'], 'unavailable')
                self.assertIn('P856', malformed['metadata_fetch']['reason'])
                self.assertEqual(malformed['metadata_fetch']['source'], transport.metadata_urls[0])
                self.assertEqual(malformed['metadata_fetch']['checked_at'], CHECKED_AT)
                self.assertNotIn('properties', malformed)
                self.assert_coverage(
                    result, status='partial', requested=2, succeeded=1,
                    failed=0, unavailable=1, references=2, reused=0,
                    operations={'attempted': 1, 'succeeded': 1, 'failed': 0})

    def test_supported_scalar_and_structured_values_remain_extractable(self):
        cases = [
            ('P856', 'https://example.com/', 'https://example.com/'),
            ('P112', {'id': 'Q2'}, 'Q2'),
            ('P571', {'time': '+2020-01-01T00:00:00Z'}, '+2020-01-01T00:00:00Z'),
            ('P1476', {'text': 'Example', 'language': 'en'}, 'Example'),
            ('P1128', {'amount': '+25'}, '+25'),
            ('P1128', {'amount': 0}, 0),
            ('P1128', 0, 0), ('P1128', 1, 1), ('P1128', 1.5, 1.5),
        ]
        for prop, value, expected in cases:
            with self.subTest(prop=prop, value=value):
                entity = {'claims': {prop: [{'mainsnak': {'datavalue': {'value': value}}}]}}
                self.assertEqual(crawl.claim_values(entity, prop), [expected])

    def test_unavailable_entity_does_not_discard_valid_sibling_or_accept_extra_entities(self):
        unavailable = {
            'omitted QID': {},
            'missing marker, empty string': {'Q2': {'id': 'Q2', 'missing': '', 'claims': {}}},
            'missing claims': {'Q2': {'id': 'Q2'}},
            'null claims': {'Q2': {'id': 'Q2', 'claims': None}},
            'nonempty legacy claims list': {'Q2': {'id': 'Q2', 'claims': [{}]}},
            'selected property is not a list': {'Q2': {'claims': {'P856': {}}}},
            'selected statement is not an object': {'Q2': {'claims': {'P856': [None]}}},
            'selected statement is missing its snak': {'Q2': {'claims': {'P856': [{}]}}},
            'selected statement has malformed snak': {'Q2': {'claims': {'P856': [{'mainsnak': []}]}}},
            'value snak is missing datavalue': {'Q2': {'claims': {'P856': [{'mainsnak': {'snaktype': 'value'}}]}}},
            'datavalue is missing value': {'Q2': {'claims': {'P856': [{'mainsnak': {'datavalue': {}}}]}}},
            'datavalue is null': {'Q2': {'claims': {'P856': [{'mainsnak': {'datavalue': {'value': None}}}]}}},
            'conflicting identity': {'Q2': {'id': 'Q99', 'claims': {}}},
        }
        for label, entity in unavailable.items():
            with self.subTest(label=label):
                transport = ScriptedApiTransport([search_result('Q1', 'Q2')], [{
                    'entities': {'Q1': {'id': 'Q1', 'claims': website_claim()},
                                 'Q99': {'id': 'Q99', 'claims': {}}, **entity},
                }])
                result = self.discover(transport)
                good, missing = result['results'][0]['candidates']
                self.assertEqual(good['properties']['official_website'], ['https://example.com/'])
                self.assertEqual(good['metadata_fetch']['status'], 'ok')
                self.assertEqual(missing['metadata_fetch']['status'], 'unavailable')
                self.assertTrue(missing['metadata_fetch']['reason'])
                self.assertEqual(missing['metadata_fetch']['source'], transport.metadata_urls[0])
                self.assertNotIn('properties', missing)
                self.assert_coverage(
                    result, status='partial', requested=2, succeeded=1,
                    failed=0, unavailable=1, references=2, reused=0,
                    operations={'attempted': 1, 'succeeded': 1, 'failed': 0})

    def test_http_api_and_malformed_envelopes_are_failed_fetches(self):
        responses = {
            'HTTP error': (503, b'Unavailable'),
            'invalid JSON': (200, b'not JSON'),
            'API error': {'error': {'code': 'maxlag'}},
            'API reports failure': {'success': 0, 'entities': {'Q1': {'claims': {}}}},
            'non-object JSON root': [],
            'absent entities': {'success': 1},
            'null entities': {'entities': None},
            'non-object entities': {'entities': [{}]},
        }
        for label, response in responses.items():
            with self.subTest(label=label):
                transport = ScriptedApiTransport([search_result('Q1')], [response])
                result = self.discover(transport)
                candidate = result['results'][0]['candidates'][0]
                self.assertEqual(candidate['metadata_fetch']['status'], 'failed')
                self.assertTrue(candidate['metadata_fetch']['reason'])
                self.assertEqual(candidate['metadata_fetch']['source'], transport.metadata_urls[0])
                self.assertNotIn('properties', candidate)
                self.assert_coverage(
                    result, status='none_succeeded', requested=1, succeeded=0,
                    failed=1, unavailable=0, references=1, reused=0,
                    operations={'attempted': 1, 'succeeded': 0, 'failed': 1})

    def test_legacy_empty_entity_map_is_successfully_read_but_requested_entity_is_unavailable(self):
        transport = ScriptedApiTransport([search_result('Q1')], [{'entities': []}])
        result = self.discover(transport)
        candidate = result['results'][0]['candidates'][0]
        self.assertEqual(candidate['metadata_fetch']['status'], 'unavailable')
        self.assertTrue(candidate['metadata_fetch']['reason'])
        self.assertNotIn('properties', candidate)
        self.assert_coverage(
            result, status='none_succeeded', requested=1, succeeded=0,
            failed=0, unavailable=1, references=1, reused=0,
            operations={'attempted': 1, 'succeeded': 1, 'failed': 0})

    def test_explicit_unknown_and_no_value_snaks_are_valid_metadata(self):
        transport = ScriptedApiTransport([search_result('Q1', 'Q2')], [{
            'entities': {
                'Q1': {'claims': {'P856': [{'mainsnak': {'snaktype': 'somevalue'}}]}},
                'Q2': {'claims': {'P856': [{'mainsnak': {'snaktype': 'novalue'}}]}},
            },
        }])
        result = self.discover(transport)
        for candidate in result['results'][0]['candidates']:
            self.assertEqual(candidate['metadata_fetch']['status'], 'ok')
            self.assertEqual(candidate['properties'], {})
        self.assert_coverage(
            result, status='all_succeeded', requested=2, succeeded=2,
            failed=0, unavailable=0, references=2, reused=0,
            operations={'attempted': 1, 'succeeded': 1, 'failed': 0})

    def test_split_batch_counts_failed_parent_and_reuses_success_and_failure(self):
        transport = ScriptedApiTransport(
            [search_result('Q1', 'Q2'), search_result('Q1', 'Q2')],
            [crawl.CrawlError('response exceeds size limit'),
             {'entities': {'Q1': {'claims': website_claim()}}},
             crawl.CrawlError('request failed: timeout')])
        result = self.discover(transport, names=('Example', 'Example alias'))
        first, second = [row['candidates'] for row in result['results']]
        self.assertEqual(first[0]['metadata_fetch']['status'], 'ok')
        self.assertEqual(first[1]['metadata_fetch']['status'], 'failed')
        self.assertEqual(first[0]['metadata_fetch'], second[0]['metadata_fetch'])
        self.assertEqual(first[1]['metadata_fetch'], second[1]['metadata_fetch'])
        self.assertEqual(first[0]['properties'], second[0]['properties'])
        self.assertNotIn('properties', first[1])
        self.assertNotIn('properties', second[1])
        self.assertEqual(first[0]['metadata_fetch']['source'], transport.metadata_urls[1])
        self.assertEqual(first[1]['metadata_fetch']['source'], transport.metadata_urls[2])
        self.assertEqual([parse_qs(urlsplit(url).query)['ids'][0]
                          for url in transport.metadata_urls], ['Q1|Q2', 'Q1', 'Q2'])
        self.assert_coverage(
            result, status='partial', requested=2, succeeded=1,
            failed=1, unavailable=0, references=4, reused=2,
            operations={'attempted': 3, 'succeeded': 1, 'failed': 2})

    def test_no_search_matches_do_not_attempt_entity_metadata(self):
        transport = ScriptedApiTransport([search_result()])
        result = self.discover(transport)
        self.assertEqual(result['results'][0]['status'], 'no_matches')
        self.assertEqual(transport.metadata_urls, [])
        self.assert_coverage(
            result, status='not_attempted', requested=0, succeeded=0,
            failed=0, unavailable=0, references=0, reused=0,
            operations={'attempted': 0, 'succeeded': 0, 'failed': 0})

    def test_recovered_split_succeeds_without_erasing_failed_parent_operation(self):
        transport = ScriptedApiTransport([search_result('Q1', 'Q2')], [
            crawl.CrawlError('response exceeds size limit'),
            {'entities': {'Q1': {'claims': {}}}},
            {'entities': {'Q2': {'claims': {}}}},
        ])
        result = self.discover(transport)
        candidates = result['results'][0]['candidates']
        self.assertEqual([c['metadata_fetch']['status'] for c in candidates], ['ok', 'ok'])
        self.assertEqual([c['metadata_fetch']['source'] for c in candidates], transport.metadata_urls[1:])
        self.assert_coverage(
            result, status='all_succeeded', requested=2, succeeded=2,
            failed=0, unavailable=0, references=2, reused=0,
            operations={'attempted': 3, 'succeeded': 2, 'failed': 1})

    def test_api_failure_during_search_remains_failed_instead_of_no_matches(self):
        transport = ScriptedApiTransport([{'success': 0}])
        result = self.discover(transport)
        self.assertEqual(result['results'][0]['status'], 'failed')
        self.assertTrue(result['results'][0]['reason'])
        self.assertEqual(transport.metadata_urls, [])
        self.assertEqual(result['metadata_coverage']['fetch_status'], 'not_attempted')

    def test_rate_limit_stops_actual_transport_before_next_metadata_batch(self):
        class Response:
            def __init__(self, status, body):
                self.status, self.body = status, body
                self.headers = {'Content-Type': 'application/json'}

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, size):
                return self.body[:size]

        responses = [Response(200, json.dumps(search_result(
            *('Q' + str(q) for q in range(start, start + 7)))).encode())
            for start in (1, 8, 15)]
        responses.append(Response(429, b'Rate limited'))
        transport = crawl.Transport(delay=1)
        with patch.object(crawl.socket, 'getaddrinfo', return_value=[
                (2, 1, 6, '', ('93.184.216.34', 443))]), \
             patch.object(crawl.time, 'sleep'), \
             patch.object(transport.opener, 'open', side_effect=responses) as request:
            result = self.discover(transport, names=('First', 'Second', 'Third'))
        self.assertEqual(request.call_count, 4, 'Three searches and one rate-limited metadata HTTP attempt')
        self.assertIn('www.wikidata.org', transport.stopped)
        candidates = [c for row in result['results'] for c in row['candidates']]
        self.assertEqual(len(candidates), 21)
        self.assertTrue(all(c['metadata_fetch']['status'] == 'failed' for c in candidates))
        self.assertIn('429', candidates[0]['metadata_fetch']['reason'])
        self.assertIn('paused', candidates[-1]['metadata_fetch']['reason'])
        self.assertTrue(all('properties' not in c for c in candidates))
        self.assert_coverage(
            result, status='none_succeeded', requested=21, succeeded=0,
            failed=21, unavailable=0, references=21, reused=0,
            operations={'attempted': 2, 'succeeded': 0, 'failed': 2})

    def test_review_csv_preserves_metadata_failure_and_original_directory_source(self):
        lead = {'name': 'Example', 'reported_type': 'VC', 'provider': 'Provider',
                'source_url': 'https://directory.example/partners',
                'source_scope': 'Australia', 'checked_at': '2026-11-16T00:00:00Z'}
        transport = ScriptedApiTransport(
            [search_result('Q1')], [crawl.CrawlError('=not a formula')])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            leads, output = path / 'leads.csv', path / 'review.csv'
            crawl.write_partner_directory_review_csv(leads, {'candidates': [lead]})
            args = types.SimpleNamespace(partner=None, limit=0, candidates=10, leads=leads)
            with patch.object(crawl, 'utc_now', return_value=CHECKED_AT), contextlib.redirect_stderr(io.StringIO()):
                result = crawl.discover({'partnerLeads': []}, args, transport)
            crawl.write_review_csv(output, result)
            with output.open(newline='') as handle:
                row = next(csv.DictReader(handle))
        self.assertEqual(row['metadata_status'], 'failed')
        self.assertEqual(row['metadata_checked_at'], CHECKED_AT)
        self.assertEqual(row['metadata_source'], transport.metadata_urls[0])
        self.assertEqual(row['metadata_reason'], "'=not a formula")
        self.assertEqual(row['directory_provider'], lead['provider'])
        self.assertEqual(row['directory_type'], lead['reported_type'])
        self.assertEqual(row['directory_source'], lead['source_url'])
        self.assertEqual(row['directory_scope'], lead['source_scope'])
        self.assertEqual(row['directory_checked_at'], lead['checked_at'])
        self.assertEqual(row['approved'], '')
        self.assertEqual(row['official_website'], '')

    def test_cli_persists_review_artifacts_and_distinguishes_unusable_metadata(self):
        cases = [
            ('no matches', search_result(), (), 0, 'not_attempted'),
            ('search failure', crawl.CrawlError('DNS failed'), (), 1, 'not_attempted'),
            ('metadata failure', search_result('Q1'),
             [crawl.CrawlError('request failed')], 1, 'none_succeeded'),
            ('all metadata unavailable', search_result('Q1'),
             [{'entities': {}}], 1, 'none_succeeded'),
            ('malformed selected object value', search_result('Q1'),
             [{'entities': {'Q1': {'claims': website_claim({})}}}], 1, 'none_succeeded'),
            ('malformed selected array value', search_result('Q1'),
             [{'entities': {'Q1': {'claims': website_claim([])}}}], 1, 'none_succeeded'),
            ('valid empty metadata', search_result('Q1'),
             [{'entities': {'Q1': {'claims': {}}}}], 0, 'all_succeeded'),
            ('partial metadata', search_result('Q1', 'Q2'),
             [{'entities': {'Q1': {'claims': {}}, 'Q2': {'missing': ''}}}], 0, 'partial'),
        ]
        for label, search, metadata, expected_code, expected_status in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                catalogue = root / 'catalogue.json'
                catalogue.write_text(json.dumps({'partnerLeads': ['Example']}))
                transport = ScriptedApiTransport([search], metadata)
                stdout, stderr = io.StringIO(), io.StringIO()
                with patch.object(crawl, 'CATALOGUE', catalogue), \
                     patch.object(crawl, 'Transport', return_value=transport), \
                     contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    code = crawl.main(['discover', '--limit', '1', '--out', str(root / 'out')])
                self.assertEqual(code, expected_code)
                saved = json.loads((root / 'out' / 'latest-discover.json').read_text())
                self.assertEqual(saved['metadata_coverage']['fetch_status'], expected_status)
                reviews = list((root / 'out').glob('partner-review-*.csv'))
                self.assertEqual(len(reviews), 1)
                with reviews[0].open(newline='') as handle:
                    review = csv.DictReader(handle)
                    self.assertIn('metadata_status', review.fieldnames)
                    rows = list(review)
                self.assertTrue(all(row['approved'] == '' for row in rows))
                self.assertIn('Wikidata metadata coverage:', stdout.getvalue())


if __name__ == '__main__':
    unittest.main()
