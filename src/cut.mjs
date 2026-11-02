// cut: sheets in, parts + rig out.
// Input: pack/sheets/sheets.json
//   { "sheets": [ { "file": "sheets/head.png",
//                   "labels": ["head.front", "head.34", "accessory"] }, ... ] }
// A label may carry *N ("eyes.open*2") when one part is drawn as N separate
// components (an eye pair). Components are matched to labels in reading
// order after chroma keying and speck removal. Output:
//   parts/<label>.png, parts/parts.json, motion/rig.json (anchors estimated)
// and the manifest gains its motion layer.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from './pngcodec.mjs';
import { alphaMask, chromaKey, connectedComponents, cropPart, readingOrder, unionBbox } from './imageops.mjs';
import { buildRig } from './autorig.mjs';
import { loadManifest } from './manifest.mjs';

export function parseLabel(raw) {
  const m = /^(.+?)(?:\*(\d+))?$/.exec(raw);
  return { label: m[1], count: m[2] ? +m[2] : 1 };
}

export function cutSheets(packDir) {
  const sheetsPath = join(packDir, 'sheets', 'sheets.json');
  if (!existsSync(sheetsPath)) throw new Error('no sheets/sheets.json — see SPEC.md for the sheet manifest format');
  const plan = JSON.parse(readFileSync(sheetsPath, 'utf8'));
  const manifest = loadManifest(packDir);
  mkdirSync(join(packDir, 'parts'), { recursive: true });
  mkdirSync(join(packDir, 'motion'), { recursive: true });

  const parts = new Map();
  const index = [];
  const report = [];

  for (const sheet of plan.sheets || []) {
    const sheetPath = join(packDir, sheet.file);
    if (!existsSync(sheetPath)) throw new Error(`sheet file missing: ${sheet.file}`);
    const img = readPng(sheetPath);
    chromaKey(img);
    let comps = connectedComponents(alphaMask(img), img.w, img.h);
    const largest = comps[0]?.area || 0;
    const minArea = Math.max(24, largest * 0.02);
    const before = comps.length;
    comps = readingOrder(comps.filter((c) => c.area >= minArea));
    report.push(`${sheet.file}: ${before} components, ${comps.length} after speck filter (min ${minArea}px)`);

    const labels = (sheet.labels || []).map(parseLabel);
    const needed = labels.reduce((n, l) => n + l.count, 0);
    if (comps.length !== needed)
      throw new Error(`${sheet.file}: found ${comps.length} components but labels need ${needed} (${sheet.labels.join(', ')}). Re-draw the sheet with separated items, or fix the labels.`);

    let cursor = 0;
    for (const { label, count } of labels) {
      const group = comps.slice(cursor, cursor + count); cursor += count;
      const keep = new Set();
      for (const c of group) for (const p of c.pixels) keep.add(p);
      const bbox = unionBbox(group.map((c) => c.bbox));
      const { img: partImg } = cropPart(img, bbox, keep);
      const file = `parts/${label}.png`;
      writePng(join(packDir, file), partImg);
      parts.set(label, { file, img: partImg });
      index.push({ label, file, w: partImg.w, h: partImg.h, sheetBbox: bbox });
      report.push(`  ${label} <- ${count > 1 ? count + ' components' : '1 component'} ${partImg.w}x${partImg.h}`);
    }
  }

  writeFileSync(join(packDir, 'parts', 'parts.json'), JSON.stringify(index, null, 2) + '\n');
  const rig = buildRig(manifest.id, parts);
  writeFileSync(join(packDir, 'motion', 'rig.json'), JSON.stringify(rig, null, 2) + '\n');
  manifest.motion = { ...(manifest.motion || {}), rig: 'motion/rig.json' };
  writeFileSync(join(packDir, 'character.rigpop.json'), JSON.stringify(manifest, null, 2) + '\n');
  report.push(`rig: motion/rig.json with ${Object.keys(rig.parts).length} parts (anchors estimated — hand-tune before shipping)`);
  return { report, rig, index };
}
