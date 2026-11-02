// The Forge QA gate. Mirrors the lesson rigpop-motion learned the hard way:
// a character that animates perfectly but never blinks or speaks is a silent
// failure, so missing/undersized face patches are ERRORS, not warnings.
//
// Checks (talk layer, verified against the real rigpop-talk cast):
//   - base + pose images exist and are exactly canvas-sized
//   - every patch image exists and its PNG size equals its rect {w,h}
//   - every patch rect sits fully inside the canvas
// Checks (motion layer, when present):
//   - rig.json exists, parses, and every parts.*.file it names exists
//   - every pose pack dir exists and contains key frames
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngSize } from './png.mjs';
import { TALK_PATCHES, TALK_POSES, loadManifest, validateManifest } from './manifest.mjs';

export function qaCharacter(dir) {
  const errors = [], warnings = [];
  let m;
  try {
    m = loadManifest(dir);
  } catch (e) {
    return { ok: false, errors: [e.message], warnings, manifest: null };
  }
  for (const e of validateManifest(m)) errors.push(e);
  if (errors.length) return { ok: false, errors, warnings, manifest: m };

  const checkImage = (rel, expect, label) => {
    const path = join(dir, rel);
    if (!existsSync(path)) { errors.push(`${label}: missing file ${rel}`); return; }
    const size = pngSize(path);
    if (!size) { errors.push(`${label}: ${rel} is not a PNG`); return; }
    if (expect && (size.w !== expect.w || size.h !== expect.h))
      errors.push(`${label}: ${rel} is ${size.w}x${size.h}, expected ${expect.w}x${expect.h}`);
  };

  // talk layer
  checkImage(m.talk.base, m.talk.canvas, 'talk.base');
  for (const p of TALK_PATCHES) {
    const rect = m.talk.patches[p];
    const c = m.talk.canvas;
    if (rect.x + rect.w > c.w || rect.y + rect.h > c.h)
      errors.push(`talk.patches.${p}: rect ${JSON.stringify(rect)} escapes the ${c.w}x${c.h} canvas`);
    checkImage(m.talk.files[p], { w: rect.w, h: rect.h }, `talk patch ${p}`);
  }
  const poses = m.talk.poses || {};
  for (const pose of TALK_POSES) {
    if (poses[pose]) checkImage(poses[pose], m.talk.canvas, `talk pose ${pose}`);
    else warnings.push(`no ${pose} pose — character cannot ${pose === 'wave' ? 'wave hello' : 'gesture ' + pose} (talk/agents trigger it from words)`);
  }
  if (!m.voice?.id) warnings.push('no voice.id — agents/talk exports will fall back to each app default voice');

  // motion layer
  if (m.motion) {
    const rigPath = join(dir, m.motion.rig);
    if (!existsSync(rigPath)) {
      errors.push(`motion.rig: missing file ${m.motion.rig}`);
    } else {
      let rig;
      try { rig = JSON.parse(readFileSync(rigPath, 'utf8')); }
      catch (e) { errors.push(`motion.rig: rig.json is not valid JSON: ${e.message}`); }
      if (rig?.parts) {
        for (const [partName, part] of Object.entries(rig.parts)) {
          if (part.file && !existsSync(join(dir, 'motion', part.file)) && !existsSync(join(dir, part.file)))
            errors.push(`motion part ${partName}: missing file ${part.file}`);
        }
        for (const need of ['mouth.A', 'mouth.E', 'mouth.O', 'eyes.open'])
          if (!rig.parts[need]) errors.push(`motion rig has no ${need} part — it would never ${need.startsWith('mouth') ? 'speak' : 'blink'} on a pose pack`);
      }
    }
    for (const pack of m.motion.posePacks || []) {
      const packDir = join(dir, pack.dir || `poses/${pack.name}`);
      if (!existsSync(packDir)) { errors.push(`pose pack ${pack.name}: missing dir ${pack.dir || `poses/${pack.name}`}`); continue; }
      const keys = readdirSync(packDir).filter((f) => /^key\d+\.png$/.test(f));
      if (keys.length === 0) errors.push(`pose pack ${pack.name}: no key*.png frames in ${pack.dir || `poses/${pack.name}`}`);
      else if (pack.keys && keys.length !== pack.keys)
        warnings.push(`pose pack ${pack.name}: manifest says ${pack.keys} keys, found ${keys.length}`);
      const packJson = join(packDir, 'pack.json');
      if (keys.length && !existsSync(packJson))
        warnings.push(`pose pack ${pack.name}: no face patches yet — it will not blink or lip-sync while playing (run: rigpop-forge facepacks)`);
      else if (keys.length && existsSync(packJson)) {
        try {
          const idx = JSON.parse(readFileSync(packJson, 'utf8'));
          for (const k of idx.keys || []) {
            const all = [k.patches?.blink, ...Object.values(k.patches?.mouth || {})];
            for (const f of all) if (f && !existsSync(join(packDir, f))) errors.push(`pose pack ${pack.name}: pack.json names missing patch ${f}`);
          }
        } catch { warnings.push(`pose pack ${pack.name}: pack.json is not valid JSON`); }
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, manifest: m };
}
