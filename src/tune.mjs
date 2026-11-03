// tune: the anchor hand-tuning helper for a pack's motion rig.
// Rig anchors out of `cut` are estimates; this is how you fix them without
// opening JSON by hand:
//   rigpop-forge tune <pack>                      list every anchor value
//   rigpop-forge tune <pack> --set torso:hip.y=512   adjust one and save
//   (every run also renders motion/rig-preview.png — the parts contact
//    sheet with anchor points drawn on, so you can SEE the estimates)
// Anchor paths are <part>:<dot.path>, e.g. head.front:face.cy — part names
// contain dots themselves, hence the colon.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from './pngcodec.mjs';
import { resize, solidImage, composite } from './imageops.mjs';
import { loadManifest } from './manifest.mjs';

export function loadRig(packDir) {
  const m = loadManifest(packDir);
  if (!m.motion?.rig) throw new Error('pack has no motion rig — run `rigpop-forge cut` first');
  const rigPath = join(packDir, m.motion.rig);
  return { rig: JSON.parse(readFileSync(rigPath, 'utf8')), rigPath };
}

export function listAnchors(rig) {
  const out = [];
  const walk = (part, path, v) => {
    if (typeof v === 'number') out.push(`${part}:${path} = ${v}`);
    else if (v && typeof v === 'object' && !Array.isArray(v))
      for (const [k, x] of Object.entries(v)) walk(part, path ? `${path}.${k}` : k, x);
  };
  for (const [part, entry] of Object.entries(rig.parts || {})) {
    const { file, w, h, ...anchors } = entry;
    walk(part, '', anchors);
  }
  if (rig.skin) out.push(`skin = ${rig.skin}`);
  if (rig.hair) out.push(`hair = ${rig.hair}`);
  return out;
}

export function setAnchor(rig, spec) {
  const m = /^([^:]+):(.+)=(-?[\d.]+)$/.exec(spec);
  if (!m) throw new Error(`bad --set "${spec}" — want <part>:<path>=<number>, e.g. torso:hip.y=512`);
  const [, part, path, raw] = m;
  const entry = rig.parts?.[part];
  if (!entry) throw new Error(`rig has no part "${part}" (it has: ${Object.keys(rig.parts || {}).join(', ')})`);
  let node = entry;
  const keys = path.split('.');
  for (const k of keys.slice(0, -1)) {
    if (typeof node[k] !== 'object' || node[k] === null) throw new Error(`part ${part} has no anchor group "${path}"`);
    node = node[k];
  }
  const last = keys[keys.length - 1];
  if (typeof node[last] !== 'number') throw new Error(`part ${part} anchor "${path}" is not a number (or doesn't exist)`);
  node[last] = Number(raw);
  rig.anchorsEstimated = false; // a human touched it now
  return `${part}:${path} = ${raw}`;
}

function collectPoints(entry) {
  const pts = [];
  const walk = (v) => {
    if (v && typeof v === 'object') {
      if (typeof v.x === 'number' && typeof v.y === 'number') pts.push([v.x, v.y]);
      if (typeof v.cx === 'number' && typeof v.cy === 'number') pts.push([v.cx, v.cy]);
      for (const x of Object.values(v)) walk(x);
    }
  };
  const { file, w, h, ...anchors } = entry;
  walk(anchors);
  return pts;
}

function drawMarker(img, x, y) {
  const R = [255, 45, 85], W_ = [255, 255, 255];
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > 49 || (Math.abs(dx) > 1 && Math.abs(dy) > 1 && d2 < 30)) continue;
    const px = Math.round(x + dx), py = Math.round(y + dy);
    if (px < 0 || py < 0 || px >= img.w || py >= img.h) continue;
    const i = (py * img.w + px) * 4;
    const col = d2 >= 30 ? W_ : R;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
}

export function rigPreview(packDir, rig) {
  const parts = Object.entries(rig.parts || {});
  if (!parts.length) throw new Error('rig has no parts');
  const CELL = 260, cols = Math.min(4, parts.length), rows = Math.ceil(parts.length / cols);
  const sheet = solidImage(cols * CELL, rows * CELL, [255, 246, 229, 255]);
  parts.forEach(([label, entry], i) => {
    const filePath = join(packDir, entry.file);
    if (!existsSync(filePath)) return;
    const img = readPng(filePath);
    const scale = Math.min((CELL - 16) / img.w, (CELL - 16) / img.h, 1);
    const small = scale < 1 ? resize(img, Math.max(1, Math.round(img.w * scale)), Math.max(1, Math.round(img.h * scale))) : img;
    const ox = (i % cols) * CELL + (CELL - small.w) / 2, oy = ((i / cols) | 0) * CELL + (CELL - small.h) / 2;
    composite(sheet, small, Math.round(ox), Math.round(oy));
    for (const [x, y] of collectPoints(entry)) drawMarker(sheet, ox + x * scale, oy + y * scale);
  });
  const out = join(packDir, 'motion', 'rig-preview.png');
  writePng(out, sheet);
  return out;
}

export function tune(packDir, { set = null } = {}) {
  const { rig, rigPath } = loadRig(packDir);
  const changes = [];
  if (set) {
    changes.push(setAnchor(rig, set));
    writeFileSync(rigPath, JSON.stringify(rig, null, 2) + '\n');
  }
  const preview = rigPreview(packDir, rig);
  return { changes, anchors: listAnchors(rig), preview };
}
