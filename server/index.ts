import { createServer } from "node:http";
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
  const server = createServer(handler);

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
