import { useEffect, useState } from "react";
import { providerService } from "../services/providers";
import type { NearbyProvider } from "../services/apiTypes";
import { errorMessage } from "../services/errorMessage";

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
          setState({ items: [], loading: false, error: errorMessage(cause, "We couldn't load nearby providers. Check your connection and try again.") });
        }
      });
    return () => {
      active = false;
    };
  }, [lat, lng]);

  return state;
}
