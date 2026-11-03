// normalise: pose-pack keys onto one scale and one floor line.
// Motion's rule, learned the hard way: a pose pack only plays cleanly when
// every key shares a floor line and a height — otherwise the character
// bounces and sinks between frames. This rescales every key so the drawn
// figures have the SAME tight-bbox height, aligns their bbox bottoms to
// one floor, and centres them horizontally, on one shared canvas.
// Face geometry moves with the art: a pack.json face rect and the
// manifest's pack.face are transformed by the same math. Face patch tiles
// no longer line up after a rescale, so they are removed (re-run
// `facepacks` afterwards) — silently keeping stale patches would be worse.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from './pngcodec.mjs';
import { composite, resize, tightBbox } from './imageops.mjs';
import { loadManifest } from './manifest.mjs';

const FLOOR_MARGIN = 4;

export function normalisePack(packDir, packName = null) {
  const manifest = loadManifest(packDir);
  const packs = (manifest.motion?.posePacks || []).filter((p) => !packName || p.name === packName);
  if (!packs.length) throw new Error(packName ? `no pose pack named ${packName}` : 'manifest has no motion.posePacks');
  const report = [];

  for (const pack of packs) {
    const dir = join(packDir, pack.dir || `poses/${pack.name}`);
    const keyFiles = readdirSync(dir).filter((f) => /^key\d+\.png$/.test(f)).sort();
    if (!keyFiles.length) throw new Error(`pose pack ${pack.name}: no key*.png frames`);
    const keys = keyFiles.map((f) => {
      const img = readPng(join(dir, f));
      const t = tightBbox(img);
      if (!t) throw new Error(`pose pack ${pack.name}: ${f} is fully transparent`);
      return { f, img, bbox: t.bbox };
    });
    const targetH = Math.max(...keys.map((k) => k.bbox.h));
    const targetW = Math.max(...keys.map((k) => Math.round(k.bbox.w * (targetH / k.bbox.h))));
    const canvasW = Math.max(...keys.map((k) => k.img.w)), canvasH = Math.max(...keys.map((k) => k.img.h));

    const transforms = [];
    for (const k of keys) {
      const s = targetH / k.bbox.h;
      const scaled = s === 1 ? k.img : resize(k.img, Math.round(k.img.w * s), Math.round(k.img.h * s));
      const sb = tightBbox(scaled).bbox;
      const dx = Math.round((canvasW - targetW) / 2 + (targetW - sb.w) / 2 - sb.x);
      const dy = Math.round(canvasH - FLOOR_MARGIN - sb.h - sb.y);
      const canvas = { w: canvasW, h: canvasH, data: new Uint8ClampedArray(canvasW * canvasH * 4) };
      composite(canvas, scaled, dx, dy);
      writePng(join(dir, k.f), canvas);
      transforms.push({ f: k.f, s, dx, dy });
      report.push(`${pack.name}/${k.f}: scale ${s.toFixed(3)}, shift (${dx}, ${dy})`);
    }

    // face rect: packs share one face rect by design, but every key got its
    // own transform — move the rect by the AVERAGE transform.
    const avg = {
      s: transforms.reduce((n, t) => n + t.s, 0) / transforms.length,
      dx: transforms.reduce((n, t) => n + t.dx, 0) / transforms.length,
      dy: transforms.reduce((n, t) => n + t.dy, 0) / transforms.length,
    };
    const moveRect = (r) => r && ({
      x: Math.round(r.x * avg.s + avg.dx), y: Math.round(r.y * avg.s + avg.dy),
      w: Math.round(r.w * avg.s), h: Math.round(r.h * avg.s),
    });
    if (pack.face) pack.face = moveRect(pack.face);

    const indexPath = join(dir, 'pack.json');
    if (existsSync(indexPath)) {
      const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
      if (idx.face) idx.face = moveRect(idx.face);
      idx.eyes = idx.mouth = undefined; idx.keys = [];
      for (const f of readdirSync(dir)) if (/\.blink\.png$/.test(f) || /\.m\./.test(f)) rmSync(join(dir, f));
      writeFileSync(indexPath, JSON.stringify(idx, null, 2) + '\n');
      report.push(`${pack.name}: pack.json face updated; stale face tiles removed — re-run rigpop-forge facepacks`);
    }
    report.push(`${pack.name}: ${keys.length} keys normalised to height ${targetH}px, floor at y=${canvasH - FLOOR_MARGIN}`);
  }
  writeFileSync(join(packDir, 'character.rigpop.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { report };
}
