# rigpop-forge

![rigpop-forge — one drawing in, a character pack out](docs/assets/hero.png)

![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-339933) ![spec v1](https://img.shields.io/badge/character%20spec-v1-FF4D8D) ![tests](https://img.shields.io/badge/tests-12%20passing-00A676) ![zero dependencies](https://img.shields.io/badge/dependencies-0-FFD23F) ![MIT](https://img.shields.io/badge/license-MIT-blue)

**v0.2 is here:** sheets now cut themselves (`cut`) and talk patches derive
themselves (`facepack`) — see below. Still zero dependencies: the PNG codec
is pure JS on Node's zlib.

**The character factory for the Rigpop family.** Engines were never the
problem — talking busts, agent-rendered videos, full cartoons, ink restyles,
living websites all exist. Making a *character* was the problem: manual in
every app, in a different format in every repo.

Forge fixes that. Author a character **once** as a `character.rigpop.json`
pack ([SPEC.md](SPEC.md)), pass it through the QA gate, export it anywhere.

<p align="center">
  <img src="docs/assets/doodle-swapnil.gif" alt="Doodle Swapnil cycling through her gesture poses" width="300">
</p>

<p align="center"><em>Doodle Swapnil — a real Forge pack (examples/doodle-swapnil), imported from rigpop-talk in one command.</em></p>

## How it flows

![pipeline: drawing, prompts, image model, forge pack, QA gate, talk/agents/motion](docs/assets/pipeline.svg)

## Meet the gesture poses

Every pack ships four full-canvas poses. Talk and Agents fire them from
*words* in the script — no timeline editing:

![wave, point, open and thumbs poses with their trigger words](docs/assets/pose-strip.png)

## What the QA gate actually checks

Exports and packing **refuse** a character that fails QA. The checks that
matter most are geometric — patch image size must equal its rect, rects must
stay on the canvas, base and poses must be exactly canvas-sized:

![anatomy of a pack: base drawing with A, O, E and blink rects, and the patch images themselves](docs/assets/anatomy.png)

A character that animates perfectly and never blinks or speaks is a silent
failure. Forge makes it a loud one.

## Quickstart

```bash
# start a new character (+ all six sheet prompts, generated for you)
node bin/rigpop-forge.js init aarav-2 --out characters/aarav-2 --voice hi-IN-MadhurNeural

# paint the art: prompts/00-model-sheet.md first — it is the reference for
# every other sheet. Then let Forge do the measuring:

node bin/rigpop-forge.js cut characters/aarav-2        # sheets -> parts + motion/rig.json
node bin/rigpop-forge.js facepack characters/aarav-2   # states -> talk patches + rects
node bin/rigpop-forge.js qa characters/aarav-2
node bin/rigpop-forge.js export talk characters/aarav-2 ../rigpop-talk/characters
node bin/rigpop-forge.js export motion characters/aarav-2 ../rigpop-motion
node bin/rigpop-forge.js pack characters/aarav-2 --out dist
```

Already have a character in rigpop-talk or rigpop-agents? Adopt it:

```bash
node bin/rigpop-forge.js import-talk ../rigpop-talk/characters kdswapnil \
  --out examples/doodle-swapnil --name "Doodle Swapnil" --voice en-IN-NeerjaExpressiveNeural
# ✓ imported kdswapnil as a Forge pack at examples/doodle-swapnil — qa: PASS
```

## The commands

| Command | What it does |
| --- | --- |
| `init <id> --out <dir>` | Scaffold a pack: manifest, folders, and all six sheet prompts |
| `prompts <pack>` | Regenerate sheet prompts from the pack's style bible |
| `import-talk <charactersDir> <id>` | Adopt an existing Talk/Agents character (files + characters.json rects) |
| `qa <pack>` | The gate — patch sizes vs rects, on-canvas checks, motion parts, pose-pack keys |
| `export talk\|agents <pack> <out>` | Flat `<id>_*.png` files + merged `characters.json`, exactly where the app expects them |
| `export motion <pack> <out>` | `characters/<id>/` with `rig.json`, pose packs, and a script cast snippet |
| `pack <pack> --out <dir>` | Bundle `<id>.rigpop-pack/` with a sha256 content index (diffable, cacheable) |
| `cut <pack>` | **v0.2** — chroma-key the `sheets/` sheets, cut components in reading order into `parts/`, estimate anchors, write `motion/rig.json` |
| `facepack <pack>` | **v0.2** — diff `states/{A,O,E,blink}.png` against the base and derive the talk patches + rects automatically |

## The sheet prompts

One pose = one generation. Chroma-green ground. A blank face on the head
sheet; eyes and mouths arrive as their own kit. Every prompt repeats the
pack's style bible and passes the model sheet as reference, in a reading
order the auto-cutter understands (`"eyes.open*2"`, `"mouth.laugh>0.47"`).
These are the conventions rigpop-motion's auto-rig was built on — Forge
writes them down and generates them for you.

## The Rigpop family

| Repo | Role |
| --- | --- |
| **rigpop-forge** | Characters *(you are here)* |
| [rigpop-talk](https://github.com/swapagrawal14/rigpop-talk) | Browser app: doodles that talk |
| [rigpop-agents](https://github.com/swapagrawal14/rigpop-agents) | CLI/MCP: scripts in, talking videos out |
| [rigpop-motion](https://github.com/swapagrawal14/rigpop-motion) | Full cartoon animation: hybrid rigs + pose packs |
| [rigpop-ink](https://github.com/swapagrawal14/rigpop-ink) | Footage that redraws itself as ink |
| wowkit | Websites with living Rigpop characters |

## What's new in v0.2

- **`cut`** — the auto-cut + auto-rig port: chroma keying by greenness,
  connected components, speck removal, reading-order label matching
  (including `eyes.open*2` pair parts), tight crops, and a rigpop-motion
  `rig.json` with silhouette-estimated anchors (face ellipse, torso
  neck/shoulders/hip, limb ends, eye/mouth centres, sampled skin/hair).
- **`facepack`** — draw the base once, then draw it again with only the
  mouth (or eyes) changed, per state. Forge diffs, crops and writes the
  patch + rect. On the real Doodle Swapnil art it re-derived a 66×78 rect
  nested inside the original hand-measured 79×79 patch — the tight mouth
  region plus margin, exactly as intended. Drifted state drawings (whole
  canvas changed) are rejected.
- **A pure-JS PNG codec** (`src/pngcodec.mjs`) — decode (grey/RGB/palette/
  alpha, 8/16-bit) + encode on Node's zlib, so Forge keeps zero deps.

## Roadmap

- **v0.3 — wowkit export:** project JSON with joints, from motion anchors.
- **v0.3 — pose-pack face patches:** port rigpop-motion's facepatch so pose
  packs keep blinking and lip-syncing.
- **v0.3 — registry:** publish/discover `.rigpop-pack` characters.
- **Later — rig refinement:** sleeves painted into torsos, rubber-hose limb
  strips (the v3 motion tricks), and anchor hand-tuning UI.

## Tests & visuals

```bash
npm test   # node --test, zero dependencies, Node >= 20
```

The images on this page are generated from the real example pack —
regenerate them with `python3 docs/brand/build-assets.py` (Pillow, dev-only)
whenever the example art changes.

MIT © Swapnil Agrawal. Character art in `examples/` and `docs/assets/` is
Swapnil's own brand art — the code is MIT, please don't reuse the character
as your own brand.
