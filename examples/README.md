# Examples

## doodle-swapnil/ — a real pack, imported not hand-made

Doodle Swapnil (`kdswapnil` in rigpop-talk), imported verbatim from the
rigpop-talk cast with one command:

```bash
node bin/rigpop-forge.js import-talk ../rigpop-talk/characters kdswapnil \
  --out examples/doodle-swapnil --name "Doodle Swapnil" \
  --voice en-IN-NeerjaExpressiveNeural
node bin/rigpop-forge.js prompts examples/doodle-swapnil
node bin/rigpop-forge.js qa examples/doodle-swapnil   # ✓ PASS
```

720×936 canvas, all four gesture poses, patch images matching their rects to
the pixel. Export it back any time:

```bash
node bin/rigpop-forge.js export talk examples/doodle-swapnil /tmp/talk-out
node bin/rigpop-forge.js pack examples/doodle-swapnil --out dist
```

The character art is Swapnil Agrawal's own brand art (also MIT-licensed in
rigpop-talk); please don't reuse the character as your own brand.
