# Landing page artwork

The landing page uses StageShow stills. The desktop composition shows the List and Canva's inspector. The compact composition puts the same inspector over a shorter list. The site loads one WebP according to viewport width.

## Update a capture

From the repo root, install StageShow and copy it to a temporary directory for preview. `skills-lock.json` records the kit revision used for these stills.

```sh
npx skills add benjitaylor/skills --skill stageshow --agent codex --yes
ATLAS_STAGE_ROOT=$(mktemp -d)
cp -R .agents/skills/stageshow "$ATLAS_STAGE_ROOT/kit"
ATLAS_STAGE_EXAMPLE="$ATLAS_STAGE_ROOT/kit/examples/atlas-landing"
mkdir -p "$ATLAS_STAGE_EXAMPLE/assets"
cp docs/design/landing-stage/{index.tsx,stage.css} "$ATLAS_STAGE_EXAMPLE/"
cp web/assets/fonts/editorial/{inter,newsreader}-variable.woff2 "$ATLAS_STAGE_EXAMPLE/assets/"
cp web/assets/logos/{alloovium.png,culture-amp.svg} "$ATLAS_STAGE_EXAMPLE/assets/"
cd "$ATLAS_STAGE_ROOT/kit"
npm ci
npx vite playground --config playground/vite.config.ts --port 5179 --strictPort
```

In another terminal, run the kit's filmer from that temporary copy. It uses installed Chrome. Confirm the labels and the inspector are fully visible at both widths before encoding the stills.

```sh
node scripts/film.mjs 'http://127.0.0.1:5179/?capture=atlas-landing' --still --width 660 --pad 0 --out /tmp/atlas-list-wide.png
node scripts/film.mjs 'http://127.0.0.1:5179/?capture=atlas-landing' --still --width 358 --pad 0 --out /tmp/atlas-list-compact.png
```

From the repo root, replace the files in `web/assets/landing/` and run the site build and browser suite.

```sh
cwebp -quiet -q 89 /tmp/atlas-list-wide.png -o web/assets/landing/atlas-list-wide.webp
cwebp -quiet -q 89 /tmp/atlas-list-compact.png -o web/assets/landing/atlas-list-compact.webp
npm run build
node scripts/test-atlas-views-browser.mjs
```

Artwork facts come from the company profiles and [technology research](../../../data/treemap-evidence.json). Keep the copy aligned with those records when changing the featured company or people.
