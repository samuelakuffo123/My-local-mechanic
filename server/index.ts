import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { config } from "./config.ts";
import { openDatabase, closeDatabase } from "./db.ts";
import { createRequestHandler } from "./http.ts";
import { authenticateToken } from "./auth.ts";
import { registerRoutes } from "./routes.ts";
import { bootstrapAdmin, seedDemoData } from "./seed.ts";

function main() {
  openDatabase(config.databasePath);
  registerRoutes();
  bootstrapAdmin();
  if (config.seedDemoData) seedDemoData();

  const handler = createRequestHandler({ authenticate: authenticateToken });
  // Belt and braces: the handler handles its own errors, but a rejection here
  // must never take the process down.
  const server = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error) => {
      const existingId = res.getHeader("X-Request-Id");
      const requestId = typeof existingId === "string" ? existingId : randomUUID();
      if (!existingId) res.setHeader("X-Request-Id", requestId);
      console.error(`[api] request failed requestId=${requestId}`, error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          error: {
            code: "internal_error",
            message: config.env === "production" ? "We couldn't complete that request. Please try again." : "Unexpected server error.",
            requestId,
          },
        }));
      } else {
        res.end();
      }
    });
  });

  server.listen(config.port, config.host, () => {
    console.log(`[api] MechNow backend listening on http://${config.host}:${config.port} (env=${config.env})`);
    console.log(`[api] CORS origins: ${config.corsOrigins.join(", ")}`);
  });

  const shutdown = () => {
    console.log("[api] shutting down");
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

try {
  main();
} catch (error) {
  console.error("[api] failed to start", error);
  process.exit(1);
}
