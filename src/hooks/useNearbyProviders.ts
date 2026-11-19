import { useEffect, useState } from "react";
import { providerService } from "../services/providers";
import type { NearbyProvider } from "../services/apiTypes";

interface NearbyState {
  items: NearbyProvider[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the verified mechanics, tow operators and shops around the customer.
 * The first load happens before geolocation resolves (Accra-wide), then refines
 * once a real origin is available.
 */
export function useNearbyProviders(origin: { lat: number; lng: number } | null) {
  const [state, setState] = useState<NearbyState>({ items: [], loading: true, error: null });
  const lat = origin?.lat;
  const lng = origin?.lng;

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    providerService
      .nearby({ lat, lng, radiusKm: 45 })
      .then((items) => {
        if (active) setState({ items, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (active) {
          setState({ items: [], loading: false, error: cause instanceof Error ? cause.message : "Couldn't load nearby providers." });
        }
      });
    return () => {
      active = false;
    };
  }, [lat, lng]);

  return state;
}
