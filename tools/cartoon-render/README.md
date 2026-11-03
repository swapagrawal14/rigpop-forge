# cartoon-render — Forge packs → cartoon episodes

An optional Python tool (not part of the zero-dependency Node CLI) that
renders a full cartoon episode from Forge character packs: staged scenes,
a moving camera, walking entrances, phrase-level gestures, reactions, and
audio-envelope lip-sync.

```
python3 render.py examples/family-episode-1 [packs_dir] [out.mp4]
```

- `packs_dir` defaults to the repo's `examples/`. Characters load from each
  pack's `character.rigpop.json` — pose art, patches, voice-agnostic.
- A project is `script.json` (scenes, lines, stage marks), `shots.json`
  (camera + staging per line range), `voices.json` (Piper casting), and
  `assets/` background plates. See `examples/family-episode-1/`, the
  Agrawal family pilot (2:51, 3 scenes, 28 shots).
- Lip-sync placement uses the pack's **`talk.poseAnchors`** (spec v1,
  v0.7+) — mouth/eye centres measured per pose. Packs without anchors fall
  back to the base patch rects for all poses, which visibly drifts on
  gesture poses; anchors are the production path.
- Poses play at one figure height per character: keep pack pose art
  normalised (same tight-bbox height + floor per pose) or characters will
  grow/shrink between gestures.

Requires: Python 3 + Pillow + numpy, ffmpeg, and Piper TTS
(`pip install piper-tts`; voice models in `$PIPER_VOICES`, default
`~/.piper-voices`). Any TTS that can write per-line WAVs into
`<project>/audio/lNN.wav` can replace Piper — the renderer only reads the
WAVs. Line audio is cached; delete `audio/` to re-voice.

Shot camera forms: `[cx0, cy0, z0, cx1, cy1, z1]` (stage-space pan/zoom),
`["closeup", charId, z0, z1]`, `["two", charA, charB, z0, z1]`.
Cast entries: `null` (waiting at the mark) or
`{"enter": [fromX, delaySec, walkSec]}`. `react` entries make listeners
strike a pose on a punchline's tail: `[lineIdx, [charIds], pose]`.
