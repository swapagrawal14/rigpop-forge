// Pixel operations for the cut pipeline, on { w, h, data RGBA } images.
// Conventions follow rigpop-motion's autorig: key by greenness (so the
// model's soft ground shadows go too), drop specks, read the sheet in rows.

/** Zero out chroma-green pixels. A pixel is "green ground" when green is
 *  strong and clearly above red and blue. Returns the number keyed. */
export function chromaKey(img, { minG = 90, dominance = 45 } = {}) {
  const { data } = img;
  let keyed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (g >= minG && g - r >= dominance && g - b >= dominance) {
      data[i + 3] = 0; keyed++;
    }
  }
  return keyed;
}

/** Filled-in ground: pixels whose alpha is 0 are not part of the art. Enclosed
 *  pockets (between a lifted leg and a trouser) survive flood fill, so the
 *  mask is simply alpha-based after keying — motion's rule 3. */
export function alphaMask(img, threshold = 32) {
  const mask = new Uint8Array(img.w * img.h);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) mask[p] = img.data[i + 3] > threshold ? 1 : 0;
  return mask;
}

/** 4-connected components over a mask. Returns [{ area, bbox, pixels }] with
 *  pixels as a Uint32Array of indices, sorted by area desc. */
export function connectedComponents(mask, w, h) {
  const seen = new Uint8Array(mask.length);
  const comps = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const pixels = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    stack.push(start); seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      const x = p % w, y = (p / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    comps.push({ area: pixels.length, bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, pixels: Uint32Array.from(pixels) });
  }
  return comps.sort((a, b) => b.area - a.area);
}

/** Group components into reading order: rows by vertical overlap, then
 *  left-to-right. Mirrors how a sheet is drawn: rows, in reading order. */
export function readingOrder(comps) {
  const sorted = [...comps].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const rows = [];
  for (const c of sorted) {
    const cy = c.bbox.y + c.bbox.h / 2;
    const row = rows.find((r) => cy >= r.minY && cy <= r.maxY);
    if (row) { row.items.push(c); row.minY = Math.min(row.minY, c.bbox.y); row.maxY = Math.max(row.maxY, c.bbox.y + c.bbox.h); }
    else rows.push({ minY: c.bbox.y, maxY: c.bbox.y + c.bbox.h, items: [c] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.bbox.x - b.bbox.x));
}

export function unionBbox(boxes) {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Crop to a bbox, keeping ONLY the given components' pixels (pass a Set of
 *  pixel indices belonging to the part) so neighbouring art never leaks in.
 *  With no keep-set, crops the raw image region. */
export function cropPart(img, bbox, keep = null, pad = 2) {
  const x0 = Math.max(0, bbox.x - pad), y0 = Math.max(0, bbox.y - pad);
  const x1 = Math.min(img.w, bbox.x + bbox.w + pad), y1 = Math.min(img.h, bbox.y + bbox.h + pad);
  const w = x1 - x0, h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcP = (y0 + y) * img.w + (x0 + x);
      if (keep && !keep.has(srcP)) continue;
      const s = srcP * 4, d = (y * w + x) * 4;
      data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = img.data[s + 3];
    }
  }
  return { img: { w, h, data }, origin: { x: x0, y: y0 } };
}

/** Tight alpha bbox of an image (for anchor maths on a cropped part). */
export function tightBbox(img, threshold = 32) {
  let minX = img.w, maxX = -1, minY = img.h, maxY = -1, count = 0, sx = 0, sy = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.data[(y * img.w + x) * 4 + 3] > threshold) {
      count++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!count) return null;
  return { bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, centroid: { x: sx / count, y: sy / count }, area: count };
}
