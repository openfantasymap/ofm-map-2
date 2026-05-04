#!/usr/bin/env node
// Render world-tile thumbnails for the OFM timeline picker grid.
//
// For each entry in https://static.fantasymaps.org/timelines.json, navigates
// the live map at its starting position/zoom/date, hides the chrome
// (toolbar, timebar, attribution, etc.), then screenshots the #ohm_map
// element to a JPG. Output filenames are the timeline slug.
//
// Usage:
//   cd scripts && npm install
//   node render-world-tiles.mjs [options]
//
// Options:
//   --base=<url>       Map app URL                       default https://map.openfantasymap.org
//   --out=<dir>        Output directory                  default ../tile-renders
//   --size=<px>        Square render size (px)           default 720
//   --settle=<ms>      Idle time after load              default 4500
//   --timeout=<ms>     Per-page navigation timeout       default 60000
//   --limit=<n>        Render only the first N tiles
//   --only=<slug,...>  Comma-separated slugs to render
//   --skip-existing    Skip tiles that already exist on disk
//   --jpeg-quality=<n> 1-100                             default 86

import puppeteer from 'puppeteer';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants as fsc } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv } from 'node:process';

// --- Args ----------------------------------------------------------------
const args = {};
for (const raw of argv.slice(2)) {
  if (!raw.startsWith('--')) continue;
  const [k, v] = raw.slice(2).split('=');
  args[k] = v ?? true;
}
const BASE          = args.base ?? 'https://map.openfantasymap.org';
const OUT           = resolve(args.out ?? '../tile-renders');
const SIZE          = parseInt(args.size ?? '720', 10);
const SETTLE_MS     = parseInt(args.settle ?? '4500', 10);
const TIMEOUT       = parseInt(args.timeout ?? '60000', 10);
const LIMIT         = args.limit ? parseInt(args.limit, 10) : 0;
const ONLY          = args.only ? args.only.split(',').map(s => s.trim()) : null;
const SKIP_EXISTING = !!args['skip-existing'];
const JPEG_QUALITY  = parseInt(args['jpeg-quality'] ?? '86', 10);

const TIMELINES_URL = 'https://static.fantasymaps.org/timelines.json';

// --- Helpers -------------------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function slugOf(tl) {
  // tl.url is like "/toril" — strip leading slash and any %-encoding for filename safety.
  let s = (tl.url || tl.name || '').replace(/^\/+/, '');
  s = decodeURIComponent(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function exists(p) {
  try { await access(p, fsc.F_OK); return true; } catch { return false; }
}

// --- Main ----------------------------------------------------------------
await mkdir(OUT, { recursive: true });

console.log(`Fetching timelines from ${TIMELINES_URL}`);
const tlData = await fetch(TIMELINES_URL).then(r => r.json());
let timelines = Array.isArray(tlData) ? tlData : (tlData.timelines || []);
console.log(`Found ${timelines.length} timelines`);

if (ONLY) timelines = timelines.filter(tl => ONLY.includes(slugOf(tl)));
if (LIMIT > 0) timelines = timelines.slice(0, LIMIT);
console.log(`Rendering ${timelines.length} → ${OUT}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
page.setDefaultTimeout(TIMEOUT);
page.on('console', (msg) => {
  // Surface page errors but stay quiet on info logs.
  if (msg.type() === 'error') console.warn(`    [page] ${msg.text()}`);
});

let ok = 0, skipped = 0, failed = 0;
for (const tl of timelines) {
  const slug = slugOf(tl);
  if (!slug) { failed++; continue; }
  const outPath = join(OUT, `${slug}.jpg`);

  if (SKIP_EXISTING && await exists(outPath)) {
    console.log(`· ${slug} → skip (exists)`);
    skipped++;
    continue;
  }

  const date = tl.date ?? 0;
  const z    = tl.base?.zoom ?? 4;
  const lat  = tl.base?.lat ?? 0;
  const lng  = tl.base?.lng ?? 0;
  const url  = `${BASE}${tl.url}/${date}/${z}/${lat}/${lng}/0/0`;

  process.stdout.write(`→ ${slug}\n  ${url}\n`);
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#ohm_map .maplibregl-canvas', { timeout: TIMEOUT });

    // Strip chrome and force the map element to fill the viewport for a
    // clean, edge-to-edge thumbnail.
    await page.evaluate(() => {
      const sel = [
        'mat-toolbar',
        '#timebar',
        '#visualization',
        '#ofm_attribution',
        '.gaiawm',
        '.maplibregl-control-container',
      ];
      for (const s of sel) document.querySelectorAll(s).forEach(el => el.remove());
      const m = document.getElementById('ohm_map');
      if (m) {
        m.style.position = 'fixed';
        m.style.inset = '0';
        m.style.width = '100vw';
        m.style.height = '100vh';
      }
      window.dispatchEvent(new Event('resize'));
    });
    await sleep(SETTLE_MS);

    // Wait for any pending tiles by polling MapLibre's idle state if exposed.
    await page.evaluate(() => new Promise((resolve) => {
      const w = window;
      const tryIdle = () => {
        const map = w.__ofmMap || w.map || null;
        if (map && typeof map.loaded === 'function' && map.loaded()) return resolve();
        return resolve();
      };
      // Always resolve; the settle sleep above is the real wait.
      tryIdle();
    }));

    const buf = await page.screenshot({
      type: 'jpeg',
      quality: JPEG_QUALITY,
      clip: { x: 0, y: 0, width: SIZE, height: SIZE },
    });
    await writeFile(outPath, buf);
    console.log(`  ✓ ${outPath}`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${slug}: ${err.message}`);
    failed++;
  }
}

await browser.close();
console.log(`\nDone. ${ok} OK, ${skipped} skipped, ${failed} failed → ${OUT}`);
process.exit(failed > 0 ? 1 : 0);
