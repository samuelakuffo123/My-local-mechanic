import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../services/errorMessage";

export interface AsyncState<T> {
  data: T;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

export interface Remote<T> extends AsyncState<T> {
  reload: () => void;
}

interface UseRemoteOptions {
  enabled?: boolean;
  fallback?: string;
}

const DEFAULT_FALLBACK = "We couldn't load this right now. Check your connection and try again.";

/** Keeps stale data visible on refresh while reserving layout on first load. */
export function useRemote<T>(
  load: () => Promise<T>,
  initial: T,
  deps: unknown[],
  { enabled = true, fallback = DEFAULT_FALLBACK }: UseRemoteOptions = {},
): Remote<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: initial, loading: enabled, refreshing: false, error: null });
  const [nonce, setNonce] = useState(0);
  const run = useCallback(load, deps);
  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const loaded = useRef(false);
  const runRef = useRef(run);

  useEffect(() => {
    if (runRef.current !== run) {
      runRef.current = run;
      loaded.current = false;
    }
    if (!enabled) {
      loaded.current = false;
      setState({ data: initial, loading: false, refreshing: false, error: null });
      return;
    }
    const refreshing = loaded.current;
    let active = true;
    setState((current) => ({ ...current, loading: !refreshing, refreshing, error: null }));
    run()
      .then((data) => {
        if (active) {
          loaded.current = true;
          setState({ data, loading: false, refreshing: false, error: null });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            refreshing: false,
            error: errorMessage(cause, fallback),
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [enabled, fallback, run, nonce]);

  return { ...state, reload };
}
