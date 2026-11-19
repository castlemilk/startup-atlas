"""Offline request budgeting: fixtures are not proposed or deployed MCP tools."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('asset_transport_contract', ROOT / 'contracts/mcp_assets/transport.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
SLOT = ('arguments', 'content_base64')


def fixture():
    return {'fixture': 'OFFLINE ONLY — no deployed tool', 'id': 'fixture-request-01',
            'arguments': {'content_base64': '', 'provenance': {
                'source_page': 'https://example.com/press', 'attribution': 'Synthetic transport fixture'}},
            'padding': ''}


class TransportContractTests(unittest.TestCase):
    def assert_error(self, code, function, *args):
        with self.assertRaises(transport.TransportError) as caught:
            function(*args)
        self.assertEqual(caught.exception.code, code)
        receipt = caught.exception.as_dict()
        self.assertTrue(receipt['field'])
        self.assertTrue(receipt['message'])
        return receipt

    def aligned(self):
        envelope = fixture()
        budget = transport.request_budget(envelope, SLOT)
        envelope['padding'] = 'x' * budget['alignment_slack_bytes']
        return envelope, transport.request_budget(envelope, SLOT)

    def test_fixed_hosted_limit_and_formula_count_the_complete_envelope(self):
        envelope = fixture()
        budget = transport.request_budget(envelope, SLOT)
        expected = json.dumps(envelope, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        self.assertEqual(transport.REQUEST_LIMIT_BYTES, 131072)
        self.assertEqual(budget['envelope_bytes'], len(expected))
        self.assertEqual(budget['max_raw_bytes'], 3 * ((131072 - len(expected)) // 4))
        self.assertEqual(budget['max_base64_bytes'], 4 * ((131072 - len(expected)) // 4))
        self.assertFalse(budget['schema_validated'])
        self.assertFalse(budget['sent'])

    def test_exact_fit_and_one_extra_raw_byte(self):
        envelope, budget = self.aligned()
        data = b'x' * budget['max_raw_bytes']
        body = transport.encode_request(data, envelope, SLOT)
        self.assertEqual(len(body), 131072)
        result = transport.validate_wire_body(body, SLOT)
        self.assertEqual(result['wire_bytes'], 131072)
        self.assertEqual(result['raw_bytes'], len(data))
        self.assertEqual(result['asset_sha256'], hashlib.sha256(data).hexdigest())
        self.assert_error('RAW_BYTES_TOO_LARGE', transport.encode_request, data + b'x', envelope, SLOT)

    def test_exact_fit_plus_one_wire_byte_is_rejected_before_parsing(self):
        envelope, budget = self.aligned()
        body = transport.encode_request(b'x' * budget['max_raw_bytes'], envelope, SLOT)
        error = self.assert_error('REQUEST_TOO_LARGE', transport.validate_wire_body, body + b' ', SLOT)
        self.assertEqual(error['details']['actual_bytes'], 131073)

    def test_three_byte_groups_and_padding_are_exact(self):
        envelope = fixture()
        overhead = transport.request_budget(envelope, SLOT)['envelope_bytes']
        for count in range(10):
            with self.subTest(raw_bytes=count):
                body = transport.encode_request(bytes(range(count)), envelope, SLOT)
                self.assertEqual(len(body), overhead + 4 * ((count + 2) // 3))
                result = transport.validate_wire_body(body, SLOT)
                self.assertEqual(result['raw_bytes'], count)
        envelope, budget = self.aligned()
        for count in (budget['max_raw_bytes'] - 2, budget['max_raw_bytes'] - 1, budget['max_raw_bytes']):
            self.assertEqual(len(transport.encode_request(b'x' * count, envelope, SLOT)), 131072)

    def test_every_remainder_has_exact_capacity(self):
        for padding in range(4):
            envelope = fixture()
            envelope['padding'] = 'x' * padding
            budget = transport.request_budget(envelope, SLOT)
            body = transport.encode_request(b'x' * budget['max_raw_bytes'], envelope, SLOT)
            self.assertEqual(131072 - len(body), budget['alignment_slack_bytes'])
            self.assert_error('RAW_BYTES_TOO_LARGE', transport.encode_request,
                              b'x' * (budget['max_raw_bytes'] + 1), envelope, SLOT)

    def test_empty_slot_at_exact_cap_permits_only_empty_bytes(self):
        envelope = fixture()
        envelope['padding'] = 'x' * (131072 - transport.request_budget(envelope, SLOT)['envelope_bytes'])
        budget = transport.request_budget(envelope, SLOT)
        self.assertEqual(budget['max_raw_bytes'], 0)
        self.assertEqual(len(transport.encode_request(b'', envelope, SLOT)), 131072)
        self.assert_error('RAW_BYTES_TOO_LARGE', transport.encode_request, b'x', envelope, SLOT)
        envelope['padding'] += 'x'
        self.assert_error('REQUEST_TOO_LARGE', transport.request_budget, envelope, SLOT)

    def test_unicode_escapes_and_long_metadata_are_measured_as_wire_bytes(self):
        envelope = fixture()
        envelope['arguments']['provenance']['attribution'] = ('Résumé 🚀\n\t"\\/' * 500)
        body = transport.serialize_request(envelope)
        expected = json.dumps(envelope, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode('utf-8')
        self.assertEqual(body, expected)
        self.assertGreater(len(body), len(body.decode('utf-8')))
        self.assertEqual(transport.request_budget(envelope, SLOT)['envelope_bytes'], len(body))
        body_with_bytes = transport.encode_request(b'\xff\xff\x00', envelope, SLOT)
        self.assertEqual(len(body_with_bytes), len(body) + 4)

    def test_more_utf8_metadata_reduces_actual_raw_capacity(self):
        ascii_envelope = fixture()
        unicode_envelope = fixture()
        ascii_envelope['padding'] = 'e' * 4000
        unicode_envelope['padding'] = 'é' * 4000
        ascii_budget = transport.request_budget(ascii_envelope, SLOT)
        unicode_budget = transport.request_budget(unicode_envelope, SLOT)
        self.assertEqual(unicode_budget['envelope_bytes'] - ascii_budget['envelope_bytes'], 4000)
        self.assertEqual(ascii_budget['max_raw_bytes'] - unicode_budget['max_raw_bytes'], 3000)

    def test_unknown_fields_are_counted_but_not_schema_approved(self):
        envelope = fixture()
        first = transport.request_budget(envelope, SLOT)
        envelope['unknown_future_metadata'] = 'a' * 1000
        second = transport.request_budget(envelope, SLOT)
        self.assertGreater(second['envelope_bytes'], first['envelope_bytes'])
        self.assertLess(second['max_raw_bytes'], first['max_raw_bytes'])
        self.assertFalse(second['schema_validated'])

    def test_wrong_missing_or_nonempty_slot_is_rejected(self):
        for slot in ((), 'arguments.content_base64', ('missing',), ('arguments', 'missing'), ('id', 'child'), (0,)):
            with self.subTest(slot=slot):
                self.assert_error('INVALID_SLOT', transport.request_budget, fixture(), slot)
        for value in ('YQ==', None, [], 0):
            envelope = fixture()
            envelope['arguments']['content_base64'] = value
            self.assert_error('INVALID_SLOT', transport.request_budget, envelope, SLOT)

    def test_input_envelope_and_mutable_raw_data_are_not_modified(self):
        envelope = fixture()
        before = copy.deepcopy(envelope)
        data = bytearray(b'abc')
        body = transport.encode_request(data, envelope, SLOT)
        data[0] = ord('z')
        self.assertEqual(envelope, before)
        self.assertEqual(transport.validate_wire_body(body, SLOT)['asset_sha256'], hashlib.sha256(b'abc').hexdigest())

    def test_raw_string_or_data_url_is_not_a_binary_input(self):
        for value in ('YWJj', 'data:image/png;base64,YWJj', None, [1, 2, 3]):
            self.assert_error('INVALID_BYTES', transport.encode_request, value, fixture(), SLOT)

    def test_local_one_megabyte_limit_is_not_hosted_upload_capacity(self):
        self.assertLess(transport.request_budget(fixture(), SLOT)['max_raw_bytes'], 98304)
        self.assert_error('RAW_BYTES_TOO_LARGE', transport.encode_request, b'x' * 1_000_000, fixture(), SLOT)

    def test_canonical_base64_accepts_all_three_padding_forms(self):
        for data in (b'', b'a', b'ab', b'abc', b'\xff\xff\xff'):
            encoded = base64.b64encode(data).decode('ascii')
            self.assertEqual(transport.strict_base64(encoded), data)

    def test_base64_rejects_invalid_alphabet_padding_and_unused_pad_bits(self):
        for value in ('YQ', 'YQ=', 'YQ===', 'YQ==\n', ' YQ==', 'Y Q==', 'data:image/png;base64,YQ==',
                      '_w==', '-w==', 'é===', 'YR==', 'YWJ=', 'AAAA====', '=AAA', '====', 'YQ==YQ=='):
            with self.subTest(value=value):
                self.assert_error('INVALID_BASE64', transport.strict_base64, value)

    def test_wire_checker_measures_other_whitespace_and_escape_encodings(self):
        body = transport.encode_request(b'\xff\xff\xff', fixture(), SLOT)
        envelope = json.loads(body)
        expanded = json.dumps(envelope, ensure_ascii=True, indent=2).encode('utf-8')
        result = transport.validate_wire_body(expanded, SLOT)
        self.assertEqual(result['wire_bytes'], len(expanded))
        self.assertGreater(len(expanded), len(body))
        self.assertFalse(result['matches_offline_serializer'])
        slash_escaped = expanded.replace(b'////', b'\\/\\/\\/\\/')
        self.assertEqual(transport.validate_wire_body(slash_escaped, SLOT)['raw_bytes'], 3)

    def test_other_serializer_can_overflow_despite_a_compact_budget(self):
        envelope = fixture()
        envelope['padding'] = '🚀' * 1000
        budget = transport.request_budget(envelope, SLOT)
        compact = transport.encode_request(b'x' * budget['max_raw_bytes'], envelope, SLOT)
        expanded = json.dumps(json.loads(compact), ensure_ascii=True, indent=2).encode('utf-8')
        self.assertLessEqual(len(compact), 131072)
        self.assertGreater(len(expanded), 131072)
        self.assert_error('REQUEST_TOO_LARGE', transport.validate_wire_body, expanded, SLOT)

    def test_duplicate_json_keys_including_escaped_aliases_are_rejected(self):
        for body in (b'{"arguments":{"content_base64":"","content_base64":"YQ=="}}',
                     b'{"arguments":{"content_base64":"","\\u0063ontent_base64":"YQ=="}}',
                     b'{"arguments":{"content_base64":""},"arguments":{"content_base64":"YQ=="}}'):
            self.assert_error('DUPLICATE_JSON_KEY', transport.validate_wire_body, body, SLOT)

    def test_invalid_utf8_bom_lone_surrogates_and_trailing_json_are_rejected(self):
        self.assert_error('INVALID_UTF8', transport.validate_wire_body, b'{"a":"\xff"}', ('a',))
        for body in (b'\xef\xbb\xbf{"a":""}', b'{"a":""} {}'):
            self.assert_error('INVALID_JSON', transport.validate_wire_body, body, ('a',))
        for value in ('\ud800', '\udfff', '\ud83d\ude80'):
            self.assert_error('INVALID_UNICODE', transport.serialize_request, {'a': value})
        self.assert_error('INVALID_UNICODE', transport.validate_wire_body,
                          b'{"a":"","note":"\\ud800"}', ('a',))
        valid_pair = b'{"a":"","note":"\\ud83d\\ude80"}'
        self.assertEqual(transport.validate_wire_body(valid_pair, ('a',))['wire_bytes'], len(valid_pair))

    def test_offline_number_profile_is_explicit_and_precision_safe(self):
        for number in (-9007199254740991, 0, 9007199254740991):
            self.assertEqual(json.loads(transport.serialize_request({'a': '', 'id': number}))['id'], number)
        for number in (9007199254740992, -9007199254740992):
            self.assert_error('UNSUPPORTED_JSON_NUMBER', transport.serialize_request, {'a': '', 'id': number})
        for token in (b'-0', b'1.0', b'1e0', b'NaN', b'Infinity', b'9007199254740992'):
            self.assert_error('UNSUPPORTED_JSON_NUMBER', transport.validate_wire_body,
                              b'{"a":"","id":' + token + b'}', ('a',))

    def test_non_json_types_cyclic_objects_and_excessive_depth_fail_cleanly(self):
        self.assert_error('INVALID_ENVELOPE', transport.serialize_request, [])
        for value in (1.0, b'bytes', set(), object()):
            self.assert_error('UNSUPPORTED_JSON_VALUE', transport.serialize_request, {'a': value})
        self.assert_error('INVALID_ENVELOPE', transport.serialize_request, {1: 'value'})
        cyclic = {}
        cyclic['self'] = cyclic
        self.assert_error('INVALID_ENVELOPE', transport.serialize_request, cyclic)
        value = ''
        for _ in range(transport.MAX_JSON_DEPTH + 2):
            value = {'nested': value}
        self.assert_error('UNSUPPORTED_JSON_DEPTH', transport.serialize_request, value)


if __name__ == '__main__':
    unittest.main()
