// import-talk: adopt an existing rigpop-talk / rigpop-agents character.
// Those apps already share one de-facto format — flat files
//   <id>_base.png  <id>_A.png <id>_O.png <id>_E.png <id>_blink.png
//   <id>_pose_wave.png <id>_pose_point.png <id>_pose_open.png <id>_pose_thumbs.png
// plus an entry in characters.json { w, h, bg?, patches: {A,O,E,blink} }.
// This reads that format and writes a Forge pack (files copied into the pack
// layout + a character.rigpop.json manifest), so every existing cast member
// becomes a first-class Forge character in one command.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TALK_PATCHES, TALK_POSES } from './manifest.mjs';

export function importTalk(srcDir, id, outDir, opts = {}) {
  const indexPath = join(srcDir, 'characters.json');
  if (!existsSync(indexPath)) throw new Error(`no characters.json in ${srcDir}`);
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const entry = index[id];
  if (!entry) throw new Error(`characters.json has no "${id}" (has: ${Object.keys(index).join(', ')})`);

  mkdirSync(join(outDir, 'talk'), { recursive: true });
  const copy = (srcName, destRel) => {
    const src = join(srcDir, srcName);
    if (!existsSync(src)) return null;
    copyFileSync(src, join(outDir, destRel));
    return destRel;
  };

  const files = {};
  const base = copy(`${id}_base.png`, 'talk/base.png');
  if (!base) throw new Error(`missing ${id}_base.png in ${srcDir}`);
  for (const p of TALK_PATCHES) {
    const rel = copy(`${id}_${p}.png`, `talk/${p}.png`);
    if (!rel) throw new Error(`missing ${id}_${p}.png in ${srcDir} — a talk character without a ${p} patch cannot ${p === 'blink' ? 'blink' : 'speak'}`);
    files[p] = rel;
  }
  const poses = {};
  for (const pose of TALK_POSES) {
    const rel = copy(`${id}_pose_${pose}.png`, `talk/pose_${pose}.png`);
    if (rel) poses[pose] = rel;
  }

  const manifest = {
    spec: 1,
    id: opts.newId || id,
    name: opts.name || id,
    author: opts.author || 'Swapnil Agrawal',
    license: 'MIT',
    talk: {
      canvas: { w: entry.w, h: entry.h },
      ...(entry.bg ? { bg: entry.bg } : {}),
      base: 'talk/base.png',
      files,
      patches: Object.fromEntries(TALK_PATCHES.map((p) => [p, entry.patches[p]])),
      poses,
    },
    ...(opts.voice ? { voice: { engine: 'edge-tts', id: opts.voice } } : {}),
    style: { bible: opts.bible || '' },
    forgedFrom: { app: 'rigpop-talk', id, importedAt: new Date().toISOString().slice(0, 10) },
  };
  writeFileSync(join(outDir, 'character.rigpop.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
