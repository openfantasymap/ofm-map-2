import { Routes } from '@angular/router';
import { Timelines } from './timelines/timelines';
import { MapComponent } from './map/map';

export const routes: Routes = [
  { path: '', component: Timelines},
  { path: ':timeline', redirectTo: ':timeline/866/4/43.67/1.57/0/0', pathMatch: 'full' },
  // Backward-compatible 5- and 6-segment forms (pitch/bearing default to 0)
  { path: ':timeline/:year/:z/:y/:x', component: MapComponent },
  { path: ':timeline/:year/:z/:y/:x/:rels', component: MapComponent },
  // Canonical forms — pitch and bearing always travel as a pair
  { path: ':timeline/:year/:z/:y/:x/:pitch/:bearing', component: MapComponent },
  { path: ':timeline/:year/:z/:y/:x/:pitch/:bearing/:rels', component: MapComponent },
];
