import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPng, writePng } from '../src/pngcodec.mjs';
import { solidImage } from '../src/imageops.mjs';
import { initCharacter } from '../src/init.mjs';
import { loadManifest } from '../src/manifest.mjs';
import { hoseStrip, makeHose, paintSleeves } from '../src/refine.mjs';
import { buildSite, publish } from '../src/registry.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'forge5-'));
const EXAMPLE = new URL('../examples/doodle-swapnil', import.meta.url).pathname;
const px = (img, x, y) => [...img.data.slice((y * img.w + x) * 4, (y * img.w + x) * 4 + 3)];

function packWithRig(parts) {
  const out = join(tmp(), 'char');
  initCharacter(out, { id: 'char', name: 'Char' });
  mkdirSync(join(out, 'motion'), { recursive: true });
  writeFileSync(join(out, 'motion/rig.json'), JSON.stringify({ name: 'char', parts }));
  const m = loadManifest(out);
  m.motion = { rig: 'motion/rig.json' };
  writeFileSync(join(out, 'character.rigpop.json'), JSON.stringify(m, null, 2));
  return out;
}

test('sleeves paints the arm cap into the torso at both shoulders', () => {
  const torso = solidImage(220, 160, [70, 120, 200, 255]);
  const arm = { w: 30, h: 80, data: new Uint8ClampedArray(30 * 80 * 4) };
  for (let y = 0; y < 80; y++) for (let x = 0; x < 30; x++) {
    const i = (y * 30 + x) * 4, c = y < 32 ? [230, 60, 60] : [40, 40, 40]; // red sleeve cap on top
    arm.data[i] = c[0]; arm.data[i + 1] = c[1]; arm.data[i + 2] = c[2]; arm.data[i + 3] = 255;
  }
  const out = packWithRig({
    torso: { file: 'parts/torso.png', w: 220, h: 160, shoulderL: { x: 40, y: 30 }, shoulderR: { x: 180, y: 30 } },
    'arm.upper': { file: 'parts/arm.upper.png', w: 30, h: 80 },
  });
  writePng(join(out, 'parts/torso.png'), torso);
  writePng(join(out, 'parts/arm.upper.png'), arm);
  paintSleeves(out);
  const after = readPng(join(out, 'parts/torso.png'));
  assert.deepEqual(px(after, 22, 30), [230, 60, 60], 'left shoulder wears the red cap');
  assert.deepEqual(px(after, 198, 30), [230, 60, 60], 'right shoulder too (mirrored)');
  assert.deepEqual(px(after, 110, 100), [70, 120, 200], 'torso middle untouched');
  assert.ok(existsSync(join(out, 'parts/torso.nosleeve.png')));
  assert.equal(JSON.parse(readFileSync(join(out, 'motion/rig.json'), 'utf8')).sleeves, true);
});

test('hose straightens a tapered limb into a median-width strip', () => {
  const img = { w: 40, h: 50, data: new Uint8ClampedArray(40 * 50 * 4) };
  for (let y = 0; y < 50; y++) {
    const half = 4 + Math.floor(y / 5); // widens going down: rows 8..26 wide
    for (let x = 20 - half; x < 20 + half; x++) {
      const i = (y * 40 + x) * 4; img.data[i] = 90; img.data[i + 1] = 160; img.data[i + 2] = 90; img.data[i + 3] = 255;
    }
  }
  const strip = hoseStrip(img);
  assert.ok(strip.w >= 16 && strip.w <= 20, `median width ${strip.w}`);
  assert.equal(strip.h, 50);
  for (let y = 0; y < 50; y++) assert.equal(strip.data[(y * strip.w) * 4 + 3], 255, `row ${y} filled edge to edge`);

  const out = packWithRig({ 'arm.upper': { file: 'parts/arm.upper.png', w: 40, h: 50 } });
  writePng(join(out, 'parts/arm.upper.png'), img);
  makeHose(out);
  assert.ok(existsSync(join(out, 'parts/arm.upper.hose.png')));
  const rig = JSON.parse(readFileSync(join(out, 'motion/rig.json'), 'utf8'));
  assert.equal(rig.parts['arm.upper'].hose.file, 'parts/arm.upper.hose.png');
});

test('registry site produces a deployable folder with Pages workflow', () => {
  const reg = join(tmp(), 'registry');
  publish(EXAMPLE, reg);
  const site = join(tmp(), 'site');
  const entries = buildSite(reg, site);
  assert.equal(entries.length, 1);
  for (const f of ['index.html', 'registry.json', 'DEPLOY.md', '.github/workflows/pages.yml', 'packs/kdswapnil.rigpop-pack/character.rigpop.json'])
    assert.ok(existsSync(join(site, f)), f);
  assert.ok(readFileSync(join(site, '.github/workflows/pages.yml'), 'utf8').includes('deploy-pages'));
});
