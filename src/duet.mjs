// duet: two Forge packs -> one duet bundle for two-character scenes.
//
//   <out>/characters/    both characters in talk format (+ merged
//                        characters.json) — Talk's duet stage reads this
//   <out>/duet.json      the scene: stage size and each character's
//                        placement (scaled to a common height, floor
//                        aligned, left/right), with their cast voices
//   <out>/script.md      a starter dialogue in rigpop-agents script
//                        format, tagged by character id
//   <out>/README.md      how to play/render it
//
// Both packs must pass QA first (the CLI enforces it, like exports).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './manifest.mjs';
import { exportTalkFamily } from './exporters.mjs';

const STAGE_H = 960, CHAR_H = 880, GAP = 60;

export function buildDuet(packDirA, packDirB, outDir, { name = null } = {}) {
  const a = loadManifest(packDirA), b = loadManifest(packDirB);
  if (a.id === b.id) throw new Error('a duet needs two DIFFERENT characters (both packs have the same id)');
  const charsDir = join(outDir, 'characters');
  mkdirSync(charsDir, { recursive: true });
  exportTalkFamily(a, packDirA, charsDir, 'talk');
  exportTalkFamily(b, packDirB, charsDir, 'talk');

  const place = (m, side, stageW) => {
    const scale = CHAR_H / m.talk.canvas.h;
    const w = Math.round(m.talk.canvas.w * scale);
    const cx = side === 'left' ? Math.round(stageW * 0.27) : Math.round(stageW * 0.73);
    return { id: m.id, name: m.name, side, x: cx - Math.round(w / 2), y: STAGE_H - CHAR_H - 20, w, h: CHAR_H, scale: Math.round(scale * 1000) / 1000, voice: m.voice || null };
  };
  const wA = Math.round(a.talk.canvas.w * (CHAR_H / a.talk.canvas.h));
  const wB = Math.round(b.talk.canvas.w * (CHAR_H / b.talk.canvas.h));
  const stageW = Math.max(1280, wA + wB + GAP * 3);
  const duet = {
    format: 'rigpop-duet', spec: 1,
    name: name || `${a.name} & ${b.name}`,
    stage: { w: stageW, h: STAGE_H, floor: STAGE_H - 20 },
    cast: [place(a, 'left', stageW), place(b, 'right', stageW)],
    charactersDir: 'characters',
  };
  writeFileSync(join(outDir, 'duet.json'), JSON.stringify(duet, null, 2) + '\n');
  writeFileSync(join(outDir, 'script.md'),
    `# ${duet.name}\n\n[${a.id}] Hi! I'm ${a.name}.\n[${b.id}] And I'm ${b.name}. This is our first scene together.\n[${a.id}] Replace these lines with your dialogue — one speaker per line, tagged like this.\n[${b.id}] Then render us with rigpop-talk's duet stage or rigpop-agents.\n`);
  writeFileSync(join(outDir, 'README.md'),
    `# ${duet.name} — a rigpop-forge duet bundle\n\n- \`characters/\` — both characters in rigpop-talk format (merged characters.json).\n- \`duet.json\` — stage size + placements (common height ${CHAR_H}px, floor-aligned) + cast voices.\n- \`script.md\` — starter dialogue; lines are tagged \`[character-id]\`.\n\nPoint rigpop-talk's duet stage at \`characters/\`, or feed \`script.md\` to rigpop-agents.\n`);
  return duet;
}
