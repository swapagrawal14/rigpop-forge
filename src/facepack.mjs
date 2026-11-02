// facepack: derive talk patches + rects automatically — the measuring step
// that used to happen by hand in rigpop-talk.
//
// Input: pack/states/{A,O,E,blink}.png — full-canvas drawings identical to
// talk/base.png EXCEPT the one feature that changes (the mouth shape, the
// closed eyes). Forge diffs each state against the base, takes the changed
// region's bbox, expands it by a margin, crops the state there, and writes
// talk/<kind>.png + the rect into the manifest. QA then checks the result
// like any other pack.
//
// A diff covering too much of the canvas means the state drawing drifted
// (different scale/position) — that is an error, not a patch.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from './pngcodec.mjs';
import { cropPart } from './imageops.mjs';
import { TALK_PATCHES, loadManifest } from './manifest.mjs';

export function diffBbox(a, b, threshold = 24) {
  if (a.w !== b.w || a.h !== b.h) throw new Error(`state is ${b.w}x${b.h}, base is ${a.w}x${a.h} — states must be full-canvas, same size as the base`);
  let minX = a.w, maxX = -1, minY = a.h, maxY = -1, changed = 0;
  for (let p = 0; p < a.w * a.h; p++) {
    const i = p * 4;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) + Math.abs(a.data[i + 3] - b.data[i + 3]);
    if (d > threshold) {
      changed++;
      const x = p % a.w, y = (p / a.w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!changed) return null;
  return { bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, changed };
}

export function makeFacePatches(packDir, { margin = 6, maxFraction = 0.45 } = {}) {
  const manifest = loadManifest(packDir);
  const basePath = join(packDir, manifest.talk.base);
  if (!existsSync(basePath)) throw new Error(`base missing: ${manifest.talk.base}`);
  const base = readPng(basePath);
  mkdirSync(join(packDir, 'talk'), { recursive: true });
  const report = [];
  let made = 0;

  for (const kind of TALK_PATCHES) {
    const statePath = join(packDir, 'states', `${kind}.png`);
    if (!existsSync(statePath)) { report.push(`${kind}: no states/${kind}.png — skipped`); continue; }
    const state = readPng(statePath);
    const diff = diffBbox(base, state);
    if (!diff) throw new Error(`states/${kind}.png is identical to the base — draw the ${kind === 'blink' ? 'closed eyes' : kind + ' mouth'} on it`);
    const frac = (diff.bbox.w * diff.bbox.h) / (base.w * base.h);
    if (frac > maxFraction)
      throw new Error(`states/${kind}.png differs from the base over ${(frac * 100).toFixed(0)}% of the canvas — the drawing drifted; patches need the SAME drawing with only the ${kind === 'blink' ? 'eyes' : 'mouth'} changed`);
    const rect = {
      x: Math.max(0, diff.bbox.x - margin),
      y: Math.max(0, diff.bbox.y - margin),
      w: Math.min(base.w, diff.bbox.x + diff.bbox.w + margin) - Math.max(0, diff.bbox.x - margin),
      h: Math.min(base.h, diff.bbox.y + diff.bbox.h + margin) - Math.max(0, diff.bbox.y - margin),
    };
    const { img } = cropPart(state, rect, null, 0);
    const rel = `talk/${kind}.png`;
    writePng(join(packDir, rel), img);
    manifest.talk.patches[kind] = rect;
    manifest.talk.files[kind] = rel;
    report.push(`${kind}: rect ${rect.w}x${rect.h} at (${rect.x}, ${rect.y}) from ${diff.changed} changed px -> ${rel}`);
    made++;
  }
  if (!made) throw new Error('no state drawings found in states/ (expected A.png, O.png, E.png, blink.png)');
  writeFileSync(join(packDir, 'character.rigpop.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { report, manifest };
}
