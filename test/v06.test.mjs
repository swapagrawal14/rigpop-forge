import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCharacter } from '../src/init.mjs';
import { loadManifest } from '../src/manifest.mjs';
import { VOICE_PRESETS, listPresets, setVoicePreset } from '../src/voices.mjs';
import { buildDuet } from '../src/duet.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'forge6-'));
const EXAMPLE = new URL('../examples/doodle-swapnil', import.meta.url).pathname;

test('voice presets cast into the manifest', () => {
  const out = join(tmp(), 'char');
  initCharacter(out, { id: 'char', name: 'Char' });
  assert.ok(listPresets().some((l) => l.startsWith('neerja = en-IN-NeerjaExpressiveNeural')));
  const v = setVoicePreset(out, 'prabhat');
  assert.equal(v.id, VOICE_PRESETS.prabhat.id);
  assert.equal(loadManifest(out).voice.preset, 'prabhat');
  assert.throws(() => setVoicePreset(out, 'nobody'), /unknown preset/);
});

test('duet bundles two packs with stage placements and a script', () => {
  // second character: a copy of the example under a new id
  const other = join(tmp(), 'prof');
  cpSync(EXAMPLE, other, { recursive: true });
  const m = loadManifest(other);
  m.id = 'profdoodle'; m.name = 'Professor Doodle';
  writeFileSync(join(other, 'character.rigpop.json'), JSON.stringify(m, null, 2));

  const out = join(tmp(), 'duet');
  const duet = buildDuet(EXAMPLE, other, out);
  assert.equal(duet.format, 'rigpop-duet');
  assert.equal(duet.cast.length, 2);
  assert.equal(duet.cast[0].side, 'left'); assert.equal(duet.cast[1].side, 'right');
  assert.ok(duet.cast[0].x < duet.cast[1].x);
  assert.equal(duet.cast[0].h, duet.cast[1].h, 'common height');
  assert.equal(duet.cast[0].y, duet.cast[1].y, 'floor aligned');
  const index = JSON.parse(readFileSync(join(out, 'characters/characters.json'), 'utf8'));
  assert.ok(index.kdswapnil && index.profdoodle, 'merged characters.json holds both');
  assert.ok(existsSync(join(out, 'characters/kdswapnil_base.png')));
  assert.ok(existsSync(join(out, 'characters/profdoodle_base.png')));
  const script = readFileSync(join(out, 'script.md'), 'utf8');
  assert.ok(script.includes('[kdswapnil]') && script.includes('[profdoodle]'));
  assert.throws(() => buildDuet(EXAMPLE, EXAMPLE, join(tmp(), 'duet2')), /DIFFERENT/);
});
