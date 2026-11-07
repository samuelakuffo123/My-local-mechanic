import { useEffect, useRef, useState } from "react";
import mapboxgl, { type Map as MapboxMap, type Marker as MapboxMarker } from "mapbox-gl";
import { MapPin, Search } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";

type Coordinates = { lat: number; lng: number };
type MapboxFeature = { id: string; place_name: string; center: [number, number] };

interface MapboxSearchResponse {
  features?: MapboxFeature[];
  message?: string;
}

const configuredToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
const accessToken = configuredToken.startsWith("pk.") ? configuredToken : "";

export default function MapboxLocationPicker({
  location,
  coordinates,
  onChange,
  onCoordinatesChange,
}: {
  location: string;
  coordinates: Coordinates | null;
  onChange: (value: string) => void;
  onCoordinatesChange: (value: Coordinates | null) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<MapboxMarker | null>(null);
  const callbacksRef = useRef({ onChange, onCoordinatesChange });
  const selectCoordinatesRef = useRef<(lng: number, lat: number) => void>(() => {});
  const skipSearchRef = useRef("");
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  callbacksRef.current = { onChange, onCoordinatesChange };

  function placePin(lng: number, lat: number) {
    const map = mapRef.current;
    if (!map) return;

    let marker = markerRef.current;
    if (!marker) {
      marker = new mapboxgl.Marker({ color: "#ed6d38", draggable: true }).setLngLat([lng, lat]);
      marker.on("dragend", () => {
        const position = marker?.getLngLat();
        if (position) selectCoordinatesRef.current(position.lng, position.lat);
      });
      marker.addTo(map);
      markerRef.current = marker;
    }

    marker.setLngLat([lng, lat]);
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14) });
  }

  useEffect(() => {
    if (!accessToken || !mapContainerRef.current) return;

    mapboxgl.accessToken = accessToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: coordinates ? [coordinates.lng, coordinates.lat] : [-0.187, 5.6037],
      zoom: coordinates ? 15 : 11,
      attributionControl: true,
    });
    let reverseController: AbortController | null = null;
    mapRef.current = map;

    const selectCoordinates = (lng: number, lat: number) => {
      placePin(lng, lat);
      callbacksRef.current.onCoordinatesChange({ lat, lng });
      skipSearchRef.current = "Selected map location";
      callbacksRef.current.onChange("Selected map location");
      setSearchError("");
      void reverseGeocode(lng, lat);
    };

    const reverseGeocode = async (lng: number, lat: number) => {
      reverseController?.abort();
      const controller = new AbortController();
      reverseController = controller;
      try {
        const query = `${lng},${lat}`;
        const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json`);
        url.searchParams.set("access_token", accessToken);
        url.searchParams.set("language", "en");
        url.searchParams.set("limit", "1");
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("We couldn’t look up this address. The map pin is still saved.");
        const result = await response.json() as MapboxSearchResponse;
        const place = result.features?.[0]?.place_name;
        if (place) callbacksRef.current.onChange(place.slice(0, 200));
      } catch {
        if (!controller.signal.aborted) {
          setSearchError("We couldn’t look up this address. The map pin is still saved.");
        }
      }
    };

    selectCoordinatesRef.current = selectCoordinates;
    map.on("click", (event) => selectCoordinates(event.lngLat.lng, event.lngLat.lat));
    map.on("error", () => {
      setSearchError("The map couldn’t load. Check the Mapbox token and your internet connection.");
    });
    return () => {
      reverseController?.abort();
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      selectCoordinatesRef.current = () => {};
    };
  }, []);

  useEffect(() => {
    if (!coordinates) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    placePin(coordinates.lng, coordinates.lat);
  }, [coordinates]);

  useEffect(() => {
    if (!accessToken || coordinates || location.trim().length < 3 || location === skipSearchRef.current) {
      if (coordinates) skipSearchRef.current = "";
      if (location === skipSearchRef.current) skipSearchRef.current = "";
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const url = new URL("https://api.mapbox.com/geocoding/v5/mapbox.places/" + encodeURIComponent(location.trim()) + ".json");
        url.searchParams.set("access_token", accessToken);
        url.searchParams.set("autocomplete", "true");
        url.searchParams.set("country", "gh");
        url.searchParams.set("language", "en");
        url.searchParams.set("limit", "5");
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Address search is unavailable. Try another search or place the pin on the map.");
        const result = await response.json() as MapboxSearchResponse;
        setSuggestions(result.features ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setSearchError(error instanceof Error ? error.message : "Address search is unavailable. Try placing the pin on the map.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [coordinates, location]);

  function chooseSuggestion(feature: MapboxFeature) {
    const [lng, lat] = feature.center;
    const label = feature.place_name.slice(0, 200);
    skipSearchRef.current = label;
    onChange(label);
    onCoordinatesChange({ lat, lng });
    setSuggestions([]);
    setSearchError("");
    placePin(lng, lat);
  }

  return (
    <div className="mapbox-picker">
      <label className="emergency-location-input">
        <span>Pickup address or landmark</span>
        <span className="mapbox-search-input">
          <Search size={17} aria-hidden="true" />
          <input
            autoComplete="street-address"
            maxLength={200}
            onChange={(event) => {
              onChange(event.target.value);
              onCoordinatesChange(null);
            }}
            placeholder="Search an address or landmark"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            value={location}
          />
          {searching && <span className="mapbox-search-status">Searching…</span>}
        </span>
      </label>
      {suggestions.length > 0 && (
        <ul className="mapbox-suggestions" role="listbox" aria-label="Address suggestions">
          {suggestions.map((feature) => (
            <li key={feature.id}>
              <button onClick={() => chooseSuggestion(feature)} role="option" type="button">
                <MapPin size={16} aria-hidden="true" />
                <span>{feature.place_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {accessToken ? (
        <div className="mapbox-map-shell">
          <div className="mapbox-map" ref={mapContainerRef} aria-label="Mapbox pickup location map" />
          <span className="location-map__caption">
            {coordinates ? "Drag the pin or tap the map to adjust" : "Search or tap the map to set your pickup point"}
          </span>
        </div>
      ) : (
        <div className="mapbox-map-placeholder" role="status">
          <MapPin size={22} />
          <strong>Interactive map setup needed</strong>
          <span>{configuredToken ? "Use a public Mapbox token that starts with pk. The map won’t use secret tokens." : "Add a public Mapbox token to enable map selection and address search. You can still enter a landmark or use GPS."}</span>
        </div>
      )}
      {searchError && <p className="location-error" role="alert">{searchError}</p>}
    </div>
  );
}
