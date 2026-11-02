# AGENTS.md — working in rigpop-forge

Read this first. Forge is the character factory for the Rigpop family
(rigpop-talk, rigpop-agents, rigpop-motion, wowkit, swap-studio).

## The rules

1. **One format, every app.** `character.rigpop.json` (SPEC.md) is the single
   source of truth for a character. Never invent a per-app character file —
   extend the spec and the exporters instead.
2. **The talk layer is the core.** Talk/Agents' de-facto format (base +
   A/O/E/blink patches + gesture poses + characters.json rects) is spec v1's
   required layer. Do not break its invariants: patch image size == rect
   size, base/poses exactly canvas-sized, rects on-canvas.
3. **QA is the gate.** Exports and packing refuse characters that fail
   `rigpop-forge qa`. A missing blink/mouth patch is an error, never a
   warning — that is the silent bug this repo exists to kill.
4. **Zero runtime dependencies.** Node >= 20 standard library only (the PNG
   reader is an IHDR header parse on purpose). Tests run with `node --test`.
5. **Prompts are generated, not hand-edited.** Sheet prompts come from
   `src/prompts.mjs` + the pack's style bible; regenerate with
   `rigpop-forge prompts`.

## Layout

```
bin/rigpop-forge.js   CLI: init · prompts · import-talk · qa · export · pack
src/png.mjs           IHDR dimension reader
src/manifest.mjs      manifest load, structural validation, talk entry/files
src/prompts.mjs       sheet prompts (model/head/body/face/talk pack/pose pack)
src/importTalk.mjs    adopt a talk/agents character as a Forge pack
src/qa.mjs            the QA gate (talk + motion layers)
src/exporters.mjs     talk/agents flat files + characters.json; motion layout
src/pack.mjs          .rigpop-pack bundle with sha256 index
src/pngcodec.mjs      pure-JS PNG decode/encode (stdlib zlib) — v0.2
src/imageops.mjs      chroma key, connected components, reading order, crop
src/cut.mjs           sheets -> parts, via sheets/sheets.json labels
src/autorig.mjs       silhouette anchor estimates -> motion rig.json
src/facepack.mjs      states diff -> talk patches + rects
examples/             real, QA-passing packs — keep them passing
test/                 node --test suites; run before every push
```

## Before you push

`npm test`, plus `node bin/rigpop-forge.js qa examples/doodle-swapnil` must PASS.
