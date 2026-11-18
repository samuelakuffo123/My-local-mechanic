import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
// The API enforces an Origin allowlist. Tunneled preview requests arrive with a
// changing public origin, so the local proxy forwards a stable, allowed one.
const proxyOrigin = (process.env.CORS_ORIGINS ?? "http://localhost:8443").split(",")[0].trim() || "http://localhost:8443";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "src"),
    },
  },
  server: {
    host: process.env.DEV_SERVER_HOST || "0.0.0.0",
    port: Number(process.env.PORT || 8443),
    strictPort: true,
    proxy: {
      "/api": {
        // The client speaks to the TypeScript API (server/index.ts), which
        // listens on 8787 by default.
        target: process.env.API_PROXY_TARGET || `http://127.0.0.1:${process.env.API_PORT || 8787}`,
        changeOrigin: true,
        headers: { origin: proxyOrigin },
      },
    },
  },
  preview: {
    host: process.env.DEV_SERVER_HOST || "0.0.0.0",
    port: Number(process.env.PORT || 8443),
    // Quick tunnels and other proxies forward their own Host header, so the
    // production preview must accept them or Vite answers "Blocked request".
    allowedHosts: [".trycloudflare.com", "localhost"],
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || `http://127.0.0.1:${process.env.API_PORT || 8787}`,
        changeOrigin: true,
        headers: { origin: proxyOrigin },
      },
    },
  },
});
