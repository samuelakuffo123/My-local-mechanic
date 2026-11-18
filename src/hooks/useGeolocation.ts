import { useCallback, useEffect, useRef, useState } from "react";
import { reverseGeocode } from "../services/geocoding";

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  label?: string | null;
  updatedAt: number;
}

export interface GeolocationState {
  point: GeoPoint | null;
  error: string | null;
  permission: "prompt" | "granted" | "denied" | "unsupported";
  loading: boolean;
}

function toPoint(position: GeolocationPosition, label?: string | null): GeoPoint {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    label: label ?? null,
    updatedAt: Date.now(),
  };
}

async function resolveLabel(lat: number, lng: number, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback.trim();
  const resolved = await reverseGeocode(lat, lng);
  return resolved ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function useGeolocation(options?: { watch?: boolean; immediate?: boolean }) {
  const watch = options?.watch ?? false;
  const immediate = options?.immediate ?? true;
  const watchId = useRef<number | null>(null);
  const [state, setState] = useState<GeolocationState>(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return { point: null, error: "Location services are not available on this device.", permission: "unsupported", loading: false };
    }
    return { point: null, error: null, permission: "prompt", loading: immediate };
  });

  const stop = useCallback(() => {
    if (watchId.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  const request = useCallback((opts?: { label?: string | null }) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ point: null, error: "Location services are not available on this device.", permission: "unsupported", loading: false });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = toPoint(position, opts?.label ?? null);
        const label = await resolveLabel(point.lat, point.lng, opts?.label ?? null);
        setState({ point: { ...point, label }, error: null, permission: "granted", loading: false });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setState({
          point: null,
          loading: false,
          permission: denied ? "denied" : "prompt",
          error:
            denied
              ? "Location access is turned off. You can enable it in your device settings."
              : "We couldn't confirm your location right now. Try again in a moment.",
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  }, []);

  useEffect(() => {
    if (!immediate) return;
    request();
  }, [immediate, request]);

  useEffect(() => {
    if (!watch) {
      stop();
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    let resolving = false;
    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        const base = toPoint(position, null);
        setState((current) => ({
          point: { ...base, label: current.point?.label ?? `${base.lat.toFixed(5)}, ${base.lng.toFixed(5)}` },
          error: null,
          permission: "granted",
          loading: false,
        }));
        if (!resolving) {
          resolving = true;
          const label = await resolveLabel(base.lat, base.lng, null);
          resolving = false;
          setState((current) => (current.point ? { ...current, point: { ...current.point, label, lat: base.lat, lng: base.lng, updatedAt: base.updatedAt } } : current));
        }
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        setState((current) => ({
          ...current,
          loading: false,
          permission: denied ? "denied" : current.permission,
          error: denied
            ? "Location access is turned off. You can enable it in your device settings."
            : current.error,
        }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 4000 },
    );
    return stop;
  }, [stop, watch]);

  const setLabel = useCallback((label: string | null) => {
    setState((current) => (current.point ? { ...current, point: { ...current.point, label } } : current));
  }, []);

  const setPoint = useCallback((point: GeoPoint | null) => {
    setState((current) => ({ ...current, point, error: null, loading: false }));
  }, []);

  return { ...state, request, stop, setLabel, setPoint };
}
