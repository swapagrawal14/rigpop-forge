import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPng, writePng } from '../src/pngcodec.mjs';
import { solidImage, tightBbox } from '../src/imageops.mjs';
import { initCharacter } from '../src/init.mjs';
import { loadManifest } from '../src/manifest.mjs';
import { publish } from '../src/registry.mjs';
import { fetchPack } from '../src/fetch.mjs';
import { listAnchors, setAnchor, tune } from '../src/tune.mjs';
import { normalisePack } from '../src/normalise.mjs';
import { qaCharacter } from '../src/qa.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'forge4-'));
const EXAMPLE = new URL('../examples/doodle-swapnil', import.meta.url).pathname;

test('fetch pulls a published pack byte-verified and it passes qa', async () => {
  const reg = join(tmp(), 'registry');
  publish(EXAMPLE, reg);
  const outRoot = join(tmp(), 'pulled');
  mkdirSync(outRoot, { recursive: true });
  const { dest, files } = await fetchPack(reg, 'kdswapnil', outRoot);
  assert.ok(files >= 10);
  assert.ok(existsSync(join(dest, 'character.rigpop.json')));
  assert.equal(qaCharacter(dest).ok, true);
  await assert.rejects(() => fetchPack(reg, 'nobody', outRoot), /no pack "nobody"/);
});

test('tune lists anchors, sets one, and renders a preview sheet', () => {
  const out = join(tmp(), 'char');
  initCharacter(out, { id: 'char', name: 'Char' });
  writePng(join(out, 'parts/torso.png'), solidImage(60, 80, [70, 120, 200, 255]));
  mkdirSync(join(out, 'motion'), { recursive: true });
  const rig = { name: 'char', parts: { torso: { file: 'parts/torso.png', w: 60, h: 80, hip: { x: 30, y: 66 }, neckTop: { x: 30, y: 2 } } } };
  writeFileSync(join(out, 'motion/rig.json'), JSON.stringify(rig));
  const m = loadManifest(out);
  m.motion = { rig: 'motion/rig.json' };
  writeFileSync(join(out, 'character.rigpop.json'), JSON.stringify(m, null, 2));

  const { rig: loaded } = (() => ({ rig: JSON.parse(readFileSync(join(out, 'motion/rig.json'), 'utf8')) }))();
  assert.ok(listAnchors(loaded).some((a) => a === 'torso:hip.y = 66'));

  const { changes, preview } = tune(out, { set: 'torso:hip.y=70' });
  assert.deepEqual(changes, ['torso:hip.y = 70']);
  const saved = JSON.parse(readFileSync(join(out, 'motion/rig.json'), 'utf8'));
  assert.equal(saved.parts.torso.hip.y, 70);
  assert.equal(saved.anchorsEstimated, false);
  assert.ok(existsSync(preview));
  const img = readPng(preview);
  assert.ok(img.w >= 260 && img.h >= 260);
  // a red-ish marker pixel exists on the sheet
  let red = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 200 && img.data[i + 1] < 90 && img.data[i + 2] > 40 && img.data[i + 2] < 140) red++;
  assert.ok(red > 10, 'anchor markers drawn');
});

test('normalise puts pose keys on one height and floor line', () => {
  const out = join(tmp(), 'char');
  initCharacter(out, { id: 'char', name: 'Char' });
  const poseDir = join(out, 'poses/wave');
  mkdirSync(poseDir, { recursive: true });
  // key0: figure 40 tall sitting high; key1: figure 70 tall lower
  const k0 = { w: 100, h: 120, data: new Uint8ClampedArray(100 * 120 * 4) };
  const k1 = { w: 100, h: 120, data: new Uint8ClampedArray(100 * 120 * 4) };
  const fill = (img, x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = (yy * 100 + xx) * 4; img.data[i] = 200; img.data[i + 3] = 255; } };
  fill(k0, 30, 10, 30, 40);
  fill(k1, 20, 40, 44, 70);
  writePng(join(poseDir, 'key0.png'), k0);
  writePng(join(poseDir, 'key1.png'), k1);
  const m = loadManifest(out);
  m.motion = { rig: 'motion/rig.json', posePacks: [{ name: 'wave', dir: 'poses/wave', keys: 2, face: { x: 34, y: 12, w: 20, h: 16 } }] };
  writeFileSync(join(out, 'character.rigpop.json'), JSON.stringify(m, null, 2));

  normalisePack(out);
  const b0 = tightBbox(readPng(join(poseDir, 'key0.png'))).bbox;
  const b1 = tightBbox(readPng(join(poseDir, 'key1.png'))).bbox;
  assert.ok(Math.abs(b0.h - b1.h) <= 2, `heights ${b0.h} vs ${b1.h}`);
  assert.equal(b0.y + b0.h, b1.y + b1.h, 'same floor line');
  const face = loadManifest(out).motion.posePacks[0].face;
  assert.ok(face.h > 16, 'face rect scaled with the art');
});
