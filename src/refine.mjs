// Painted rig refinements, ported from rigpop-motion's v3 lessons.
//
// sleeves: an arm rotating on a bare torso shows a crescent of background
// at the shoulder. Motion's fix is to paint the sleeve INTO the torso:
// the top of the upper-arm part (the sleeve cap) is composited onto the
// torso at each shoulder anchor, so the joint is always covered by cloth
// that moves with the body. The original torso is kept as
// parts/torso.nosleeve.png and the rig gains `sleeves: true`.
//
// hose: rubber-hose limbs don't bend at elbows so much as curve. Motion
// keeps a straightened "hose strip" per limb segment — every row of the
// part resampled to one median width, centred — which a renderer can
// bend along any curve without the art shearing. `hose` writes
// parts/<label>.hose.png and records it in the rig as
// parts[label].hose = { file, w, h }.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from './pngcodec.mjs';
import { composite, cropRect, flipH, tightBbox } from './imageops.mjs';
import { loadRig } from './tune.mjs';

export function paintSleeves(packDir, { capFrac = 0.4 } = {}) {
  const { rig, rigPath } = loadRig(packDir);
  const torsoE = rig.parts?.torso, armE = rig.parts?.['arm.upper'];
  if (!torsoE?.shoulderL || !torsoE?.shoulderR) throw new Error('rig torso has no shoulder anchors — run cut (or tune) first');
  if (!armE) throw new Error('rig has no arm.upper part to take sleeves from');
  const torsoPath = join(packDir, torsoE.file);
  const backup = join(packDir, 'parts/torso.nosleeve.png');
  if (!existsSync(backup)) copyFileSync(torsoPath, backup);
  const torso = readPng(torsoPath);
  const arm = readPng(join(packDir, armE.file));
  const capH = Math.max(4, Math.round(arm.h * capFrac));
  const cap = cropRect(arm, 0, 0, arm.w, capH);
  const capCx = arm.w / 2;

  // left sleeve extends left from the shoulder, right sleeve mirrored right
  composite(torso, cap, Math.round(torsoE.shoulderL.x - capCx - cap.w * 0.35), Math.round(torsoE.shoulderL.y - capH * 0.3));
  composite(torso, flipH(cap), Math.round(torsoE.shoulderR.x + capCx - cap.w * 0.65), Math.round(torsoE.shoulderR.y - capH * 0.3));
  writePng(torsoPath, torso);
  rig.sleeves = true;
  writeFileSync(rigPath, JSON.stringify(rig, null, 2) + '\n');
  return { report: [`sleeves painted into torso from arm.upper cap (${arm.w}x${capH}) at both shoulders`, 'original kept at parts/torso.nosleeve.png'] };
}

export const LIMBS = ['arm.upper', 'arm.fore', 'leg.thigh', 'leg.shin'];

export function hoseStrip(img) {
  const widths = [];
  const spans = [];
  for (let y = 0; y < img.h; y++) {
    let minX = img.w, maxX = -1;
    for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > 32) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    spans.push(maxX >= 0 ? [minX, maxX] : null);
    if (maxX >= 0) widths.push(maxX - minX + 1);
  }
  if (!widths.length) return null;
  const W = widths.sort((a, b) => a - b)[widths.length >> 1];
  const data = new Uint8ClampedArray(W * img.h * 4);
  spans.forEach((span, y) => {
    if (!span) return;
    const [minX, maxX] = span, spanW = maxX - minX + 1;
    for (let x = 0; x < W; x++) {
      const sx = minX + Math.min(spanW - 1, Math.floor((x / W) * spanW));
      const s = (y * img.w + sx) * 4, d = (y * W + x) * 4;
      data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = img.data[s + 3];
    }
  });
  return { w: W, h: img.h, data };
}

export function makeHose(packDir, { only = null } = {}) {
  const { rig, rigPath } = loadRig(packDir);
  const labels = (only ? [only] : LIMBS).filter((l) => rig.parts?.[l]);
  if (!labels.length) throw new Error(`rig has none of the limb parts (${LIMBS.join(', ')})`);
  const report = [];
  for (const label of labels) {
    const entry = rig.parts[label];
    const img = readPng(join(packDir, entry.file));
    const strip = hoseStrip(img);
    if (!strip) { report.push(`${label}: fully transparent, skipped`); continue; }
    const file = `parts/${label}.hose.png`;
    writePng(join(packDir, file), strip);
    entry.hose = { file, w: strip.w, h: strip.h };
    report.push(`${label}: hose strip ${strip.w}x${strip.h} -> ${file}`);
  }
  writeFileSync(rigPath, JSON.stringify(rig, null, 2) + '\n');
  return { report };
}
