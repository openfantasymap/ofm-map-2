import { Routes } from '@angular/router';
import { Timelines } from './timelines/timelines';
import { MapComponent } from './map/map';

export const routes: Routes = [
  { path: '', component: Timelines},
  { path: ':timeline', redirectTo: ':timeline/866/4/43.67/1.57', pathMatch: 'full' },
  { path: ':timeline/:year/:z/:y/:x', component: MapComponent },
  { path: ':timeline/:year/:z/:y/:x/:rels', component: MapComponent },

];
