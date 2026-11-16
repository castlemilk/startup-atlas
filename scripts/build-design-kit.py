#!/usr/bin/env python3
"""Package the exact published visual assets and canonical design sources."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
TARGET = DIST / 'assets/design-lab/atlas-design-kit.zip'
FIXED_TIME = (2026, 1, 1, 0, 0, 0)

readme = '''# Startup Atlas design kit

Explore the collection at:
https://castlemilk.github.io/startup-atlas/design-assets.html

The kit includes ten generated full-size visuals, ten lightweight previews,
32 editable standalone SVG icons, the canonical CSS tokens and icon registry,
asset and icon manifests, and the design / interaction guidance.

The generated interface and direction images are illustrative studies. Their
fictional records, values, layouts and marks do not establish product behaviour
or research facts. The operational site, CSS tokens and SVG registry are the
canonical references. The three editorial illustrations retain transparent alpha.

Exact generation prompts, dimensions, intended uses, exclusions and SHA-256
checksums are in assets/design-lab/asset-manifest.json. Existing concepts retain
their revision prompts where relevant. Check sourceRevision to identify the build.

Icons use a 24 × 24 viewBox, no fill, round caps and joins, and a 1.65 stroke.
SVGs inherit currentColor; set color on their parent when embedding inline, or
change the SVG stroke attribute when importing them into a design application.
Use a text label for meaningful controls; decorative icons should be hidden from
assistive technology. Export variants in the online icon workbench.

Generated artwork and the SVG registry are separate asset families. Do not
derive small utility icons or exact chart geometry from generated raster images.
Keep a source's evidence and date in accessible page text beside a factual claim.

The documentation files are the same copies served by the website; repository
references may link to the published source. No user data is included in this kit.
'''


def add(archive, path, content):
    item = ZipInfo(path, FIXED_TIME)
    item.compress_type = ZIP_DEFLATED
    item.external_attr = 0o100644 << 16
    archive.writestr(item, content)


manifest = json.loads((DIST / 'assets/design-lab/asset-manifest.json').read_text())
paths = set()
for asset in manifest['assets']:
    for key in ('image', 'thumb'):
        path = asset[key].removeprefix('./')
        if not path.startswith('assets/design-lab/') or '..' in Path(path).parts:
            raise ValueError(f'Unexpected design asset path: {path}')
        paths.add(path)
paths.update(path.relative_to(DIST).as_posix() for path in (DIST / 'assets/design-icons').glob('*'))
paths.update(path.relative_to(DIST).as_posix() for path in (DIST / 'docs').glob('*') if path.name in {
    'DESIGN.md', 'UX-CONTRACT.md', 'EXPLORER-VIEWS.md', 'DESIGN-LAB.md', 'DESIGN-DIRECTION.md'
})
paths.update({'assets/design-lab/asset-manifest.json', 'design-tokens.css', 'atlas-icons.js'})
with ZipFile(TARGET, 'w') as archive:
    add(archive, 'README.md', readme.encode())
    for path in sorted(paths):
        add(archive, path, (DIST / path).read_bytes())
with ZipFile(TARGET) as archive:
    if archive.testzip() is not None:
        raise ValueError('The generated design kit failed its integrity check')
print(f'Built design kit with {len(paths) + 1} files ({TARGET.stat().st_size:,} bytes)')
