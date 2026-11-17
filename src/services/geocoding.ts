const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?limit=1&access_token=${encodeURIComponent(TOKEN)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: Array<{ place_name?: string; text?: string }> };
    const feature = data.features?.[0];
    const label = feature?.place_name || feature?.text;
    return typeof label === "string" && label.trim() ? label.trim() : null;
  } catch {
    return null;
  }
}
