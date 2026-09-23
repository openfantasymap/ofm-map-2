import { GeomqttLayer, latToTileY, lonToTileX, tilesInBounds } from './geomqtt-layer';

describe('geomqtt tile math', () => {
  it('lonToTileX agrees with the slippy formula at zoom 6', () => {
    // 0° at zoom 6 → tile 32 (n/2).
    expect(lonToTileX(0, 6)).toBe(32);
    // -180° → tile 0.
    expect(lonToTileX(-180, 6)).toBe(0);
    // +180° → tile 64 mathematically, but clamping in tilesInBounds keeps it
    // inside [0, n-1]. The raw lonToTileX at exactly +180 returns n.
    expect(lonToTileX(180, 6)).toBe(64);
  });

  it('latToTileY yields expected tile for known cities', () => {
    // Berkeley (37.87, -122.27) at zoom 10 → roughly y=395, x=164.
    expect(lonToTileX(-122.27, 10)).toBe(164);
    expect(latToTileY(37.87, 10)).toBe(395);
  });

  it('tilesInBounds covers a small viewport in 1 tile', () => {
    const tiles = tilesInBounds(11.30, 44.48, 11.36, 44.50, 6);
    expect(tiles.length).toBe(1);
  });

  it('tilesInBounds covers a global viewport in many tiles at zoom 2', () => {
    // Global → 16 tiles at zoom 2 (n=4).
    const tiles = tilesInBounds(-180, -85, 180, 85, 2);
    expect(tiles.length).toBe(16);
  });

  it('tilesInBounds is finite at the polar extremes', () => {
    // Should not produce NaN tile indices when lat exceeds Web Mercator clamp.
    const tiles = tilesInBounds(-10, -89, 10, 89, 6);
    for (const [x, y] of tiles) {
      expect(Number.isFinite(x)).toBeTrue();
      expect(Number.isFinite(y)).toBeTrue();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });
});

/** A fake MapLibre map sufficient for GeomqttLayer dispose() tests. */
function fakeMap() {
  const handlers: Record<string, Function[]> = {};
  return {
    getBounds: () => ({
      getWest: () => 11, getSouth: () => 44, getEast: () => 12, getNorth: () => 45,
    }),
    getSource: (_id: string) => ({ setData: (_: any) => {} }),
    on: (event: string, fn: any) => { (handlers[event] ??= []).push(fn); },
    off: (event: string, fn: any) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== fn);
    },
    _handlers: handlers,
  } as any;
}

describe('GeomqttLayer (no broker)', () => {
  it('skips start() gracefully when mqtt global is missing', () => {
    // mqtt is undefined in the test environment by default.
    const map = fakeMap();
    const layer = new GeomqttLayer(map, { url: 'ws://nowhere/mqtt', set: 'agents-toril' });
    const warn = spyOn(console, 'warn');
    expect(() => layer.start()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(jasmine.stringMatching(/mqtt\.js global/));
  });

  it('dispose() is a no-op when never started', () => {
    const map = fakeMap();
    const layer = new GeomqttLayer(map, { url: 'ws://nowhere/mqtt', set: 'agents-toril' });
    expect(() => layer.dispose()).not.toThrow();
  });
});
