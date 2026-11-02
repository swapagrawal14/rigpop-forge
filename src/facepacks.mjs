// facepacks: pose-pack face patches, ported from rigpop-motion's facepatch.
// A pose pack replaces the whole drawing per key, so the rig's own face
// stack (blinks, lip-sync) vanishes while it plays — unless every key ships
// patch tiles next to it:
//
//   poses/<action>/key0.png            the drawn pose
//                   key0.blink.png     closed-eyes tile for this key's face
//                   key0.m.rest.png    mouth tiles: rest | M | A | O | E
//                   pack.json          face/mouth/eyes rects + patch index
//
// Each tile is filled with the skin colour sampled in a ring around its
// rect ON THAT KEY, so the patch edge vanishes into the drawing, and the
// mouth/eye art (the pack's cut face-kit parts) is composited on top.
// Face geometry inside a pack is an input, not a guess: pose packs are
// normalised (one floor line, one scale), so ONE face rect per pack —
// manifest motion.posePacks[].face or --face x,y,w,h — with eyes/mouth
// placed by documented ratios inside it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from './pngcodec.mjs';
import { composite, resize, sampleRing, solidImage } from './imageops.mjs';
import { loadManifest } from './manifest.mjs';

export const MOUTH_SHAPES = ['rest', 'M', 'A', 'O', 'E'];

export function packFaceRects(face) {
  const eyes = {
    x: Math.round(face.x + face.w * 0.22), y: Math.round(face.y + face.h * 0.30),
    w: Math.round(face.w * 0.56), h: Math.round(face.h * 0.16),
  };
  const mouthW = Math.round(face.w * 0.34);
  const mouth = {
    x: Math.round(face.x + face.w / 2 - mouthW / 2), y: Math.round(face.y + face.h * 0.62),
    w: mouthW, h: Math.round(face.h * 0.20),
  };
  return { eyes, mouth };
}

function tile(keyImg, rect, partImg) {
  const skin = sampleRing(keyImg, rect) || [128, 128, 128];
  const t = solidImage(rect.w, rect.h, [...skin, 255]);
  if (partImg) composite(t, resize(partImg, rect.w, rect.h), 0, 0);
  return t;
}

export function buildFacepacks(packDir, { faceOverride = null, force = false } = {}) {
  const manifest = loadManifest(packDir);
  const packs = manifest.motion?.posePacks || [];
  if (!packs.length) throw new Error('manifest has no motion.posePacks — nothing to patch');
  const need = { blink: 'eyes.closed', rest: 'mouth.M', M: 'mouth.M', A: 'mouth.A', O: 'mouth.O', E: 'mouth.E' };
  const parts = {};
  for (const label of new Set(Object.values(need))) {
    const p = join(packDir, 'parts', `${label}.png`);
    if (!existsSync(p)) throw new Error(`missing face-kit part parts/${label}.png — run \`rigpop-forge cut\` on the face sheet first`);
    parts[label] = readPng(p);
  }
  const report = [];

  for (const pack of packs) {
    const face = faceOverride || pack.face;
    if (!face) throw new Error(`pose pack ${pack.name}: no face rect — set motion.posePacks[].face {x,y,w,h} in the manifest or pass --face x,y,w,h (the face region on the normalised keys)`);
    const dir = join(packDir, pack.dir || `poses/${pack.name}`);
    if (!existsSync(dir)) throw new Error(`pose pack ${pack.name}: missing dir ${pack.dir || `poses/${pack.name}`}`);
    const { eyes, mouth } = packFaceRects(face);
    const keyFiles = readdirSync(dir).filter((f) => /^key\d+\.png$/.test(f)).sort();
    if (!keyFiles.length) throw new Error(`pose pack ${pack.name}: no key*.png frames`);
    const indexPath = join(dir, 'pack.json');
    const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { name: pack.name, keys: [] };
    index.face = face; index.eyes = eyes; index.mouth = mouth; index.keys = [];

    for (const file of keyFiles) {
      const stem = file.replace(/\.png$/, '');
      const keyImg = readPng(join(dir, file));
      const patches = { mouth: {} };
      const blinkName = `${stem}.blink.png`;
      if (force || !existsSync(join(dir, blinkName))) writePng(join(dir, blinkName), tile(keyImg, eyes, parts['eyes.closed']));
      patches.blink = blinkName;
      for (const shape of MOUTH_SHAPES) {
        const name = `${stem}.m.${shape}.png`;
        if (force || !existsSync(join(dir, name))) writePng(join(dir, name), tile(keyImg, mouth, parts[need[shape]]));
        patches.mouth[shape] = name;
      }
      index.keys.push({ file, patches });
      report.push(`${pack.name}/${file}: blink + ${MOUTH_SHAPES.length} mouth tiles (skin-sampled)`);
    }
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
    report.push(`${pack.name}: pack.json written (face ${face.w}x${face.h} at ${face.x},${face.y})`);
  }
  return { report };
}
