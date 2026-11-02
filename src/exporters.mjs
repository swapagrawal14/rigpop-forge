// Exporters: Forge pack -> the layouts the family apps already eat.
//   talk / agents : flat <id>_*.png files + a merged characters.json entry
//   motion        : characters/<id>/ with rig.json + pose packs, plus a
//                   cast-line snippet for a rigpop-motion script
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TALK_PATCHES, TALK_POSES, talkEntry, talkFileName } from './manifest.mjs';

function copyIf(src, dest) {
  if (!existsSync(src)) return false;
  mkdirSync(join(dest, '..'), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

export function exportTalkFamily(m, packDir, outDir, app) {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  const put = (kind, rel) => {
    if (copyIf(join(packDir, rel), join(outDir, talkFileName(m, kind)))) written.push(talkFileName(m, kind));
  };
  put('base', m.talk.base);
  for (const p of TALK_PATCHES) put(p, m.talk.files[p]);
  for (const pose of TALK_POSES) if (m.talk.poses?.[pose]) put(pose, m.talk.poses[pose]);

  const indexPath = join(outDir, 'characters.json');
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
  index[m.id] = talkEntry(m);
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  written.push('characters.json');
  return { app, written };
}

export function exportMotion(m, packDir, outDir) {
  if (!m.motion) throw new Error('this pack has no motion layer — add motion.rig first (see SPEC.md)');
  const charDir = join(outDir, 'characters', m.id);
  mkdirSync(charDir, { recursive: true });
  const written = [];
  if (copyIf(join(packDir, m.motion.rig), join(charDir, 'rig.json'))) written.push('rig.json');
  for (const pack of m.motion.posePacks || []) {
    const srcDir = join(packDir, pack.dir || `poses/${pack.name}`);
    const destDir = join(charDir, 'poses', pack.name);
    if (!existsSync(srcDir)) continue;
    mkdirSync(destDir, { recursive: true });
    for (const f of readdirSync(srcDir)) {
      if (f.endsWith('.png')) {
        copyFileSync(join(srcDir, f), join(destDir, f));
        written.push(`poses/${pack.name}/${f}`);
      }
    }
  }
  const key = (m.id[0] || 'X').toUpperCase();
  const cast = `${key}: { rig: image:characters/${m.id}, name: ${m.name}, voice: ${m.voice?.id || 'en-IN-NeerjaExpressiveNeural'} }`;
  writeFileSync(join(charDir, 'cast-snippet.md'), `# Paste into your rigpop-motion script's cast:\n\n\`\`\`\ncast:\n  ${cast}\n\`\`\`\n`);
  written.push('cast-snippet.md');
  return { app: 'motion', written };
}
