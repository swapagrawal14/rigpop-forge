// The pack registry: a folder of .rigpop-pack bundles + a catalog
// (registry.json) + a static gallery page (index.html). Publish with
// `rigpop-forge publish <pack> --registry <dir>`; rebuild the catalog any
// time with `rigpop-forge registry build <dir>`. Deliberately boring
// technology — a folder and a JSON file any Rigpop app can read.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packCharacter } from './pack.mjs';

export const PAGES_WORKFLOW = `name: Deploy registry to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
`;

/** Build a deployable static site from a registry: the gallery, catalog
 *  and packs copied to <out>, plus a GitHub Pages workflow, ready to push
 *  to any repo and serve. `fetch` works against the hosted URL as-is. */
export function buildSite(registryDir, outDir) {
  const entries = buildRegistry(registryDir);
  mkdirSync(outDir, { recursive: true });
  cpSync(join(registryDir, 'packs'), join(outDir, 'packs'), { recursive: true });
  cpSync(join(registryDir, 'registry.json'), join(outDir, 'registry.json'));
  cpSync(join(registryDir, 'index.html'), join(outDir, 'index.html'));
  mkdirSync(join(outDir, '.github/workflows'), { recursive: true });
  writeFileSync(join(outDir, '.github/workflows/pages.yml'), PAGES_WORKFLOW);
  writeFileSync(join(outDir, 'DEPLOY.md'),
    `# Hosting this registry\n\n1. Push this folder to a GitHub repo (or copy it into one).\n2. Repo Settings → Pages → Source: "GitHub Actions".\n3. Push to main — the workflow deploys the site.\n4. Anyone can then run:\n\n   rigpop-forge fetch https://<you>.github.io/<repo>/ <pack-id> --out ./characters\n`);
  return entries;
}

export function scanRegistry(registryDir) {
  const packsDir = join(registryDir, 'packs');
  const entries = [];
  if (!existsSync(packsDir)) return entries;
  for (const name of readdirSync(packsDir).sort()) {
    const dir = join(packsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const mf = join(dir, 'character.rigpop.json');
    const idx = join(dir, 'pack.json');
    if (!existsSync(mf) || !existsSync(idx)) continue;
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    const p = JSON.parse(readFileSync(idx, 'utf8'));
    entries.push({
      id: m.id, name: m.name, author: m.author || '', license: m.license || '',
      spec: m.spec, canvas: m.talk?.canvas || null,
      voice: m.voice?.id || null,
      poses: Object.keys(m.talk?.poses || {}),
      hasMotion: !!m.motion,
      files: p.files.length,
      bytes: p.files.reduce((n, f) => n + f.bytes, 0),
      pack: `packs/${name}`,
      preview: `packs/${name}/${m.talk?.base || ''}`,
    });
  }
  return entries;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function galleryHtml(entries) {
  const cards = entries.map((e) => `
    <article class="card">
      <img src="${esc(e.preview)}" alt="${esc(e.name)}">
      <h2>${esc(e.name)}</h2>
      <p class="meta">${esc(e.id)} · by ${esc(e.author)} · ${esc(e.license)}</p>
      <p class="meta">${e.canvas ? `${e.canvas.w}×${e.canvas.h}` : ''}${e.voice ? ` · 🎙 ${esc(e.voice)}` : ''}${e.hasMotion ? ' · 🎬 motion rig' : ''}</p>
      <p class="meta">poses: ${e.poses.join(', ') || '—'} · ${e.files} files · ${Math.round(e.bytes / 1024)} KB</p>
      <p><a href="${esc(e.pack)}/character.rigpop.json">character.rigpop.json</a> · <a href="${esc(e.pack)}/pack.json">pack index</a></p>
    </article>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>rigpop-forge registry</title>
<style>
  body { font-family: system-ui, sans-serif; background: #FFF6E5; color: #1F2228; margin: 2rem; }
  h1 { color: #FF4D8D; } .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
  .card { background: white; border-radius: 16px; padding: 1rem; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
  .card img { width: 100%; height: 260px; object-fit: contain; background: #FFF6E5; border-radius: 10px; }
  .meta { color: #555; font-size: .9rem; margin: .3rem 0; } a { color: #2483FF; }
</style></head><body>
<h1>🌷 rigpop-forge registry</h1>
<p>${entries.length} character pack(s). Machine-readable catalog: <a href="registry.json">registry.json</a></p>
<div class="grid">${cards}
</div></body></html>
`;
}

export function buildRegistry(registryDir) {
  mkdirSync(join(registryDir, 'packs'), { recursive: true });
  const entries = scanRegistry(registryDir);
  const catalog = { format: 'rigpop-registry', version: 1, builtAt: new Date().toISOString(), packs: entries };
  writeFileSync(join(registryDir, 'registry.json'), JSON.stringify(catalog, null, 2) + '\n');
  writeFileSync(join(registryDir, 'index.html'), galleryHtml(entries));
  return entries;
}

export function publish(packDir, registryDir) {
  const { outDir, index } = packCharacter(packDir, join(registryDir, 'packs'));
  const entries = buildRegistry(registryDir);
  return { outDir, index, entries };
}
