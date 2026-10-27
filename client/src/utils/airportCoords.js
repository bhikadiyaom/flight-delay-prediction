// Map defaults for the contiguous US + a few hubs for fallback. The risk-map API already returns lat/lon for every
// airport; this file only supplies the viewport and a safety net when an airport has no coordinates.
export const US_CENTER = [39.5, -98.35];
export const US_ZOOM = 4;
export const US_BOUNDS = [[17, -170], [72, -60]]; // keeps Hawaii, Alaska and Puerto Rico reachable

export const HUB_COORDS = {
  ATL: [33.6407, -84.4277], ORD: [41.9742, -87.9073], DFW: [32.8998, -97.0403], DEN: [39.8561, -104.6737],
  LAX: [33.9416, -118.4085], JFK: [40.6413, -73.7781], SFO: [37.6213, -122.379], SEA: [47.4502, -122.3088],
  LAS: [36.084, -115.1537], MCO: [28.4312, -81.3081], MIA: [25.7959, -80.287], BOS: [42.3656, -71.0096],
};

export const coordsFor = (iata, fallback) => HUB_COORDS[iata] ?? fallback ?? null;
