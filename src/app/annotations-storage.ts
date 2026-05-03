import { Injectable } from '@angular/core';

export interface Annotation {
  id: string;
  world: string;
  title: string;
  body: string;
  color?: string;
  created: string;
  updated?: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
}

export const ANNOTATION_PALETTE: { name: string; value: string }[] = [
  { name: 'Cinnabar',  value: '#c44632' },
  { name: 'Ochre',     value: '#c49232' },
  { name: 'Verdigris', value: '#469c8c' },
  { name: 'Lapis',     value: '#5064c3' },
  { name: 'Plum',      value: '#965a96' },
  { name: 'Bone',      value: '#dcd7c8' },
];

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

  add(world: string, lngLat: { lng: number; lat: number }, title: string, body: string, color?: string): Annotation {
    const list = this.getAll(world);
    const a: Annotation = {
      id: this.uuid(),
      world,
      title: (title && title.trim()) || 'Untitled',
      body: body || '',
      color: color || undefined,
      created: new Date().toISOString(),
      geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] },
    };
    list.push(a);
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return a;
  }

  update(world: string, id: string, patch: Partial<Pick<Annotation, 'title' | 'body' | 'color'>>): Annotation | null {
    const list = this.getAll(world);
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return null;
    const next: Annotation = {
      ...list[i],
      ...patch,
      title: patch.title !== undefined ? ((patch.title.trim()) || 'Untitled') : list[i].title,
      color: patch.color !== undefined ? (patch.color || undefined) : list[i].color,
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

  importFeatureCollection(world: string, fc: any): { added: number; skipped: number } {
    if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
      return { added: 0, skipped: 0 };
    }
    const list = this.getAll(world);
    const existingIds = new Set(list.map(a => a.id));
    let added = 0, skipped = 0;
    for (const f of fc.features) {
      if (!f || f.type !== 'Feature' || !f.geometry || f.geometry.type !== 'Point') {
        skipped++;
        continue;
      }
      const coords = f.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2 || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
        skipped++;
        continue;
      }
      const props = f.properties || {};
      const candidateId = typeof f.id === 'string' ? f.id : (typeof props.id === 'string' ? props.id : null);
      const id = candidateId && !existingIds.has(candidateId) ? candidateId : this.uuid();
      const a: Annotation = {
        id,
        world,
        title: (props.title || props.name || 'Imported').toString(),
        body: (props.body || props.description || '').toString(),
        color: typeof props.color === 'string' ? props.color : undefined,
        created: typeof props.created === 'string' ? props.created : new Date().toISOString(),
        geometry: { type: 'Point', coordinates: [coords[0], coords[1]] },
      };
      list.push(a);
      existingIds.add(id);
      added++;
    }
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return { added, skipped };
  }

  getFeatureCollection(world: string) {
    return {
      type: 'FeatureCollection',
      features: this.getAll(world).map(a => ({
        type: 'Feature',
        id: a.id,
        properties: {
          id: a.id,
          title: a.title,
          body: a.body,
          ...(a.color ? { color: a.color } : {}),
          created: a.created,
        },
        geometry: a.geometry,
      })),
    };
  }
}
