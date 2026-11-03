# Bubbles the Fishbowl Girl

A rigpop-forge character pack. Generate the art with `prompts/`:

- Sheets (head/body/face) go in `sheets/` with `sheets/sheets.json` — `rigpop-forge cut .` turns them into `parts/` + `motion/rig.json`.
- Talk states go in `states/` (the base drawing with only the mouth/eyes changed) — `rigpop-forge facepack .` derives the patches + rects.
- The talk base + poses go in `talk/`.

Then:

```
rigpop-forge qa .
rigpop-forge export talk ../rigpop-talk/characters
```
