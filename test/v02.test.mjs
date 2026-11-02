import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePng, encodePng, readPng, writePng } from '../src/pngcodec.mjs';
import { alphaMask, chromaKey, connectedComponents } from '../src/imageops.mjs';
import { initCharacter } from '../src/init.mjs';
import { cutSheets } from '../src/cut.mjs';
import { makeFacePatches, diffBbox } from '../src/facepack.mjs';
import { loadManifest } from '../src/manifest.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'forge2-'));
const blank = (w, h, [r, g, b, a] = [0, 255, 0, 255]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a; }
  return { w, h, data };
};
const rect = (img, x, y, w, h, [r, g, b, a = 255]) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * img.w + xx) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
  }
};

test('png codec round-trips RGBA pixels', () => {
  const img = blank(17, 9, [10, 20, 30, 255]);
  rect(img, 3, 2, 5, 4, [200, 100, 50, 255]);
  rect(img, 10, 5, 4, 3, [0, 0, 0, 0]);
  const back = decodePng(encodePng(img));
  assert.equal(back.w, 17); assert.equal(back.h, 9);
  assert.deepEqual([...back.data], [...img.data]);
});

test('codec decodes a real palette PNG (the example pack art)', () => {
  const img = readPng(new URL('../examples/doodle-swapnil/talk/base.png', import.meta.url).pathname);
  assert.equal(img.w, 720); assert.equal(img.h, 936);
  let opaque = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 32) opaque++;
  assert.ok(opaque > 100000, `expected real art, got ${opaque} opaque px`);
});

test('chroma key + components find separated shapes', () => {
  const img = blank(60, 30);
  rect(img, 5, 5, 10, 12, [220, 60, 60]);
  rect(img, 35, 8, 12, 10, [60, 60, 220]);
  chromaKey(img);
  const comps = connectedComponents(alphaMask(img), img.w, img.h);
  assert.equal(comps.length, 2);
  assert.equal(comps[0].area, 120);
});

test('cut turns a labelled sheet into parts + an estimated rig', () => {
  const d = tmp(); const out = join(d, 'char');
  initCharacter(out, { id: 'char', name: 'Char' });
  const sheet = blank(120, 60);
  rect(sheet, 5, 10, 30, 40, [220, 60, 60]);    // torso-ish
  rect(sheet, 70, 15, 24, 18, [60, 60, 220]);   // foot-ish
  writePng(join(out, 'sheets/body.png'), sheet);
  writeFileSync(join(out, 'sheets/sheets.json'), JSON.stringify({ sheets: [{ file: 'sheets/body.png', labels: ['torso', 'foot'] }] }));
  const { rig } = cutSheets(out);
  assert.ok(existsSync(join(out, 'parts/torso.png')));
  assert.ok(existsSync(join(out, 'parts/foot.png')));
  assert.equal(rig.parts.torso.width, 30);
  assert.ok(rig.parts.foot.ankle);
  assert.equal(loadManifest(out).motion.rig, 'motion/rig.json');
});

test('facepack derives patch rects from state diffs', () => {
  const d = tmp(); const out = join(d, 'char');
  initCharacter(out, { id: 'char', name: 'Char', w: 100, h: 120 });
  const base = blank(100, 120, [240, 200, 170, 255]);
  writePng(join(out, 'talk/base.png'), base);
  mkdirSync(join(out, 'states'), { recursive: true });
  const aState = blank(100, 120, [240, 200, 170, 255]);
  rect(aState, 40, 62, 20, 14, [90, 20, 20]);      // the A mouth
  writePng(join(out, 'states/A.png'), aState);
  const blink = blank(100, 120, [240, 200, 170, 255]);
  rect(blink, 30, 30, 40, 8, [40, 40, 40]);        // closed eyes
  writePng(join(out, 'states/blink.png'), blink);

  const diff = diffBbox(base, aState);
  assert.deepEqual(diff.bbox, { x: 40, y: 62, w: 20, h: 14 });

  makeFacePatches(out, { margin: 4 });
  const m = loadManifest(out);
  assert.deepEqual(m.talk.patches.A, { x: 36, y: 58, w: 28, h: 22 });
  assert.deepEqual(m.talk.patches.blink, { x: 26, y: 26, w: 48, h: 16 });
  const patch = readPng(join(out, 'talk/A.png'));
  assert.equal(patch.w, 28); assert.equal(patch.h, 22);
});

test('facepack refuses a drifted state drawing', () => {
  const d = tmp(); const out = join(d, 'char');
  initCharacter(out, { id: 'char', name: 'Char', w: 100, h: 120 });
  writePng(join(out, 'talk/base.png'), blank(100, 120, [240, 200, 170, 255]));
  mkdirSync(join(out, 'states'), { recursive: true });
  writePng(join(out, 'states/A.png'), blank(100, 120, [10, 10, 200, 255])); // everything changed
  assert.throws(() => makeFacePatches(out), /drifted/);
});
