// Minimal PNG header reader — Forge only needs dimensions, so it reads the
// IHDR chunk (bytes 16-24) and never decodes pixels. No dependencies.
import { readFileSync } from 'node:fs';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(buf) {
  return buf.length >= 8 && PNG_SIG.every((b, i) => buf[i] === b);
}

/** Returns { w, h } for a PNG file, or null when the file is not a PNG. */
export function pngSize(path) {
  const buf = readFileSync(path);
  if (!isPng(buf) || buf.length < 24) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Builds the smallest PNG-shaped buffer with a given size (test fixtures). */
export function pngHeader(w, h) {
  const buf = Buffer.alloc(33);
  Buffer.from(PNG_SIG).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  buf[24] = 8; // bit depth
  buf[25] = 6; // colour type RGBA
  return buf;
}
