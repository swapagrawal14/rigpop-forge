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

/** Horizontal mirror. */
export function flipH(img) {
  const data = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const s = (y * img.w + x) * 4, d = (y * img.w + (img.w - 1 - x)) * 4;
    data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = img.data[s + 3];
  }
  return { w: img.w, h: img.h, data };
}

/** Crop a plain rectangle region (no component masking). */
export function cropRect(img, x, y, w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const sx = x + xx, sy = y + yy;
    if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
    const s = (sy * img.w + sx) * 4, d = (yy * w + xx) * 4;
    data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = img.data[s + 3];
  }
  return { w, h, data };
}

/** Bilinear resize to an exact size. */
export function resize(img, w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5) * (img.w / w) - 0.5, sy = (y + 0.5) * (img.h / h) - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0));
      for (let c = 0; c < 4; c++) {
        const v = (img.data[(y0 * img.w + x0) * 4 + c] * (1 - fx) + img.data[(y0 * img.w + x1) * 4 + c] * fx) * (1 - fy)
          + (img.data[(y1 * img.w + x0) * 4 + c] * (1 - fx) + img.data[(y1 * img.w + x1) * 4 + c] * fx) * fy;
        data[(y * w + x) * 4 + c] = v;
      }
    }
  }
  return { w, h, data };
}

/** Alpha-composite src onto dst at (dx, dy), in place on dst. */
export function composite(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x, ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const s = (y * src.w + x) * 4, d = (ty * dst.w + tx) * 4;
      const sa = src.data[s + 3] / 255;
      if (!sa) continue;
      for (let c = 0; c < 3; c++) dst.data[d + c] = src.data[s + c] * sa + dst.data[d + c] * (1 - sa);
      dst.data[d + 3] = Math.max(dst.data[d + 3], src.data[s + 3]);
    }
  }
  return dst;
}

/** Median opaque colour in the band just OUTSIDE a rect — the skin a face
 *  patch should be filled with so its edges vanish into the drawing
 *  (rigpop-motion's facepatch trick). Returns [r,g,b] or null. */
export function sampleRing(img, rect, band = 8) {
  const rs = [], gs = [], bs = [];
  const x0 = Math.max(0, rect.x - band), x1 = Math.min(img.w, rect.x + rect.w + band);
  const y0 = Math.max(0, rect.y - band), y1 = Math.min(img.h, rect.y + rect.h + band);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) continue;
    const i = (y * img.w + x) * 4;
    if (img.data[i + 3] < 200) continue;
    rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
  }
  if (!rs.length) return null;
  const med = (arr) => arr.sort((a, b) => a - b)[arr.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

export function solidImage(w, h, [r, g, b, a = 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a; }
  return { w, h, data };
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
