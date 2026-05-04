import { Injectable } from '@angular/core';

export type AnnotationGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] };

export interface Annotation {
  id: string;
  world: string;
  title: string;
  body: string;
  color?: string;
  icon?: string;
  created: string;
  updated?: string;
  geometry: AnnotationGeometry;
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

  add(world: string, lngLat: { lng: number; lat: number }, title: string, body: string, color?: string, icon?: string): Annotation {
    return this.addFeature(world, { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] }, title, body, color, icon);
  }

  addFeature(world: string, geometry: AnnotationGeometry, title: string, body: string, color?: string, icon?: string): Annotation {
    const list = this.getAll(world);
    const a: Annotation = {
      id: this.uuid(),
      world,
      title: (title && title.trim()) || 'Untitled',
      body: body || '',
      color: color || undefined,
      icon: icon || undefined,
      created: new Date().toISOString(),
      geometry,
    };
    list.push(a);
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return a;
  }

  update(world: string, id: string, patch: Partial<Pick<Annotation, 'title' | 'body' | 'color' | 'icon'>>): Annotation | null {
    const list = this.getAll(world);
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return null;
    const next: Annotation = {
      ...list[i],
      ...patch,
      title: patch.title !== undefined ? ((patch.title.trim()) || 'Untitled') : list[i].title,
      color: patch.color !== undefined ? (patch.color || undefined) : list[i].color,
      icon: patch.icon !== undefined ? (patch.icon || undefined) : list[i].icon,
      updated: new Date().toISOString(),
    };
    list[i] = next;
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return next;
  }

  moveFeature(world: string, id: string, geometry: AnnotationGeometry): Annotation | null {
    const list = this.getAll(world);
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], geometry, updated: new Date().toISOString() };
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return list[i];
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
      if (!f || f.type !== 'Feature' || !f.geometry) {
        skipped++;
        continue;
      }
      const g = f.geometry;
      let geometry: AnnotationGeometry | null = null;
      if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2 &&
          typeof g.coordinates[0] === 'number' && typeof g.coordinates[1] === 'number') {
        geometry = { type: 'Point', coordinates: [g.coordinates[0], g.coordinates[1]] };
      } else if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
        geometry = { type: 'LineString', coordinates: g.coordinates as [number, number][] };
      } else if (g.type === 'Polygon' && Array.isArray(g.coordinates) && g.coordinates.length >= 1) {
        geometry = { type: 'Polygon', coordinates: g.coordinates as [number, number][][] };
      }
      if (!geometry) {
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
        icon: typeof props.icon === 'string' ? props.icon : undefined,
        created: typeof props.created === 'string' ? props.created : new Date().toISOString(),
        geometry,
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
          ...(a.icon ? { icon: a.icon } : {}),
          created: a.created,
        },
        geometry: a.geometry,
      })),
    };
  }
}
