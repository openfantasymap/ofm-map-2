import { AfterContentInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, isDevMode, KeyValueDiffers, OnDestroy, OnInit, Pipe, PipeTransform, signal, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {MatSidenav, MatSidenavModule} from '@angular/material/sidenav';
import {MatDialog, MatDialogModule} from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { OfmService } from '../ofm';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NgxCaptureModule, NgxCaptureService } from 'ngx-capture';
import { DecimaldatePipe } from '../decimaldate-pipe';
import { DateComponent } from '../date/date';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { CommonModule, DatePipe, KeyValuePipe, Location } from '@angular/common';
import { ShareDirective } from '../share';
import { NicedatePipe } from '../nicedate-pipe';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { Response } from '../gaia/response/response';
import { InputDialog } from '../gaia/input/input';
import { GaiaStorage } from '../gaia-storage';
import { AnnotationsStorage, Annotation } from '../annotations-storage';
import { AnnotationDialog } from '../annotation-dialog/annotation-dialog';
import { ViewsStorage, SavedView } from '../views-storage';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
//declare const mapboxgl;
declare const maplibregl: any;
declare const vis: any;
declare const turf: any;

@Pipe({
  name: 'deck',
  standalone: true,
})

export class DeckPipe implements PipeTransform{
  constructor(private _differs: KeyValueDiffers){}
  transform(value: any, args?: any): {key: string, value: any}[] {
    const pipe = new KeyValuePipe(this._differs);
    return pipe.transform<string, any>(value, args);
  }
}

@Component({
  selector: 'app-map',
  imports: [
    MatSidenavModule, 
    MatDialogModule, MatSnackBarModule, 
    NgxCaptureModule, MatMenuModule, 
    MatIconModule, MatListModule, 
    MatToolbarModule, CommonModule,
    MatButtonModule,
    DecimaldatePipe, DatePipe, 
    MatSlideToggleModule,MatExpansionModule,MatProgressSpinnerModule,
    ShareDirective, NicedatePipe, DeckPipe,
    FormsModule, MatFormFieldModule, MatInputModule

  ],
  templateUrl: './map.html',
  styleUrl: './map.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush

})
export class MapComponent implements OnInit, AfterContentInit, OnDestroy {
  map: any;
  ts: any;

  layers: any = {}; 
  startstopicons: Map<string,string> = new Map<string,string>();
  
  startstopicon = 'play_arrow';
  startstopstatus = 'stop';
  startstopInterval: any;

  @Input() style: string = "";

  ofm_meta:any = {};

  start = {
    center: [1.57, 43.67],
    zoom: 3.5,
    pitch: 0,
    bearing: 0,
  };

  rels: any;

  atDate = 866.001;
  atMacroDate = 800;
  atMicroDate = 870;

  tl!: string;

  timeline: any;

  speed = 2000;

  events!: Observable < any[] > ;

  infoData: any;

  title: string = "";

  @ViewChild('sharebar') sharebar!: MatSidenav;
  @ViewChild('screen') screen!: any;

  share_link!: string;


  showInfo = false;
  showSearch = false;
  searchResults = []
  showLegend = false;
  showTools = false;
  showShare = false;

  /**
   * GAIA
   */
  drawing = false;
  center?: any = null;
  radius?:number;
  bearing?:number;
  angle:number = 120; 

  circleLayerId = 'circle-preview';

  SOURCE_ID = 'gaia-cone-source';
  LAYER_ID = 'gaia-cone-layer';

 createCone(
  center: any,
  radius: number,
  bearing: number,
  angle: number,
  steps = 48
): any {
  const coords: number[][] = [[center.lng, center.lat]];
  const R = 6_371_000;

  const start = bearing - angle / 2;
  const end = bearing + angle / 2;

  for (let i = 0; i <= steps; i++) {
    const b = ((start + (i / steps) * (end - start)) * Math.PI) / 180;

    const lat1 = (center.lat * Math.PI) / 180;
    const lng1 = (center.lng * Math.PI) / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(radius / R) +
      Math.cos(lat1) * Math.sin(radius / R) * Math.cos(b)
    );

    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(b) * Math.sin(radius / R) * Math.cos(lat1),
        Math.cos(radius / R) - Math.sin(lat1) * Math.sin(lat2)
      );

    coords.push([
      (lng2 * 180) / Math.PI,
      (lat2 * 180) / Math.PI
    ]);
  }

  coords.push([center.lng, center.lat]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    },
    properties: {}
  };
}


  getDistanceMeters(a: any, b: any): number {
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);

    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  getBearing(a: any, b: any): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
    const x =
      Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
      Math.sin(toRad(a.lat)) *
        Math.cos(toRad(b.lat)) *
        Math.cos(toRad(b.lng - a.lng));

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  upsertCone(map: any, data: any) {
    if (map.getSource(this.SOURCE_ID)) {
      (map.getSource(this.SOURCE_ID)).setData(data);
    }  
  }
gaialoading = signal(false);
uploadCone(cone: any) {
  this.gaialoading.set(true);
  let gpt_key:string|null = localStorage.getItem('gaia-sora-key');;
  let conf = this.md.open(InputDialog, {data: {key:gpt_key}, width:"400px"});
  conf.afterClosed().subscribe(result=>{
    console.log(result);
    if(result){
      localStorage.setItem('gaia-sora-key', result);
      this.http.post('https://api.gaia.fantasymaps.org/'+this.ar.snapshot.params['timeline']+'/context?describe=only&image='+result, cone, {
        headers: { 'Content-Type': 'application/json' },
      }).subscribe((data:any) => {
        this.gs.addQuery(this.ar.snapshot.params['timeline'], data.pov, data, this.createCone(data.pov, cone.radius, cone.bearing, cone.fov));
        this.gaialist.set(this.gs.getPastQueries(this.ar.snapshot.params['timeline']));
        this.map.getSource('gaiaStorageFovs').setData(this.gs.getFovs(this.ar.snapshot.params['timeline']));
        this.map.getSource('gaiaStoragePovs').setData(this.gs.getMarkers(this.ar.snapshot.params['timeline']));

        this.showGaia(data);
      })
    } else {
      this.http.post('https://api.gaia.fantasymaps.org/'+this.ar.snapshot.params['timeline']+'/context?describe=only&image=false', cone, {
        headers: { 'Content-Type': 'application/json' },
      }).subscribe((data:any) => {
        this.gs.addQuery(this.ar.snapshot.params['timeline'], data.pov, data, this.createCone(data.pov, cone.radius, cone.bearing, cone.fov));
        this.gaialist.set(this.gs.getPastQueries(this.ar.snapshot.params['timeline']));
        this.map.getSource('gaiaStorageFovs').setData(this.gs.getFovs(this.ar.snapshot.params['timeline']));
        this.map.getSource('gaiaStoragePovs').setData(this.gs.getMarkers(this.ar.snapshot.params['timeline']));
        
        this.showGaia(data);
      });
    }
  })
}

showGaia(data:any){
  this.md.open(Response, {data: data});
  this.gaialoading.set(false);
}

cleanup(map: any) {
  this.drawing = false;
  this.center = null;
  map.getCanvas().style.cursor = '';
this.upsertCone(map, {type:"FeatureCollection", features:[]})
}

registerConeHandlers(map: any) {
  map.on('click', (e:any) => {
    if (!this.drawing) return;

    if (!this.center) {
      this.center = e.lngLat;
      return;
    }

    // finalize
    this.uploadCone({
      x: this.center.lng,
      y: this.center.lat,
      radius: this.radius,
      bearing: this.bearing,
      fov: this.angle
    });

    this.cleanup(map);
  });

  map.on('mousemove', (e:any) => {
    if (!this.drawing || !this.center) return;

    this.bearing = this.getBearing(this.center, e.lngLat);
    this.radius = this.getDistanceMeters(this.center, e.lngLat);

    const cone = this.createCone(this.center, this.radius, this.bearing, this.angle);
    this.upsertCone(map, cone);
  });
}

drawWedge(){
  this.drawing=true;
  this.center=null;
  this.map.getCanvas().style.cursor = 'crosshair';
  
  this.map.getLayer(this.LAYER_ID).bringToFront();
}

  hideAll() {
    this.showInfo = false;
    this.showSearch = false;
    this.showLegend = false;
    this.showTools = false;
    this.showShare = false;
  }

  p = null;

  measuring = false;

  measured = "";
  times: any[] = [];



  geojson: {type:string, features:any[]} = {
    'type': 'FeatureCollection',
    'features': []
  };
  linestring:{type:string, geometry: {type:string, coordinates:number[][]}} = {
    'type': 'Feature',
    'geometry': {
      'type': 'LineString',
      'coordinates': []
    }
  }

  ractive = signal("");

  gaialist = signal<any[]>([]);

  // ─── Annotations ───
  annotating = signal(false);
  annotationsVisible = signal(true);
  annotations = signal<Annotation[]>([]);
  ANNOT_SOURCE_ID = 'annotations';
  ANNOT_LAYER_ID = 'annotations_layer';
  ANNOT_LABEL_ID = 'annotations_label';

  // ─── Saved views ───
  views = signal<SavedView[]>([]);
  viewLabelDraft = '';

  // ─── Imported overlays (session only) ───
  overlays = signal<{ id: string; name: string; color: string; sourceId: string; layerIds: string[]; featureCount: number }[]>([]);
  private overlayPalette = ['#c44632', '#c49232', '#469c8c', '#5064c3', '#965a96', '#dcd7c8'];
  private overlayPaletteIdx = 0;

  constructor(
    private ar: ActivatedRoute,
    private l: Location,
    private md: MatDialog,
    private ohm: OfmService,
    private ofm: OfmService,
    private http: HttpClient,
    private _snackBar: MatSnackBar,
    private clipboard: Clipboard,
    private capture: NgxCaptureService,
    private cdr: ChangeDetectorRef,
    private gs: GaiaStorage,
    private annot: AnnotationsStorage,
    private viewsStore: ViewsStorage
  ) {
    this.startstopicons.set('stop', 'play_arrow');
    this.startstopicons.set('play', 'stop');
    this.gaialist.set(gs.getPastQueries(ar.snapshot.params['timeline']));
    this.annotations.set(annot.getAll(ar.snapshot.params['timeline']));
    this.views.set(viewsStore.getAll(ar.snapshot.params['timeline']));
  }

  ngOnDestroy(): void {
    this.currentDeck = "";
  }

  currentDeck="d1";

  setDeck(deck: string){
    this.currentDeck=deck;
    this.changeUrl('deck');
  }

  ngAfterContentInit(): void {
    this.map = new maplibregl.Map({
      container: 'ohm_map',
      style: 'https://static.fantasymaps.org/' + this.ar.snapshot.params['timeline'] + '/map.json', // stylesheet location
      center: this.start.center, // starting position [lng, lat]
      zoom: this.start.zoom, // starting zoom
      bearing: this.start.bearing,
      pitch: this.start.pitch,
      maxZoom:25,
      projection: 'equirectangular',
      maxPitch: 85,
      minPitch: 0,
      attributionControl: false,
      preserveDrawingBuffer: true,
      transformRequest: (url: string, resourceType: string) => {
        let nurl = url;
        if (isDevMode()) {
          nurl = nurl.replace('https://tiles.fantasymaps.org/' + this.tl, this.ts + this.tl);
          nurl = nurl.replace('https://a.tiles.fantasymaps.org/' + this.tl, this.ts + this.tl);
          nurl = nurl.replace('https://b.tiles.fantasymaps.org/' + this.tl, this.ts + this.tl);
          nurl = nurl.replace('https://c.tiles.fantasymaps.org/' + this.tl, this.ts + this.tl);
        }
        return {
          url: nurl.replace('{atDate}', this.atDate.toString()).replace('%7BatDate%7D', this.atDate.toString()).replace('{deck}', this.currentDeck).replace('%7Bdeck%7D', this.currentDeck)
        };
      }

    });

    console.log(this.map);

    this.map.on('load', () => {
      this.showRels();
      this.map.on('zoomend', () => {
        if (this.map.getZoom() >= 22 && this.ofm_meta.relatedLayers) {
          const features = this.map.queryRenderedFeatures({
            layers: this.ofm_meta?.relatedLayers
          });
          if (features.length == 1) {
            const move_to = this.ar.snapshot.params['timeline'] + "-" + features[0].properties[this.ofm_meta.relatedField].toLowerCase();
            this.warpTo(this.atDate, move_to);
          }
        } else if (this.map.getZoom() < 1 && this.ofm_meta.parentMap) {
          this.warpTo(this.atDate, this.ofm_meta.parentMap, 20, this.ofm_meta.parentLocation);
        }
      })

    });


    this.map.on('load', () => {
      this.showOverlays();
      //this.map.setTerrain({source:'dem', 'exaggeration': 1.2})
      //this.map.addLauer({
      //  'id': 'sky',
      //  'type': 'sky',
      //  'paint': {
      //  'sky-type': 'atmosphere',
      //  'sky-atmosphere-sun': [0.0, 0.0],
      //  'sky-atmosphere-sun-intensity': 15
      //  }});

      this.registerConeHandlers(this.map);

      
    this.map.addSource(this.SOURCE_ID, {
      type: 'geojson',
      data:{type:"FeatureCollection", features:[]}
    });

    this.map.addLayer({
      id: this.LAYER_ID,
      type: 'fill',
      source: this.SOURCE_ID,
      paint: {
        'fill-color': '#ff6a00',
        'fill-opacity': 0.35
      }
    });

    setInterval(()=>{
      this.gs.getAgents(this.ar.snapshot.params['timeline']).subscribe(data=>{
        this.map.getSource('gaiaAgentsPovs').setData(data);
      })
    }, 5*1000);


      this.map.addSource('gaiaAgentsPovs', {
        'type': 'geojson',
        'data': {type:'FeatureCollection', features:[]}
      });


      this.map.addLayer({
        id: 'gaia_layer_agents_povs',
        type: 'circle',
        source: 'gaiaAgentsPovs',
        paint: {
          'circle-radius': 4,
          'circle-color': 'rgba(186, 42, 28, 1)'
        },
      });

      this.map.addSource('gaiaStoragePovs', {
        'type': 'geojson',
        'data': this.gs.getMarkers(this.ar.snapshot.params['timeline'])
      });

      this.map.addSource('gaiaStorageFovs', {
        'type': 'geojson',
        'data': this.gs.getFovs(this.ar.snapshot.params['timeline'])
      });


      this.map.addLayer({
        id: 'gaia_layer_povs',
        type: 'circle',
        source: 'gaiaStoragePovs',
        paint: {
          'circle-radius': 4,
          'circle-color': 'rgba(231, 241, 28, 0.5)'
        },
      });
      this.map.addLayer({
        id: 'gaia_layer_fovs',
        type: 'fill',
        source: 'gaiaStorageFovs',
        paint: {
          'fill-color': '#fff200d9',
          'fill-opacity': 0.35
        }
        
      });

      this.map.on('click', 'gaia_layer_povs', (e:any)=>{
        const p = e.features[0].properties;
        this.showGaia(p);
      })


      for (let layer of (this.ofm_meta?.clickLayers ?? [])) {
        this.map.on('click', layer, (e:any) => {
          this.hideAll();
          this.p = e.features[0].properties;
          this.showInfo = true;
        });
        this.map.on('mouseenter', layer, () => {
          this.map.getCanvas().style.cursor = this.measuring ? 'crosshair' : 'pointer';
        });

        // Change it back to a pointer when it leaves.
        this.map.on('mouseleave', layer, () => {
          this.map.getCanvas().style.cursor = '';
        });
      }


      this.map.addSource('geojson', {
        'type': 'geojson',
        'data': this.geojson
      });


      // Add styles to the map
      this.map.addLayer({
        id: 'measure-points',
        type: 'circle',
        source: 'geojson',
        paint: {
          'circle-radius': 4,
          'circle-color': 'rgba(245,245,245,0.5)'
        },
        filter: ['in', '$type', 'Point']
      });
      this.map.addLayer({
        id: 'measure-lines',
        type: 'line',
        source: 'geojson',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': 'rgba(245,245,245,0.5)',
          'line-width': 2.5,
          'line-dasharray': [2, 2]
        },
        filter: ['in', '$type', 'LineString']
      });

    });

    // Annotations get their own load handler so a throw in the gaia/clickLayers
    // setup above can never leave them un-wired (which would silently disable
    // both the markers and the place-on-click handler).
    this.map.on('load', () => {
      try {
        this.registerAnnotationLayers();
      } catch (err) {
        console.error('[annotations] registerAnnotationLayers failed', err);
      }
    });




    this.map.on('moveend', () => {
      this.changeUrl();
    });

  }
showGaiaLayers = false;
toggleGaiaLayers(){
  this.showGaiaLayers = !this.showGaiaLayers;
  this.map.setLayoutProperty('gaia_layer_povs', 'visibility', this.showGaiaLayers?'visible':'none')
  this.map.setLayoutProperty('gaia_layer_fovs', 'visibility', this.showGaiaLayers?'visible':'none')
}
showGaiaAgentsLayer = false;
toggleGaiaAgentsLayer(){
  this.showGaiaAgentsLayer = !this.showGaiaAgentsLayer;
  this.map.setLayoutProperty('gaia_layer_agents_povs', 'visibility', this.showGaiaAgentsLayer?'visible':'none')

}

  // ─── Annotations ──────────────────────────────────────────────────────
  registerAnnotationLayers() {
    const world = this.ar.snapshot.params['timeline'];
    this.map.addSource(this.ANNOT_SOURCE_ID, {
      type: 'geojson',
      data: this.annot.getFeatureCollection(world),
    });

    this.map.addLayer({
      id: this.ANNOT_LAYER_ID,
      type: 'circle',
      source: this.ANNOT_SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': ['coalesce', ['get', 'color'], '#c44632'],
        'circle-opacity': 0.9,
        'circle-stroke-color': 'rgba(245, 240, 230, 0.95)',
        'circle-stroke-width': 1.5,
      },
    });

    this.map.addLayer({
      id: this.ANNOT_LABEL_ID,
      type: 'symbol',
      source: this.ANNOT_SOURCE_ID,
      layout: {
        'text-field': ['get', 'title'],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': 'rgba(245, 240, 230, 0.95)',
        'text-halo-color': 'rgba(0, 0, 0, 0.6)',
        'text-halo-width': 1,
      },
    });

    this.map.on('click', this.ANNOT_LAYER_ID, (e: any) => {
      const f = e.features?.[0];
      if (!f) return;
      this.editAnnotation(f.properties.id);
    });

    this.map.on('mouseenter', this.ANNOT_LAYER_ID, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', this.ANNOT_LAYER_ID, () => {
      this.map.getCanvas().style.cursor = this.annotating() ? 'crosshair' : '';
    });

    this.map.on('click', (e: any) => {
      if (!this.annotating()) return;
      if (this.measuring || this.drawing) return;
      const hits = this.map.queryRenderedFeatures(e.point, { layers: [this.ANNOT_LAYER_ID] });
      if (hits.length) return;
      this.placeAnnotation(e.lngLat);
    });
  }

  toggleAnnotate() {
    const next = !this.annotating();
    this.annotating.set(next);
    if (!this.map) return;
    this.map.getCanvas().style.cursor = next ? 'crosshair' : '';
    if (next && !this.annotationsVisible()) {
      // No point placing markers you can't see.
      this.annotationsVisible.set(true);
      this.setAnnotationVisibility(true);
      this.bringAnnotationsToTop();
    }
  }

  toggleAnnotationsVisible() {
    const next = !this.annotationsVisible();
    this.annotationsVisible.set(next);
    if (!this.map) return;
    this.setAnnotationVisibility(next);
    if (next) {
      this.bringAnnotationsToTop();
    } else if (this.annotating()) {
      // Hiding the layer while in annotate mode is contradictory — exit it.
      this.annotating.set(false);
      this.map.getCanvas().style.cursor = '';
    }
  }

  private setAnnotationVisibility(visible: boolean) {
    const v = visible ? 'visible' : 'none';
    if (this.map.getLayer(this.ANNOT_LAYER_ID)) this.map.setLayoutProperty(this.ANNOT_LAYER_ID, 'visibility', v);
    if (this.map.getLayer(this.ANNOT_LABEL_ID)) this.map.setLayoutProperty(this.ANNOT_LABEL_ID, 'visibility', v);
  }

  bringAnnotationsToTop() {
    if (!this.map) return;
    // moveLayer(id) with no beforeId puts the layer at the top of the stack.
    // Move circles first, then labels, so labels end up above their markers.
    if (this.map.getLayer(this.ANNOT_LAYER_ID)) this.map.moveLayer(this.ANNOT_LAYER_ID);
    if (this.map.getLayer(this.ANNOT_LABEL_ID)) this.map.moveLayer(this.ANNOT_LABEL_ID);
  }

  placeAnnotation(lngLat: { lng: number; lat: number }) {
    console.log('[annotations] placeAnnotation', lngLat);
    let ref;
    try {
      ref = this.md.open(AnnotationDialog, {
        data: { mode: 'create', title: '', body: '', lat: lngLat.lat, lng: lngLat.lng },
        width: '420px',
      });
    } catch (err: any) {
      console.error('Annotation dialog open failed', err);
      this._snackBar.open(`Dialog error: ${err?.message ?? err}`, 'Close', { duration: 5000 });
      return;
    }
    ref.afterClosed().subscribe((res: any) => {
      if (!res) return;
      const world = this.ar.snapshot.params['timeline'];
      this.annot.add(world, lngLat, res.title, res.body, res.color);
      this.refreshAnnotations();
    });
  }

  editAnnotation(id: string) {
    const world = this.ar.snapshot.params['timeline'];
    const a = this.annot.getAll(world).find(x => x.id === id);
    if (!a) return;
    let ref;
    try {
      ref = this.md.open(AnnotationDialog, {
        data: {
          mode: 'edit',
          title: a.title,
          body: a.body,
          color: a.color,
          lat: a.geometry.coordinates[1],
          lng: a.geometry.coordinates[0],
        },
        width: '420px',
      });
    } catch (err: any) {
      console.error('Annotation dialog open failed', err);
      this._snackBar.open(`Dialog error: ${err?.message ?? err}`, 'Close', { duration: 5000 });
      return;
    }
    ref.afterClosed().subscribe((res: any) => {
      if (!res) return;
      if (res.delete) {
        this.annot.delete(world, id);
      } else {
        this.annot.update(world, id, { title: res.title, body: res.body, color: res.color });
      }
      this.refreshAnnotations();
    });
  }

  deleteAnnotation(id: string) {
    const world = this.ar.snapshot.params['timeline'];
    this.annot.delete(world, id);
    this.refreshAnnotations();
  }

  locateAnnotation(a: Annotation) {
    const c = a.geometry.coordinates;
    this.map.flyTo({ center: c, zoom: Math.max(this.map.getZoom(), 8) });
  }

  onAnnotationImportInput(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (file) this.importAnnotationsFromFile(file);
  }

  importAnnotationsFromFile(file: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      let fc: any;
      try {
        fc = JSON.parse(text);
      } catch {
        this._snackBar.open('Could not parse file as JSON.', 'Close', { duration: 2000 });
        return;
      }
      const world = this.ar.snapshot.params['timeline'];
      const { added, skipped } = this.annot.importFeatureCollection(world, fc);
      if (added === 0 && skipped === 0) {
        this._snackBar.open('No FeatureCollection of points found.', 'Close', { duration: 2500 });
        return;
      }
      this.refreshAnnotations();
      const msg = `Imported ${added} annotation${added === 1 ? '' : 's'}` + (skipped ? ` (${skipped} skipped)` : '');
      this._snackBar.open(msg, 'Close', { duration: 2500 });
    };
    reader.readAsText(file);
  }

  exportAnnotations() {
    const world = this.ar.snapshot.params['timeline'];
    const fc = this.annot.getFeatureCollection(world);
    if (!fc.features.length) {
      this._snackBar.open('No annotations to export.', 'Close', { duration: 1500 });
      return;
    }
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations-${world}-${new Date().toISOString().slice(0, 10)}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private refreshAnnotations() {
    const world = this.ar.snapshot.params['timeline'];
    this.annotations.set(this.annot.getAll(world));
    const src = this.map?.getSource(this.ANNOT_SOURCE_ID);
    if (src) src.setData(this.annot.getFeatureCollection(world));
    this.cdr.markForCheck();
  }

  // ─── Saved views ─────────────────────────────────────────────────────
  saveCurrentView() {
    if (!this.map) return;
    const world = this.ar.snapshot.params['timeline'];
    const c = this.map.getCenter();
    this.viewsStore.add(world, {
      label: this.viewLabelDraft,
      lat: c.lat,
      lng: c.lng,
      zoom: this.map.getZoom(),
      date: parseFloat(this.atDate.toString()),
      pitch: this.map.getPitch(),
      bearing: this.map.getBearing(),
    });
    this.viewLabelDraft = '';
    this.views.set(this.viewsStore.getAll(world));
    this.cdr.markForCheck();
  }

  gotoView(v: SavedView) {
    this.atDate = v.date;
    this.timeline?.setCustomTime(this.toFloatDate(this.atDate), 'atTime');
    this.map.flyTo({
      center: [v.lng, v.lat],
      zoom: v.zoom,
      pitch: v.pitch ?? 0,
      bearing: v.bearing ?? 0,
    });
    this.changeUrl(this.atDate.toString());
  }

  deleteView(id: string) {
    const world = this.ar.snapshot.params['timeline'];
    this.viewsStore.delete(world, id);
    this.views.set(this.viewsStore.getAll(world));
    this.cdr.markForCheck();
  }

  // ─── Imported overlays ───────────────────────────────────────────────
  importOverlaysFromInput(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input?.files) return;
    Array.from(input.files).forEach(f => this.importOverlayFromFile(f));
  }

  importOverlayFromFile(file: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      let fc: any;
      try {
        fc = JSON.parse(text);
      } catch {
        this._snackBar.open('Could not parse file as JSON.', 'Close', { duration: 2000 });
        return;
      }
      this.addOverlay(file.name.replace(/\.[^.]+$/, ''), fc);
    };
    reader.readAsText(file);
  }

  private addOverlay(name: string, fc: any) {
    if (!fc || (fc.type !== 'FeatureCollection' && fc.type !== 'Feature')) {
      this._snackBar.open('Not a valid GeoJSON FeatureCollection.', 'Close', { duration: 2500 });
      return;
    }
    const data = fc.type === 'Feature' ? { type: 'FeatureCollection', features: [fc] } : fc;
    const features = Array.isArray(data.features) ? data.features : [];
    if (!features.length) {
      this._snackBar.open('GeoJSON contained no features.', 'Close', { duration: 2000 });
      return;
    }
    const id = this.uuid();
    const sourceId = `overlay-${id}`;
    const color = this.overlayPalette[this.overlayPaletteIdx % this.overlayPalette.length];
    this.overlayPaletteIdx++;

    this.map.addSource(sourceId, { type: 'geojson', data });

    const fillId = `${sourceId}-fill`;
    const lineId = `${sourceId}-line`;
    const pointId = `${sourceId}-point`;

    this.map.addLayer({
      id: fillId,
      type: 'fill',
      source: sourceId,
      paint: { 'fill-color': color, 'fill-opacity': 0.25 },
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
    });
    this.map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.85 },
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'], true, false],
    });
    this.map.addLayer({
      id: pointId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 5,
        'circle-color': color,
        'circle-opacity': 0.9,
        'circle-stroke-color': 'rgba(245, 240, 230, 0.95)',
        'circle-stroke-width': 1,
      },
      filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
    });

    this.overlays.update(list => [
      ...list,
      { id, name, color, sourceId, layerIds: [fillId, lineId, pointId], featureCount: features.length },
    ]);

    // Bring annotations back to the top so the overlay doesn't bury them.
    this.bringAnnotationsToTop();

    this._snackBar.open(`Added "${name}" — ${features.length} feature${features.length === 1 ? '' : 's'}`, 'Close', { duration: 2500 });
    this.cdr.markForCheck();
  }

  removeOverlay(id: string) {
    const o = this.overlays().find(x => x.id === id);
    if (!o) return;
    for (const lid of o.layerIds) {
      if (this.map.getLayer(lid)) this.map.removeLayer(lid);
    }
    if (this.map.getSource(o.sourceId)) this.map.removeSource(o.sourceId);
    this.overlays.update(list => list.filter(x => x.id !== id));
    this.cdr.markForCheck();
  }

  onMapDragOver(ev: DragEvent) {
    if (!ev.dataTransfer) return;
    if (Array.from(ev.dataTransfer.items || []).some(i => i.kind === 'file')) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
    }
  }

  onMapDrop(ev: DragEvent) {
    if (!ev.dataTransfer) return;
    const files = Array.from(ev.dataTransfer.files || []);
    const geo = files.filter(f => /\.(geo)?json$/i.test(f.name) || f.type === 'application/geo+json' || f.type === 'application/json');
    if (!files.length) return;
    ev.preventDefault();
    if (!geo.length) {
      this._snackBar.open('Only .geojson / .json files are supported.', 'Close', { duration: 2000 });
      return;
    }
    for (const f of geo) this.importOverlayFromFile(f);
  }

  private uuid(): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  panTo(coords: { lat: number; lng: number; } | { lat: number; lon: number; } | [number, number]) {
    this.map.panTo(coords);
  }

  ngOnInit(): void {
    this.http.get('assets/info.json').subscribe(data => {
      this.infoData = data;
    })

    this.atDate = this.ar.snapshot.params['year'];
    this.start.center = [this.ar.snapshot.params['x'], this.ar.snapshot.params['y']];
    this.start.zoom = this.ar.snapshot.params['z'];
    this.start.pitch = parseFloat(this.ar.snapshot.params['pitch'] ?? '0') || 0;
    this.start.bearing = parseFloat(this.ar.snapshot.params['bearing'] ?? '0') || 0;
    this.rels = this.ar.snapshot.params['rels'];
    this.layers = {};

    this.ofm.getMap(this.ar.snapshot.params['timeline']).subscribe((data: any) => {
      this.title = data.name;
      this.ofm_meta = data.metadata.ofm;

      for (let l of this.ofm_meta.togglable) {
        this.layers[l.name] = true;
      }
      this.cdr.markForCheck();
    });

    const container = document.getElementById('visualization');

    const items = new vis.DataSet([]);

    this.ar.params.subscribe(params => {
      this.atDate = params['year'];
      this.start.center = [params['x'], params['y']];
      this.start.zoom = params['z'];
      this.start.pitch = parseFloat(params['pitch'] ?? '0') || 0;
      this.start.bearing = parseFloat(params['bearing'] ?? '0') || 0;
      this.tl = params['timeline'];
      if (this.map) {
        this.map.panTo(this.start.center);
      }
    });

    // Create a Timeline
    this.timeline = new vis.Timeline(container, items, {
      showCurrentTime: false
    });

    this.timeline.addCustomTime(this.toFloatDate(this.atDate), 'atTime');
    const d = this.toFloatDate(this.atDate);
    // tslint:disable-next-line:max-line-length
    this.timeline.setWindow(new Date(d.getFullYear() - 10, d.getMonth(), d.getDate()), new Date(d.getFullYear() + 10, d.getMonth(), d.getDate()));


    this.timeline.on('click', (properties: any) => {
      this.atDate = this.toDateFloat(properties.time);
      this.timeline.setCustomTime(properties.time, 'atTime');
      this.changeUrl(this.atDate.toString());
    });

    this.timeline.on('rangechanged', (properties: any) => {});
  }

  changeUrl(ev:(string|null) = null): void {
    const c = this.map.getCenter();
    const p = this.map.getPitch();
    const b = this.map.getBearing();
    this.l.go(`/${this.tl}/${this.atDate}/${this.map.getZoom()}/${c.lat}/${c.lng}/${p}/${b}` + (this.rels ? '/' + this.rels : ''));
    if (ev) {
      for (let tm of this.ofm_meta.timed) {
        const s = this.map.getSource(tm.source);
        console.log(s);
        if (s.type === 'geojson') {
          this.http.get(s._options.data.replace('{atDate}', this.atDate)).subscribe(data => {
            try {
              s.setData(data);
            } catch (ex) {
              console.log(ex);
            }
          })
        }
      }

      if(this.ofm_meta.type === "starbase"){
        for (let tm of [{"source":"base"}, {"source": "walls"}, {"source": "areas"}]) {

          const s = this.map.getSource(tm.source);
          console.log(s);
          
          if (s.type === 'geojson') {
            this.http.get(s._options.data.replace('{deck}', this.currentDeck)).subscribe(data => {
              try {
                s.setData(data);
              } catch (ex) {
                console.log(ex);
              }
            })
          }        
          this.map.style.getSource('base').load();
        }
      }
    }
    this.events = this.ohm.getEvents(this.tl, this.atDate, 10);
  }

  changeStyle(style: string): void {
    this.style = style;
    this.map.setStyle(style);
  }

  toDateFloat(date: Date): number {
    let ret = date.getFullYear();
    ret += (date.getMonth() + 1) / 12;
    ret += (date.getDate()) * (1 / 12 / 31);
    ret += (date.getHours()) * (1 / 12 / 31 / 24);
    ret += (date.getMinutes()) * (1 / 12 / 31 / 24 / 60);
    ret += (date.getSeconds()) * (1 / 12 / 31 / 24 / 60 / 60);
    return ret;
  }

  toFloatDate(date: number): Date {
    const dd = new DecimaldatePipe();
    return dd.transform(date);
  }

  startstop() {
    this.startstopstatus = this.startstopstatus === 'play' ? 'stop' : 'play';
    this.startstopicon = this.startstopicons.get(this.startstopstatus)!;
    if (this.startstopstatus === 'play') {
      this.startstopInterval = setInterval(() => {
        const delta = 1 / 12 / 30;
        this.atDate = parseFloat(this.atDate.toString()) + delta;
        this.timeline.setCustomTime(this.toFloatDate(this.atDate), 'atTime');
        this.changeUrl(this.atDate.toString());
      }, this.speed);
    } else {
      clearInterval(this.startstopInterval);
    }
  }

  selectDate() {
    const ref = this.md.open(DateComponent, {
      data: this.atDate
    });
    ref.afterClosed().subscribe(date => {
      this.atDate = date;
    });
  }

  setSpeed(speed: number) {
    this.speed = speed;
    if (this.startstopInterval) {
      clearInterval(this.startstopInterval);
      this.startstop();
    }
  }

  info() {}

  showOverlays() {
    console.log('run');
    /*this.map.addLayer({
      id: 'ships',
      type: 'circle',
      source: 'ohm-ephemeral',
      'source-layer': 'movement',
      filter: [
        'all',
        ['==', 'type', 'ship']
      ],
      paint: {
        'circle-opacity': 0.6,
        'circle-color': 'rgb(53, 175, 109)',
        'circle-radius': 2
      }
    });
    this.map.addLayer({
      id: 'planes',
      type: 'circle',
      source: 'ohm-ephemeral',
      'source-layer': 'movement',
      filter: [
        'all',
        ['==', 'type', 'aircraft']
      ],
      paint: {
        'circle-opacity': 0.6,
        'circle-color': '#dd3333',
        'circle-radius': 2
      }
    });
    this.map.addLayer({
      id: 'human',
      type: 'circle',
      source: 'ohm-ephemeral',
      'source-layer': 'movement',
      filter: [
        'all',
        ['==', 'type', 'human']
      ],
      paint: {
        'circle-opacity': 0.6,
        'circle-color': 'rgb(53, 53, 200)',
        'circle-radius': 2
      }
    });
    /*
    this.map.addLayer({
      id: 'ships-labels',
      type: 'symbol',
      source: 'ohm-ephemeral',
      'source-layer': 'movement',
      filter: [
        'any',
        ['==', 'type', 'ship'],
        ['==', 'type', 'aircraft'],
      ],
      layout: {
        'text-field': {
          stops: [
            [1, ''],
            [2, '{service} {name}'],
            [5, '{service} {name} - {ship:nationality}'],
            [13, '{service} {name} - {ship:nationality}']
          ]
        },
        'text-size': {
          stops: [[6, 10], [10, 13]]
        },
        'text-allow-overlap': true,
        'text-ignore-placement': false,
        'text-offset': [0, -1],
        'text-max-width': 12
      }
    });
    */
    /*
    this.map.addLayer({
      id: 'human-labels',
      type: 'symbol',
      source: 'ohm-ephemeral',
      'source-layer': 'movement',
      filter: [
        'all',
        ['==', 'type', 'human']
      ],
      layout: {
        'text-field': '{name}',
        'text-font': ['Open Sans Regular'],
        'text-size': 10,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-offset': [0, -1],
        'text-max-width': 12
      }
    });
    */
    /*this.map.addLayer({
      id: 'events',
      type: 'circle',
      source: 'ohm-ephemeral',
      'source-layer': 'event',
      paint: {
        'circle-opacity': 1,
        'circle-color': '#dd3333',
        'circle-radius': 1.5
      }
    });
    /*
    this.map.addLayer({
      id: 'events-labels',
      type: 'symbol',
      source: 'ohm-ephemeral',
      'source-layer': 'event',
      layout: {
        'text-field': '{name}',
        'text-font': ['Open Sans Regular'],
        'text-size': {
          stops: [[6, 10], [10, 13]]
        },
        'text-allow-overlap': true,
        'text-ignore-placement': false,
        'text-offset': [0, -1],
        'text-max-width': 12
      }
    });
    */
  }

  copy_url() {
    try {
      this.capture.getImage(this.screen, true).subscribe(img => {
        this.hideAll();
        this.ohm.su(window.location.href, img).subscribe(data => {
          this.clipboard.copy(data);
          this.share_link = data;
          this.showShare = true;
          this._snackBar.open('Address ready to share', 'Close', {
            duration: 1000
          });
        });
      })
    } catch (ex) {
      this.clipboard.copy(window.location.href);
      this._snackBar.open('Address ready to share', 'Close', {
        duration: 1000
      });
    }
  }

  goTimeSpace(time: number, space: any): void {
    const p = this.map.getPitch();
    const b = this.map.getBearing();
    this.l.go(`${this.tl}/${time}/${this.map.getZoom()}/${space.coordinates[0]}/${space.coordinates[1]}/${p}/${b}` + (this.rels ? '/' + this.rels : ''));
  }

  warpTo(time: number, timeline: string, zoom: number = 2, space: any = [0, 0]): void {
    setTimeout(() => {
      this.l.go(`/${timeline}/${time}/${zoom}/${space[0]}/${space[1]}/0/0` + (this.rels ? '/' + this.rels : ''));
      window.location.reload();
    }, 100);
  }

  
  toggleLayer(name: string) {
    if (Object.keys(this.layers).indexOf(name) >= 0) {
      this.layers[name] = !this.layers[name];
      for (let l of this.ofm_meta.togglable.filter((x:any) => x.name === name)[0].layers) {
        this.map.setLayoutProperty(l, 'visibility', this.layers[name] ? 'visible' : 'none');
      }
    } else
      this.layers[name] = true;
  }

  showRels() {
    if (this.rels) {
      const rc = this.rels.split('|');
      const rels = rc.map((x:any) => x.split(':')[0]);
      const cols = rc.map((x:any) => x.split(':').length > 1 ? x.split(':')[1] : '232323');
      const wids = rc.map((x:any) => x.split(':').length > 2 ? parseFloat(x.split(':')[2]) : 2);
      const opas = rc.map((x:any) => x.split(':').length > 3 ? parseFloat(x.split(':')[3]) : 0.2);
      const zip = (arr1:any[], arr2:any) => arr1.map((k:any, i:any) => [k, arr2[i]]);

      const rcs = zip(rels, cols);


      console.log(rcs);

      this.map.addSource('ohm-movement-rels', {
        type: 'geojson',
        data: 'http://51.15.160.236:9034/relation/' + rels.join('|'),
      });
      rcs.forEach((irc, i) => {
        this.map.addLayer({
          id: 'rel-movements-' + irc[0],
          type: 'line',
          source: 'ohm-movement-rels',
          filter: [
            'all',
            ['==', 'relation', irc[0]]
          ],
          paint: {
            'line-opacity': opas[i],
            'line-color': '#' + irc[1],
            'line-width': wids[i],
          }
        });
      });
      this.map.addLayer({
        id: 'rel-movements-labels',
        type: 'symbol',
        source: 'ohm-movement-rels',
        layout: {
          'text-field': {
            stops: [
              [1, ''],
              [4, '{name}']
            ]
          },
          'text-size': 9
        }
      });
    }

  }

  
  clearDistance() {
    this.measuring = false;
    this.measured = '';
    this.times = [];
    this.geojson = {
      'type': 'FeatureCollection',
      'features': []
    };
    this.linestring = {
      'type': 'Feature',
      'geometry': {
      'type': 'LineString',
      'coordinates': []
      }
    };
      
    this.map.getSource('geojson').setData(this.geojson);

  }

  startDistance() {
    this.measuring = !this.measuring;
    

  //  this.map.on('mousemove', (e) => {
  //    var features = this.map.queryRenderedFeatures(e.point, {
  //      layers: ['measure-points']
  //    });
  //    // UI indicator for clicking/hovering a point on the map
  //    this.map.getCanvas().style.cursor = features.length ?
  //      'pointer' :
  //      'crosshair';
  //  });

    this.map.on('click', (e:any)=>{
      if(this.measuring){
      var features = this.map.queryRenderedFeatures(e.point, {
        layers: ['measure-points']
      });

      // Remove the linestring from the group
      // So we can redraw it based on the points collection
      if (this.geojson.features.length > 1) this.geojson.features.pop();

      // If a feature was clicked, remove it from the map
      if (features.length) {
        var id = features[0].properties.id;
        this.geojson.features = this.geojson.features.filter((point: any) => {
          return point.properties.id !== id;
        });
      } else {
        var point = {
          'type': 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': [e.lngLat.lng, e.lngLat.lat]
          },
          'properties': {
            'id': String(new Date().getTime())
          }
        };

        this.geojson.features.push(point);
      }

      if (this.geojson.features.length > 1) {
        this.linestring.geometry.coordinates = this.geojson.features.map(
          function (point) {
            return point.geometry.coordinates;
          }
        );

        this.geojson.features.push(this.linestring);

        const ll = turf.length(this.linestring)*this.ofm_meta.distance_multiplier;
        // Populate the distanceContainer with total distance
        const value = '' +
          (ll).toFixed(1) + ' ' +
          this.ofm_meta.distance_unit;
        this.measured = value;
        this.times = [];
        const units: Map<string,number> = new Map<string, number>();
        units.set("s",60).set("min", 60).set("h", 24).set("d", 30).set("mo", 12).set("y", 1);
        const unitNames = Array.from(units.keys());
        for(let t of this.ofm_meta.speeds){
          let ms = ll*9.461e+15/(299792458*Math.pow(t.multiplier,10/3));
          let cuu = unitNames[0];
          for (let i = 0; i < unitNames.length - 1; i++) {
            const toNext = units.get(unitNames[i])!;
            const scaled = ms / toNext;
            if (scaled >= 1) {
              ms = scaled;
              cuu = unitNames[i + 1];
            } else {
              break;
            }
          }
          this.times.push({
            v: t.multiplier == 1?ll.toFixed(2):(ms).toFixed(2),
            u: cuu,
            l: t.label,
          })
        }
      }

      this.map.getSource('geojson').setData(this.geojson);
    }
    });
  }
}

