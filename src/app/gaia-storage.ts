import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

/** One saved "eye on the world" look: where it was taken from and what Gaia said. */
export interface GaiaQuery {
  type: 'Feature';
  id: string;
  world: string;
  created: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  /** Gaia's answer: description, image_prompt, … (the image lives in IndexedDB). */
  properties: { description?: string; image_prompt?: string; [k: string]: any };
  /** The view cone, as a GeoJSON Polygon feature. */
  cone: any;
}

const QUERIES_KEY = 'queries';
const IMAGE_DB = 'ofm-gaia';
const IMAGE_STORE = 'images';

/**
 * Local history of GaiaWM queries.
 *
 * Text lives in localStorage; rendered images are multi-megabyte data: URLs,
 * so they go to IndexedDB keyed by query id — localStorage's ~5 MB quota
 * would fill after two or three pictures.
 */
@Injectable({ providedIn: 'root' })
export class GaiaStorage {
  private http = inject(HttpClient);
  private db?: Promise<IDBDatabase>;

  getPastQueries(world: string): GaiaQuery[] {
    return this.all().filter(q => q.world === world);
  }

  addQuery(world: string, center: { lat: number; lng: number }, properties: any, cone: any): GaiaQuery {
    const { image, ...props } = properties ?? {};
    const q: GaiaQuery = {
      type: 'Feature',
      id: crypto.randomUUID(),
      world,
      created: new Date().toISOString(),
      geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
      properties: props,
      cone,
    };
    this.save([...this.all(), q]);
    return q;
  }

  deleteQuery(id: string) {
    this.save(this.all().filter(q => q.id !== id));
    this.deleteImage(id);
  }

  /** Viewpoints, with the query id on each feature so map clicks can find it. */
  getMarkers(world: string) {
    return {
      type: 'FeatureCollection',
      features: this.getPastQueries(world).map(q => ({ ...q, properties: { ...q.properties, id: q.id } })),
    };
  }

  getFovs(world: string) {
    return {
      type: 'FeatureCollection',
      features: this.getPastQueries(world)
        .filter(q => q.cone?.geometry)
        .map(q => ({ type: 'Feature', geometry: q.cone.geometry, properties: { id: q.id } })),
    };
  }

  getAgents(world: string) {
    return this.http.get('https://api.gaia.fantasymaps.org/' + world + '/agents/position');
  }

  // ─── Images (IndexedDB) ───
  async putImage(id: string, dataUrl: string): Promise<void> {
    await this.tx('readwrite', s => s.put(dataUrl, id));
  }

  async getImage(id: string): Promise<string | null> {
    return (await this.tx<string>('readonly', s => s.get(id))) ?? null;
  }

  async deleteImage(id: string): Promise<void> {
    await this.tx('readwrite', s => s.delete(id));
  }

  private all(): GaiaQuery[] {
    try {
      return JSON.parse(localStorage.getItem(QUERIES_KEY) || '[]');
    } catch {
      return [];
    }
  }

  private save(list: GaiaQuery[]) {
    try {
      localStorage.setItem(QUERIES_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('[gaia] could not persist query history', err);
    }
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(IMAGE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IMAGE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  /** Run one request in its own transaction; storage failures resolve to undefined. */
  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
    try {
      const db = await this.open();
      return await new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(IMAGE_STORE, mode).objectStore(IMAGE_STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[gaia] image store unavailable', err);
      return undefined;
    }
  }
}
