import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import crawl
from collection_coverage import Ledger, ContractError, ConflictError
from replay_company_profiles import compile_replay

AT = '2026-11-18T12:00:00Z'
CHECKED = '2026-11-17T10:00:00+00:00'


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.overlay = self.root/'overlay.json'; self.seeds = self.root/'seeds.csv'; self.packet = self.root/'packet.json'
        self.overlay.write_text(json.dumps({'startups': [
            {'name': 'One', 'website': 'https://one.test/'},
            {'name': 'Two', 'website': 'https://two.test/'},
            {'name': 'Unapproved', 'website': 'https://unapproved.test/'}]}))
        self.seeds.write_text('partner,official_website,approved\nOne,https://one.test/,yes\nTwo,https://two.test/,yes\nUnapproved,https://unapproved.test/,no\n')
        self.data = {'version': 1, 'mode': 'company-profiles', 'generated_at': CHECKED,
                     'results': [{'name': 'One', 'url': 'https://one.test/', 'pages': [self.ok('https://one.test/')]}],
                     'candidates': []}
        self.save()

    def ok(self, url):
        return {'url': url, 'final_url': url, 'checked_at': CHECKED, 'status': 'ok', 'http_status': 200}

    def save(self): self.packet.write_text(json.dumps(self.data))

    def compile(self): return compile_replay(self.overlay, self.seeds, self.packet, 'a'*40, AT)

    def ledger(self, result):
        path = self.root/'ledger.sqlite'
        instance = Ledger.create(path, result['config'])
        self.addCleanup(instance.close)
        return instance

    def apply(self, ledger, batch):
        return ledger.apply(batch['batch_id'], batch['expected_sequence'], batch['events'], batch['committed_at'])

    def test_success_maps_packet_analysis_not_verification_or_full_scan(self):
        result = self.compile(); ledger = self.ledger(result)
        self.apply(ledger, result['start_batch']); self.apply(ledger, result['outcome_batch'])
        report = ledger.report(AT)
        self.assertEqual(report['snapshot_kind'], 'synthetic')
        one, two = report['scopes']
        # Scope hashes sort independently; use the eligible source name.
        one = next(s for s in report['scopes'] if s['population']['eligible_ids'] == ['One'])
        two = next(s for s in report['scopes'] if s['population']['eligible_ids'] == ['Two'])
        self.assertEqual(one['counts']['attempted'], 1)
        self.assertEqual(one['counts']['verified'], 0)
        self.assertIsNone(one['counts']['stale'])
        self.assertEqual(one['completion'], 'partial')
        self.assertIsNone(one['last_successful_full_scan_at'])
        self.assertEqual(two['counts']['undiscovered'], 1)
        self.assertEqual(two['counts']['attempted'], 0)
        self.assertEqual(two['completion'], 'partial')
        self.assertEqual(result['observations'][0]['pages'][0]['checked_at'], CHECKED)
        self.assertEqual(result['inventory']['population']['source_records'], 3)
        self.assertFalse(result['runtime_supported'])
        self.assertEqual(result['config']['attempt_budget'], 2)

    def test_exact_replay_is_idempotent_across_reopen(self):
        result = self.compile(); path = self.root/'ledger.sqlite'
        with Ledger.create(path, result['config']) as ledger:
            self.apply(ledger, result['start_batch']); self.apply(ledger, result['outcome_batch'])
        with Ledger.open(path, result['config']) as ledger:
            self.assertTrue(self.apply(ledger, result['start_batch'])['replayed'])
            self.assertTrue(self.apply(ledger, result['outcome_batch'])['replayed'])
            self.assertEqual(sum(s['counts']['attempts_total'] for s in ledger.report(AT)['scopes']), 1)

    def test_interrupted_replay_stays_inflight_until_explicit_recovery(self):
        result = self.compile(); path = self.root/'ledger.sqlite'
        with Ledger.create(path, result['config']) as ledger:
            self.apply(ledger, result['start_batch'])
        with Ledger.open(path, result['config']) as ledger:
            source = next(s for s in ledger.report(AT)['scopes'] if s['counts']['in_flight'])
            self.assertEqual(source['resume_queue'][0]['action'], 'reconcile_in_flight')
            event = result['outcome_batch']['events'][0]
            recover = {k: event[k] for k in ('scope_id', 'entity_id', 'at', 'attempt_id', 'evidence')}
            recover.update(type='recover', retry={'mode': 'manual', 'after': None})
            ledger.apply('manual-offline-recovery', 1, [recover], AT)
            with self.assertRaises((ConflictError, ContractError)):
                self.apply(ledger, result['outcome_batch'])
            late = copy.deepcopy(result['outcome_batch']); late['expected_sequence'] = 2
            with self.assertRaises(ContractError): self.apply(ledger, late)
            row = next(s for s in ledger.report(AT)['scopes'] if s['counts']['interrupted'])
            self.assertEqual(row['resume_queue'][0]['action'], 'manual_review')
            self.assertEqual(row['counts']['verified'], 0)

    def test_partial_and_failure_packets_require_manual_review(self):
        self.data['results'][0]['pages'].append({'url': 'https://one.test/team', 'checked_at': CHECKED,
                                               'status': 'skipped', 'reason': 'HTTP 429'})
        self.save(); result = self.compile(); ledger = self.ledger(result)
        self.apply(ledger, result['start_batch']); self.apply(ledger, result['outcome_batch'])
        row = next(s for s in ledger.report(AT)['scopes'] if s['counts']['unavailable'])
        self.assertEqual(row['counts']['manual_review'], 1)
        self.assertEqual(row['completion'], 'partial')
        self.assertEqual(result['observations'][0]['pages'][1]['reason'], 'HTTP 429')
        self.assertEqual(ledger.report(AT)['host_pauses'], {})  # Offline only: no invented retry time.

    def test_empty_page_list_is_not_success(self):
        self.data['results'][0]['pages'] = []; self.save()
        result = self.compile()
        event = result['outcome_batch']['events'][0]
        self.assertEqual(event['outcome'], 'unavailable')
        self.assertEqual(event['reason'], 'parser_error')

    def test_omitted_results_never_generate_attempts(self):
        self.data['results'] = []; self.save(); result = self.compile(); ledger = self.ledger(result)
        self.assertIsNone(result['start_batch'])
        self.apply(ledger, result['outcome_batch'])
        self.assertTrue(all(s['counts']['attempted'] == 0 for s in ledger.report(AT)['scopes']))
        self.assertTrue(all(s['completion'] == 'partial' for s in ledger.report(AT)['scopes']))

    def test_mismatched_unapproved_and_duplicate_sources_fail(self):
        original = copy.deepcopy(self.data)
        for change in ('unknown', 'unapproved', 'different_url', 'duplicate'):
            self.data = copy.deepcopy(original)
            if change == 'unknown': self.data['results'][0]['name'] = 'Unknown'
            if change == 'unapproved': self.data['results'][0].update(name='Unapproved', url='https://unapproved.test/')
            if change == 'different_url': self.data['results'][0]['url'] = 'https://one.test/changed'
            if change == 'duplicate': self.data['results'].append(self.data['results'][0])
            self.save()
            with self.subTest(change=change), self.assertRaises(ValueError): self.compile()

    def test_unknown_status_and_invalid_page_provenance_fail(self):
        original = copy.deepcopy(self.data)
        mutations = [dict(status='unknown'), dict(http_status=404), dict(http_status=200.0), dict(final_url='https://other.test/'),
                     dict(url='https://other.test/'), dict(checked_at='2026-11-18T11:00:00Z'),
                     dict(checked_at='bad'), dict(checked_at='2026-11-17'), dict(url='https://one.test/robots.txt')]
        for mutation in mutations:
            self.data = copy.deepcopy(original); self.data['results'][0]['pages'][0].update(mutation); self.save()
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.compile()

    def test_duplicate_or_excessive_pages_fail(self):
        self.data['results'][0]['pages'] *= 2; self.save()
        with self.assertRaises(ValueError): self.compile()
        self.data['results'][0]['pages'] = [self.ok('https://one.test/'+str(i)) for i in range(22)]; self.save()
        with self.assertRaises(ValueError): self.compile()

    def test_packet_bytes_and_replay_configuration_are_bound(self):
        result = self.compile(); ledger = self.ledger(result)
        self.packet.write_text(self.packet.read_text()+'\n')
        altered = self.compile()
        self.assertNotEqual(altered['packet_sha256'], result['packet_sha256'])
        self.assertNotEqual(altered['config']['run_id'], result['config']['run_id'])
        with self.assertRaises(ConflictError): Ledger.open(self.root/'ledger.sqlite', altered['config'])

    def test_duplicate_json_and_nonfinite_values_fail(self):
        for text in ['{"mode":"company-profiles","mode":"profiles"}', '{"value": NaN}']:
            self.packet.write_text(text)
            with self.assertRaises(ValueError): self.compile()

    def test_rejects_malformed_mode_version_generated_time(self):
        original = copy.deepcopy(self.data)
        for key, value in [('mode', 'profiles'), ('version', True), ('version', 2),
                           ('generated_at', '2026-11-19T00:00:00Z'), ('generated_at', 'bad'), ('results', {})]:
            self.data = copy.deepcopy(original); self.data[key] = value; self.save()
            with self.subTest(key=key,value=value), self.assertRaises(ValueError): self.compile()

    def test_actual_collector_fixture_maps_without_network(self):
        args = types.SimpleNamespace(approved=self.seeds, partner='One', limit=0, follow=0)
        transport = types.SimpleNamespace(request=lambda url, host: (200, {'Content-Type': 'text/html'}, b'<title>One</title>', url))
        with patch.object(crawl, 'utc_now', return_value=CHECKED):
            self.data = crawl.crawl_company_profiles(json.loads(self.overlay.read_text())['startups'], args, transport)
        self.save()
        with patch.object(crawl.Transport, 'request', side_effect=AssertionError('Network forbidden')), \
                patch.object(crawl.socket, 'getaddrinfo', side_effect=AssertionError('DNS forbidden')):
            result = self.compile()
        self.assertEqual(result['observations'][0]['mapping'], 'all_saved_pages_ok')

    def test_unrepresentable_ledger_host_fails_before_emitting_batches(self):
        self.overlay.write_text(json.dumps({'startups': [{'name': 'One', 'website': 'https://éxample.test/'}]}))
        self.seeds.write_text('partner,official_website,approved\nOne,https://éxample.test/,yes\n')
        with self.assertRaisesRegex(ValueError, 'cannot be represented'): self.compile()

    def test_cli_is_offline_and_does_not_create_ledger(self):
        before = sorted(p.name for p in self.root.iterdir())
        result = subprocess.run([sys.executable, str(ROOT/'scripts/replay_company_profiles.py'),
                                 '--overlay', str(self.overlay), '--approved', str(self.seeds),
                                 '--packet', str(self.packet), '--revision', 'a'*40, '--replay-at', AT],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['offline_only'])
        self.assertEqual(before, sorted(p.name for p in self.root.iterdir()))


if __name__ == '__main__': unittest.main()
