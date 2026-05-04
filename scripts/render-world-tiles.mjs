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
const BASE          = args.base ?? 'https://map.fantasymaps.org';
const OUT           = resolve(args.out ?? '../tile-renders');
const SIZE          = parseInt(args.size ?? '720', 10);
const SETTLE_MS     = parseInt(args.settle ?? '8000', 10);
const IDLE_WAIT_MS  = parseInt(args['idle-wait'] ?? '20000', 10);
const TIMEOUT       = parseInt(args.timeout ?? '45000', 10);
const RETRIES       = parseInt(args.retries ?? '2', 10);
const ALLOW_GAIA    = !!args['allow-gaia'];
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

// Dedupe by slug — timelines.json contains a few duplicate entries (e.g.
// multiple /toril rows). Keep only the first occurrence so we don't render
// the same world repeatedly.
{
  const seen = new Set();
  timelines = timelines.filter(tl => {
    const s = slugOf(tl);
    if (!s || seen.has(s)) return false;
    seen.add(s);
    return true;
  });
  console.log(`After dedupe: ${timelines.length}`);
}

if (ONLY) timelines = timelines.filter(tl => ONLY.includes(slugOf(tl)));
if (LIMIT > 0) timelines = timelines.slice(0, LIMIT);
console.log(`Rendering ${timelines.length} → ${OUT}`);

const browser = await puppeteer.launch({
  // 'new' headless has working WebGL (with software fallback), which MapLibre
  // requires. 'shell' / classic headless leaves the map canvas blank.
  // --disable-web-security is required because production tile servers don't
  // grant CORS to map.fantasymaps.org; without it tiles fail to fetch and
  // the screenshot is just the dark surface color.
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--user-data-dir=/tmp/chrome-render',
  ],
});
const page = await browser.newPage();
// #ohm_map is sized as calc(100vh - 170px) so we add exactly that much
// chrome padding to the viewport, leaving the map at SIZE × SIZE natively.
const CHROME_PAD = 170;
await page.setViewport({ width: SIZE, height: SIZE + CHROME_PAD, deviceScaleFactor: 1 });
page.setDefaultTimeout(TIMEOUT);
page.on('console', (msg) => {
  if (msg.type() === 'error') console.warn(`    [page] ${msg.text()}`);
});

// Block traffic that is irrelevant to the basemap thumbnail: the gaia
// agents polling, MQTT bootstraps, etc. It cuts noisy in-flight network and
// lets DOMContentLoaded fire faster on flaky days. Pass --allow-gaia to
// keep them.
if (!ALLOW_GAIA) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (
      u.includes('api.gaia.fantasymaps.org/') ||
      u.includes('/agents/position') ||
      u.includes('hivemq') ||
      u.includes('mqtt')
    ) {
      return req.abort('blockedbyclient').catch(() => {});
    }
    return req.continue().catch(() => {});
  });
}

async function renderOne(slug, url, outPath) {
    // 'domcontentloaded' returns once HTML is parsed; we then wait for the
    // MapLibre canvas and its 'idle' event explicitly. Don't use 'load' or
    // 'networkidle*' — 'load' waits for every initial sub-resource (one
    // slow GeoJSON stalls the whole goto), and the OFM map's 5 s gaia
    // polling means the network is never idle.
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ohm_map .maplibregl-canvas', { timeout: TIMEOUT });

    // Soft-hide chrome — keeps Angular happy but removes it from the visual.
    // The map element keeps its natural size (the viewport was sized so the
    // calc() leaves it at SIZE × SIZE).
    await page.evaluate(() => {
      const sel = ['#ofm_attribution', '.gaiawm', '.maplibregl-control-container'];
      for (const s of sel) {
        for (const el of document.querySelectorAll(s)) {
          (el).style.display = 'none';
        }
      }
    });

    // Wait for MapLibre's 'idle' event (style + tiles + sources fully loaded
    // and no animations in flight) using the global hook map.ts publishes on
    // window.__ofmMap. Falls through to a plain settle sleep if the hook
    // isn't found (e.g. against an older deployed build).
    const waited = await page.evaluate((waitMs) => new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const map = (window).__ofmMap;
        if (!map || typeof map.loaded !== 'function') {
          resolve('no-hook');
          return;
        }
        if (map.loaded()) {
          resolve('loaded-sync');
          return;
        }
        let done = false;
        const finish = (reason) => {
          if (done) return;
          done = true;
          resolve(reason);
        };
        map.once('idle', () => finish('idle'));
        const remaining = Math.max(500, waitMs - (Date.now() - start));
        setTimeout(() => finish('timeout'), remaining);
      };
      tick();
    }), IDLE_WAIT_MS);
    process.stdout.write(`  · idle: ${waited}\n`);
    await sleep(SETTLE_MS);

    // Screenshot the actual map element so the toolbar/timebar/etc. that
    // we left in the DOM aren't included.
    const mapEl = await page.$('#ohm_map');
    if (!mapEl) throw new Error('#ohm_map not found at screenshot time');
    const buf = await mapEl.screenshot({
      type: 'jpeg',
      quality: JPEG_QUALITY,
    });
    await writeFile(outPath, buf);
}

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

  let lastErr = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) process.stdout.write(`  ⟳ retry ${attempt}/${RETRIES}\n`);
    try {
      await renderOne(slug, url, outPath);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      // Reset the page between attempts so a half-loaded state doesn't poison the next try.
      try { await page.goto('about:blank'); } catch {}
    }
  }

  if (lastErr) {
    console.error(`  ✗ ${slug}: ${lastErr.message}`);
    failed++;
  } else {
    console.log(`  ✓ ${outPath}`);
    ok++;
  }
}

await browser.close();
console.log(`\nDone. ${ok} OK, ${skipped} skipped, ${failed} failed → ${OUT}`);
process.exit(failed > 0 ? 1 : 0);
