// init: scaffold a fresh character pack — manifest with the geometry left
// to fill in, the folder layout, and the sheet prompts that produce the art.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sheetPrompts } from './prompts.mjs';

export function initCharacter(outDir, opts) {
  if (existsSync(join(outDir, 'character.rigpop.json')))
    throw new Error(`${outDir} already has a character.rigpop.json — refusing to overwrite`);
  for (const sub of ['talk', 'sheets', 'parts', 'poses', 'prompts'])
    mkdirSync(join(outDir, sub), { recursive: true });

  const manifest = {
    spec: 1,
    id: opts.id,
    name: opts.name || opts.id,
    author: opts.author || 'Swapnil Agrawal',
    license: 'MIT',
    talk: {
      canvas: { w: opts.w || 720, h: opts.h || 960 },
      base: 'talk/base.png',
      files: { A: 'talk/A.png', O: 'talk/O.png', E: 'talk/E.png', blink: 'talk/blink.png' },
      // Placeholder rects: measure them on YOUR base drawing, then run qa.
      patches: {
        A: { x: 0, y: 0, w: 100, h: 80 },
        O: { x: 0, y: 0, w: 80, h: 70 },
        E: { x: 0, y: 0, w: 100, h: 70 },
        blink: { x: 0, y: 0, w: 160, h: 60 },
      },
      poses: { wave: 'talk/pose_wave.png', point: 'talk/pose_point.png', open: 'talk/pose_open.png', thumbs: 'talk/pose_thumbs.png' },
    },
    voice: { engine: 'edge-tts', id: opts.voice || 'en-IN-NeerjaExpressiveNeural' },
    style: {
      bible: opts.bible || 'bold black outlines, flat colours, big round eyes, hand-drawn doodle charm',
      palette: [],
      outfit: opts.outfit || '',
    },
  };
  writeFileSync(join(outDir, 'character.rigpop.json'), JSON.stringify(manifest, null, 2) + '\n');
  const prompts = sheetPrompts(manifest);
  for (const [file, text] of Object.entries(prompts))
    writeFileSync(join(outDir, 'prompts', file), text);
  writeFileSync(join(outDir, 'README.md'),
    `# ${manifest.name}\n\nA rigpop-forge character pack. Generate the art with \`prompts/\`, drop the talk pack into \`talk/\`,\nmeasure the patch rects into \`character.rigpop.json\`, then run:\n\n\`\`\`\nrigpop-forge qa .\nrigpop-forge export talk ../rigpop-talk/characters\n\`\`\`\n`);
  return manifest;
}
