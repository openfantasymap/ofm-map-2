// Spherical helpers for the GaiaWM view cone. Worlds are served in EPSG:4326
// with Earth-sized coordinates, so a 6371 km sphere matches Gaia's own maths.

export interface LngLat { lng: number; lat: number; }

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** GeoJSON Polygon feature for a circular sector (apex at `center`). */
export function createCone(center: LngLat, radius: number, bearing: number, angle: number, steps = 48): any {
  const coords: number[][] = [[center.lng, center.lat]];
  const lat1 = rad(center.lat);
  const lng1 = rad(center.lng);
  const d = radius / R;
  const start = bearing - angle / 2;

  for (let i = 0; i <= steps; i++) {
    const b = rad(start + (i / steps) * angle);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    coords.push([deg(lng2), deg(lat2)]);
  }
  coords.push([center.lng, center.lat]);

  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Initial bearing from `a` to `b`, degrees clockwise from north in [0, 360). */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
