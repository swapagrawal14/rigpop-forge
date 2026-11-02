// export wowkit: a Forge pack -> a WowKit project (v2 format, verified
// against wowkit's own cast files):
//   { v: 2, name, size: [w, h], image: "assets/cast/<id>-cutout.png",
//     joints: [{ name, x, y, parent }] (15 joints),
//     animation: { duration, tracks: { joint: [{ t, rot, dy? }] } } }
// The image is the pack's talk base (a full-body transparent cutout).
// Joint positions are ESTIMATES from the pack's face geometry (blink/mouth
// rects give face centre + scale; body proportions do the rest, anchored to
// the drawing's tight bbox). Refine them in WowKit's workshop — the file
// says so in its "forge" note. Animation is a generated gentle-sway loop
// in the same units as the built-in cast (rot in degrees, 33 keys / 2.4 s).
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng } from './pngcodec.mjs';
import { tightBbox } from './imageops.mjs';

const R = (v) => Math.round(v);

export function estimateJoints(m, img) {
  const tight = tightBbox(img);
  if (!tight) throw new Error('base drawing is fully transparent — nothing to rig');
  const { bbox } = tight;
  const top = bbox.y, bottom = bbox.y + bbox.h;
  const blink = m.talk.patches.blink, mouth = m.talk.patches.A;
  const faceCx = blink.x + blink.w / 2;
  const eyeY = blink.y + blink.h / 2;
  const mouthY = mouth.y + mouth.h / 2;
  const faceW = blink.w * 1.55;                    // eyes span ~65% of face width
  const headTop = Math.max(top, eyeY - faceW * 0.52);
  const chin = mouthY + faceW * 0.30;
  const headH = Math.max(24, chin - headTop);
  const neckY = chin + headH * 0.06;
  const shoulderY = neckY + headH * 0.24;
  const shoulderHalf = faceW * 0.60;
  const hipY = top + (bottom - top) * 0.54;
  const spineY = (neckY + hipY) / 2;
  const elbowDY = headH * 0.92, handDY = headH * 0.88;
  const legHalf = faceW * 0.20;
  const kneeY = hipY + (bottom - hipY) * 0.52;
  return [
    { name: 'hip', x: R(faceCx), y: R(hipY), parent: null },
    { name: 'spine', x: R(faceCx), y: R(spineY), parent: 'hip' },
    { name: 'head', x: R(faceCx), y: R((headTop + chin) / 2), parent: 'spine' },
    { name: 'lshoulder', x: R(faceCx - shoulderHalf), y: R(shoulderY), parent: 'spine' },
    { name: 'lelbow', x: R(faceCx - shoulderHalf * 1.12), y: R(shoulderY + elbowDY), parent: 'lshoulder' },
    { name: 'lhand', x: R(faceCx - shoulderHalf * 1.18), y: R(shoulderY + elbowDY + handDY), parent: 'lelbow' },
    { name: 'rshoulder', x: R(faceCx + shoulderHalf), y: R(shoulderY), parent: 'spine' },
    { name: 'relbow', x: R(faceCx + shoulderHalf * 1.12), y: R(shoulderY + elbowDY), parent: 'rshoulder' },
    { name: 'rhand', x: R(faceCx + shoulderHalf * 1.18), y: R(shoulderY + elbowDY + handDY), parent: 'relbow' },
    { name: 'lhip', x: R(faceCx - legHalf), y: R(hipY + headH * 0.06), parent: 'hip' },
    { name: 'lknee', x: R(faceCx - legHalf), y: R(kneeY), parent: 'lhip' },
    { name: 'lfoot', x: R(faceCx - legHalf), y: R(bottom - 2), parent: 'lknee' },
    { name: 'rhip', x: R(faceCx + legHalf), y: R(hipY + headH * 0.06), parent: 'hip' },
    { name: 'rknee', x: R(faceCx + legHalf), y: R(kneeY), parent: 'rhip' },
    { name: 'rfoot', x: R(faceCx + legHalf), y: R(bottom - 2), parent: 'rknee' },
  ];
}

function swayTrack(amp, phase = 0, T = 2.4, keys = 33) {
  const out = [];
  for (let i = 0; i < keys; i++) {
    const t = (T * i) / (keys - 1);
    out.push({ t: Math.round(t * 1000) / 1000, rot: Math.round(amp * Math.sin((2 * Math.PI * t) / T + phase) * 1000) / 1000 });
  }
  return out;
}

export function gentleSway() {
  const hip = swayTrack(1.4);
  for (const k of hip) k.dy = Math.round(-1.6 * (0.5 - 0.5 * Math.cos((4 * Math.PI * k.t) / 2.4)) * 1000) / 1000;
  return {
    duration: 2.4,
    tracks: {
      hip, spine: swayTrack(2.0, 0.3), head: swayTrack(-1.4, 0.3),
      lshoulder: swayTrack(5.0, 0.15), lelbow: swayTrack(3.2, 0.4),
      rshoulder: swayTrack(-5.0, 0.15), relbow: swayTrack(3.2, 0.4),
      lhip: swayTrack(2.0), rhip: swayTrack(-2.0),
    },
  };
}

export function exportWowkit(m, packDir, outDir) {
  const basePath = join(packDir, m.talk.base);
  const img = readPng(basePath);
  const joints = estimateJoints(m, img);
  const imageRel = `assets/cast/${m.id}-cutout.png`;
  mkdirSync(join(outDir, 'assets/cast'), { recursive: true });
  mkdirSync(join(outDir, 'projects/cast'), { recursive: true });
  copyFileSync(basePath, join(outDir, imageRel));
  const project = {
    v: 2, name: m.name, size: [m.talk.canvas.w, m.talk.canvas.h], image: imageRel,
    joints, animation: gentleSway(),
    forge: { jointsEstimated: true, from: 'rigpop-forge', pack: m.id, note: 'Joint positions are estimates from the pack face geometry — refine in the WowKit workshop.' },
  };
  const rel = `projects/cast/${m.id}.json`;
  writeFileSync(join(outDir, rel), JSON.stringify(project, null, 2) + '\n');
  return { app: 'wowkit', written: [imageRel, rel] };
}
