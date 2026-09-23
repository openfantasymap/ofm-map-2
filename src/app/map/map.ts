import { AfterContentInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, KeyValueDiffers, OnDestroy, OnInit, Pipe, PipeTransform, signal, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import {MatDialog, MatDialogModule} from '@angular/material/dialog';
import { firstValueFrom, Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
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
import { GaiaView, ImageState, Response } from '../gaia/response/response';
import { GaiaConnectDialog, GaiaConnectResult } from '../gaia/connect/connect';
import { bearingDegrees, createCone, distanceMeters, LngLat } from '../gaia/cone';
import { GaiaQuery, GaiaStorage } from '../gaia-storage';
import { OpenRouterService } from '../openrouter';
import { AnnotationsStorage, Annotation, AnnotationGeometry } from '../annotations-storage';
import { AnnotationDialog } from '../annotation-dialog/annotation-dialog';
import { ViewsStorage, SavedView } from '../views-storage';
import { GeomqttLayer } from './geomqtt-layer';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
declare const maplibregl: any;
declare const vis: any;
declare const turf: any;
declare const JSZip: any;
declare const marked: any;

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

  layers: any = {}; 
  startstopicons: Map<string,string> = new Map<string,string>();
  
  startstopicon = 'play_arrow';
  startstopstatus = 'stop';
  startstopInterval: any;

  ofm_meta:any = {};

  start = {
    center: [1.57, 43.67],
    zoom: 3.5,
    pitch: 0,
    bearing: 0,
  };

  rels: any;

  atDate = 866.001;

  tl!: string;

  timeline: any;

  speed = 2000;

  events!: Observable < any[] > ;

  infoData: any;

  title: string = "";

  @ViewChild('screen') screen!: any;

  share_link?: string;

  /** Rendered WORLD.md for this world, or null when it has none. */
  worldGuide = signal<string | null>(null);

  showInfo = false;

  // ─── GaiaWM "eye on the world" ───
  // Click a viewpoint, then a second point to set direction and reach. Gaia
  // (api.gaia.fantasymaps.org) narrates the view; the picture is painted in
  // the browser by an OpenRouter image model on the viewer's own key, which
  // is required before the tool can be used.
  drawing = false;
  private coneCenter: LngLat | null = null;
  private coneRadius = 0;
  private coneBearing = 0;
  coneAngle = 120;
  gaialoading = signal(false);
  gaialist = signal<GaiaQuery[]>([]);
  readonly CONE_SOURCE_ID = 'gaia-cone-source';
  readonly CONE_LAYER_ID = 'gaia-cone-layer';

  async drawWedge() {
    if (!this.openrouter.key() && !(await this.connectOpenRouter())) return;
    this.drawing = true;
    this.coneCenter = null;
    this.map.getCanvas().style.cursor = 'crosshair';
    this.map.moveLayer(this.CONE_LAYER_ID);
  }

  /** Ask for an OpenRouter account. Resolves true when a key is usable right away. */
  async connectOpenRouter(): Promise<boolean> {
    const ref = this.md.open<GaiaConnectDialog, void, GaiaConnectResult>(GaiaConnectDialog, { width: '460px', maxWidth: '95vw' });
    const res = await firstValueFrom(ref.afterClosed());
    if (res?.action === 'key') {
      this.openrouter.setKey(res.key);
      return true;
    }
    if (res?.action === 'login') await this.openrouter.login(this.l.path());
    return false;
  }

  private registerConeHandlers() {
    this.map.on('click', (e: any) => {
      if (!this.drawing) return;
      if (!this.coneCenter) {
        this.coneCenter = e.lngLat;
        return;
      }
      this.queryGaia({
        x: this.coneCenter.lng,
        y: this.coneCenter.lat,
        radius: this.coneRadius,
        bearing: this.coneBearing,
        fov: this.coneAngle,
      });
      this.stopCone();
    });

    this.map.on('mousemove', (e: any) => {
      if (!this.drawing || !this.coneCenter) return;
      this.coneBearing = bearingDegrees(this.coneCenter, e.lngLat);
      this.coneRadius = distanceMeters(this.coneCenter, e.lngLat);
      this.map.getSource(this.CONE_SOURCE_ID)?.setData(createCone(this.coneCenter, this.coneRadius, this.coneBearing, this.coneAngle));
    });
  }

  private stopCone() {
    this.drawing = false;
    this.coneCenter = null;
    this.map.getCanvas().style.cursor = '';
    this.map.getSource(this.CONE_SOURCE_ID)?.setData({ type: 'FeatureCollection', features: [] });
  }

  private queryGaia(cone: { x: number; y: number; radius: number; bearing: number; fov: number }) {
    const world = this.world;
    this.gaialoading.set(true);
    this.http.post<any>(`https://api.gaia.fantasymaps.org/${world}/context?describe=only&image_description=true`, cone)
      .pipe(finalize(() => this.gaialoading.set(false)))
      .subscribe({
        next: data => {
          const q = this.gs.addQuery(world, data.pov, data, createCone(data.pov, cone.radius, cone.bearing, cone.fov));
          this.refreshGaia();
          this.showGaia(q, true);
        },
        error: err => {
          console.error('[gaia] context request failed', err);
          this._snackBar.open(`Gaia could not describe this place (${err?.status || 'network error'}).`, 'Close', { duration: 4000 });
        },
      });
  }

  /** Open a Gaia answer; `paintNow` renders the image, otherwise a stored one is loaded. */
  showGaia(q: GaiaQuery, paintNow = false) {
    const image = signal<string | null>(null);
    const imageState = signal<ImageState>('none');
    const imageError = signal<string | null>(null);

    const paint = async () => {
      if (!this.openrouter.key() && !(await this.connectOpenRouter())) return;
      imageState.set('loading');
      imageError.set(null);
      try {
        const url = await this.openrouter.generateImage(q.properties.image_prompt || q.properties.description || '');
        await this.gs.putImage(q.id, url);
        image.set(url);
        imageState.set('ready');
      } catch (err: any) {
        imageError.set(err?.message ?? String(err));
        imageState.set('error');
      }
    };

    const data: GaiaView = {
      description: q.properties.description,
      image_prompt: q.properties.image_prompt,
      image, imageState, imageError, paint,
    };
    this.md.open(Response, { data, width: '720px', maxWidth: '95vw' });

    if (paintNow) {
      paint();
    } else {
      this.gs.getImage(q.id).then(url => {
        if (url) {
          image.set(url);
          imageState.set('ready');
        }
      });
    }
  }

  locateGaia(q: GaiaQuery) {
    this.map.flyTo({ center: q.geometry.coordinates, zoom: Math.max(this.map.getZoom(), 10) });
  }

  deleteGaia(q: GaiaQuery) {
    this.gs.deleteQuery(q.id);
    this.refreshGaia();
  }

  private refreshGaia() {
    const world = this.world;
    this.gaialist.set(this.gs.getPastQueries(world));
    this.map?.getSource('gaiaStorageFovs')?.setData(this.gs.getFovs(world));
    this.map?.getSource('gaiaStoragePovs')?.setData(this.gs.getMarkers(world));
  }

  setImageModel(model: string) {
    this.openrouter.setImageModel(model);
  }

  hideAll() {
    this.showInfo = false;
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

  // ─── Live agent positions (geomqtt) ───
  // Replaces the 5s polling loop when ofm_meta.geomqtt is configured.
  private geomqttLayer: GeomqttLayer | null = null;
  private agentsPollInterval: any = null;

  // ─── Annotations ───
  annotating = signal(false);                                    // point placement mode
  drawingMode = signal<'line' | 'polygon' | null>(null);         // shape drawing mode
  annotationsVisible = signal(true);
  annotations = signal<Annotation[]>([]);
  ANNOT_SOURCE_ID = 'annotations';
  ANNOT_LINE_LAYER_ID = 'annotations_lines';
  ANNOT_FILL_LAYER_ID = 'annotations_fills';
  ANNOT_DRAFT_SOURCE_ID = 'annotations_draft';
  ANNOT_DRAFT_LINE_LAYER_ID = 'annotations_draft_line';
  ANNOT_DRAFT_FILL_LAYER_ID = 'annotations_draft_fill';
  ANNOT_DRAFT_POINTS_LAYER_ID = 'annotations_draft_points';
  private annotMarkers = new Map<string, any>();                 // id → maplibregl.Marker
  private drawingCoords: [number, number][] = [];
  private justDraggedMarker = false;                             // suppress click-after-drag

  // ─── Saved views ───
  views = signal<SavedView[]>([]);
  viewLabelDraft = '';

  // ─── Imported overlays (session only) ───
  overlays = signal<{ id: string; name: string; color: string; sourceId: string; layerIds: string[]; featureCount: number; data: any }[]>([]);
  private overlayPalette = ['#c44632', '#c49232', '#469c8c', '#5064c3', '#965a96', '#dcd7c8'];
  private overlayPaletteIdx = 0;

  constructor(
    private ar: ActivatedRoute,
    private l: Location,
    private md: MatDialog,
    private ofm: OfmService,
    private http: HttpClient,
    private _snackBar: MatSnackBar,
    private clipboard: Clipboard,
    private capture: NgxCaptureService,
    private cdr: ChangeDetectorRef,
    private gs: GaiaStorage,
    private annot: AnnotationsStorage,
    private viewsStore: ViewsStorage,
    readonly openrouter: OpenRouterService,
  ) {
    this.startstopicons.set('stop', 'play_arrow');
    this.startstopicons.set('play', 'stop');
    this.gaialist.set(gs.getPastQueries(ar.snapshot.params['timeline']));
    this.annotations.set(annot.getAll(ar.snapshot.params['timeline']));
    this.views.set(viewsStore.getAll(ar.snapshot.params['timeline']));
  }

  /** Slug of the world on screen (the `:timeline` route param). */
  get world(): string {
    return this.ar.snapshot.params['timeline'];
  }

  ngOnDestroy(): void {
    this.currentDeck = "";
    if (this.geomqttLayer) {
      this.geomqttLayer.dispose();
      this.geomqttLayer = null;
    }
    if (this.agentsPollInterval) {
      clearInterval(this.agentsPollInterval);
      this.agentsPollInterval = null;
    }
  }

  currentDeck="d1";

  setDeck(deck: string){
    this.currentDeck=deck;
    this.changeUrl('deck');
  }

  ngAfterContentInit(): void {
    this.map = new maplibregl.Map({
      container: 'ohm_map',
      style: 'https://static.fantasymaps.org/' + this.world + '/map.json',
      center: this.start.center,
      zoom: this.start.zoom,
      bearing: this.start.bearing,
      pitch: this.start.pitch,
      maxZoom: 25,
      projection: 'equirectangular',
      maxPitch: 85,
      minPitch: 0,
      attributionControl: false,
      preserveDrawingBuffer: true,
      transformRequest: (url: string) => ({
        url: url
          .replace('{atDate}', this.atDate.toString()).replace('%7BatDate%7D', this.atDate.toString())
          .replace('{deck}', this.currentDeck).replace('%7Bdeck%7D', this.currentDeck),
      }),
    });

    // Expose for external tooling (the offline tile renderer waits on
    // __ofmMap.loaded() / 'idle' instead of guessing with a sleep).
    (window as any).__ofmMap = this.map;

    this.map.on('load', () => {
      // The style *is* map.json, so its metadata is available here even if
      // the separate getMap() request in ngOnInit hasn't answered yet.
      if (!this.ofm_meta || !Object.keys(this.ofm_meta).length) {
        this.ofm_meta = this.map.getStyle()?.metadata?.ofm ?? {};
      }
      this.showRels();
      this.registerWarpHandlers();
      this.registerGaiaLayers();
      this.registerClickLayers();
      this.registerMeasureLayers();
    });

    // Annotations get their own load handler so a throw in the setup above can
    // never leave them un-wired (which would silently disable both the markers
    // and the place-on-click handler).
    this.map.on('load', () => {
      try {
        this.registerAnnotationLayers();
      } catch (err) {
        console.error('[annotations] registerAnnotationLayers failed', err);
      }
    });

    this.map.on('moveend', () => this.changeUrl());
  }

  /** Zoom far in on a related feature → child world; zoom far out → parent world. */
  private registerWarpHandlers() {
    this.map.on('zoomend', () => {
      if (this.map.getZoom() >= 22 && this.ofm_meta.relatedLayers) {
        const features = this.map.queryRenderedFeatures({ layers: this.ofm_meta.relatedLayers });
        if (features.length == 1) {
          const move_to = this.world + '-' + features[0].properties[this.ofm_meta.relatedField].toLowerCase();
          this.warpTo(this.atDate, move_to);
        }
      } else if (this.map.getZoom() < 1 && this.ofm_meta.parentMap) {
        this.warpTo(this.atDate, this.ofm_meta.parentMap, 20, this.ofm_meta.parentLocation);
      }
    });
  }

  private registerGaiaLayers() {
    const empty = { type: 'FeatureCollection', features: [] };

    // In-progress view cone
    this.map.addSource(this.CONE_SOURCE_ID, { type: 'geojson', data: empty });
    this.map.addLayer({
      id: this.CONE_LAYER_ID,
      type: 'fill',
      source: this.CONE_SOURCE_ID,
      paint: { 'fill-color': '#ff6a00', 'fill-opacity': 0.35 },
    });
    this.registerConeHandlers();

    // Live agents (hidden until toggled on in the GaiaWM panel)
    this.map.addSource('gaiaAgentsPovs', { type: 'geojson', data: empty });
    this.map.addLayer({
      id: 'gaia_layer_agents_povs',
      type: 'circle',
      source: 'gaiaAgentsPovs',
      layout: { visibility: 'none' },
      paint: { 'circle-radius': 4, 'circle-color': 'rgba(186, 42, 28, 1)' },
    });

    // Agent positions: live via geomqtt if configured, polling otherwise.
    // ofm_meta.geomqtt = { url: "wss://geomqtt.example/mqtt", set?: "agents-toril", zoom?: 6 }
    const geomqttCfg = this.ofm_meta?.geomqtt;
    if (geomqttCfg?.url) {
      this.geomqttLayer = new GeomqttLayer(this.map, {
        url: geomqttCfg.url,
        set: geomqttCfg.set ?? `agents-${this.world}`,
        zoom: geomqttCfg.zoom ?? 6,
        sourceId: 'gaiaAgentsPovs',
      });
      this.geomqttLayer.start();
    } else {
      this.agentsPollInterval = setInterval(() => {
        this.gs.getAgents(this.world).subscribe((data: any) => {
          this.map.getSource('gaiaAgentsPovs')?.setData(data);
        });
      }, 5 * 1000);
    }

    // Past "eye on the world" looks (hidden until toggled on)
    this.map.addSource('gaiaStoragePovs', { type: 'geojson', data: this.gs.getMarkers(this.world) });
    this.map.addSource('gaiaStorageFovs', { type: 'geojson', data: this.gs.getFovs(this.world) });
    this.map.addLayer({
      id: 'gaia_layer_fovs',
      type: 'fill',
      source: 'gaiaStorageFovs',
      layout: { visibility: 'none' },
      paint: { 'fill-color': '#fff200d9', 'fill-opacity': 0.35 },
    });
    this.map.addLayer({
      id: 'gaia_layer_povs',
      type: 'circle',
      source: 'gaiaStoragePovs',
      layout: { visibility: 'none' },
      paint: { 'circle-radius': 4, 'circle-color': 'rgba(231, 241, 28, 0.5)' },
    });
    this.map.on('click', 'gaia_layer_povs', (e: any) => {
      const q = this.gaialist().find(x => x.id === e.features?.[0]?.properties?.id);
      if (q) this.showGaia(q);
    });
  }

  /** ofm_meta.clickLayers: remember the clicked feature's properties. */
  private registerClickLayers() {
    for (const layer of this.ofm_meta?.clickLayers ?? []) {
      this.map.on('click', layer, (e: any) => {
        this.hideAll();
        this.p = e.features[0].properties;
        this.showInfo = true;
        this.cdr.markForCheck();
      });
      this.map.on('mouseenter', layer, () => {
        this.map.getCanvas().style.cursor = this.measuring ? 'crosshair' : 'pointer';
      });
      this.map.on('mouseleave', layer, () => {
        this.map.getCanvas().style.cursor = '';
      });
    }
  }

  private registerMeasureLayers() {
    this.map.addSource('geojson', { type: 'geojson', data: this.geojson });
    this.map.addLayer({
      id: 'measure-points',
      type: 'circle',
      source: 'geojson',
      paint: { 'circle-radius': 4, 'circle-color': 'rgba(245,245,245,0.5)' },
      filter: ['in', '$type', 'Point'],
    });
    this.map.addLayer({
      id: 'measure-lines',
      type: 'line',
      source: 'geojson',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(245,245,245,0.5)', 'line-width': 2.5, 'line-dasharray': [2, 2] },
      filter: ['in', '$type', 'LineString'],
    });
    // Registered once; startDistance() only flips `measuring`.
    this.map.on('click', (e: any) => this.onMeasureClick(e));
  }

  showGaiaLayers = false;
  toggleGaiaLayers() {
    this.showGaiaLayers = !this.showGaiaLayers;
    const v = this.showGaiaLayers ? 'visible' : 'none';
    this.map.setLayoutProperty('gaia_layer_povs', 'visibility', v);
    this.map.setLayoutProperty('gaia_layer_fovs', 'visibility', v);
  }

  showGaiaAgentsLayer = false;
  toggleGaiaAgentsLayer() {
    this.showGaiaAgentsLayer = !this.showGaiaAgentsLayer;
    this.map.setLayoutProperty('gaia_layer_agents_povs', 'visibility', this.showGaiaAgentsLayer ? 'visible' : 'none');
  }

  // ─── Annotations ──────────────────────────────────────────────────────
  registerAnnotationLayers() {
    const world = this.world;

    // Persisted features — only LineString and Polygon render as map layers.
    // Points are rendered as DOM markers so we can use any web font glyph.
    this.map.addSource(this.ANNOT_SOURCE_ID, {
      type: 'geojson',
      data: this.annot.getFeatureCollection(world),
    });

    this.map.addLayer({
      id: this.ANNOT_FILL_LAYER_ID,
      type: 'fill',
      source: this.ANNOT_SOURCE_ID,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#c44632'],
        'fill-opacity': 0.22,
      },
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
    });

    this.map.addLayer({
      id: this.ANNOT_LINE_LAYER_ID,
      type: 'line',
      source: this.ANNOT_SOURCE_ID,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#c44632'],
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'], true, false],
    });

    // Drafts (in-progress drawing) — separate source so we can clear without
    // touching persisted features.
    this.map.addSource(this.ANNOT_DRAFT_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: this.ANNOT_DRAFT_FILL_LAYER_ID,
      type: 'fill',
      source: this.ANNOT_DRAFT_SOURCE_ID,
      paint: { 'fill-color': '#c44632', 'fill-opacity': 0.18 },
      filter: ['match', ['geometry-type'], ['Polygon'], true, false],
    });
    this.map.addLayer({
      id: this.ANNOT_DRAFT_LINE_LAYER_ID,
      type: 'line',
      source: this.ANNOT_DRAFT_SOURCE_ID,
      paint: {
        'line-color': '#c44632',
        'line-width': 2,
        'line-dasharray': [2, 2],
      },
      filter: ['match', ['geometry-type'], ['LineString', 'Polygon'], true, false],
    });
    this.map.addLayer({
      id: this.ANNOT_DRAFT_POINTS_LAYER_ID,
      type: 'circle',
      source: this.ANNOT_DRAFT_SOURCE_ID,
      paint: {
        'circle-radius': 4,
        'circle-color': '#c44632',
        'circle-stroke-color': 'rgba(245, 240, 230, 0.95)',
        'circle-stroke-width': 1,
      },
      filter: ['match', ['geometry-type'], ['Point'], true, false],
    });

    // Click on persisted line/fill → edit
    const editFromLayer = (e: any) => {
      const f = e.features?.[0];
      if (!f) return;
      this.editAnnotation(f.properties.id);
    };
    this.map.on('click', this.ANNOT_LINE_LAYER_ID, editFromLayer);
    this.map.on('click', this.ANNOT_FILL_LAYER_ID, editFromLayer);

    const setPointer = () => { this.map.getCanvas().style.cursor = 'pointer'; };
    const clearPointer = () => { this.map.getCanvas().style.cursor = this.cursorForCurrentMode(); };
    this.map.on('mouseenter', this.ANNOT_LINE_LAYER_ID, setPointer);
    this.map.on('mouseleave', this.ANNOT_LINE_LAYER_ID, clearPointer);
    this.map.on('mouseenter', this.ANNOT_FILL_LAYER_ID, setPointer);
    this.map.on('mouseleave', this.ANNOT_FILL_LAYER_ID, clearPointer);

    // Single click handler: drawing mode wins, then point placement.
    this.map.on('click', (e: any) => {
      if (this.measuring || this.drawing) return;

      const draw = this.drawingMode();
      if (draw) {
        this.drawingCoords.push([e.lngLat.lng, e.lngLat.lat]);
        this.updateDraftPreview();
        return;
      }

      if (!this.annotating()) return;
      // Skip if click hit a persisted line/fill annotation (handled by their layer events).
      const hits = this.map.queryRenderedFeatures(e.point, {
        layers: [this.ANNOT_LINE_LAYER_ID, this.ANNOT_FILL_LAYER_ID].filter(id => this.map.getLayer(id)),
      });
      if (hits.length) return;
      this.placeAnnotation(e.lngLat);
    });

    // Double-click finishes the in-progress shape.
    this.map.on('dblclick', (e: any) => {
      const draw = this.drawingMode();
      if (!draw) return;
      e.preventDefault?.();
      this.completeDrawing();
    });

    // Spawn DOM markers for persisted points.
    this.rebuildPointMarkers();
  }

  cursorForCurrentMode(): string {
    if (this.drawingMode() || this.annotating()) return 'crosshair';
    return '';
  }

  private rebuildPointMarkers() {
    for (const m of this.annotMarkers.values()) m.remove();
    this.annotMarkers.clear();

    const list = this.annotations();
    for (const a of list) {
      if (a.geometry?.type !== 'Point') continue;
      const el = this.buildMarkerElement(a);
      const marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat(a.geometry.coordinates as [number, number])
        .addTo(this.map);

      marker.on('dragstart', () => {
        el.classList.add('is-dragging');
      });
      marker.on('dragend', () => {
        el.classList.remove('is-dragging');
        const ll = marker.getLngLat();
        const world = this.world;
        this.annot.moveFeature(world, a.id, { type: 'Point', coordinates: [ll.lng, ll.lat] });
        // Refresh the signal so the sidebar reflects the new coords.
        this.annotations.set(this.annot.getAll(world));
        this.cdr.markForCheck();
        // Suppress the synthetic click that fires after the drag release.
        this.justDraggedMarker = true;
        setTimeout(() => { this.justDraggedMarker = false; }, 0);
      });

      this.annotMarkers.set(a.id, marker);
    }
  }

  private buildMarkerElement(a: Annotation): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ann-marker';
    el.title = a.title;
    el.style.color = a.color || '#c44632';
    if (a.icon) {
      const i = document.createElement('i');
      i.className = a.icon;
      el.appendChild(i);
    } else {
      el.classList.add('ann-marker--dot');
    }
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (this.justDraggedMarker) return;
      this.editAnnotation(a.id);
    });
    if (!this.annotationsVisible()) el.style.display = 'none';
    return el;
  }

  // ─── Drawing tool ─────────────────────────────────────────────────────
  setPlacementMode(mode: 'point' | 'line' | 'polygon' | null) {
    // Cancel anything in progress.
    if (this.drawingMode()) {
      this.drawingCoords = [];
      this.updateDraftPreview();
    }
    this.annotating.set(false);
    this.drawingMode.set(null);

    if (mode === 'point') {
      this.annotating.set(true);
      if (!this.annotationsVisible()) {
        this.annotationsVisible.set(true);
        this.setAnnotationVisibility(true);
        this.bringAnnotationsToTop();
      }
    } else if (mode === 'line' || mode === 'polygon') {
      this.drawingMode.set(mode);
      if (!this.annotationsVisible()) {
        this.annotationsVisible.set(true);
        this.setAnnotationVisibility(true);
        this.bringAnnotationsToTop();
      }
    }

    if (this.map) this.map.getCanvas().style.cursor = this.cursorForCurrentMode();
  }

  cancelDrawing() {
    this.setPlacementMode(null);
  }

  undoLastPoint() {
    if (!this.drawingMode()) return;
    this.drawingCoords.pop();
    this.updateDraftPreview();
  }

  private updateDraftPreview() {
    if (!this.map) return;
    const src = this.map.getSource(this.ANNOT_DRAFT_SOURCE_ID);
    if (!src) return;

    const mode = this.drawingMode();
    const features: any[] = [];
    if (mode && this.drawingCoords.length > 0) {
      // Vertex dots for clarity
      for (const c of this.drawingCoords) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} });
      }
      if (mode === 'line' && this.drawingCoords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: this.drawingCoords },
          properties: {},
        });
      } else if (mode === 'polygon' && this.drawingCoords.length >= 2) {
        const ring = this.drawingCoords.length >= 3
          ? [...this.drawingCoords, this.drawingCoords[0]]
          : this.drawingCoords;
        features.push({
          type: 'Feature',
          geometry: this.drawingCoords.length >= 3
            ? { type: 'Polygon', coordinates: [ring] }
            : { type: 'LineString', coordinates: ring },
          properties: {},
        });
      }
    }
    src.setData({ type: 'FeatureCollection', features });
  }

  private completeDrawing() {
    const mode = this.drawingMode();
    if (!mode) return;
    if (mode === 'line' && this.drawingCoords.length < 2) return;
    if (mode === 'polygon' && this.drawingCoords.length < 3) return;

    const geometry: AnnotationGeometry = mode === 'line'
      ? { type: 'LineString', coordinates: [...this.drawingCoords] }
      : { type: 'Polygon', coordinates: [[...this.drawingCoords, this.drawingCoords[0]]] };

    let ref;
    try {
      ref = this.md.open(AnnotationDialog, {
        data: {
          mode: 'create',
          geometryType: geometry.type,
          title: '',
          body: '',
          lat: this.drawingCoords[0][1],
          lng: this.drawingCoords[0][0],
        },
        width: '420px',
      });
    } catch (err: any) {
      console.error('Annotation dialog open failed', err);
      this._snackBar.open(`Dialog error: ${err?.message ?? err}`, 'Close', { duration: 5000 });
      this.setPlacementMode(null);
      return;
    }
    ref.afterClosed().subscribe((res: any) => {
      if (res && !res.delete) {
        const world = this.world;
        this.annot.addFeature(world, geometry, res.title, res.body, res.color, res.icon);
        this.refreshAnnotations();
      }
      this.setPlacementMode(null);
    });
  }

  toggleAnnotationsVisible() {
    const next = !this.annotationsVisible();
    this.annotationsVisible.set(next);
    if (!this.map) return;
    this.setAnnotationVisibility(next);
    if (next) {
      this.bringAnnotationsToTop();
    } else if (this.annotating() || this.drawingMode()) {
      // Hiding the layer while drawing/placing is contradictory — exit it.
      this.setPlacementMode(null);
    }
  }

  private setAnnotationVisibility(visible: boolean) {
    const v = visible ? 'visible' : 'none';
    for (const id of [this.ANNOT_FILL_LAYER_ID, this.ANNOT_LINE_LAYER_ID]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', v);
    }
    // DOM markers are independent of layer visibility — toggle them via display.
    for (const m of this.annotMarkers.values()) {
      const el = m.getElement();
      if (el) el.style.display = visible ? '' : 'none';
    }
  }

  bringAnnotationsToTop() {
    if (!this.map) return;
    // moveLayer(id) with no beforeId puts the layer at the top of the stack.
    // Fills first, then lines, so polygon outlines stay readable over fills.
    // DOM markers are positioned absolutely above the canvas, always on top.
    if (this.map.getLayer(this.ANNOT_FILL_LAYER_ID)) this.map.moveLayer(this.ANNOT_FILL_LAYER_ID);
    if (this.map.getLayer(this.ANNOT_LINE_LAYER_ID)) this.map.moveLayer(this.ANNOT_LINE_LAYER_ID);
    if (this.map.getLayer(this.ANNOT_DRAFT_FILL_LAYER_ID)) this.map.moveLayer(this.ANNOT_DRAFT_FILL_LAYER_ID);
    if (this.map.getLayer(this.ANNOT_DRAFT_LINE_LAYER_ID)) this.map.moveLayer(this.ANNOT_DRAFT_LINE_LAYER_ID);
    if (this.map.getLayer(this.ANNOT_DRAFT_POINTS_LAYER_ID)) this.map.moveLayer(this.ANNOT_DRAFT_POINTS_LAYER_ID);
  }

  placeAnnotation(lngLat: { lng: number; lat: number }) {
    const ref = this.md.open(AnnotationDialog, {
      data: { mode: 'create', geometryType: 'Point', title: '', body: '', lat: lngLat.lat, lng: lngLat.lng },
      width: '420px',
    });
    ref.afterClosed().subscribe((res: any) => {
      if (!res || res.delete) return;
      const world = this.world;
      this.annot.add(world, lngLat, res.title, res.body, res.color, res.icon);
      this.refreshAnnotations();
    });
  }

  editAnnotation(id: string) {
    const world = this.world;
    const a = this.annot.getAll(world).find(x => x.id === id);
    if (!a) return;
    const seed = this.geometrySeedCoords(a.geometry);
    const ref = this.md.open(AnnotationDialog, {
      data: {
        mode: 'edit',
        geometryType: a.geometry.type,
        title: a.title,
        body: a.body,
        color: a.color,
        icon: a.icon,
        lat: seed[1],
        lng: seed[0],
      },
      width: '420px',
    });
    ref.afterClosed().subscribe((res: any) => {
      if (!res) return;
      if (res.delete) {
        this.annot.delete(world, id);
      } else {
        this.annot.update(world, id, { title: res.title, body: res.body, color: res.color, icon: res.icon });
      }
      this.refreshAnnotations();
    });
  }

  private geometrySeedCoords(g: AnnotationGeometry): [number, number] {
    if (g.type === 'Point') return g.coordinates;
    if (g.type === 'LineString') return g.coordinates[0];
    return g.coordinates[0][0];
  }

  deleteAnnotation(id: string) {
    const world = this.world;
    this.annot.delete(world, id);
    this.refreshAnnotations();
  }

  locateAnnotation(a: Annotation) {
    const c = this.geometrySeedCoords(a.geometry);
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
      const world = this.world;
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

  async exportGeoContextZip() {
    if (typeof JSZip === 'undefined') {
      this._snackBar.open('JSZip library not loaded.', 'Close', { duration: 3000 });
      return;
    }

    const world = this.world;
    const annotations = this.annot.getFeatureCollection(world);
    const overlays = this.overlays();
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const stamp = new Date().toISOString();
    const datestamp = stamp.slice(0, 10);

    const datasources: any[] = [];
    const layers: any[] = [
      { name: 'OpenStreetMap', type: 'osm-tiled' },
      {
        name: `OFM · ${this.title || world}`,
        type: 'ofm-tiled',
        conf: { url: `https://tiles.fantasymaps.org/${world}/{z}/{x}/{y}.png` },
      },
    ];

    const zip = new JSZip();
    const datasets = zip.folder('assets').folder('datasets');

    if (annotations.features.length) {
      datasets.file('annotations.geojson', JSON.stringify(annotations, null, 2));
      datasources.push({
        name: 'annotations',
        type: 'geojson+http+remote',
        conf: { source: 'assets/datasets/annotations.geojson' },
      });
      layers.push({
        name: 'Annotations',
        type: 'features',
        datasource: 'annotations',
      });
    }

    for (const o of overlays) {
      if (!o.data) continue;
      const safe = o.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'overlay';
      const dsName = `overlay_${o.id.slice(0, 8)}`;
      const filename = `overlay-${o.id.slice(0, 8)}-${safe}.geojson`;
      datasets.file(filename, JSON.stringify(o.data, null, 2));
      datasources.push({
        name: dsName,
        type: 'geojson+http+remote',
        conf: { source: `assets/datasets/${filename}` },
      });
      layers.push({
        name: o.name,
        type: 'features',
        datasource: dsName,
      });
    }

    const gcx = {
      title: `OFM · ${this.title || world}`,
      type: '2d',
      center: [center.lat, center.lng],
      minzoom: 1,
      startzoom: Math.max(1, Math.round(zoom)),
      maxzoom: 22,
      search: false,
      metadata: {
        source: 'OpenFantasyMap (ofm-map-2)',
        ofm_timeline: world,
        ofm_world_name: this.title || world,
        ofm_atDate: this.atDate,
        ofm_pitch: this.map.getPitch(),
        ofm_bearing: this.map.getBearing(),
        exported_at: stamp,
      },
      datasources,
      layers,
    };
    zip.file('gcx.json', JSON.stringify(gcx, null, 2));

    const annotCount = annotations.features.length;
    const overlayCount = overlays.length;
    const readme =
      `# GeoContext bundle — exported from OpenFantasyMap\n\n` +
      `- World: **${this.title || world}**\n` +
      `- Timeline: \`${world}\`\n` +
      `- atDate: ${this.atDate}\n` +
      `- Annotations: ${annotCount}\n` +
      `- Overlays: ${overlayCount}\n` +
      `- Exported: ${stamp}\n\n` +
      `## Contents\n\n` +
      `- \`gcx.json\` — GeoContext map descriptor\n` +
      `- \`assets/datasets/\` — referenced GeoJSON files\n\n` +
      `## How to use\n\n` +
      `Drop this folder into a GeoContext-compatible repo or serve \`assets/\`\n` +
      `from any static host. The OFM tile layer (\`ofm-tiled\`) points at the\n` +
      `live tiles.fantasymaps.org URL for this timeline; OSM is provided as a\n` +
      `fallback basemap. Each annotation/overlay is a separate features layer\n` +
      `backed by a \`geojson+http+remote\` datasource so the renderer can fetch\n` +
      `them as the user toggles them on.\n`;
    zip.file('README.md', readme);

    let blob;
    try {
      blob = await zip.generateAsync({ type: 'blob' });
    } catch (err: any) {
      console.error('Zip generation failed', err);
      this._snackBar.open(`Zip error: ${err?.message ?? err}`, 'Close', { duration: 4000 });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ofm-${world}-${datestamp}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);

    this._snackBar.open(`Exported bundle (${annotCount} annot · ${overlayCount} overlays)`, 'Close', { duration: 2500 });
  }

  exportAnnotations() {
    const world = this.world;
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
    const world = this.world;
    this.annotations.set(this.annot.getAll(world));
    const src = this.map?.getSource(this.ANNOT_SOURCE_ID);
    if (src) src.setData(this.annot.getFeatureCollection(world));
    this.rebuildPointMarkers();
    this.cdr.markForCheck();
  }

  // Sidebar list helpers
  geometryGlyph(a: Annotation): string {
    if (a.geometry?.type === 'LineString') return 'timeline';
    if (a.geometry?.type === 'Polygon') return 'crop_square';
    return 'location_on';
  }

  romanize(n: number): string {
    if (!Number.isFinite(n) || n <= 0 || n > 3999) return String(n);
    const m: [number, string][] = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100,  'C'], [90,  'XC'], [50,  'L'], [40,  'XL'],
      [10,   'X'], [9,   'IX'], [5,   'V'], [4,   'IV'], [1, 'I'],
    ];
    let r = '';
    for (const [v, s] of m) {
      while (n >= v) { r += s; n -= v; }
    }
    return r;
  }

  // ─── Saved views ─────────────────────────────────────────────────────
  saveCurrentView() {
    if (!this.map) return;
    const world = this.world;
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
    const world = this.world;
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
      { id, name, color, sourceId, layerIds: [fillId, lineId, pointId], featureCount: features.length, data },
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

    this.ofm.getMap(this.world).subscribe((data: any) => {
      this.title = data.name;
      this.ofm_meta = data.metadata?.ofm ?? {};
      for (const l of this.ofm_meta.togglable ?? []) {
        this.layers[l.name] = true;
      }
      this.cdr.markForCheck();
    });

    // A world may ship a WORLD.md guide; the toolbar only offers it when present.
    this.ofm.getWorldGuide(this.world).subscribe(md => {
      this.worldGuide.set(md ? renderMarkdown(md) : null);
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

  }

  changeUrl(ev: (string | null) = null): void {
    const c = this.map.getCenter();
    const p = this.map.getPitch();
    const b = this.map.getBearing();
    this.l.go(`/${this.tl}/${this.atDate}/${this.map.getZoom()}/${c.lat}/${c.lng}/${p}/${b}` + (this.rels ? '/' + this.rels : ''));
    if (ev) {
      // ofm_meta.timed entries are { source, field_from, field_to }; bare names are accepted too.
      for (const tm of this.ofm_meta.timed ?? []) {
        this.refetchGeojson(typeof tm === 'string' ? tm : tm.source, '{atDate}', String(this.atDate));
      }
      if (this.ofm_meta.type === 'starbase') {
        for (const source of ['base', 'walls', 'areas']) {
          this.refetchGeojson(source, '{deck}', this.currentDeck);
        }
      }
    }
    this.events = this.ofm.getEvents(this.tl, this.atDate, 10);
  }

  /** Re-download a GeoJSON source whose URL template contains `token`. */
  private refetchGeojson(sourceId: string, token: string, value: string) {
    const src = this.map.getSource(sourceId);
    const template = src?._options?.data;
    if (src?.type !== 'geojson' || typeof template !== 'string') return;
    this.http.get(template.replace(token, value)).subscribe({
      next: data => src.setData(data),
      error: err => console.warn(`[map] could not refresh ${sourceId}`, err),
    });
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
      if (date === undefined || date === null) return;
      this.atDate = date;
      this.timeline.setCustomTime(this.toFloatDate(this.atDate), 'atTime');
      this.changeUrl(String(this.atDate));
    });
  }

  setSpeed(speed: number) {
    this.speed = speed;
    if (this.startstopInterval) {
      clearInterval(this.startstopInterval);
      this.startstop();
    }
  }

  copy_url() {
    try {
      this.capture.getImage(this.screen, true).subscribe(img => {
        this.ofm.su(window.location.href, img).subscribe(data => {
          this.clipboard.copy(data);
          this.share_link = data;
          this.cdr.markForCheck();
          this._snackBar.open('Address ready to share', 'Close', {
            duration: 1000
          });
        });
      })
    } catch (ex) {
      this.share_link = window.location.href;
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
  }

  /** Measuring tool: click adds a vertex, clicking a vertex removes it. */
  private onMeasureClick(e: any) {
    if (!this.measuring) return;
    const hit = this.map.queryRenderedFeatures(e.point, { layers: ['measure-points'] });

    // Drop the previous line; it's rebuilt from the points below.
    if (this.geojson.features.length > 1) this.geojson.features.pop();

    if (hit.length) {
      const id = hit[0].properties.id;
      this.geojson.features = this.geojson.features.filter((pt: any) => pt.properties.id !== id);
    } else {
      this.geojson.features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] },
        properties: { id: String(Date.now()) },
      });
    }

    if (this.geojson.features.length > 1) {
      this.linestring.geometry.coordinates = this.geojson.features.map((pt: any) => pt.geometry.coordinates);
      this.geojson.features.push(this.linestring);

      const ll = turf.length(this.linestring) * (this.ofm_meta.distance_multiplier ?? 1);
      this.measured = `${ll.toFixed(1)} ${this.ofm_meta.distance_unit ?? 'km'}`;
      this.times = [];
      const units = new Map<string, number>([['s', 60], ['min', 60], ['h', 24], ['d', 30], ['mo', 12], ['y', 1]]);
      const unitNames = Array.from(units.keys());
      for (const t of this.ofm_meta.speeds ?? []) {
        let ms = ll * 9.461e+15 / (299792458 * Math.pow(t.multiplier, 10 / 3));
        let cuu = unitNames[0];
        for (let i = 0; i < unitNames.length - 1; i++) {
          const scaled = ms / units.get(unitNames[i])!;
          if (scaled < 1) break;
          ms = scaled;
          cuu = unitNames[i + 1];
        }
        this.times.push({ v: t.multiplier == 1 ? ll.toFixed(2) : ms.toFixed(2), u: cuu, l: t.label });
      }
    }

    this.map.getSource('geojson').setData(this.geojson);
  }
}

/** Render WORLD.md; falls back to preformatted text if the marked CDN script failed. */
function renderMarkdown(md: string): string {
  if (typeof marked !== 'undefined') return marked.parse(md);
  const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre>${esc}</pre>`;
}
