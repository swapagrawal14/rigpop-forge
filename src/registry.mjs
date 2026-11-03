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
export function buildSite(registryDir, outDir, opts = {}) {
  const entries = buildRegistry(registryDir, opts);
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

export function galleryHtml(entries, { siteUrl = '' } = {}) {
  const base = siteUrl || '<registry-url>';
  const cards = entries.map((e) => `
    <article class="card">
      <div class="stage"><img src="${esc(e.preview)}" alt="${esc(e.name)}"></div>
      <h2>${esc(e.name)}</h2>
      <p class="by">${esc(e.id)} · by ${esc(e.author)} · ${esc(e.license)}</p>
      <div class="chips">
        ${e.canvas ? `<span class="chip">📐 ${e.canvas.w}×${e.canvas.h}</span>` : ''}
        ${e.voice ? `<span class="chip">🎙 ${esc(e.voice.replace(/^en-[A-Z]{2}-/, '').replace(/Neural$/, ''))}</span>` : ''}
        ${e.hasMotion ? '<span class="chip">🎬 motion rig</span>' : '<span class="chip">💬 talk pack</span>'}
        <span class="chip">📦 ${Math.round(e.bytes / 1024)} KB</span>
      </div>
      <p class="poses">poses: ${e.poses.join(' · ') || '—'}</p>
      <code class="fetch">rigpop-forge fetch ${esc(base)} ${esc(e.id)} --out ./characters</code>
      <p class="links"><a href="${esc(e.pack)}/character.rigpop.json">manifest</a> · <a href="${esc(e.pack)}/pack.json">pack index</a></p>
    </article>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>rigpop-forge registry — characters that travel</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-rounded, system-ui, sans-serif; background: #FFF6E5; color: #1F2228; margin: 0; }
  header { background: linear-gradient(120deg, #FF4D8D, #FF8A5C 55%, #FFD23F); color: white; padding: 3rem 1.5rem 2.4rem; text-align: center; }
  header h1 { margin: 0; font-size: 2.4rem; letter-spacing: -.02em; text-shadow: 0 2px 0 rgba(0,0,0,.12); }
  header p { margin: .6rem auto 0; max-width: 560px; font-size: 1.05rem; opacity: .95; }
  header .count { display: inline-block; margin-top: 1rem; background: rgba(31,34,40,.85); color: #FFD23F; padding: .35rem .9rem; border-radius: 999px; font-weight: 700; font-size: .9rem; }
  main { max-width: 1120px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.2rem; }
  .card { background: white; border-radius: 20px; padding: 1rem 1rem 1.1rem; box-shadow: 0 3px 14px rgba(31,34,40,.09); border: 2px solid transparent; transition: transform .15s ease, border-color .15s ease; }
  .card:hover { transform: translateY(-4px); border-color: #FFD23F; }
  .stage { background: radial-gradient(circle at 50% 30%, #FFF6E5, #FFE3EE); border-radius: 14px; }
  .stage img { width: 100%; height: 250px; object-fit: contain; display: block; }
  .card h2 { margin: .8rem 0 .15rem; font-size: 1.25rem; }
  .by { color: #6b7280; font-size: .88rem; margin: 0 0 .6rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .35rem; }
  .chip { background: #FFF1B8; border-radius: 999px; padding: .18rem .6rem; font-size: .78rem; font-weight: 600; }
  .poses { color: #555; font-size: .88rem; margin: .7rem 0 .5rem; }
  .fetch { display: block; background: #1F2228; color: #A7F3D0; border-radius: 10px; padding: .55rem .7rem; font-size: .74rem; overflow-x: auto; white-space: nowrap; }
  .links { font-size: .85rem; margin: .6rem 0 0; } a { color: #2483FF; }
  footer { text-align: center; color: #8a8f98; font-size: .85rem; padding: 0 1rem 2.5rem; }
</style></head><body>
<header>
  <h1>🌷 rigpop-forge registry</h1>
  <p>One drawing in — a character for every Rigpop app out. Pick a character, fetch it verified, and it talks, poses and lip-syncs anywhere.</p>
  <span class="count">${entries.length} character${entries.length === 1 ? '' : 's'} · catalog: <a href="registry.json" style="color:#FFD23F">registry.json</a></span>
</header>
<main><div class="grid">${cards}
</div></main>
<footer>Made with rigpop-forge — the character factory for rigpop-talk · rigpop-agents · rigpop-motion · wowkit</footer>
</body></html>
`;
}

export function buildRegistry(registryDir, opts = {}) {
  mkdirSync(join(registryDir, 'packs'), { recursive: true });
  const entries = scanRegistry(registryDir);
  const catalog = { format: 'rigpop-registry', version: 1, builtAt: new Date().toISOString(), packs: entries };
  writeFileSync(join(registryDir, 'registry.json'), JSON.stringify(catalog, null, 2) + '\n');
  writeFileSync(join(registryDir, 'index.html'), galleryHtml(entries, opts));
  return entries;
}

export function publish(packDir, registryDir) {
  const { outDir, index } = packCharacter(packDir, join(registryDir, 'packs'));
  const entries = buildRegistry(registryDir);
  return { outDir, index, entries };
}
