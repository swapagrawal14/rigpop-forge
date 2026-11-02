// Pure-JS PNG codec on Node's stdlib zlib — Forge stays zero-dependency.
// Decode: bit depth 8 (16 is down-sampled), colour types 0/2/3/4/6,
// non-interlaced (Adam7 throws — canvas/Pillow/image-model exports are
// non-interlaced). Encode: RGBA, filter 0, one IDAT.
// Images are { w, h, data: Uint8ClampedArray RGBA }.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng({ w, h, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (1 + w * 4) + 1);
  }
  return Buffer.concat([
    Buffer.from(SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export function writePng(path, img) { writeFileSync(path, encodePng(img)); }

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (SIG.some((b, i) => buf[i] !== b)) throw new Error('not a PNG');
  let off = 8, w, h, bitDepth, colorType, interlace = 0;
  const idat = [], plte = [], trns = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') plte.push(...data);
    else if (type === 'tRNS') trns.push(...data);
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNGs are not supported (re-export without interlacing)');
  if (bitDepth !== 8 && bitDepth !== 16) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  const step = bitDepth === 16 ? 2 : 1;
  const bpp = channels * step;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = up ? up[x] : 0;
      const c = up && x >= bpp ? up[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paeth(a, b, c)) & 0xff;
      out[x] = v;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const src = i * bpp;
    const get = (ch) => (bitDepth === 16 ? px[src + ch * 2] : px[src + ch]);
    const o = i * 4;
    if (colorType === 6) { data[o] = get(0); data[o + 1] = get(1); data[o + 2] = get(2); data[o + 3] = get(3); }
    else if (colorType === 2) { data[o] = get(0); data[o + 1] = get(1); data[o + 2] = get(2); data[o + 3] = 255; }
    else if (colorType === 4) { const g = get(0); data[o] = data[o + 1] = data[o + 2] = g; data[o + 3] = get(1); }
    else if (colorType === 0) { const g = get(0); data[o] = data[o + 1] = data[o + 2] = g; data[o + 3] = 255; }
    else if (colorType === 3) {
      const idx = get(0);
      data[o] = plte[idx * 3] ?? 0; data[o + 1] = plte[idx * 3 + 1] ?? 0; data[o + 2] = plte[idx * 3 + 2] ?? 0;
      data[o + 3] = trns[idx] ?? 255;
    }
  }
  return { w, h, data };
}
export function readPng(path) { return decodePng(readFileSync(path)); }
