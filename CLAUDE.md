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
ng test --include='**/map.spec.ts'   # single spec
```

Docker image build (publishes to `ofdistantworlds/map`):

```bash
./build.sh          # docker buildx build + docker push
```

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

If you add a behavior, prefer extending `ofm_meta` (server-owned) over hardcoding.

### Deployment-time env

The Docker image's `docker-entrypoint.sh` runs `jq -n env > ./assets/env.json` at container start, baking container env vars into a static JSON. `OfmService.getTimelines()` / `getTags()` read `assets/env.json` first and, if `TAG` is present, append `?tag=<TAG>` to the static-site requests. This is how a single image is re-skinned per deployment — don't break it by hardcoding URLs or moving the fetch off `assets/env.json`.

### Known rough edges (leave alone unless fixing)

- `warpTo()` uses `setTimeout` + `window.location.reload()` to force a full reload across worlds; this is intentional (MapLibre style swaps across projections were flaky).
- `showOverlays()` is mostly commented-out legacy OHM layers. Leave commented blocks unless the user explicitly asks to clean them up.
- `MapComponent.ts` is declared as `any` and only read by the dev-mode branch of `transformRequest`; it is never assigned, so the dev-mode tile-URL rewrite currently produces bogus `undefined<timeline>/...` URLs. If you need a local tile proxy in dev, wire it up explicitly — don't trust this branch as-is.
- Do not reintroduce a `maplibregl.accessToken` assignment — MapLibre ignores it, and a committed Mapbox `pk.*` token triggers GitHub push protection.
