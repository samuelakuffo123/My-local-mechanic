import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

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
        target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: process.env.DEV_SERVER_HOST || "0.0.0.0",
    port: Number(process.env.PORT || 8443),
  },
});
