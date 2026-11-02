// Auto-rig anchor estimation, v0.2: turn cut parts into a rigpop-motion
// rig.json. Anchors are ESTIMATES from silhouettes (documented as such in
// the file) — they get a character moving; hand-tune them like you would
// any first rig. Conventions match rigpop-motion's rig.json for kabir:
// faces carry an ellipse, torsos carry neck/shoulders/hip, eyes and mouths
// carry a centre + tight size, limbs carry top/bottom points.
import { tightBbox } from './imageops.mjs';

function rowStats(img, y) {
  let minX = img.w, maxX = -1, sum = 0, n = 0;
  for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > 32) { if (x < minX) minX = x; if (x > maxX) maxX = x; sum += x; n++; }
  }
  return n ? { minX, maxX, w: maxX - minX + 1, cx: sum / n, n } : null;
}
function bandCentroidX(img, y0, y1) {
  let sum = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(img.h, y1); y++)
    for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] > 32) { sum += x; n++; }
  return n ? sum / n : img.w / 2;
}
function quantise(r, g, b) { return `${r >> 4},${g >> 4},${b >> 4}`; }
function sampleColours(img, region) {
  const hist = new Map();
  for (let y = region.y0; y < region.y1; y++) for (let x = region.x0; x < region.x1; x++) {
    const i = (y * img.w + x) * 4;
    if (img.data[i + 3] <= 32) continue;
    const key = quantise(img.data[i], img.data[i + 1], img.data[i + 2]);
    const e = hist.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += img.data[i]; e.g += img.data[i + 1]; e.b += img.data[i + 2];
    hist.set(key, e);
  }
  const top = [...hist.values()].sort((a, b) => b.n - a.n)[0];
  if (!top) return null;
  const hex = (v) => Math.round(v / top.n).toString(16).padStart(2, '0');
  return `#${hex(top.r)}${hex(top.g)}${hex(top.b)}`;
}

export function anchorsFor(label, img) {
  const tight = tightBbox(img);
  if (!tight) return {};
  const { bbox, centroid } = tight;

  if (label.startsWith('mouth.') || label.startsWith('eyes.')) {
    return { c: { x: round(centroid.x), y: round(centroid.y) }, width: bbox.w, height: bbox.h };
  }
  if (label.startsWith('head.')) {
    return {
      face: {
        cx: round(centroid.x), cy: round(bbox.y + bbox.h * 0.6),
        rx: round(bbox.w * 0.31), ry: round(bbox.h * 0.33),
        top: bbox.y, bottom: bbox.y + bbox.h,
      },
    };
  }
  if (label === 'torso') {
    const rows = [];
    for (let y = bbox.y; y < bbox.y + bbox.h; y++) rows.push({ y, ...rowStats(img, y) });
    const filled = rows.filter((r) => r.n);
    const maxW = Math.max(...filled.map((r) => r.w || 0));
    const topBand = filled.filter((r) => r.y < bbox.y + bbox.h * 0.25);
    const neckRow = topBand.reduce((a, b) => ((b.w || 1e9) < (a.w || 1e9) ? b : a), topBand[0] || filled[0]);
    const shoulderRow = filled.find((r) => r.y >= (neckRow?.y || bbox.y) + bbox.h * 0.1) || filled[0];
    return {
      neckTop: { x: round(neckRow?.cx ?? centroid.x), y: neckRow?.y ?? bbox.y },
      neckW: neckRow?.w ?? 0,
      shirtTop: (filled.find((r) => (r.w || 0) > maxW * 0.5)?.y) ?? bbox.y,
      hem: bbox.y + bbox.h,
      hip: { x: round(centroid.x), y: round(bbox.y + bbox.h * 0.82) },
      shoulderL: { x: shoulderRow?.minX ?? bbox.x, y: shoulderRow?.y ?? bbox.y },
      shoulderR: { x: shoulderRow?.maxX ?? bbox.x + bbox.w, y: shoulderRow?.y ?? bbox.y },
      width: maxW,
    };
  }
  if (label.startsWith('hand.')) {
    return { wrist: { x: round(bandCentroidX(img, bbox.y, bbox.y + bbox.h * 0.15)), y: bbox.y + 4 }, len: bbox.h, width: bbox.w };
  }
  if (label === 'foot') {
    return { ankle: { x: round(bandCentroidX(img, bbox.y, bbox.y + bbox.h * 0.3)), y: bbox.y + 4 }, sole: bbox.y + bbox.h, len: bbox.w };
  }
  // generic limb segment: top/bottom points along its principal (vertical) axis
  return {
    top: { x: round(bandCentroidX(img, bbox.y, bbox.y + bbox.h * 0.12)), y: bbox.y },
    bottom: { x: round(bandCentroidX(img, bbox.y + bbox.h * 0.88, bbox.y + bbox.h)), y: bbox.y + bbox.h },
  };
}

const round = (v) => Math.round(v * 10) / 10;

/** parts: Map<label, { file, img }> -> a rigpop-motion-shaped rig object. */
export function buildRig(name, parts) {
  const rig = { name, generated: new Date().toISOString().slice(0, 10), anchorsEstimated: true, parts: {} };
  for (const [label, { file, img }] of parts) {
    rig.parts[label] = { file, w: img.w, h: img.h, ...anchorsFor(label, img) };
  }
  const head = parts.get('head.front');
  if (head) {
    const b = tightBbox(head.img)?.bbox || { x: 0, y: 0, w: head.img.w, h: head.img.h };
    const skin = sampleColours(head.img, { x0: Math.floor(b.x + b.w * 0.3), x1: Math.floor(b.x + b.w * 0.7), y0: Math.floor(b.y + b.h * 0.55), y1: Math.floor(b.y + b.h * 0.85) });
    const hair = sampleColours(head.img, { x0: b.x, x1: b.x + b.w, y0: b.y, y1: Math.floor(b.y + b.h * 0.15) });
    if (skin) rig.skin = skin;
    if (hair) rig.hair = hair;
  }
  return rig;
}
