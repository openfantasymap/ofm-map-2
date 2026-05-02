import { Injectable } from '@angular/core';

export interface Annotation {
  id: string;
  world: string;
  title: string;
  body: string;
  created: string;
  updated?: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
}

@Injectable({ providedIn: 'root' })
export class AnnotationsStorage {
  private key(world: string): string {
    return `annotations:${world}`;
  }

  private uuid(): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  getAll(world: string): Annotation[] {
    const raw = localStorage.getItem(this.key(world));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  add(world: string, lngLat: { lng: number; lat: number }, title: string, body: string): Annotation {
    const list = this.getAll(world);
    const a: Annotation = {
      id: this.uuid(),
      world,
      title: (title && title.trim()) || 'Untitled',
      body: body || '',
      created: new Date().toISOString(),
      geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] },
    };
    list.push(a);
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return a;
  }

  update(world: string, id: string, patch: Partial<Pick<Annotation, 'title' | 'body'>>): Annotation | null {
    const list = this.getAll(world);
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return null;
    const next = {
      ...list[i],
      ...patch,
      title: patch.title !== undefined ? ((patch.title.trim()) || 'Untitled') : list[i].title,
      updated: new Date().toISOString(),
    };
    list[i] = next;
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return next;
  }

  delete(world: string, id: string): void {
    const list = this.getAll(world).filter(x => x.id !== id);
    localStorage.setItem(this.key(world), JSON.stringify(list));
  }

  getFeatureCollection(world: string) {
    return {
      type: 'FeatureCollection',
      features: this.getAll(world).map(a => ({
        type: 'Feature',
        id: a.id,
        properties: { id: a.id, title: a.title, body: a.body },
        geometry: a.geometry,
      })),
    };
  }
}
