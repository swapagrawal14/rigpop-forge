// Loading + structural validation for character.rigpop.json (spec v1).
// See SPEC.md for the format. Structural problems are errors here; art-level
// problems (missing files, wrong sizes, patches off-canvas) belong to qa.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SPEC_VERSION = 1;
export const TALK_PATCHES = ['A', 'O', 'E', 'blink'];
export const TALK_POSES = ['wave', 'point', 'open', 'thumbs'];
export const MOTION_MOUTHS = ['A', 'E', 'O', 'M', 'smile', 'laugh', 'frown', 'smirk'];
export const MOTION_EYES = ['open', 'half', 'closed', 'happy'];

export function manifestPath(dir) {
  return join(dir, 'character.rigpop.json');
}

export function loadManifest(dir) {
  const path = manifestPath(dir);
  if (!existsSync(path)) throw new Error(`no character.rigpop.json in ${dir}`);
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`character.rigpop.json is not valid JSON: ${e.message}`);
  }
  return data;
}

const isRect = (r) =>
  r && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(r[k]) && r[k] >= 0) && r.w > 0 && r.h > 0;

/** Returns a list of structural error strings (empty = structurally valid). */
export function validateManifest(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  if (m.spec !== SPEC_VERSION) errs.push(`spec must be ${SPEC_VERSION}, got ${JSON.stringify(m.spec)}`);
  if (!m.id || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) errs.push('id must be lowercase letters, digits and dashes');
  if (!m.name) errs.push('name is required');

  const talk = m.talk;
  if (!talk) {
    errs.push('talk section is required (it is the core layer every Rigpop app shares)');
  } else {
    if (!talk.canvas || !(talk.canvas.w > 0) || !(talk.canvas.h > 0)) errs.push('talk.canvas needs positive w/h');
    if (!talk.base) errs.push('talk.base (base drawing file) is required');
    for (const p of TALK_PATCHES) {
      if (!talk.patches || !isRect(talk.patches[p])) errs.push(`talk.patches.${p} must be a rect {x,y,w,h}`);
      if (!talk.files || !talk.files[p]) errs.push(`talk.files.${p} (patch image file) is required`);
    }
    for (const pose of TALK_POSES) {
      if (talk.poses && talk.poses[pose] !== undefined && typeof talk.poses[pose] !== 'string')
        errs.push(`talk.poses.${pose} must be a file name`);
    }
  }

  if (m.motion) {
    if (!m.motion.rig) errs.push('motion.rig (path to a rigpop-motion rig.json) is required when motion is present');
    if (m.motion.posePacks !== undefined && !Array.isArray(m.motion.posePacks))
      errs.push('motion.posePacks must be an array of { name, dir, keys }');
  }
  if (m.voice && m.voice.engine !== undefined && m.voice.engine !== 'edge-tts')
    errs.push('voice.engine: only "edge-tts" is supported by the family today');
  return errs;
}

/** The characters.json entry rigpop-talk / rigpop-agents expect for this pack. */
export function talkEntry(m) {
  const entry = { w: m.talk.canvas.w, h: m.talk.canvas.h };
  if (m.talk.bg) entry.bg = m.talk.bg;
  entry.patches = {};
  for (const p of TALK_PATCHES) entry.patches[p] = { ...m.talk.patches[p] };
  return entry;
}

/** File naming used by rigpop-talk and rigpop-agents: <id>_base.png etc. */
export function talkFileName(m, kind) {
  if (kind === 'base') return `${m.id}_base.png`;
  if (TALK_PATCHES.includes(kind)) return `${m.id}_${kind}.png`;
  if (TALK_POSES.includes(kind)) return `${m.id}_pose_${kind}.png`;
  throw new Error(`unknown talk file kind: ${kind}`);
}
