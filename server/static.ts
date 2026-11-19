import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// Serves the production client bundle from the same origin as the API. Keeping
// both on one origin means the service worker, manifest and /api calls all use
// relative paths, and there is no CORS or VITE_API_URL to get wrong.

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

function fileStats(path: string) {
  try {
    const stats = statSync(path);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => boolean;

/**
 * Returns a handler that answers static requests, or null when the client has
 * not been built. API paths are left untouched so the API keeps returning
 * JSON 404s instead of the SPA shell.
 */
export function createStaticHandler(distDirectory: string): StaticHandler | null {
  const root = resolve(distDirectory);
  const indexFile = join(root, "index.html");
  if (!fileStats(indexFile)) return null;

  return (req, res) => {
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") return false;

    const url = req.url ?? "/";
    if (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")) return false;

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Bad request");
      return true;
    }

    const target = resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Bad request");
      return true;
    }

    const direct = fileStats(target);
    // Client-side routes (for example /app/track/:id) have no file extension
    // and fall back to the SPA shell so deep links work on first load.
    const fallback = direct ? null : extname(pathname) ? null : fileStats(indexFile);
    const stats = direct ?? fallback;
    if (!stats) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end("Not found");
      return true;
    }

    const filePath = direct ? target : indexFile;
    const extension = extname(filePath).toLowerCase();
    const isShell = filePath === indexFile;
    const isHashedAsset = pathname.startsWith("/assets/");
    const isWorker = pathname === "/sw.js";

    res.setHeader("Content-Type", MIME_TYPES[extension] ?? "application/octet-stream");
    res.setHeader("Content-Length", String(stats.size));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    res.setHeader(
      "Cache-Control",
      isShell || isWorker || pathname === "/manifest.webmanifest"
        ? "no-cache"
        : isHashedAsset
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
    );

    if (method === "HEAD") {
      res.end();
      return true;
    }

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    stream.pipe(res);
    return true;
  };
}
