import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, ViewChild } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbar, MatToolbarModule, MatToolbarRow } from '@angular/material/toolbar';
import { OfmService } from '../ofm';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AsyncKeyword } from 'typescript';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { LocationUpgradeModule } from '@angular/common/upgrade';

@Component({
  selector: 'app-timelines',
  imports: [MatToolbarModule, MatIconModule, MatSidenavModule, MatChipsModule, MatListModule, RouterModule, CommonModule, MatButtonModule],
  templateUrl: './timelines.html',
  styleUrl: './timelines.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Timelines {

infoData: any;
events: any;

timelines!: any[];
seen_timelines!: any[];
tags: any;
selected_tags!: string[];

  constructor(
    private ofm: OfmService,
    private ht: HttpClient,
    private cdr: ChangeDetectorRef
  ) { 
  }

  @ViewChild('stgl', {read: ElementRef}) stgl!: ElementRef;

  disabled() {
    alert('Login disabled. User accounts and private maps will come soon');
  }

  ngOnInit(): void {
    this.ht.get('assets/info.json').subscribe({
      next: (data:any) => {
        this.infoData = data;
        this.cdr.markForCheck();
      },
      error: (err) => console.warn('[timelines] info.json failed', err),
    });

    this.ofm.getTimelines().subscribe({
      next: (data:any) => {
        const list = Array.isArray(data) ? data : [];
        if (!list.length) {
          console.warn('[timelines] getTimelines returned no items', data);
        }
        this.timelines = list;
        this.seen_timelines = list;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[timelines] getTimelines failed', err);
        // Show an empty grid rather than the indefinite-standby state.
        this.timelines = [];
        this.seen_timelines = [];
        this.cdr.markForCheck();
      },
    });

    this.ofm.getTags().subscribe({
      next: (data:any) => {
        const list = Array.isArray(data) ? data : [];
        this.tags = list.map((x:any) => ({ label: x, selected: true }));
        this.selected_tags = list;
        this.cdr.markForCheck();
      },
      error: (err) => console.warn('[timelines] getTags failed', err),
    });

    setTimeout(() => {
      try {
        this.stgl?.nativeElement?.click();
        setTimeout(() => this.stgl?.nativeElement?.click(), 100);
      } catch (err) {
        console.warn('[timelines] sidebar warm-up click failed', err);
      }
    }, 100);
  }

  filter(ev:any, tag:string){
    console.log(tag);
    this.selected_tags = [tag];
    this.tags.map((x: any)=>x.selected=false);
    this.tags.filter((x:any)=>x.label===tag)[0].selected=true;
    this.seen_timelines = this.timelines.filter((x:any)=>x.tags?.indexOf(tag) >= 0);
  }

  // Returns a CSS background-image value pointing at the locally-bundled
  // tile-render JPG. Slug is the timeline's URL path stripped of leading
  // slashes (must match the renderer script's slugOf()). If the JPG isn't
  // there yet the browser falls back to the tile's [style.background]
  // color.
  bgImage(tl: any): string {
    if (!tl?.url) return tl?.bgimg ?? '';
    const slug = decodeURIComponent(tl.url.replace(/^\/+/, '')).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `url('/assets/tile-renders/${slug}.jpg')`;
  }

  romanize(n: number): string {
    if (!Number.isFinite(n) || n <= 0 || n > 3999) return String(n);
    const map: [number, string][] = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100,  'C'], [90,  'XC'], [50,  'L'], [40,  'XL'],
      [10,   'X'], [9,   'IX'], [5,   'V'], [4,   'IV'], [1, 'I'],
    ];
    let r = '';
    for (const [v, s] of map) {
      while (n >= v) { r += s; n -= v; }
    }
    return r;
  }

  primaryTags(tl: any): string {
    const t = (tl?.tags ?? []).filter(Boolean).slice(0, 2);
    return t.map((s: string) => s.toUpperCase()).join(' · ');
  }

}
