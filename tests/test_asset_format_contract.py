"""Representative synthetic formats against the unchanged strict image helper."""
import binascii
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import unittest
import zlib


ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assets = load('strict_assets_for_format_contract', 'scripts/atlas_assets.py')
fixtures = load('synthetic_image_fixtures', 'contracts/mcp_assets/image_fixtures.py')


def png_chunks(data):
    """Independent structural fixture check, not a new production decoder."""
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise AssertionError('Fixture signature is not PNG.')
    offset, chunks = 8, []
    while offset < len(data):
        length = int.from_bytes(data[offset:offset + 4], 'big')
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        crc = int.from_bytes(data[offset + 8 + length:offset + 12 + length], 'big')
        if length != len(payload) or crc != (binascii.crc32(kind + payload) & 0xffffffff):
            raise AssertionError('Synthetic chunk length or CRC is wrong.')
        chunks.append((kind, payload))
        offset += 12 + length
    if offset != len(data) or chunks[-1] != (b'IEND', b''):
        raise AssertionError('Fixture is not a complete PNG stream.')
    return chunks


class AssetFormatContractTests(unittest.TestCase):
    def test_registry_matches_every_exact_synthetic_payload(self):
        registry = json.loads((ROOT / 'contracts/mcp_assets/fixtures/image-cases.json').read_text())
        self.assertEqual(registry['status'], 'offline-synthetic-format-fixtures')
        self.assertFalse(registry['real_asset_or_identity_evidence'])
        actual = fixtures.cases()
        self.assertEqual(set(registry['cases']), set(actual))
        for name, (mime, data, expected) in actual.items():
            with self.subTest(case=name):
                entry = registry['cases'][name]
                self.assertEqual(entry['sha256'], hashlib.sha256(data).hexdigest())
                self.assertEqual(entry['bytes'], len(data))
                self.assertEqual(entry['declared_mime'], mime)
                self.assertEqual(entry['expected_format_result'], expected)
        self.assertEqual(len({hashlib.sha256(data).hexdigest() for _, data, _ in actual.values()}), len(actual))

    def test_logo_and_portrait_sized_rgb_rgba_pngs_pass_existing_helper(self):
        for name, width, height, color_type in (
            ('logo-rgb', 48, 32, 2), ('logo-rgba', 48, 32, 6), ('portrait-rgb', 48, 64, 2)):
            mime, data, _ = fixtures.cases()[name]
            measured = assets.inspect_png(data, declared_mime=mime, observed_mime=mime,
                                          expected_sha256=hashlib.sha256(data).hexdigest())
            self.assertEqual((measured['width'], measured['height'], measured['color_type']), (width, height, color_type))
            self.assertEqual(measured['bit_depth'], 8)
            chunks = png_chunks(data)
            self.assertEqual([kind for kind, _ in chunks], [b'IHDR', b'IDAT', b'IEND'])
            self.assertEqual(struct.unpack('>IIBBBBB', chunks[0][1]), (width, height, 8, color_type, 0, 0, 0))
            decoded = zlib.decompress(chunks[1][1])
            stride = width * (3 if color_type == 2 else 4) + 1
            self.assertEqual(len(decoded), stride * height)
            self.assertEqual({decoded[y * stride] for y in range(height)}, {0})

    def test_rgba_fixture_has_real_alpha_variation_without_metadata(self):
        chunks = png_chunks(fixtures.logo_rgba_png())
        rows = zlib.decompress(chunks[1][1])
        alphas = {rows[y * 193 + 1 + x * 4 + 3] for y in range(32) for x in range(48)}
        self.assertEqual(alphas, {0, 128, 255})

    def test_fixtures_are_deterministic_and_original_rasters_have_multiple_colors(self):
        for create in (fixtures.logo_rgb_png, fixtures.logo_rgba_png, fixtures.portrait_rgb_png):
            first, second = create(), create()
            self.assertEqual(first, second)
            chunks = png_chunks(first)
            width, height, _, color_type, *_ = struct.unpack('>IIBBBBB', chunks[0][1])
            channels = 3 if color_type == 2 else 4
            stride = width * channels + 1
            rows = zlib.decompress(chunks[1][1])
            colors = {rows[y * stride + 1 + x * channels:y * stride + 1 + (x + 1) * channels]
                      for y in range(height) for x in range(width)}
            self.assertGreater(len(colors), 1)

    def test_jpeg_fixture_is_complete_not_a_magic_only_placeholder(self):
        data = fixtures.synthetic_jpeg()
        self.assertEqual(hashlib.sha256(data).hexdigest(), fixtures.JPEG_GENERATION['sha256'])
        self.assertEqual(len(data), 770)
        self.assertEqual(data[:2], b'\xff\xd8')
        self.assertEqual(data[-2:], b'\xff\xd9')
        # Inspect length-delimited JPEG headers and nonempty entropy data. This
        # structural probe is not a JPEG decoder. One-time decoder evidence is
        # recorded with the frozen fixture's exact tool/version/parameters.
        offset, markers, frame, scan = 2, [], None, None
        while offset < len(data) - 2:
            self.assertEqual(data[offset], 0xff)
            marker = data[offset + 1]
            length = int.from_bytes(data[offset + 2:offset + 4], 'big')
            self.assertGreaterEqual(length, 2)
            payload = data[offset + 4:offset + 2 + length]
            self.assertEqual(len(payload), length - 2)
            markers.append(marker)
            if marker == 0xc0:
                frame = payload
            offset += 2 + length
            if marker == 0xda:
                scan = data[offset:-2]
                break
        self.assertTrue({0xe0, 0xdb, 0xc0, 0xc4, 0xda}.issubset(markers))
        self.assertEqual((frame[0], int.from_bytes(frame[1:3], 'big'), int.from_bytes(frame[3:5], 'big'), frame[5]), (8, 16, 16, 3))
        self.assertGreater(len(scan), 50)
        self.assertIn('decoded RGB 16x16 successfully', fixtures.JPEG_GENERATION['creation_check'])

    def test_complete_jpeg_and_both_svgs_remain_rejected_with_correct_and_spoofed_mime(self):
        for name in ('complete-jpeg', 'benign-svg', 'active-svg'):
            mime, data, _ = fixtures.cases()[name]
            with self.subTest(case=name, mime=mime), self.assertRaises(assets.AssetError) as caught:
                assets.inspect_png(data, declared_mime=mime, observed_mime=mime)
            self.assertEqual(caught.exception.code, 'MIME_MISMATCH')
            with self.subTest(case=name, mime='spoofed-png'), self.assertRaises(assets.AssetError) as caught:
                assets.inspect_png(data, declared_mime='image/png', observed_mime='image/png')
            self.assertEqual(caught.exception.code, 'UNSUPPORTED_IMAGE')

    def test_valid_crc_ancillary_chunks_are_rejected_without_stripping(self):
        original = fixtures.logo_rgb_png()
        original_chunks = png_chunks(original)
        for kind in (b'tEXt', b'iCCP', b'eXIf', b'gAMA'):
            with self.subTest(chunk=kind):
                data = fixtures.ancillary_png(kind)
                digest = hashlib.sha256(data).hexdigest()
                chunks = png_chunks(data)
                self.assertEqual([name for name, _ in chunks], [b'IHDR', kind, b'IDAT', b'IEND'])
                self.assertEqual(chunks[0], original_chunks[0])
                self.assertEqual(chunks[2], original_chunks[1])
                with self.assertRaises(assets.AssetError) as caught:
                    assets.inspect_png(data)
                self.assertEqual(caught.exception.code, 'UNSUPPORTED_IMAGE')
                self.assertEqual(hashlib.sha256(data).hexdigest(), digest)
                self.assertNotEqual(data, original)

    def test_ancillary_fixtures_contain_explicit_metadata_that_cannot_be_silently_dropped(self):
        entries = {kind: payload for kind, payload in png_chunks(fixtures.ancillary_png(b'iCCP'))}
        keyword, remainder = entries[b'iCCP'].split(b'\x00', 1)
        self.assertEqual(keyword, b'Synthetic sRGB')
        self.assertEqual(remainder[0], 0)
        profile = zlib.decompress(remainder[1:])
        self.assertEqual(profile, fixtures.srgb_profile())
        self.assertEqual(int.from_bytes(profile[:4], 'big'), len(profile))
        self.assertEqual(profile[36:40], b'acsp')
        self.assertEqual(hashlib.sha256(profile).hexdigest(), fixtures.ICC_GENERATION['sha256'])
        exif = dict(png_chunks(fixtures.ancillary_png(b'eXIf')))[b'eXIf']
        self.assertEqual(exif[:8], b'II\x2a\x00\x08\x00\x00\x00')
        self.assertEqual(int.from_bytes(exif[18:20], 'little'), 6)
        gamma = dict(png_chunks(fixtures.ancillary_png(b'gAMA')))[b'gAMA']
        self.assertEqual(int.from_bytes(gamma, 'big'), 45455)
        text = dict(png_chunks(fixtures.ancillary_png(b'tEXt')))[b'tEXt']
        self.assertIn(b'Synthetic fixture metadata', text)

    def test_no_conversion_api_or_decoder_dependency_is_imported_by_fixture_helper(self):
        self.assertFalse(hasattr(fixtures, 'convert'))
        self.assertFalse(hasattr(fixtures, 'sanitize'))
        self.assertFalse(hasattr(fixtures, 'Image'))
        self.assertFalse(hasattr(fixtures, 'ImageCms'))
        self.assertEqual(fixtures.cases()['complete-jpeg'][2], 'rejected')


if __name__ == '__main__':
    unittest.main()
