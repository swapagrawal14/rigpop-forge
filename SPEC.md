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

## Versioning

`spec: 1`. Breaking changes bump the integer; exporters refuse nothing —
QA reports the mismatch as an error so old packs fail loudly, not silently.
