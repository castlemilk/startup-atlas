"""Original synthetic format fixtures, not real logos, people or source assets.

Pure stdlib helpers produce exact raster bytes using hand-authored geometry and
uncompressed DEFLATE blocks. They do not convert or sanitize input files. The
complete JPEG and generated sRGB profile are frozen creation fixtures: Pillow is
not imported or required at test/runtime. Their recorded tool versions describe
one local creation/decoder check, not a supported conversion service.
"""
from __future__ import annotations

import base64
import binascii
import struct
import zlib


JPEG_GENERATION = {
    'tool': 'Pillow', 'version': '13.0.0', 'jpeg_codec': '6.2',
    'libjpeg_turbo': '3.2.0',
    'parameters': {'format': 'JPEG', 'quality': 85, 'subsampling': 0,
                   'optimize': False, 'progressive': False, 'mode': 'RGB',
                   'width': 16, 'height': 16},
    'pixels': 'For y then x in range(16): (x*16, y*16, ((x+y)%16)*16).',
    'creation_check': 'Pillow Image.open(BytesIO(data)).load() decoded RGB 16x16 successfully.',
    'sha256': '4aa80df28941dcfae2a76f4a5d46d3a4b9f5644f1ec84356f7d2d2f0492dac20',
}

_JPEG_BASE64 = (
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/'
    '2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAQABADAREAAhEBAxEB/8QA'
    'HwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK'
    'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG'
    'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC'
    'AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE'
    'hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxbwv4M+5+'
    '6/Svrcswuxhk+e7anoGm+HfLxb28fz9HYD7vsPevJ4n4w+qXy7LpfvNpzX2f7sX/ADd39nZe98P7Jw7mnNac3od3pvh3y8W9vH8/RnA+77D3r57ifjD6pfLs'
    'ul+82nNfZ/uxf83d/Z2XvfD/ACHw7mnNac3od14X8Gfc/dfpXx+WYXY/aMmz3bU//9k='
)

ICC_GENERATION = {
    'tool': 'Pillow ImageCms', 'pillow_version': '13.0.0', 'littlecms_version': '2.19',
    'parameters': {'createProfile': 'sRGB'},
    'sha256': '4a74a3e4d7ddedbd8dbf450f6deb75fed932dd457ef34d3472b4d715aea1b54a',
    'note': 'Frozen generated profile; do not regenerate its timestamp-bearing header during tests.',
}

_ICC_BASE64 = (
    'AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACwARAAwAHwATYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAA'
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAU'
    'YlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMA'
    'AAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1'
    'AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABv'
    'oAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAA'
    'AACj1wAAVHsAAEzNAACZmgAAJmYAAA9c'
)


def chunk(kind, payload):
    """Encode a controlled fixture chunk, with a valid CRC."""
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', binascii.crc32(kind + payload) & 0xffffffff)


def stored_zlib(raw):
    """Version-independent zlib framing and uncompressed DEFLATE for fixtures."""
    blocks = []
    for start in range(0, len(raw), 65535):
        part = raw[start:start + 65535]
        final = start + len(part) == len(raw)
        blocks.append(bytes([1 if final else 0]) + struct.pack('<HH', len(part), len(part) ^ 0xffff) + part)
    if not blocks:
        blocks = [b'\x01\x00\x00\xff\xff']
    return b'\x78\x01' + b''.join(blocks) + struct.pack('>I', zlib.adler32(raw) & 0xffffffff)


def _raster(width, height, color_type, pixel):
    channels = 3 if color_type == 2 else 4
    rows = []
    for y in range(height):
        row = b''.join(bytes(pixel(x, y)) for x in range(width))
        if len(row) != width * channels:
            raise ValueError('Synthetic pixel function has the wrong channel count.')
        rows.append(b'\x00' + row)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', stored_zlib(b''.join(rows))) + chunk(b'IEND', b'')


def logo_rgb_png():
    """48x32 original geometric RGB mark; no organisation or identity claim."""
    def pixel(x, y):
        bar = 6 <= x < 12 and 5 <= y < 27
        steps = 16 <= x < 22 and 10 <= y < 27 or 26 <= x < 32 and 15 <= y < 27 or 36 <= x < 42 and 20 <= y < 27
        return (35, 84, 155) if bar or steps else (242, 238, 227)
    return _raster(48, 32, 2, pixel)


def logo_rgba_png():
    """48x32 geometric alpha fixture with transparent and partially opaque pixels."""
    def pixel(x, y):
        distance = (x - 24) ** 2 + (y - 16) ** 2
        if 36 <= distance <= 144:
            return (190, 60, 45, 255)
        if distance < 36:
            return (35, 84, 155, 128)
        return (0, 0, 0, 0)
    return _raster(48, 32, 6, pixel)


def portrait_rgb_png():
    """48x64 abstract head/shoulder geometry, not a photograph or identified person."""
    def pixel(x, y):
        head = (x - 24) ** 2 * 144 + (y - 21) ** 2 * 81 <= 81 * 144
        shoulders = y >= 39 and (x - 24) ** 2 * 400 + (y - 62) ** 2 * 361 <= 361 * 400
        return (48, 62, 78) if head or shoulders else (220, 229, 233)
    return _raster(48, 64, 2, pixel)


def synthetic_jpeg():
    """Complete frozen JPEG, created and decoded once with recorded existing tools."""
    return base64.b64decode(_JPEG_BASE64, validate=True)


def srgb_profile():
    return base64.b64decode(_ICC_BASE64, validate=True)


def ancillary_png(kind):
    """Insert one explicit valid-CRC metadata chunk; never strip or sanitize it."""
    payloads = {
        b'tEXt': b'Comment\x00Synthetic fixture metadata; no personal data.',
        b'iCCP': b'Synthetic sRGB\x00\x00' + stored_zlib(srgb_profile()),
        # TIFF IFD with orientation=6 (90 degrees clockwise), kept unapplied.
        b'eXIf': b'II\x2a\x00\x08\x00\x00\x00\x01\x00\x12\x01\x03\x00\x01\x00\x00\x00\x06\x00\x00\x00\x00\x00\x00\x00',
        b'gAMA': struct.pack('>I', 45455),
    }
    if kind not in payloads:
        raise ValueError('Choose an explicitly authored ancillary fixture chunk.')
    original = logo_rgb_png()
    return original[:33] + chunk(kind, payloads[kind]) + original[33:]


def cases():
    """Return fresh synthetic bytes and declared MIME, with expected format outcome."""
    return {
        'logo-rgb': ('image/png', logo_rgb_png(), 'accepted'),
        'logo-rgba': ('image/png', logo_rgba_png(), 'accepted'),
        'portrait-rgb': ('image/png', portrait_rgb_png(), 'accepted'),
        'complete-jpeg': ('image/jpeg', synthetic_jpeg(), 'rejected'),
        'benign-svg': ('image/svg+xml', b'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"><rect x="6" y="6" width="36" height="20" fill="#23549b"/></svg>', 'rejected'),
        'active-svg': ('image/svg+xml', b'<svg xmlns="http://www.w3.org/2000/svg" onload="void(0)"><script>/* Synthetic active-content rejection fixture. */</script><rect width="48" height="32"/></svg>', 'rejected'),
        **{'png-' + kind.decode('ascii'): ('image/png', ancillary_png(kind), 'rejected')
           for kind in (b'tEXt', b'iCCP', b'eXIf', b'gAMA')},
    }
