# Media coverage report

Generated 2026-11-27 from data revision 15e0b22 by `npm run report:media-coverage` (#85).
Counts are computed from the committed records, `web/logos.js`, the public asset
manifests in `web/assets/manifests/` and the published graph — not from live fetches.

Stages, per entity: **discovered** = a source-attributed image reference exists;
**published** = the reference points at a repository-local asset; **downloaded** =
that asset file exists in `web/`; **approved** = a public manifest covers it with
identity and rights both approved; **rendered** = graph artwork for the entity
resolves to an existing local file (no initials fallback).

| Entity kind | Total | Discovered | Published | Downloaded | Approved | Rendered |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Startup logos | 55 | 53 (96%) | 53 (96%) | 53 (96%) | 40 (73%) | 53 (96%) |
| Partner logos | 11 | 10 (91%) | 10 (91%) | 10 (91%) | 8 (73%) | 10 (91%) |
| Provider logos | 92 | 46 (50%) | 46 (50%) | 46 (50%) | 7 (8%) | 46 (50%) |
| Portfolio company logos | 46 | 14 (30%) | 3 (7%) | 3 (7%) | 0 (0%) | 44 (96%) |
| Portraits (founders & partner people) | 146 | 104 (71%) | 98 (67%) | 98 (67%) | 98 (67%) | 98 (67%) |

Public asset manifests on file: 154.
Rendered can exceed a kind's own discovered count where the graph carries an image
reference from another record (for example a partner portfolio listing) that the
kind's own records do not carry.

## Startup logos

<details><summary>Not downloaded (2)</summary>

- PsiQuantum — no source-attributed image reference
- Remi AI — no source-attributed image reference

</details>

<details><summary>Downloaded but not manifest-approved (13)</summary>

- Canva — no public asset manifest
- Fusion Books — no public asset manifest
- Airwallex — no public asset manifest
- Draper — no public asset manifest
- Gilmour Space — no public asset manifest
- Go1 — no public asset manifest
- Cauldron — no public asset manifest
- Wise — no public asset manifest
- Revolut — no public asset manifest
- UiPath — no public asset manifest
- Eucalyptus — no public asset manifest
- Loam Bio — no public asset manifest
- FloodMapp — no public asset manifest

</details>

## Partner logos

<details><summary>Not downloaded (1)</summary>

- Main Sequence — no source-attributed image reference

</details>

<details><summary>Downloaded but not manifest-approved (2)</summary>

- Blackbird Ventures — no public asset manifest
- Startmate — no public asset manifest

</details>

## Provider logos

<details><summary>Not downloaded (46)</summary>

- AI Grant — no source-attributed image reference
- ANDHealth — no source-attributed image reference
- Australian government — no source-attributed image reference
- Barayamal — no source-attributed image reference
- BytePlus — no source-attributed image reference
- CSIRO — no source-attributed image reference
- CSIRO / Australian government — no source-attributed image reference
- Carthona Capital — no source-attributed image reference
- Department for Promotion of Industry and Internal Trade — no source-attributed image reference
- EWOR — no source-attributed image reference
- Enterprise Singapore — no source-attributed image reference
- Entrepreneur First — no source-attributed image reference
- First Australians Capital — no source-attributed image reference
- First Nations Economics — no source-attributed image reference
- Founders Inc — no source-attributed image reference
- Futurpreneur — no source-attributed image reference
- Generation AI — no source-attributed image reference
- Government e-Marketplace — no source-attributed image reference
- Government of India — no source-attributed image reference
- Government of Western Australia — Department of Water and Environmental Regulation — no source-attributed image reference
- Illume Ventures — no source-attributed image reference
- Innovation Victoria — no source-attributed image reference
- Innovative Solutions Canada / Shared Services Canada — no source-attributed image reference
- Loughborough University — no source-attributed image reference
- MLAI — no source-attributed image reference
- Melbourne Accelerator Program — no source-attributed image reference
- National Research Council Canada — no source-attributed image reference
- Northern Territory Government — no source-attributed image reference
- Northern Territory government — no source-attributed image reference
- On Deck — no source-attributed image reference
- Pacific Economic Development Canada — no source-attributed image reference
- Press Play Ventures — no source-attributed image reference
- Queensland Government — no source-attributed image reference
- STATION F — no source-attributed image reference
- Side Stage Ventures — no source-attributed image reference
- South Australian Government — no source-attributed image reference
- South Australian Office for Small and Family Business — no source-attributed image reference
- South Park Commons — no source-attributed image reference
- StartX — no source-attributed image reference
- Startup SG — no source-attributed image reference
- State Library Victoria — no source-attributed image reference
- Supabase — no source-attributed image reference
- TechSpark and West of England Mayoral Combined Authority — no source-attributed image reference
- UK government — no source-attributed image reference
- UMi — no source-attributed image reference
- Z Fellows — no source-attributed image reference

</details>

<details><summary>Downloaded but not manifest-approved (39)</summary>

- Alibaba Cloud — no public asset manifest
- Amazon Web Services — no public asset manifest
- Anthropic — no public asset manifest
- Antler — no public asset manifest
- Atlassian — no public asset manifest
- Baseten — no public asset manifest
- Blackbird — no public asset manifest
- Cerebras — no public asset manifest
- Cloudflare — no public asset manifest
- Cognition — no public asset manifest
- DeepInfra — no public asset manifest
- Deepgram — no public asset manifest
- DigitalOcean — no public asset manifest
- ElevenLabs — no public asset manifest
- Fireworks AI — no public asset manifest
- Fly.io — no public asset manifest
- GitHub — no public asset manifest
- Google Cloud — no public asset manifest
- Google for Startups — no public asset manifest
- HubSpot — no public asset manifest
- Intercom — no public asset manifest
- Linear — no public asset manifest
- Microsoft — no public asset manifest
- Modal — no public asset manifest
- MongoDB — no public asset manifest
- NVIDIA — no public asset manifest
- Nebius — no public asset manifest
- Neon — no public asset manifest
- Notion — no public asset manifest
- OpenAI — no public asset manifest
- Oracle — no public asset manifest
- PostHog — no public asset manifest
- Replit — no public asset manifest
- Startmate — no public asset manifest
- Stripe — no public asset manifest
- Together AI — no public asset manifest
- Vercel — no public asset manifest
- Vultr — no public asset manifest
- xAI — no public asset manifest

</details>

## Portfolio company logos

<details><summary>Not downloaded (43)</summary>

- Airwallex (Airtree) — reference is remote-only, no local asset published
- Go1 (Airtree) — reference is remote-only, no local asset published
- Eucalyptus (Airtree) — reference is remote-only, no local asset published
- Canva (Airtree) — reference is remote-only, no local asset published
- Canva (Blackbird Ventures) — reference is remote-only, no local asset published
- Culture Amp (Blackbird Ventures) — no source-attributed image reference
- Gilmour Space (Blackbird Ventures) — reference is remote-only, no local asset published
- PsiQuantum (Blackbird Ventures) — no source-attributed image reference
- PI.EXCHANGE (Boab AI) — no source-attributed image reference
- Remi AI (Boab AI) — no source-attributed image reference
- Strongroom AI (Boab AI) — no source-attributed image reference
- Synthesia (Seedcamp) — no source-attributed image reference
- Canva (Square Peg) — reference is remote-only, no local asset published
- Cuttable (Square Peg) — no source-attributed image reference
- Loam Bio (Main Sequence) — reference is remote-only, no local asset published
- Cauldron (Main Sequence) — reference is remote-only, no local asset published
- ULUU (Main Sequence) — reference is remote-only, no local asset published
- Goterra (Rampersand) — no source-attributed image reference
- JigSpace (Rampersand) — no source-attributed image reference
- Quantum Brilliance (Rampersand) — no source-attributed image reference
- ENA Respiratory (Brandon Capital) — no source-attributed image reference
- Bugcrowd (Startmate) — reference is remote-only, no local asset published
- Morse Micro (Startmate) — no source-attributed image reference
- Puralink (Startmate) — no source-attributed image reference
- Alloovium (Startmate) — no source-attributed image reference
- Ascenda (Startmate) — no source-attributed image reference
- Brainwaves (Startmate) — no source-attributed image reference
- cascayd (Startmate) — no source-attributed image reference
- CheckGen (Startmate) — no source-attributed image reference
- CrossCourtAI (Startmate) — no source-attributed image reference
- Deeligence (Startmate) — no source-attributed image reference
- Neuralindex (Startmate) — no source-attributed image reference
- Guin (Startmate) — no source-attributed image reference
- Tendor (Startmate) — no source-attributed image reference
- FlowGo (Startmate) — no source-attributed image reference
- iBnkVault (Startmate) — no source-attributed image reference
- Lockii (Startmate) — no source-attributed image reference
- Superstat (Startmate) — no source-attributed image reference
- Draper (Startmate) — no source-attributed image reference
- Thermal Dawn (Startmate) — no source-attributed image reference
- Vixia (Startmate) — no source-attributed image reference
- Evatto (Startmate) — no source-attributed image reference
- Zabidou (Startmate) — no source-attributed image reference

</details>

<details><summary>Downloaded but not manifest-approved (3)</summary>

- Revolut (Seedcamp) — no public asset manifest
- Wise (Seedcamp) — no public asset manifest
- UiPath (Seedcamp) — no public asset manifest

</details>

## Portraits (founders & partner people)

<details><summary>Not downloaded (48)</summary>

- Elicia McDonald (Airtree) — no source-attributed image reference
- Craig Blair (Airtree) — no source-attributed image reference
- James Cameron (Airtree) — no source-attributed image reference
- Jackie Vullinghs (Airtree) — no source-attributed image reference
- Niki Scevak (Blackbird Ventures) — no source-attributed image reference
- Paul Bassat (Square Peg) — no source-attributed image reference
- Bill Bartee (Main Sequence) — reference is remote-only, no local asset published
- Elaine Stead (Main Sequence) — no source-attributed image reference
- Paul Naphtali (Rampersand) — no source-attributed image reference
- Creel Price (Investible) — no source-attributed image reference
- Jeremy Colless (Artesian) — no source-attributed image reference
- Matt Clunies-Ross (Artesian) — no source-attributed image reference
- John McCartney (Artesian) — no source-attributed image reference
- Phoebe Pincus (Startmate) — reference is remote-only, no local asset published
- Ben Simai (Startmate) — reference is remote-only, no local asset published
- Emma Grife (Startmate) — reference is remote-only, no local asset published
- Chris Raethke (Bugcrowd) — no source-attributed image reference
- Sergei Belokamen (Bugcrowd) — no source-attributed image reference
- Michael De Nil (Morse Micro) — reference is remote-only, no local asset published
- Andrew Terry (Morse Micro) — reference is remote-only, no local asset published
- Tom McKenzie (Brainwaves) — no source-attributed image reference
- Oliver Wright (CheckGen) — no source-attributed image reference
- Naveed Nekoo (Neuralindex) — no source-attributed image reference
- Mat Heywood (Neuralindex) — no source-attributed image reference
- Son Duong (Neuralindex) — no source-attributed image reference
- Manishankar R (Guin) — no source-attributed image reference
- Jason Cai (Tendor) — no source-attributed image reference
- Jason Hor (FlowGo) — no source-attributed image reference
- Ivy Fan (iBnkVault) — no source-attributed image reference
- Yi Zhang (iBnkVault) — no source-attributed image reference
- Cordelia King (Superstat) — no source-attributed image reference
- Kai Bloomfield (Superstat) — no source-attributed image reference
- Sam Hung (Superstat) — no source-attributed image reference
- Linda Zeniou (Thermal Dawn) — no source-attributed image reference
- Matthew Eyles (Vixia) — no source-attributed image reference
- Storm Drury (Vixia) — no source-attributed image reference
- Chris Hood (Go1) — no source-attributed image reference
- Taavet Hinrikus (Wise) — no source-attributed image reference
- Benny Kleist (Eucalyptus) — no source-attributed image reference
- Alexey Mitko (Eucalyptus) — no source-attributed image reference
- Numa Bertron (JigSpace) — no source-attributed image reference
- Frank Oly (Loam Bio) — no source-attributed image reference
- Jack White (Cuttable) — no source-attributed image reference
- Kieran Start (Strongroom AI) — no source-attributed image reference
- Mark Feldschuh (Strongroom AI) — no source-attributed image reference
- Thien Long Tran (Puralink) — no source-attributed image reference
- Quan Pham (PI.EXCHANGE) — no source-attributed image reference
- Amar Shah (Wayve) — no source-attributed image reference

</details>
