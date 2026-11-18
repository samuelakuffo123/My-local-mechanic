import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef } from "react";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string | null;
  kind?: "user" | "provider" | "destination";
}

interface LiveMapProps {
  user?: MapPoint | null;
  provider?: MapPoint | null;
  destination?: MapPoint | null;
  route?: Array<[number, number]> | null; // [lng, lat]
  followUser?: boolean;
  interactive?: boolean;
  className?: string;
  height?: number | string;
}

const DEFAULT_CENTER: [number, number] = [-0.1870, 5.6037]; // Accra
const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

function markerEl(kind: NonNullable<MapPoint["kind"]>) {
  const el = document.createElement("div");
  el.className = `live-map-marker live-map-marker--${kind}`;
  el.innerHTML =
    kind === "user"
      ? '<span class="live-map-marker__pulse"></span><span class="live-map-marker__dot"></span>'
      : kind === "provider"
        ? '<span class="live-map-marker__car"></span>'
        : '<span class="live-map-marker__pin"></span>';
  return el;
}

export function LiveMap({ user, provider, destination, route = null, followUser = true, interactive = true, className = "", height = "100%" }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ user?: mapboxgl.Marker; provider?: mapboxgl.Marker; destination?: mapboxgl.Marker }>({});
  const fittedRef = useRef(false);

  const points = useMemo(() => {
    const list: Array<{ key: "user" | "provider" | "destination"; point: MapPoint }> = [];
    if (user) list.push({ key: "user", point: user });
    if (provider) list.push({ key: "provider", point: provider });
    if (destination) list.push({ key: "destination", point: destination });
    return list;
  }, [destination, provider, user]);

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const initial = user ?? provider ?? destination;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initial ? [initial.lng, initial.lat] : DEFAULT_CENTER,
      zoom: initial ? 14 : 12,
      attributionControl: false,
      interactive,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      if (!map.getSource("route-line")) {
        map.addSource("route-line", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
        map.addLayer({ id: "route-line-casing", type: "line", source: "route-line", paint: { "line-color": "#0a0d3a", "line-width": 8, "line-opacity": 0.5 } });
        map.addLayer({ id: "route-line", type: "line", source: "route-line", paint: { "line-color": "#5865f2", "line-width": 4, "line-opacity": 0.95 } });
      }
    });
    mapRef.current = map;
    return () => {
      Object.values(markersRef.current).forEach((marker) => marker?.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, [destination, interactive, provider, user]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (["user", "provider", "destination"] as const).forEach((key) => {
      const found = points.find((item) => item.key === key)?.point;
      const existing = markersRef.current[key];
      if (!found) {
        existing?.remove();
        delete markersRef.current[key];
        return;
      }
      const lngLat: [number, number] = [found.lng, found.lat];
      if (!existing) {
        markersRef.current[key] = new mapboxgl.Marker({ element: markerEl(key), anchor: "center" }).setLngLat(lngLat).addTo(map);
      } else {
        existing.setLngLat(lngLat);
      }
    });

    if (points.length === 0) return;
    if (points.length === 1) {
      const only = points[0].point;
      if (followUser || !fittedRef.current) {
        map.easeTo({ center: [only.lng, only.lat], zoom: Math.max(map.getZoom(), 14), duration: 700 });
        fittedRef.current = true;
      }
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach(({ point }) => bounds.extend([point.lng, point.lat]));
    map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 700 });
    fittedRef.current = true;
  }, [followUser, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyRoute = () => {
      const source = map.getSource("route-line") as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route && route.length > 1 ? route : [] },
      });
    };
    if (map.isStyleLoaded()) applyRoute();
    else map.once("load", applyRoute);
  }, [route]);

  if (!TOKEN) {
    return (
      <div className={`live-map live-map--empty ${className}`} style={{ height }}>
        <div className="live-map__fallback">
          <strong>Map unavailable</strong>
          <small>Add <code>VITE_MAPBOX_ACCESS_TOKEN</code> to enable live maps.</small>
        </div>
      </div>
    );
  }

  return <div className={`live-map ${className}`} ref={containerRef} style={{ height }} />;
}
