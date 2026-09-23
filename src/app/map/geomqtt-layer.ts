/**
 * Live agent positions over geomqtt — drop-in replacement for the polling
 * `gs.getAgents()` loop.
 *
 * Connects to a geomqtt MQTT broker over WebSocket, computes the slippy-map
 * tiles covering the current viewport at a fixed enrich zoom, subscribes to
 * `geo/{set}/{z}/{x}/{y}` for each, and pushes a GeoJSON FeatureCollection of
 * the current agent positions onto a named MapLibre source.
 *
 * The geomqtt protocol is documented at
 * https://github.com/openfantasymap/geomqtt/blob/main/PROTOCOL.md.
 *
 * Subscriptions are diffed on `moveend`/`zoomend`; only changed tiles are
 * (un)subscribed. Source updates are throttled to one per animation frame so
 * a flurry of move events doesn't pin the renderer.
 */

declare const mqtt: any;

export interface GeomqttLayerOptions {
  /** WebSocket URL of the geomqtt broker (e.g. wss://geomqtt.example.com/mqtt). */
  url: string;
  /** GEO set name. For agents this is `agents-{world}`. */
  set: string;
  /** Slippy zoom level on which we subscribe. Must match one of the broker's
   *  GEOMQTT_ENRICH_ZOOMS. Default 6 — coarsest enrich zoom, gives us all
   *  agents anywhere in the visible viewport with at most a few subscriptions. */
  zoom?: number;
  /** Name of the MapLibre source to update. Default 'gaiaAgentsPovs'. */
  sourceId?: string;
  /** Optional MQTT client options forwarded to mqtt.connect (e.g. username, password). */
  mqttOptions?: Record<string, unknown>;
  /** Logger for debugging; defaults to console.log gated by `verbose`. */
  log?: (msg: string, ...args: unknown[]) => void;
  /** Set true to log every protocol event. */
  verbose?: boolean;
}

interface AgentRecord {
  id: string;
  lat: number;
  lng: number;
  ts: number;
  attrs?: Record<string, unknown>;
  /** Tiles currently claiming this object — the entry stays alive while
   *  at least one tile we're subscribed to has it. */
  tiles: Set<string>;
}

const DEFAULT_ZOOM = 6;
const DEFAULT_SOURCE_ID = 'gaiaAgentsPovs';

/** Slippy-map tile X for a longitude. */
export function lonToTileX(lon: number, zoom: number): number {
  const n = 1 << zoom;
  return Math.floor(((lon + 180) / 360) * n);
}

/** Slippy-map tile Y for a latitude (Web Mercator). */
export function latToTileY(lat: number, zoom: number): number {
  const n = 1 << zoom;
  const rad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  return Math.floor(y * n);
}

/** All slippy-map tiles intersecting an axis-aligned lon/lat bbox at `zoom`. */
export function tilesInBounds(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number,
): Array<[number, number]> {
  const n = 1 << zoom;
  // Clamp lat to Web Mercator range so polar viewports don't NaN.
  const safeLat = (l: number) => Math.max(-85.05112878, Math.min(85.05112878, l));
  const xMin = Math.max(0, Math.min(n - 1, lonToTileX(west, zoom)));
  const xMax = Math.max(0, Math.min(n - 1, lonToTileX(east, zoom)));
  const yMin = Math.max(0, Math.min(n - 1, latToTileY(safeLat(north), zoom)));
  const yMax = Math.max(0, Math.min(n - 1, latToTileY(safeLat(south), zoom)));
  const tiles: Array<[number, number]> = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push([x, y]);
    }
  }
  return tiles;
}

export class GeomqttLayer {
  private map: any;
  private opts: Required<Omit<GeomqttLayerOptions, 'mqttOptions' | 'log' | 'verbose'>> & {
    mqttOptions?: Record<string, unknown>;
    log: (msg: string, ...args: unknown[]) => void;
    verbose: boolean;
  };

  private client: any = null;
  private subscribed = new Set<string>();   // tile keys "z/x/y"
  private agents = new Map<string, AgentRecord>();   // obid → state
  private flushScheduled = false;

  private moveHandler = () => this.refreshSubscriptions();

  constructor(map: any, options: GeomqttLayerOptions) {
    this.map = map;
    this.opts = {
      url: options.url,
      set: options.set,
      zoom: options.zoom ?? DEFAULT_ZOOM,
      sourceId: options.sourceId ?? DEFAULT_SOURCE_ID,
      mqttOptions: options.mqttOptions,
      log: options.log ?? ((msg, ...rest) => { if (options.verbose) console.log('[geomqtt]', msg, ...rest); }),
      verbose: options.verbose ?? false,
    };
  }

  /** Open the MQTT connection and subscribe to viewport tiles. */
  start(): void {
    if (typeof mqtt === 'undefined') {
      console.warn('[geomqtt] mqtt.js global not found — was the CDN script loaded?');
      return;
    }
    this.client = mqtt.connect(this.opts.url, this.opts.mqttOptions);
    this.client.on('connect', () => {
      this.opts.log('connected', this.opts.url);
      this.refreshSubscriptions();
    });
    this.client.on('message', (topic: string, payload: Uint8Array) => this.handleMessage(topic, payload));
    this.client.on('error', (err: Error) => console.warn('[geomqtt] mqtt error', err));

    this.map.on('moveend', this.moveHandler);
    this.map.on('zoomend', this.moveHandler);
  }

  /** Close the MQTT connection and detach map handlers. */
  dispose(): void {
    this.map.off('moveend', this.moveHandler);
    this.map.off('zoomend', this.moveHandler);
    if (this.client) {
      try { this.client.end(true); } catch { /* swallow */ }
      this.client = null;
    }
    this.subscribed.clear();
    this.agents.clear();
  }

  /** Diff the desired tile set against the currently-subscribed one. */
  private refreshSubscriptions(): void {
    if (!this.client || !this.client.connected) return;
    const bounds = this.map.getBounds();
    const tiles = tilesInBounds(
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
      this.opts.zoom,
    );
    const want = new Set(tiles.map(([x, y]) => `${this.opts.zoom}/${x}/${y}`));

    // Unsubscribe from tiles no longer visible.
    for (const key of this.subscribed) {
      if (!want.has(key)) {
        const topic = `geo/${this.opts.set}/${key}`;
        this.client.unsubscribe(topic);
        this.opts.log('unsub', topic);
        this.dropTileFromAgents(key);
      }
    }
    // Subscribe to newly-visible tiles.
    for (const key of want) {
      if (!this.subscribed.has(key)) {
        const topic = `geo/${this.opts.set}/${key}`;
        this.client.subscribe(topic);
        this.opts.log('sub', topic);
      }
    }
    this.subscribed = want;
    this.scheduleFlush();
  }

  /** Remove a tile reference from each agent; if no tiles remain, evict. */
  private dropTileFromAgents(tileKey: string): void {
    for (const [obid, rec] of this.agents) {
      if (rec.tiles.delete(tileKey) && rec.tiles.size === 0) {
        this.agents.delete(obid);
      }
    }
  }

  private handleMessage(topic: string, payload: Uint8Array): void {
    const tileKey = this.parseTileTopic(topic);
    if (!tileKey) return;
    let msg: any;
    try {
      msg = JSON.parse(new TextDecoder().decode(payload));
    } catch (e) {
      this.opts.log('bad json', topic);
      return;
    }
    const op = msg.op as string;
    const id = msg.id as string;
    if (!id) return;

    if (op === 'snapshot' || op === 'add' || op === 'move') {
      const rec = this.agents.get(id) ?? {
        id,
        lat: msg.lat,
        lng: msg.lng,
        ts: msg.ts ?? Date.now(),
        attrs: msg.attrs,
        tiles: new Set<string>(),
      };
      rec.lat = msg.lat ?? rec.lat;
      rec.lng = msg.lng ?? rec.lng;
      rec.ts = msg.ts ?? rec.ts;
      if (msg.attrs) rec.attrs = { ...(rec.attrs ?? {}), ...msg.attrs };
      rec.tiles.add(tileKey);
      this.agents.set(id, rec);
    } else if (op === 'remove') {
      const rec = this.agents.get(id);
      if (rec) {
        rec.tiles.delete(tileKey);
        if (rec.tiles.size === 0) this.agents.delete(id);
      }
    } else if (op === 'attr') {
      const rec = this.agents.get(id);
      if (rec) rec.attrs = { ...(rec.attrs ?? {}), ...(msg.attrs ?? {}) };
    }
    this.scheduleFlush();
  }

  /** topic = `geo/<set>/<z>/<x>/<y>` → "z/x/y" or null if it doesn't match. */
  private parseTileTopic(topic: string): string | null {
    const parts = topic.split('/');
    if (parts.length !== 5 || parts[0] !== 'geo' || parts[1] !== this.opts.set) return null;
    return `${parts[2]}/${parts[3]}/${parts[4]}`;
  }

  /** Coalesce source updates to one per animation frame. */
  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      this.pushToSource();
    });
  }

  private pushToSource(): void {
    const features = [];
    for (const rec of this.agents.values()) {
      features.push({
        type: 'Feature',
        id: rec.id,
        properties: { id: rec.id, ts: rec.ts, ...(rec.attrs ?? {}) },
        geometry: { type: 'Point', coordinates: [rec.lng, rec.lat] },
      });
    }
    const fc = { type: 'FeatureCollection', features };
    const src = this.map.getSource?.(this.opts.sourceId);
    if (src && typeof src.setData === 'function') {
      src.setData(fc);
    }
  }

  /** Snapshot of current agents — useful in tests or debug overlays. */
  snapshot(): Array<{ id: string; lat: number; lng: number; attrs?: Record<string, unknown> }> {
    return Array.from(this.agents.values()).map((r) => ({
      id: r.id, lat: r.lat, lng: r.lng, attrs: r.attrs,
    }));
  }
}
