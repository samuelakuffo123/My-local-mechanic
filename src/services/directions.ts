const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

export interface RouteResult {
  coordinates: Array<[number, number]>; // [lng, lat]
  distanceMeters?: number;
  durationSeconds?: number;
}

export async function getDrivingRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult | null> {
  if (!TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${encodeURIComponent(TOKEN)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> }; distance?: number; duration?: number }>;
    };
    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return null;
    return { coordinates, distanceMeters: route?.distance, durationSeconds: route?.duration };
  } catch {
    return null;
  }
}
