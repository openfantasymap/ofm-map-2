import { Injectable } from '@angular/core';

export interface SavedView {
  id: string;
  world: string;
  label: string;
  lat: number;
  lng: number;
  zoom: number;
  date: number;
  created: string;
}

@Injectable({ providedIn: 'root' })
export class ViewsStorage {
  private key(world: string): string {
    return `views:${world}`;
  }

  private uuid(): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  getAll(world: string): SavedView[] {
    const raw = localStorage.getItem(this.key(world));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  add(world: string, view: { label: string; lat: number; lng: number; zoom: number; date: number }): SavedView {
    const list = this.getAll(world);
    const v: SavedView = {
      id: this.uuid(),
      world,
      label: (view.label && view.label.trim()) || `View ${list.length + 1}`,
      lat: view.lat,
      lng: view.lng,
      zoom: view.zoom,
      date: view.date,
      created: new Date().toISOString(),
    };
    list.push(v);
    localStorage.setItem(this.key(world), JSON.stringify(list));
    return v;
  }

  delete(world: string, id: string): void {
    const list = this.getAll(world).filter(v => v.id !== id);
    localStorage.setItem(this.key(world), JSON.stringify(list));
  }
}
