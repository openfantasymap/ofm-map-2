import { bearingDegrees, createCone, distanceMeters } from './cone';

describe('cone geometry', () => {
  const origin = { lng: 0, lat: 0 };

  it('measures a degree of latitude as ~111 km', () => {
    expect(distanceMeters(origin, { lng: 0, lat: 1 })).toBeCloseTo(111_195, -2);
  });

  it('reports compass bearings', () => {
    expect(bearingDegrees(origin, { lng: 0, lat: 1 })).toBeCloseTo(0, 6);
    expect(bearingDegrees(origin, { lng: 1, lat: 0 })).toBeCloseTo(90, 6);
    expect(bearingDegrees(origin, { lng: -1, lat: 0 })).toBeCloseTo(270, 6);
  });

  it('builds a closed sector polygon anchored at the centre', () => {
    const ring = createCone(origin, 1000, 0, 90, 8).geometry.coordinates[0];
    expect(ring.length).toBe(8 + 1 + 2);
    expect(ring[0]).toEqual([0, 0]);
    expect(ring[ring.length - 1]).toEqual([0, 0]);
    for (const [lng, lat] of ring.slice(1, -1)) {
      expect(distanceMeters(origin, { lng, lat })).toBeCloseTo(1000, 0);
    }
  });
});
