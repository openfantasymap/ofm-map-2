# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **ofm-map-2** Angular app — the primary OFM map viewer. Platform-wide context (other services, Gaia API, database, world timelines) lives in `/srv/ofm/CLAUDE.md`.

## Commands

```bash
npm install
ng serve                          # dev server on :4200 (dev config is default for serve)
ng build                          # production build → dist/
ng build --configuration development
ng test                           # Karma + Jasmine
ng test --include='**/cone.spec.ts'  # single spec
```

Docker image build (publishes to `ofdistantworlds/map`):

```bash
./build.sh          # docker buildx build + docker push
```

Specs need `provideZonelessChangeDetection()` in `TestBed` (the app runs without Zone.js). `MapComponent` has no spec: it depends on the CDN globals (MapLibre, vis, turf).

There is no lint script — the repo has no ESLint config. Prettier is configured inline in `package.json` for HTML only.

## Architecture

### Runtime shape

- Angular 20, **standalone components only**, **zoneless change detection** (`provideZonelessChangeDetection()` in `src/app/app.config.ts`). Components use `ChangeDetectionStrategy.OnPush` — after async work that must update the view, call `cdr.markForCheck()` (see `timelines.ts`, `map.ts`).
- SCSS, Angular Material + CDK, `ngx-capture` for screenshotting the map.
- **MapLibre GL, turf, and vis-timeline are loaded from CDNs in `src/index.html`**, not from npm. In TS they are accessed via `declare const maplibregl/turf/vis: any;` — don't try to `import` them.

### Routes (`src/app/app.routes.ts`)

URL is the single source of truth for map state. Any user-visible map change calls `Location.go(...)` via `changeUrl()` to rewrite the URL without a navigation:

- `/` → `Timelines` (world picker)
- `/:timeline` → redirects to `/:timeline/866/4/43.67/1.57` (default year/zoom/lat/lng)
- `/:timeline/:year/:z/:y/:x[/:rels]` → `MapComponent`

`:year` is a **decimal fantasy date** (float year with fractional month/day/hour/min/sec — see `decimaldate-pipe.ts` and `map.ts`'s `toFloatDate` / `toDateFloat`). It is passed to tile URLs as `{atDate}` (URL-encoded as `%7BatDate%7D`) via MapLibre's `transformRequest`. Advancing time edits the URL and, for sources listed in `ofm_meta.timed`, re-fetches GeoJSON with the new `atDate`.

`:rels` encodes colored relation overlays: pipe-separated `name:color:width:opacity` tuples, fetched from `http://51.15.160.236:9034/relation/<name|name|...>`.

### Two services, one inheritance chain

- `OhmService` (`src/app/ohm.ts`) — base. Talks to legacy OpenHistoryMap endpoints (events, stats, share-URL shortener at `su.openhistorymap.org`).
- `OfmService` (`src/app/ofm.ts`) — extends `OhmService`. Talks to `static.fantasymaps.org` for per-world `map.json`, `events.json`, `timelines.json`, `tags.json`.

Both components inject `OfmService` (sometimes twice, as `ohm` and `ofm` — same instance). When adding an endpoint, put it on the service that matches the host, not where it's most convenient.

### `map.json` drives the map

When `MapComponent` loads, it fetches `//static.fantasymaps.org/<timeline>/map.json` and reads `metadata.ofm` into `ofm_meta`. That object configures almost all conditional behavior:

- `ofm_meta.clickLayers` — layers that open the info sidebar on click
- `ofm_meta.togglable` — legend entries (each has `name` + `layers[]`)
- `ofm_meta.timed` — sources whose GeoJSON URL contains `{atDate}` and must be refetched on time change
- `ofm_meta.relatedLayers` / `relatedField` — zoom-in-to-warp: at zoom ≥ 22, a single feature under the cursor triggers `warpTo(<timeline>-<field>)` (reload into a child world)
- `ofm_meta.parentMap` / `parentLocation` — zoom-out-to-warp to the parent world
- `ofm_meta.distance_multiplier`, `distance_unit`, `speeds[]` — drive the measuring tool (turf.length × multiplier, plus fantasy-speed conversions)
- `ofm_meta.type === "starbase"` — swaps the `{atDate}` pattern for `{deck}` on `base`/`walls`/`areas` sources, so changing deck re-fetches those layers
- `ofm_meta.geomqtt` — `{ url, set?, zoom? }` to enable live agent positions over [geomqtt](https://github.com/openfantasymap/geomqtt). When present, `MapComponent` instantiates a `GeomqttLayer` (`src/app/map/geomqtt-layer.ts`) that subscribes to viewport tiles and pushes a `FeatureCollection` to the existing `gaiaAgentsPovs` source — replacing the 5s polling loop. `set` defaults to `agents-{timeline}`, `zoom` to 6 (the lowest enrich zoom; gives full-viewport coverage with at most ~4 subscriptions). MQTT.js v5 is loaded from `unpkg.com/mqtt@5` in `index.html`. Subscriptions are diffed on `moveend`/`zoomend`; source updates are throttled to one per animation frame.

If you add a behavior, prefer extending `ofm_meta` (server-owned) over hardcoding.

`ofm_meta` is also read from the loaded style's `metadata.ofm` on MapLibre `load` when the separate `getMap()` request hasn't answered yet, so load-time setup (`registerGaiaLayers`, `registerClickLayers`, …) never sees an empty object.

### World guide (`WORLD.md`)

A world may ship `/srv/ofm/<world>/WORLD.md`. `OfmService.getWorldGuide()` fetches it from `staticfiles.fantasymaps.org` (plain nginx over `/srv/ofm`) and emits `null` on 404/empty. When present, `MapComponent.worldGuide` holds the rendered HTML and the toolbar/left sidebar offer a "World guide" plate (`ractive() === 'world'`, wider sidebar). Markdown is rendered by `marked` from the CDN (`index.html`); Angular's `[innerHTML]` sanitizer strips scripts. Worlds without the file show no entry point.

### GaiaWM "eye on the world" + OpenRouter

The eye (`.gaiawm` button → `drawWedge()`) **requires an OpenRouter account**. Without a key it opens `GaiaConnectDialog` (`gaia/connect/`) instead of drawing:

- **Login** is OpenRouter's OAuth PKCE flow (`OpenRouterService.login()` in `src/app/openrouter.ts`): redirect to `openrouter.ai/auth`, return to the `auth/openrouter` route (`OpenRouterCallback`), exchange the code at `/api/v1/auth/keys`, then navigate back to the map URL saved in sessionStorage. A pasted key is accepted as a fallback.
- The key lives in localStorage (`ofm-openrouter-key`) and is **only sent to openrouter.ai** — never to the Gaia backend. A 401 signs the user out.
- Flow: two clicks draw the cone (`gaia/cone.ts` maths) → `POST api.gaia.fantasymaps.org/<world>/context?describe=only&image_description=true` returns description + image prompt → the `Response` dialog opens and the browser renders the prompt through OpenRouter chat completions with `modalities: ['image','text']` (default model `google/gemini-2.5-flash-image`, changeable in the GaiaWM panel).
- History: `GaiaStorage` keeps query text in localStorage (`queries`) and rendered images in IndexedDB (`ofm-gaia`/`images`, keyed by query id) — data: URLs are too big for localStorage.

The backend's own `image=<key>` path (OpenAI, key in the query string) is no longer used by this app.

### Deployment-time env

The Docker image's `docker-entrypoint.sh` runs `jq -n env > ./assets/env.json` at container start, baking container env vars into a static JSON. `OfmService.getTimelines()` / `getTags()` read `assets/env.json` first and, if `TAG` is present, append `?tag=<TAG>` to the static-site requests. This is how a single image is re-skinned per deployment — don't break it by hardcoding URLs or moving the fetch off `assets/env.json`.

### Known rough edges (leave alone unless fixing)

- `warpTo()` uses `setTimeout` + `window.location.reload()` to force a full reload across worlds; this is intentional (MapLibre style swaps across projections were flaky).
- The measuring tool (`startDistance`/`onMeasureClick`), the legend (`toggleLayer`) and the `clickLayers` info state (`p`/`showInfo`) still work in code but currently have **no UI entry point** in `map.html`.
- There is no dev-mode tile proxy; `transformRequest` only substitutes `{atDate}`/`{deck}`. If you need one, wire it up explicitly.
- Do not reintroduce a `maplibregl.accessToken` assignment — MapLibre ignores it, and a committed Mapbox `pk.*` token triggers GitHub push protection.

## Design Context

Full canonical version lives in `.impeccable.md` — read that before any visual work. Summary:

- **Users:** tabletop RPG GMs/players browsing fantasy worlds from a desk. Desktop-first. Archival exploration, not a productivity tool.
- **Personality (three words):** atlas, archival, unhurried. Museum cartographic exhibit, not video game.
- **Aesthetic:** editorial / National Geographic, in line with the marketing site fantasymaps.org. Warm dark paper, cinnabar ink. One rich accent, used rarely. Chrome is a frame; the map is the subject.
- **Shell:** neutral across all worlds — chrome does not adapt per world.
- **Type:** **Spectral** (display serif) + **Public Sans** (body) + **Fragment Mono** (mark labels — uppercase, tracked `0.14em`, used for `PLATE I · CONTENTS`-style register cues). All reflex fonts (Fraunces, Crimson, Playfair, Newsreader, Instrument Serif, DM Serif, IBM Plex, Inter, DM Sans, Vollkorn) are rejected.
- **Color:** OKLCH neutrals tinted warm (hue ~55°), **cinnabar** accent `oklch(0.70 0.18 32)`. Canonical aliases `--paper`, `--ink`, `--cinnabar` mirror the marketing site's vocabulary. Patreon FieryCoral on the Patreon button is immutable and derives nothing else.
- **Editorial structure:** pages organise as "plates". Use `.plate-head` (2/10 fr margin/body grid), `.mark` mono labels, and `.chart-corners` L-tick framing for chart-room surfaces.
- **Anti-references (actively rejected):** generic SaaS dashboard; Google Maps clone; D&D Beyond / Roll20 aesthetic; AI-slop fantasy (purple/blue gradients, neon cyan, glowing runes).
- **Accessibility posture:** user deprioritized WCAG targets; preserve focus indicators and `prefers-reduced-motion` anyway. Do not chase contrast ratios at the cost of atmosphere.

### Design principles

1. The map is the subject. Chrome is a frame.
2. Warm, not cool. Dark sepia, not neon.
3. One accent, used rarely.
4. Typography does the hierarchy — not color, gradient, or glow.
5. Negative space is a feature.
