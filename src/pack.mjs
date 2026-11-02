// pack: bundle a character folder into a distributable <id>.rigpop-pack/
// directory with a content index (sha256 per file). Deliberately a plain
// folder — zip/tar it with any tool; the index makes packs diffable and
// cacheable, same determinism argument as rigpop-ink's seeded renders.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadManifest } from './manifest.mjs';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function packCharacter(dir, outRoot) {
  const m = loadManifest(dir);
  const outDir = join(outRoot, `${m.id}.rigpop-pack`);
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const src of walk(dir)) {
    const rel = relative(dir, src);
    if (rel.startsWith('prompts/') || rel === 'pack.json') continue; // prompts are regenerable
    const dest = join(outDir, rel);
    mkdirSync(join(dest, '..'), { recursive: true });
    copyFileSync(src, dest);
    const buf = readFileSync(src);
    files.push({ path: rel, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
  }
  const index = { format: 'rigpop-pack', spec: m.spec, id: m.id, name: m.name, packedAt: new Date().toISOString(), files };
  writeFileSync(join(outDir, 'pack.json'), JSON.stringify(index, null, 2) + '\n');
  return { outDir, index };
}

export function packExists(p) { return existsSync(p); }
