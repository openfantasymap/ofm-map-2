# scripts/

Out-of-band tooling. Each script is self-contained and pulls its own deps via
this folder's `package.json`. Nothing here is imported by the Angular app.

## `render-world-tiles.mjs`

Renders a square thumbnail per timeline for use as the world-picker tile
background. Walks `https://static.fantasymaps.org/timelines.json`, navigates a
headless Chromium to each world's starting view (URL pattern
`/<timeline>/<year>/<z>/<lat>/<lng>/0/0`), strips the chrome, and screenshots
`#ohm_map` to JPG.

### Setup

```bash
cd scripts
npm install                # downloads Chromium (~150 MB)
```

### Render every world

```bash
node render-world-tiles.mjs
# defaults:
#   --base=https://map.openfantasymap.org
#   --out=../tile-renders
#   --size=720
#   --idle-wait=20000   max ms to wait for MapLibre 'idle'
#   --settle=8000       extra sleep after idle, for label placement
#   --timeout=90000     per-page goto / waitForSelector timeout
#   --jpeg-quality=86
```

The script uses `waitUntil: 'domcontentloaded'` on `page.goto`, then waits
for `#ohm_map .maplibregl-canvas`, then for MapLibre's `idle` event via
`window.__ofmMap` (which `map.ts` publishes on init). It falls back to a
plain sleep if the hook isn't there.

Why not `'load'` or `'networkidle2'`?

- `'load'` waits for every initial sub-resource — a single slow GeoJSON
  stalls the whole `goto` and you hit the navigation timeout.
- `'networkidle2'` never fires: the OFM map polls the gaia `/agents`
  endpoint every 5 s, so the network is never quiet for 500 ms straight.

### Common variations

```bash
# Re-render only Toril and Krynn at higher resolution
node render-world-tiles.mjs --only=toril,krynn --size=1024

# Resume an interrupted batch — skip what's already on disk
node render-world-tiles.mjs --skip-existing

# Render against a local dev server
node render-world-tiles.mjs --base=http://localhost:4200 --settle=6000

# Smoke test — first three only
node render-world-tiles.mjs --limit=3
```

### Output

JPGs are written as `<slug>.jpg` where `<slug>` is the timeline's URL path
stripped of leading slashes and decoded (e.g. `/sta-wolf%20359` → `sta-wolf_359`).
Default destination is `../tile-renders/` next to the project.

To wire the renders into the world-picker grid, the live `timelines.json`
already supports per-tile `bg`/`bgimg`. Upload the rendered JPGs to a static
host (e.g. `static.fantasymaps.org/tiles/`) and set each timeline's `bgimg`
to `url('https://static.fantasymaps.org/tiles/<slug>.jpg')`.

### Docker (recommended)

A `Dockerfile` next to this README builds on
[`ghcr.io/puppeteer/puppeteer`](https://pptr.dev/guides/docker), so Chromium
and the matching Puppeteer version are baked in — no host npm install, no
GLIBC version dance.

```bash
# Build once (~1 GB, mostly Chromium).
docker build -t ofm-tile-renderer ./scripts

# Render every world to ./tile-renders
mkdir -p tile-renders
docker run --rm --init --shm-size=2g \
  -v "$(pwd)/tile-renders:/out" \
  ofm-tile-renderer
```

Pass any of the script's flags after the image name:

```bash
docker run --rm --init --shm-size=2g \
  -v "$(pwd)/tile-renders:/out" \
  ofm-tile-renderer --only=toril,krynn --size=1024 --skip-existing
```

`--shm-size=2g` is the only Docker-side flag that matters: Chrome's default
64 MB `/dev/shm` is too small for complex map renders and triggers
`Target closed` errors mid-batch.

The container runs as root so the bind-mounted output directory is
writable; Chromium runs with `--no-sandbox` (already in the script) which
makes that safe in headless mode. If you'd rather not have root-owned
files on the host, append `--user "$(id -u):$(id -g)"` to the run command
and ensure `tile-renders/` is writable by your uid first.
