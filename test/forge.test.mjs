import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pngHeader, pngSize } from '../src/png.mjs';
import { initCharacter } from '../src/init.mjs';
import { importTalk } from '../src/importTalk.mjs';
import { qaCharacter } from '../src/qa.mjs';
import { exportTalkFamily } from '../src/exporters.mjs';
import { packCharacter } from '../src/pack.mjs';
import { loadManifest } from '../src/manifest.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'forge-'));
const png = (path, w, h) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, pngHeader(w, h)); };

test('pngSize reads IHDR dimensions', () => {
  const d = tmp(); const p = join(d, 'x.png');
  writeFileSync(p, pngHeader(720, 936));
  assert.deepEqual(pngSize(p), { w: 720, h: 936 });
});

test('init scaffolds a pack whose prompts exist and manifest validates structurally', () => {
  const d = tmp(); const out = join(d, 'biscuit-2');
  initCharacter(out, { id: 'biscuit-2', name: 'Biscuit 2' });
  assert.ok(existsSync(join(out, 'character.rigpop.json')));
  assert.ok(existsSync(join(out, 'prompts/00-model-sheet.md')));
  assert.ok(existsSync(join(out, 'prompts/03-face-kit.md')));
  const q = qaCharacter(out);
  // art not generated yet -> base missing is an error, but no structural errors
  assert.ok(q.errors.some((e) => e.includes('talk.base')));
});

function makeTalkSource() {
  const d = tmp(); const chars = join(d, 'characters');
  mkdirSync(chars, { recursive: true });
  const entry = { w: 720, h: 936, patches: { A: { x: 322, y: 204, w: 79, h: 79 }, O: { x: 326, y: 212, w: 74, h: 58 }, E: { x: 311, y: 205, w: 102, h: 64 }, blink: { x: 284, y: 149, w: 153, h: 53 } } };
  writeFileSync(join(chars, 'characters.json'), JSON.stringify({ testchar: entry }));
  png(join(chars, 'testchar_base.png'), 720, 936);
  png(join(chars, 'testchar_A.png'), 79, 79);
  png(join(chars, 'testchar_O.png'), 74, 58);
  png(join(chars, 'testchar_E.png'), 102, 64);
  png(join(chars, 'testchar_blink.png'), 153, 53);
  png(join(chars, 'testchar_pose_wave.png'), 720, 936);
  return { chars, d };
}

test('import-talk adopts a talk character and qa passes; export round-trips it', () => {
  const { chars } = makeTalkSource();
  const d = tmp(); const out = join(d, 'testchar');
  importTalk(chars, 'testchar', out, { voice: 'en-IN-NeerjaExpressiveNeural' });
  const q = qaCharacter(out);
  assert.equal(q.ok, true, q.errors.join('; '));

  const target = join(d, 'app-characters');
  const m = loadManifest(out);
  const r = exportTalkFamily(m, out, target, 'talk');
  assert.ok(r.written.includes('testchar_base.png'));
  const index = JSON.parse(readFileSync(join(target, 'characters.json'), 'utf8'));
  assert.equal(index.testchar.w, 720);
  assert.equal(index.testchar.patches.A.w, 79);
});

test('qa fails a character whose patch image does not match its rect', () => {
  const { chars } = makeTalkSource();
  // corrupt: blink image 10px too wide
  png(join(chars, 'testchar_blink.png'), 163, 53);
  const d = tmp(); const out = join(d, 'testchar');
  importTalk(chars, 'testchar', out, {});
  const q = qaCharacter(out);
  assert.equal(q.ok, false);
  assert.ok(q.errors.some((e) => e.includes('blink')));
});

test('qa fails a patch rect that escapes the canvas', () => {
  const { chars } = makeTalkSource();
  const d = tmp(); const out = join(d, 'testchar');
  importTalk(chars, 'testchar', out, {});
  const mf = join(out, 'character.rigpop.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.talk.patches.A.x = 700; // 700 + 79 > 720
  writeFileSync(mf, JSON.stringify(m, null, 2));
  const q = qaCharacter(out);
  assert.equal(q.ok, false);
  assert.ok(q.errors.some((e) => e.includes('escapes the')));
});

test('pack bundles files with a sha256 index', () => {
  const { chars } = makeTalkSource();
  const d = tmp(); const out = join(d, 'testchar');
  importTalk(chars, 'testchar', out, {});
  const { outDir, index } = packCharacter(out, join(d, 'dist'));
  assert.ok(existsSync(join(outDir, 'pack.json')));
  assert.equal(index.id, 'testchar');
  assert.ok(index.files.length >= 6);
  assert.ok(index.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
});
