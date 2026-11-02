import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPng, writePng } from '../src/pngcodec.mjs';
import { solidImage } from '../src/imageops.mjs';
import { initCharacter } from '../src/init.mjs';
import { loadManifest } from '../src/manifest.mjs';
import { exportWowkit, estimateJoints } from '../src/wowkit.mjs';
import { buildFacepacks, packFaceRects } from '../src/facepacks.mjs';
import { buildRegistry, publish } from '../src/registry.mjs';
import { qaCharacter } from '../src/qa.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'forge3-'));
const EXAMPLE = new URL('../examples/doodle-swapnil', import.meta.url).pathname;

test('wowkit export produces a real v2 project from the example pack', () => {
  const out = join(tmp(), 'wowkit');
  const m = loadManifest(EXAMPLE);
  const r = exportWowkit(m, EXAMPLE, out);
  assert.equal(r.app, 'wowkit');
  const p = JSON.parse(readFileSync(join(out, 'projects/cast/kdswapnil.json'), 'utf8'));
  assert.equal(p.v, 2);
  assert.deepEqual(p.size, [720, 936]);
  assert.equal(p.image, 'assets/cast/kdswapnil-cutout.png');
  assert.ok(existsSync(join(out, p.image)));
  assert.equal(p.joints.length, 15);
  assert.equal(p.joints[0].name, 'hip'); assert.equal(p.joints[0].parent, null);
  const byName = Object.fromEntries(p.joints.map((j) => [j.name, j]));
  for (const j of p.joints) {
    assert.ok(j.x >= 0 && j.x <= 720 && j.y >= 0 && j.y <= 936, `${j.name} inside canvas`);
    if (j.parent) assert.ok(byName[j.parent], `${j.name} parent exists`);
  }
  // the head joint should sit at the real face centre (blink rect centre x = 360)
  assert.ok(Math.abs(byName.head.x - 360) <= 2);
  assert.equal(Object.keys(p.animation.tracks).length, 9);
  assert.equal(p.animation.tracks.hip.length, 33);
  assert.equal(p.forge.jointsEstimated, true);
});

test('facepacks builds skin-sampled tiles + pack.json for a pose pack', () => {
  const out = join(tmp(), 'char');
  initCharacter(out, { id: 'char', name: 'Char' });
  // face-kit parts
  writePng(join(out, 'parts/eyes.closed.png'), solidImage(20, 4, [30, 30, 30, 255]));
  writePng(join(out, 'parts/mouth.M.png'), solidImage(14, 3, [60, 20, 20, 255]));
  const mouthA = { w: 12, h: 10, data: new Uint8ClampedArray(12 * 10 * 4) };
  for (let y = 2; y < 8; y++) for (let x = 3; x < 9; x++) {
    const i = (y * 12 + x) * 4; mouthA.data[i] = 90; mouthA.data[i + 1] = 20; mouthA.data[i + 2] = 20; mouthA.data[i + 3] = 255;
  }
  writePng(join(out, 'parts/mouth.A.png'), mouthA);
  writePng(join(out, 'parts/mouth.O.png'), solidImage(8, 10, [90, 20, 20, 255]));
  writePng(join(out, 'parts/mouth.E.png'), solidImage(14, 6, [90, 20, 20, 255]));
  // pose pack: face region skin colour on a green-ish body
  const poseDir = join(out, 'poses/wave');
  mkdirSync(poseDir, { recursive: true });
  for (const k of ['key0.png', 'key1.png']) {
    const img = solidImage(120, 140, [70, 140, 70, 255]);
    for (let y = 10; y < 70; y++) for (let x = 30; x < 90; x++) {
      const i = (y * 120 + x) * 4; img.data[i] = 240; img.data[i + 1] = 200; img.data[i + 2] = 170;
    }
    writePng(join(poseDir, k), img);
  }
  const m = loadManifest(out);
  m.motion = { posePacks: [{ name: 'wave', dir: 'poses/wave', keys: 2, face: { x: 30, y: 10, w: 60, h: 60 } }] };
  writeFileSync(join(out, 'character.rigpop.json'), JSON.stringify(m, null, 2));

  buildFacepacks(out);
  assert.ok(existsSync(join(poseDir, 'key0.blink.png')));
  assert.ok(existsSync(join(poseDir, 'key1.m.A.png')));
  const idx = JSON.parse(readFileSync(join(poseDir, 'pack.json'), 'utf8'));
  assert.equal(idx.keys.length, 2);
  const rects = packFaceRects({ x: 30, y: 10, w: 60, h: 60 });
  const blink = readPng(join(poseDir, 'key0.blink.png'));
  assert.equal(blink.w, rects.eyes.w); assert.equal(blink.h, rects.eyes.h);
  // mouth tile centre should carry the mouth art colour, corner the sampled skin
  const mouthTile = readPng(join(poseDir, 'key0.m.A.png'));
  const centre = ((mouthTile.h >> 1) * mouthTile.w + (mouthTile.w >> 1)) * 4;
  assert.equal(mouthTile.data[centre], 90);
  assert.equal(mouthTile.data[0], 240); // skin sampled from the key's face
});

test('publish + registry build a catalog and gallery', () => {
  const reg = join(tmp(), 'registry');
  const { entries } = publish(EXAMPLE, reg);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'kdswapnil');
  assert.ok(entries[0].poses.includes('wave'));
  const catalog = JSON.parse(readFileSync(join(reg, 'registry.json'), 'utf8'));
  assert.equal(catalog.format, 'rigpop-registry');
  const html = readFileSync(join(reg, 'index.html'), 'utf8');
  assert.ok(html.includes('Doodle Swapnil'));
  const again = buildRegistry(reg); // rebuild is idempotent
  assert.equal(again.length, 1);
});

test('qa warns (not fails) when a pose pack has no face patches', () => {
  const out = join(tmp(), 'char');
  initCharacter(out, { id: 'char', name: 'Char' });
  const poseDir = join(out, 'poses/wave');
  mkdirSync(poseDir, { recursive: true });
  writePng(join(poseDir, 'key0.png'), solidImage(10, 10, [1, 2, 3, 255]));
  for (const f of ['mouth.A.png', 'mouth.E.png', 'mouth.O.png', 'eyes.open.png'])
    writePng(join(out, 'parts', f), solidImage(6, 4, [9, 9, 9, 255]));
  mkdirSync(join(out, 'motion'), { recursive: true });
  writeFileSync(join(out, 'motion/rig.json'), JSON.stringify({ parts: {
    'mouth.A': { file: 'parts/mouth.A.png' }, 'mouth.E': { file: 'parts/mouth.E.png' },
    'mouth.O': { file: 'parts/mouth.O.png' }, 'eyes.open': { file: 'parts/eyes.open.png' },
  } }));
  const m = loadManifest(out);
  m.motion = { rig: 'motion/rig.json', posePacks: [{ name: 'wave', dir: 'poses/wave', keys: 1 }] };
  writeFileSync(join(out, 'character.rigpop.json'), JSON.stringify(m, null, 2));
  const q = qaCharacter(out);
  assert.ok(q.warnings.some((w) => w.includes('facepacks')), q.warnings.join('; '));
});
