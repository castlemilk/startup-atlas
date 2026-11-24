import unittest,json,hashlib,xml.etree.ElementTree as ET,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/assets/design-lab/signal-explorations'
class Studies(unittest.TestCase):
 def test_fixed_exports_and_safe_subset(self):
  manifest=json.loads((OUT/'manifest.json').read_text()); self.assertEqual(len(manifest['assets']),9)
  with tempfile.TemporaryDirectory() as tmp:
   generated=Path(tmp)
   subprocess.run(['python3',str(ROOT/'scripts/make-signal-studies.py'),'--out',str(generated)],check=True)
   self.assertEqual({p.name:p.read_bytes() for p in OUT.glob('*.svg')},{p.name:p.read_bytes() for p in generated.glob('*.svg')})
   self.assertEqual((OUT/'manifest.json').read_bytes(),(generated/'manifest.json').read_bytes())
  for item in manifest['assets']:
   raw=(OUT/item['file']).read_bytes();self.assertEqual(hashlib.sha256(raw).hexdigest(),item['sha256'])
   root=ET.fromstring(raw);self.assertEqual(root.attrib['viewBox'],'0 0 128 128')
   for el in root.iter():
    self.assertIn(el.tag.split('}')[-1],['svg','title','g','path'])
    self.assertFalse(any(k.startswith('on') or k.endswith('href') for k in el.attrib))
 def test_palette_does_not_change_geometry(self):
  for name in ['aperture','folio','relay']:
   shapes=[]
   for theme in ['light','dark','mono']:
    root=ET.parse(OUT/f'{name}-r1-{theme}.svg');shapes.append([el.attrib['d'] for el in root.iter() if el.tag.endswith('}path')])
   self.assertEqual(shapes[0],shapes[1]);self.assertEqual(shapes[1],shapes[2])
