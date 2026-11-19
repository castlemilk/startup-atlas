"""Reproduce fixed, authored r1 logo studies; never overwrites production identity."""
from pathlib import Path
import json, hashlib
OUT=Path(__file__).resolve().parents[1]/'web/assets/design-lab/signal-explorations'
# Three different constructions, not rotations or palette-only identities.
SHAPES={
 'aperture': [('structure','M28 100 57 28H76L105 100H84L66 51 48 100Z'),('selection','M53 78H79L85 94H47Z')],
 'folio': [('structure','M25 30H78V43H38V88H78V101H25Z M47 21H100V82H87V34H47Z'),('selection','M49 53H76V66H49Z')],
 'relay': [('structure','M21 33H58V49H37V79H58V95H21Z M70 33H107V95H70V79H91V49H70Z'),('selection','M50 56H78V72H50Z')]
}
manifest={'revision':'r1','status':'original concept studies, not approved identity','provenance':'Fixed SVG geometry authored for Startup Atlas; no tracing, external fonts, raster embeds, or generated-image source. Gamma palette-role guidance read 2026-11-17; Atlas token values retained. No trademark clearance claimed.','minimum_size_px':32,'assets':[]}
for name,parts in SHAPES.items():
 for theme,ink,accent in [('light','#111318','#315EFB'),('dark','#F4F6FA','#9AAFFF'),('mono','#111318','#111318')]:
  svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title"><title id="title">Atlas '+name+' logo study, '+theme+'</title>'
  for layer,d in parts: svg+=f'<g id="{layer}" fill="{accent if layer=="selection" else ink}"><path d="{d}"/></g>'
  svg+='</svg>\n'; file=f'{name}-r1-{theme}.svg'; (OUT/file).write_text(svg)
  manifest['assets'].append({'file':file,'family':name,'theme':theme,'sha256':hashlib.sha256(svg.encode()).hexdigest()})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
