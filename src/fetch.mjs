// fetch: pull a character pack out of a registry by id.
// The registry may be a local folder or an http(s) base URL (e.g. a
// GitHub Pages site). Every file is verified against the sha256 in the
// pack's own pack.json index before it lands — the same index `pack`
// wrote — so a fetched pack is byte-identical to the published one.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const isUrl = (s) => /^https?:\/\//.test(s);

async function readRemote(base, rel) {
  const res = await fetch(new URL(rel, base.endsWith('/') ? base : base + '/'));
  if (!res.ok) throw new Error(`GET ${rel}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
function readLocal(base, rel) {
  const p = join(base, rel);
  if (!existsSync(p)) throw new Error(`registry entry missing file: ${rel}`);
  return readFileSync(p);
}

export async function fetchPack(registry, id, outRoot) {
  const read = isUrl(registry) ? readRemote : readLocal;
  const catalog = JSON.parse((await read(registry, 'registry.json')).toString('utf8'));
  const entry = (catalog.packs || []).find((p) => p.id === id);
  if (!entry) throw new Error(`registry holds no pack "${id}" (it has: ${(catalog.packs || []).map((p) => p.id).join(', ') || 'none'})`);
  const index = JSON.parse((await read(registry, `${entry.pack}/pack.json`)).toString('utf8'));
  const dest = join(outRoot, `${id}.rigpop-pack`);
  let bytes = 0;
  for (const f of index.files) {
    const buf = await read(registry, `${entry.pack}/${f.path}`);
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== f.sha256) throw new Error(`sha256 mismatch for ${f.path} — registry copy is corrupt or tampered, refusing`);
    if (buf.length !== f.bytes) throw new Error(`size mismatch for ${f.path}`);
    mkdirSync(dirname(join(dest, f.path)), { recursive: true });
    writeFileSync(join(dest, f.path), buf);
    bytes += buf.length;
  }
  writeFileSync(join(dest, 'pack.json'), JSON.stringify(index, null, 2) + '\n');
  return { dest, files: index.files.length, bytes };
}
