#!/usr/bin/env node
// rigpop-forge — the Rigpop character factory.
// One drawing in, a QA-passed character pack out: for rigpop-talk,
// rigpop-agents and rigpop-motion. Zero runtime dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadManifest } from '../src/manifest.mjs';
import { initCharacter } from '../src/init.mjs';
import { sheetPrompts } from '../src/prompts.mjs';
import { qaCharacter } from '../src/qa.mjs';
import { importTalk } from '../src/importTalk.mjs';
import { exportMotion, exportTalkFamily } from '../src/exporters.mjs';
import { packCharacter } from '../src/pack.mjs';
import { cutSheets } from '../src/cut.mjs';
import { makeFacePatches } from '../src/facepack.mjs';
import { exportWowkit } from '../src/wowkit.mjs';
import { buildFacepacks } from '../src/facepacks.mjs';
import { buildRegistry, publish } from '../src/registry.mjs';
import { fetchPack } from '../src/fetch.mjs';
import { tune } from '../src/tune.mjs';
import { normalisePack } from '../src/normalise.mjs';
import { makeHose, paintSleeves } from '../src/refine.mjs';
import { buildSite } from '../src/registry.mjs';
import { listPresets, setVoicePreset } from '../src/voices.mjs';
import { buildDuet } from '../src/duet.mjs';

const HELP = `rigpop-forge — one drawing in, a character pack out

  init <id> --out <dir> [--name N] [--voice V] [--w 720] [--h 960] [--bible "..."]
      Scaffold a new character pack + sheet prompts.
  prompts <packDir>
      (Re)generate prompts/*.md sheet prompts from the pack's style bible.
  import-talk <charactersDir> <id> --out <packDir> [--name N] [--voice V]
      Adopt an existing rigpop-talk / rigpop-agents character as a Forge pack.
  qa <packDir>
      The gate: patch rects, PNG sizes, motion parts, pose packs. Exit 1 on errors.
  export talk|agents <packDir> <charactersOutDir>
      Write <id>_*.png + merged characters.json where the app expects them.
  export motion <packDir> <motionRepoDir>
      Write characters/<id>/ (rig.json, pose packs, cast snippet).
  pack <packDir> --out <dir>
      Bundle into <id>.rigpop-pack/ with a sha256 content index.
  cut <packDir>
      Sheets -> parts: chroma-key sheets/sheets.json sheets, cut components
      in reading order, write parts/*.png + an estimated motion/rig.json.
  facepack <packDir> [--margin 6]
      Derive talk patches + rects by diffing states/{A,O,E,blink}.png
      (full-canvas variants) against the base drawing.
  export wowkit <packDir> <wowkitRepoDir>
      Write a WowKit v2 project (cutout image + estimated joints + sway).
  facepacks <packDir> [--face x,y,w,h] [--force]
      Pose-pack face patches: per key, blink + mouth tiles filled with the
      skin sampled on that key, indexed in the pack's pack.json.
  publish <packDir> --registry <dir>
      QA-pack the character into a registry and rebuild its catalog.
  registry build <dir>
      Rebuild registry.json + the static gallery in a registry folder.
  fetch <registryDir|url> <id> --out <dir>
      Pull a pack from a registry by id, verifying every file's sha256.
  tune <packDir> [--set <part>:<path>=<number>]
      List rig anchors, adjust one, and render motion/rig-preview.png.
  normalise <packDir> [--pack <name>]
      Pose-pack keys onto one height + floor line (face rects follow).
  sleeves <packDir>
      Paint the arm sleeve caps into the torso at the shoulder anchors.
  hose <packDir>
      Rubber-hose strips for limb parts (parts/<label>.hose.png).
  registry site <dir> --out <siteDir>
      Copy a registry into a deployable static site + Pages workflow.
  voice <packDir> --preset <name> | --list
      Cast a character's voice from the Edge TTS preset roster.
  duet <packA> <packB> --out <dir> [--name "A & B"]
      Bundle two QA-passed packs into a duet scene (cast + script).
`;

function args(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else pos.push(argv[i]);
  }
  return { pos, flags };
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, flags } = args(rest);

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

try {
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(HELP); process.exit(cmd ? 0 : 1); }

  if (cmd === 'init') {
    const id = pos[0]; if (!id) fail('init needs an <id>, e.g. rigpop-forge init biscuit-2 --out characters/biscuit-2');
    const out = resolve(flags.out || `characters/${id}`);
    const m = initCharacter(out, { id, name: flags.name, voice: flags.voice, bible: flags.bible, outfit: flags.outfit, w: flags.w ? +flags.w : undefined, h: flags.h ? +flags.h : undefined });
    console.log(`✓ forged a starter pack for ${m.name} at ${out}`);
    console.log('  next: generate art with prompts/00-model-sheet.md first, then fill patch rects and run qa');
  }

  else if (cmd === 'prompts') {
    const dir = resolve(pos[0] || '.');
    const m = loadManifest(dir);
    mkdirSync(join(dir, 'prompts'), { recursive: true });
    for (const [file, text] of Object.entries(sheetPrompts(m))) writeFileSync(join(dir, 'prompts', file), text);
    console.log(`✓ sheet prompts for ${m.name} written to ${join(dir, 'prompts')}`);
  }

  else if (cmd === 'import-talk') {
    const [src, id] = pos;
    if (!src || !id) fail('import-talk needs <charactersDir> <id>');
    const out = resolve(flags.out || `characters/${id}`);
    const m = importTalk(resolve(src), id, out, { name: flags.name, voice: flags.voice, bible: flags.bible });
    const q = qaCharacter(out);
    console.log(`✓ imported ${id} as a Forge pack at ${out} — qa: ${q.ok ? 'PASS' : 'FAIL'}`);
    for (const e of q.errors) console.log(`  ✗ ${e}`);
    for (const w of q.warnings) console.log(`  ! ${w}`);
    if (!q.ok) process.exit(1);
    void m;
  }

  else if (cmd === 'qa') {
    const dir = resolve(pos[0] || '.');
    const q = qaCharacter(dir);
    console.log(`qa ${dir}`);
    for (const e of q.errors) console.log(`  ✗ ${e}`);
    for (const w of q.warnings) console.log(`  ! ${w}`);
    console.log(q.ok ? '✓ PASS' : `✗ FAIL (${q.errors.length} errors)`);
    process.exit(q.ok ? 0 : 1);
  }

  else if (cmd === 'export') {
    const [app, packDir, outDir] = pos;
    if (!app || !packDir || !outDir) fail('export needs <talk|agents|motion|wowkit> <packDir> <outDir>');
    const dir = resolve(packDir);
    const q = qaCharacter(dir);
    if (!q.ok) fail(`pack does not pass qa — refusing to export a broken character (${q.errors[0]})`);
    const m = q.manifest;
    const r = app === 'motion' ? exportMotion(m, dir, resolve(outDir))
      : app === 'wowkit' ? exportWowkit(m, dir, resolve(outDir))
      : exportTalkFamily(m, dir, resolve(outDir), app);
    console.log(`✓ exported ${m.id} for rigpop-${r.app}: ${r.written.join(', ')}`);
  }

  else if (cmd === 'cut') {
    const dir = resolve(pos[0] || '.');
    const { report } = cutSheets(dir);
    for (const line of report) console.log(`  ${line}`);
    console.log(`✓ cut ${dir} — now run: rigpop-forge qa ${pos[0] || '.'}`);
  }

  else if (cmd === 'facepack') {
    const dir = resolve(pos[0] || '.');
    const { report } = makeFacePatches(dir, { margin: flags.margin ? +flags.margin : 6 });
    for (const line of report) console.log(`  ${line}`);
    console.log(`✓ face patches derived for ${dir} — manifest rects updated, run qa to verify`);
  }

  else if (cmd === 'facepacks') {
    const dir = resolve(pos[0] || '.');
    let faceOverride = null;
    if (flags.face) {
      const [x, y, w, h] = String(flags.face).split(',').map(Number);
      if ([x, y, w, h].some(Number.isNaN)) fail('--face needs x,y,w,h numbers');
      faceOverride = { x, y, w, h };
    }
    const { report } = buildFacepacks(dir, { faceOverride, force: !!flags.force });
    for (const line of report) console.log(`  ${line}`);
    console.log(`✓ pose-pack face patches built for ${dir}`);
  }

  else if (cmd === 'publish') {
    const dir = resolve(pos[0] || '.');
    if (!flags.registry) fail('publish needs --registry <dir>');
    const q = qaCharacter(dir);
    if (!q.ok) fail(`pack does not pass qa — refusing to publish a broken character (${q.errors[0]})`);
    const { index, entries } = publish(dir, resolve(flags.registry));
    console.log(`✓ published ${index.id} — registry now holds ${entries.length} pack(s)`);
  }

  else if (cmd === 'registry') {
    if (pos[0] === 'build' && pos[1]) {
      const entries = buildRegistry(resolve(pos[1]));
      console.log(`✓ registry rebuilt: ${entries.length} pack(s) — see registry.json + index.html in ${resolve(pos[1])}`);
    } else if (pos[0] === 'site' && pos[1] && flags.out) {
      const entries = buildSite(resolve(pos[1]), resolve(flags.out));
      console.log(`✓ deployable site in ${resolve(flags.out)}: ${entries.length} pack(s), gallery + catalog + .github/workflows/pages.yml — see DEPLOY.md there`);
    } else fail('usage: rigpop-forge registry build <dir> | registry site <dir> --out <siteDir>');
  }

  else if (cmd === 'fetch') {
    const [registry, id] = pos;
    if (!registry || !id) fail('usage: rigpop-forge fetch <registryDir|url> <id> --out <dir>');
    const { dest, files, bytes } = await fetchPack(registry, id, resolve(flags.out || '.'));
    console.log(`✓ fetched ${id}: ${files} files, ${Math.round(bytes / 1024)} KB, sha256-verified -> ${dest}`);
  }

  else if (cmd === 'tune') {
    const dir = resolve(pos[0] || '.');
    const { changes, anchors, preview } = tune(dir, { set: flags.set || null });
    for (const c of changes) console.log(`  set ${c}`);
    for (const a of anchors) console.log(`  ${a}`);
    console.log(`✓ rig preview: ${preview}`);
  }

  else if (cmd === 'normalise') {
    const dir = resolve(pos[0] || '.');
    const { report } = normalisePack(dir, flags.pack || null);
    for (const line of report) console.log(`  ${line}`);
    console.log(`✓ pose packs normalised — run qa, then facepacks to rebuild face tiles`);
  }

  else if (cmd === 'sleeves') {
    const dir = resolve(pos[0] || '.');
    const { report } = paintSleeves(dir);
    for (const line of report) console.log(`  ${line}`);
    console.log(`✓ sleeves painted for ${dir}`);
  }

  else if (cmd === 'hose') {
    const dir = resolve(pos[0] || '.');
    const { report } = makeHose(dir);
    for (const line of report) console.log(`  ${line}`);
    console.log(`✓ hose strips written for ${dir}`);
  }

  else if (cmd === 'voice') {
    if (flags.list) { for (const line of listPresets()) console.log(`  ${line}`); }
    else if (flags.preset && pos[0]) {
      const v = setVoicePreset(resolve(pos[0]), flags.preset);
      console.log(`✓ cast voice: ${v.preset} = ${v.id}`);
    } else fail('usage: rigpop-forge voice <packDir> --preset <name> | voice --list');
  }

  else if (cmd === 'duet') {
    const [pa, pb] = pos;
    if (!pa || !pb || !flags.out) fail('usage: rigpop-forge duet <packA> <packB> --out <dir>');
    for (const p of [pa, pb]) {
      const q = qaCharacter(resolve(p));
      if (!q.ok) fail(`pack ${p} does not pass qa — refusing to cast it in a duet (${q.errors[0]})`);
    }
    const duet = buildDuet(resolve(pa), resolve(pb), resolve(flags.out), { name: flags.name || null });
    console.log(`✓ duet "${duet.name}": stage ${duet.stage.w}x${duet.stage.h}, cast ${duet.cast.map((c) => c.id).join(' + ')} -> ${resolve(flags.out)}`);
  }

  else if (cmd === 'pack') {
    const dir = resolve(pos[0] || '.');
    const q = qaCharacter(dir);
    if (!q.ok) fail(`pack does not pass qa — refusing to pack a broken character (${q.errors[0]})`);
    const { outDir, index } = packCharacter(dir, resolve(flags.out || 'dist'));
    console.log(`✓ packed ${index.id} (${index.files.length} files) -> ${outDir}`);
  }

  else fail(`unknown command "${cmd}"\n\n${HELP}`);
} catch (e) {
  fail(e.message);
}
