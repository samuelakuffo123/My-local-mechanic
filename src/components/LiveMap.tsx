import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../state/store";

export type MapKind = "user" | "provider" | "destination" | "mechanic" | "tow" | "shop";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string | null;
  kind?: "user" | "provider" | "destination";
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string | null;
  kind: "mechanic" | "tow" | "shop";
  active?: boolean;
}

interface LiveMapProps {
  user?: MapPoint | null;
  provider?: MapPoint | null;
  destination?: MapPoint | null;
  markers?: MapMarker[];
  focus?: { lat: number; lng: number } | null;
  onMarkerSelect?: (id: string) => void;
  route?: Array<[number, number]> | null; // [lng, lat]
  followUser?: boolean;
  interactive?: boolean;
  className?: string;
  height?: number | string;
}

const DEFAULT_CENTER: [number, number] = [-0.187, 5.6037]; // Accra
const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
const EMPTY_MARKERS: MapMarker[] = [];

const MARKER_ICONS: Record<MapMarker["kind"], string> = {
  mechanic:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  tow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  shop:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
};

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

function discoveryMarkerEl(marker: MapMarker, interactive: boolean) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `live-map-pin live-map-pin--${marker.kind}${marker.active ? " is-active" : ""}`;
  el.setAttribute("aria-label", `${marker.label ?? marker.kind} on map`);
  el.style.pointerEvents = interactive ? "auto" : "none";
  const glyph = document.createElement("span");
  glyph.className = "live-map-pin__glyph";
  glyph.innerHTML = MARKER_ICONS[marker.kind];
  const label = document.createElement("span");
  label.className = "live-map-pin__label";
  label.textContent = marker.label ?? "";
  el.append(glyph, label);
  return el;
}

function addRouteLayers(map: mapboxgl.Map, route: Array<[number, number]> | null | undefined) {
  if (!map.getSource("route-line")) {
    map.addSource("route-line", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
    });
    map.addLayer({
      id: "route-line-casing",
      type: "line",
      source: "route-line",
      paint: { "line-color": "#0a0d3a", "line-width": 8, "line-opacity": 0.45 },
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      paint: { "line-color": "#5865f2", "line-width": 4, "line-opacity": 0.95 },
    });
  }
  const source = map.getSource("route-line") as mapboxgl.GeoJSONSource | undefined;
  source?.setData({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: route && route.length > 1 ? route : [] },
  });
}

export function LiveMap({
  user,
  provider,
  destination,
  markers = EMPTY_MARKERS,
  focus = null,
  onMarkerSelect,
  route = null,
  followUser = true,
  interactive = true,
  className = "",
  height = "100%",
}: LiveMapProps) {
  const theme = useAppStore((state) => state.theme);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ user?: mapboxgl.Marker; provider?: mapboxgl.Marker; destination?: mapboxgl.Marker }>({});
  const pinsRef = useRef<Map<string, { marker: mapboxgl.Marker; el: HTMLButtonElement }>>(new Map());
  const fittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const routeRef = useRef(route);
  const selectRef = useRef(onMarkerSelect);
  const themeRef = useRef(theme);
  selectRef.current = onMarkerSelect;
  routeRef.current = route;

  const points = useMemo(() => {
    const list: Array<{ key: "user" | "provider" | "destination"; point: MapPoint }> = [];
    if (user) list.push({ key: "user", point: user });
    if (provider) list.push({ key: "provider", point: provider });
    if (destination) list.push({ key: "destination", point: destination });
    return list;
  }, [destination, provider, user]);

  const fitKey = [
    ...points.map(({ key, point }) => `${key}:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`),
    ...markers.map((marker) => `${marker.id}:${marker.lat.toFixed(5)},${marker.lng.toFixed(5)}`),
  ].join("|");

  // The map is created once; prop changes move markers instead of rebuilding it.
  // Creation waits until the container has a real size, because a map measured
  // at zero size projects every point into the same corner and fits nothing.
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    const container = containerRef.current;

    const create = () => {
      if (cancelled || mapRef.current) return;
      const box = container.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) {
        frame = requestAnimationFrame(create);
        return;
      }
      mapboxgl.accessToken = TOKEN;
      const initial = user ?? provider ?? destination ?? markers[0];
      const map = new mapboxgl.Map({
        container,
        style: `mapbox://styles/mapbox/${theme === "dark" ? "dark" : "light"}-v11`,
        center: initial ? [initial.lng, initial.lat] : DEFAULT_CENTER,
        zoom: initial ? 14 : 12,
        attributionControl: false,
        interactive,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      const ensureRoute = () => addRouteLayers(map, routeRef.current);
      map.on("load", ensureRoute);
      map.on("style.load", ensureRoute);
      mapRef.current = map;
      // Sidebars, sheets and orientation changes resize the container without
      // resizing the window, so keep Mapbox's viewport in step.
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(container);
      }
      setMapReady(true);
    };

    frame = requestAnimationFrame(create);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      Object.values(markersRef.current).forEach((marker) => marker?.remove());
      markersRef.current = {};
      pinsRef.current.forEach(({ marker }) => marker.remove());
      pinsRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the basemap in step with the app theme. The map is created with the
  // current theme, so skip the first run to avoid reloading a style that is
  // still loading (which can reject if the map is torn down mid-flight).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    const style = `mapbox://styles/mapbox/${theme === "dark" ? "dark" : "light"}-v11`;
    if (!map.isStyleLoaded()) {
      map.once("load", () => map.setStyle(style));
      return;
    }
    map.setStyle(style);
  }, [theme]);

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

    const totalPoints = points.length + markers.length;
    if (totalPoints === 0) return;
    if (totalPoints === 1) {
      const only = points[0]?.point ?? markers[0];
      if (followUser || !fittedRef.current) {
        map.easeTo({ center: [only.lng, only.lat], zoom: Math.max(map.getZoom(), 14), duration: 700 });
        fittedRef.current = true;
      }
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach(({ point }) => bounds.extend([point.lng, point.lat]));
    markers.forEach((marker) => bounds.extend([marker.lng, marker.lat]));
    map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 700 });
    fittedRef.current = true;
    // Only re-frame when coordinates change, not on every render or selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, followUser, mapReady]);

  // Sync discovery pins (mechanics, tow operators and shops).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    markers.forEach((marker) => {
      seen.add(marker.id);
      const existing = pinsRef.current.get(marker.id);
      if (existing) {
        existing.marker.setLngLat([marker.lng, marker.lat]);
        existing.el.classList.toggle("is-active", Boolean(marker.active));
        const label = existing.el.querySelector(".live-map-pin__label");
        if (label) label.textContent = marker.label ?? "";
        return;
      }
      const el = discoveryMarkerEl(marker, interactive);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        selectRef.current?.(marker.id);
      });
      const pin = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([marker.lng, marker.lat]).addTo(map);
      pinsRef.current.set(marker.id, { marker: pin, el });
    });
    pinsRef.current.forEach(({ marker, el }, id) => {
      if (seen.has(id)) return;
      marker.remove();
      el.remove();
      pinsRef.current.delete(id);
    });
  }, [interactive, markers, mapReady]);

  // Optional recenter target, used when a customer taps a nearby result.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.easeTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 650 });
  }, [focus, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("load", () => addRouteLayers(map, route));
      return;
    }
    addRouteLayers(map, route);
  }, [mapReady, route]);

  if (!TOKEN) {
    return (
      <div className={`live-map live-map--empty ${className}`} style={{ height }}>
        <div className="live-map__fallback">
          <strong>Map unavailable</strong>
          <small>Live maps aren't available right now. You can still view location details.</small>
        </div>
      </div>
    );
  }

  return <div className={`live-map ${className}`} ref={containerRef} style={{ height }} />;
}
