# character.rigpop.json — spec v1

One manifest describes one character for the whole Rigpop family. A character
pack is a folder:

```
<character>/
  character.rigpop.json   the manifest (this spec)
  talk/                   base.png, A.png, O.png, E.png, blink.png,
                          pose_wave.png, pose_point.png, pose_open.png, pose_thumbs.png
  sheets/                 raw generations from prompts/ (not exported)
  parts/                  cut parts for the motion layer (optional)
  poses/<action>/         pose-pack key frames key0.png, key1.png, ... (optional)
  prompts/                sheet prompts (regenerable — `rigpop-forge prompts`)
```

## The talk layer (required)

Talk and Agents already share one de-facto character format; v1 adopts it
unchanged as the core every pack must have:

- `talk.canvas {w, h}` — the base drawing's pixel size.
- `talk.base` — the neutral full drawing. Poses must be the **same canvas,
  same scale, same floor line**.
- `talk.files {A, O, E, blink}` — patch images. Each patch image's PNG size
  must **equal** its rect's `{w, h}`.
- `talk.patches {A, O, E, blink}` — rects `{x, y, w, h}` on the canvas where
  each patch is pasted. Rects must sit fully inside the canvas.
- `talk.poses {wave, point, open, thumbs}` — optional full-canvas gesture
  poses. Talk/Agents trigger them from words (wave: hello/namaste/bye,
  point: idea/tip/first, open: why/what/kyun, thumbs: great/badhiya/yes),
  so a missing pose is a warning, not an error.
- `talk.bg` — optional background colour the apps paint behind the character.

## The motion layer (optional)

- `motion.rig` — path to a rigpop-motion `rig.json`: `parts.*` with
  `file/w/h` and anchors (face ellipse on heads, neck/shoulders/hip on the
  torso, wrist on hands, ankle/sole on feet, centre on eyes and mouths),
  plus sampled `skin`, `skinShade`, `hair`.
- `motion.posePacks [{name, dir, keys}]` — flip-book packs for the moves a
  puppet cannot sell. Rule of the engine: **locomotion = flip-book,
  conversation = cut-out.**
- A rig with no `mouth.A/E/O` or no `eyes.open` part is a QA **error** —
  it would animate and never speak or blink.

## Voice + style

- `voice {engine: "edge-tts", id}` — the free Microsoft Edge voice the
  Agents cast line and Motion scripts use, e.g. `en-IN-NeerjaExpressiveNeural`,
  `hi-IN-SwaraNeural`.
- `style.bible` — the exact style text repeated in every sheet prompt;
  `style.palette`, `style.outfit` feed the prompt generator.

## Rules Forge QA enforces

1. Base and pose images are exactly canvas-sized PNGs.
2. Patch image size == patch rect size, and rects stay on-canvas.
3. Motion parts files exist; pose packs contain `key*.png` frames.
4. `id` is lowercase-dash — it becomes the file prefix (`<id>_base.png`)
   in Talk/Agents and the folder name in Motion.

## Exports

- **talk / agents** — flat `<id>_base.png`, `<id>_A.png`, …,
  `<id>_pose_wave.png`, … plus the entry merged into `characters.json`:
  `{ "<id>": { w, h, bg?, patches: {A, O, E, blink} } }`.
- **motion** — `characters/<id>/rig.json` + pose packs + a `cast-snippet.md`
  with the script cast line.
- **wowkit** — planned (v2): the Rigpop web player takes a project JSON with
  joints; Forge will emit it from the motion layer's anchors.

## Sheets and cutting (v0.2)

`sheets/sheets.json` declares the painted sheets and what is on them, in
reading order:

```json
{ "sheets": [
  { "file": "sheets/head.png", "labels": ["head.front", "head.34", "accessory"] },
  { "file": "sheets/face.png", "labels": ["eyes.open*2", "mouth.A", "..."] }
] }
```

A label may carry `*N` when one part is drawn as N separate components (an
eye pair). `rigpop-forge cut` chroma-keys each sheet (green ground, keyed by
greenness so soft ground shadows go too), drops specks, reads components in
reading order, and writes `parts/<label>.png` plus a `motion/rig.json` whose
anchors are **estimates** from the silhouettes (face ellipse, torso
neck/shoulders/hip, limb end points, eye/mouth centres, sampled skin/hair).
Component count must equal label count — a mismatch is an error telling you
the sheet or the labels need fixing.

## Talk states and facepack (v0.2)

`states/{A,O,E,blink}.png` are full-canvas drawings identical to the base
except the one feature that changes. `rigpop-forge facepack` diffs each
state against the base, crops the changed region (plus a margin), and writes
`talk/<kind>.png` + its rect. A state differing over more than 45% of the
canvas is rejected as drifted. This replaces hand-measuring patch rects.

## WowKit export (v0.3)

`export wowkit` writes a WowKit v2 project: the talk base as
`assets/cast/<id>-cutout.png` and `projects/cast/<id>.json` with the
15-joint skeleton (hip/spine/head, arms, legs). Joint positions are
estimates from the pack's face geometry, flagged in the project's `forge`
note, and the animation is a generated gentle-sway loop (rot in degrees,
33 keys over 2.4 s, the built-in cast's units).

## Pose-pack face patches (v0.3)

A pose pack (motion layer) may carry per-key face patches so it keeps
blinking and lip-syncing while it plays:

```
poses/<action>/key0.png  key0.blink.png  key0.m.rest|M|A|O|E.png  pack.json
```

`pack.json` records the pack's face rect and the derived eyes/mouth rects
plus the patch index. `rigpop-forge facepacks` builds the tiles: each is
filled with the skin colour sampled in a ring around its rect on that key,
with the pack's cut face-kit part composited on top. A pose pack declares
its normalised face region once, as `motion.posePacks[].face` `{x,y,w,h}`.

## Registry (v0.3)

A registry is a folder: `packs/<id>.rigpop-pack/`, a `registry.json`
catalog (`{format: "rigpop-registry", version: 1, packs: [...]}`) and a
static `index.html` gallery. `publish` QA-packs a character into it;
`registry build` regenerates the catalog and gallery.

## Fetch, tune, normalise (v0.4)

`fetch <registry> <id>` pulls a pack from a registry (local folder or
http(s) base URL, e.g. GitHub Pages) and verifies every file against the
sha256 in the pack's `pack.json` index before writing it.

`tune` is the anchor-tuning surface for a motion rig: it lists every
anchor value (`<part>:<path> = n`), applies `--set <part>:<path>=<number>`
edits (clearing `anchorsEstimated` once a human has tuned), and renders
`motion/rig-preview.png`, a parts contact sheet with anchor points drawn
on.

`normalise` puts a pose pack's keys on one figure height and one floor
line (bbox bottoms aligned, figures centred, one shared canvas). Face
rects are moved by the average transform; stale face tiles are removed
and must be rebuilt with `facepacks`.

## Versioning

`spec: 1`. Breaking changes bump the integer; exporters refuse nothing —
QA reports the mismatch as an error so old packs fail loudly, not silently.
