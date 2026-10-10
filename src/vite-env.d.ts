/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "server" talks only to the API, "local" uses on-device mocks, "auto" prefers the API and falls back offline. */
  readonly VITE_API_MODE?: "server" | "local" | "auto";
  /** Base URL for the API. Defaults to same-origin "/api" (proxied in dev). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
