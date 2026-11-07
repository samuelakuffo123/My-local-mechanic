import { ApiError } from "./mockApi";

// Service bridges let every screen talk to the real backend while keeping an
// offline/dev fallback. Mode is controlled by VITE_API_MODE:
//   "server" - always the API, surface failures
//   "local"  - always the on-device mock implementation
//   "auto"   - prefer the API, fall back to the mock when the API is unreachable

export type ApiMode = "server" | "local" | "auto";

export function apiMode(): ApiMode {
  const value = import.meta.env.VITE_API_MODE;
  return value === "server" || value === "local" || value === "auto" ? value : "auto";
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504);
}

/**
 * Wraps a server implementation so that, in "auto" mode, a network failure
 * transparently falls back to the local implementation. Any other error
 * (validation, authorization, conflicts) is surfaced to the caller unchanged.
 */
export function bridge<T extends object>(server: T, local: T): T {
  const mode = apiMode();
  const output = {} as T;
  for (const key of Object.keys(server) as (keyof T)[]) {
    const serverFn = server[key] as unknown as (...args: unknown[]) => unknown;
    const localFn = local[key] as unknown as (...args: unknown[]) => unknown;
    output[key] = (async (...args: unknown[]) => {
      if (mode === "local") return localFn(...args);
      try {
        return await serverFn(...args);
      } catch (error) {
        if (mode === "auto" && isNetworkFailure(error)) return localFn(...args);
        throw error;
      }
    }) as T[keyof T];
  }
  return output;
}
