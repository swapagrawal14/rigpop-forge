# rigpop-forge

**One drawing in, a character pack out — for every Rigpop app.**

The Rigpop family grew an engine for everything — talking busts
([rigpop-talk](https://github.com/swapagrawal14/rigpop-talk)), agent-rendered
videos ([rigpop-agents](https://github.com/swapagrawal14/rigpop-agents)),
full cartoons ([rigpop-motion](https://github.com/swapagrawal14/rigpop-motion)),
ink restyles, websites — but making a *character* stayed manual in every
single one: tap the mouth here, write sheet prompts there, prep art somewhere
else, and pray the blink patch is the right size.

Forge is the missing front door. A character is authored **once** as a
`character.rigpop.json` pack ([SPEC.md](SPEC.md)), checked by a QA gate, and
exported to whichever app needs it.

```
   drawing / photo
        │
        ▼
  ┌─────────────┐   prompts    ┌──────────────┐
  │  rigpop-    │ ───────────▶ │ image model  │ paints model/head/body/
  │  forge      │              │ (any)        │ face sheets + talk pack
  │             │ ◀─────────── └──────────────┘
  │  init       │   sheets
  │  prompts    │
  │  import-talk│ ───────────▶ existing talk/agents cast becomes packs
  │  qa   ◀── the gate: patch rects, PNG sizes, motion parts, pose packs
  │  export     │ ───────────▶ talk/ · agents/ · motion/ layouts
  │  pack       │ ───────────▶ <id>.rigpop-pack/ with a sha256 index
  └─────────────┘
```

## Quickstart

```bash
# start a new character
node bin/rigpop-forge.js init aarav-2 --out characters/aarav-2 --voice hi-IN-MadhurNeural

# generate the art: prompts/00-model-sheet.md first (it is the reference
# for every other sheet), then 01..05. Drop the talk pack into talk/,
# measure the mouth/blink rects into character.rigpop.json, then:

node bin/rigpop-forge.js qa characters/aarav-2
node bin/rigpop-forge.js export talk characters/aarav-2 ../rigpop-talk/characters
node bin/rigpop-forge.js export motion characters/aarav-2 ../rigpop-motion
node bin/rigpop-forge.js pack characters/aarav-2 --out dist
```

Already have a character in rigpop-talk or rigpop-agents? Adopt it:

```bash
node bin/rigpop-forge.js import-talk ../rigpop-talk/characters kdswapnil \
  --out examples/doodle-swapnil --name "Doodle Swapnil" --voice en-IN-NeerjaExpressiveNeural
# ✓ imported kdswapnil as a Forge pack — qa: PASS
```

That is exactly how `examples/doodle-swapnil/` in this repo was made — a real,
QA-passing pack you can export straight back out.

## The commands

| Command | What it does |
| --- | --- |
| `init <id> --out <dir>` | Scaffold a pack: manifest, folders, and all six sheet prompts |
| `prompts <pack>` | Regenerate sheet prompts from the pack's style bible |
| `import-talk <charactersDir> <id>` | Adopt an existing Talk/Agents character (files + characters.json rects) |
| `qa <pack>` | The gate — errors: missing/mis-sized patches, off-canvas rects, missing motion parts or pose-pack keys. Warnings: missing gesture poses, no voice |
| `export talk\|agents <pack> <out>` | Flat `<id>_*.png` files + merged `characters.json`, exactly where the app expects them |
| `export motion <pack> <out>` | `characters/<id>/` with `rig.json`, pose packs, and a script cast snippet |
| `pack <pack> --out <dir>` | Bundle `<id>.rigpop-pack/` with a sha256 content index (diffable, cacheable) |

Exports and packing **refuse** a character that fails QA. A character that
animates perfectly and never blinks or speaks is a silent failure — Forge
makes it a loud one.

## The sheet prompts

One pose = one generation. Chroma-green ground. A blank face on the head
sheet; eyes and mouths arrive as their own kit. Every prompt repeats the
pack's style bible and passes the model sheet as reference, in reading
order the auto-cutter understands (`"eyes.open*2"`, `"mouth.laugh>0.47"`).
These are the conventions rigpop-motion's auto-rig was built on — Forge
just writes them down and generates them for you.

## The Rigpop family

| Repo | Role |
| --- | --- |
| **rigpop-forge** | Characters *(you are here)* |
| [rigpop-talk](https://github.com/swapagrawal14/rigpop-talk) | Browser app: doodles that talk |
| [rigpop-agents](https://github.com/swapagrawal14/rigpop-agents) | CLI/MCP: scripts in, talking videos out |
| [rigpop-motion](https://github.com/swapagrawal14/rigpop-motion) | Full cartoon animation: hybrid rigs + pose packs |
| [rigpop-ink](https://github.com/swapagrawal14/rigpop-ink) | Footage that redraws itself as ink |
| wowkit | Websites with living Rigpop characters |

## Roadmap

- **v0.2 — auto-cut + autorig port:** chroma keying, connected components and
  pivot-finding from rigpop-motion's `src/v3`, so sheets become parts without
  leaving Forge.
- **v0.2 — face-patch maker:** derive blink/mouth patches + rects from the
  face kit automatically (today rects are measured in rigpop-talk).
- **v0.3 — wowkit export:** project JSON with joints, from motion anchors.
- **v0.3 — registry:** publish/discover `.rigpop-pack` characters.

## Tests

```bash
npm test   # node --test, zero dependencies, Node >= 20
```

MIT © Swapnil Agrawal. Character art in `examples/` is Swapnil's own brand
art — the code is MIT, please don't reuse the character as your own brand.
