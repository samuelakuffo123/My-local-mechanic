// Central runtime configuration. Every value is environment-driven so that no
// secret, credential or environment assumption is hardcoded in source.
//
// Ghana-first defaults: Africa/Accra timezone, GHS currency, GMT offset.

// Node 22+ can read a local .env file directly. Explicit process environment
// values still win, which keeps deployed secrets injectable by the platform.
try {
  process.loadEnvFile(".env");
} catch {
  // A .env file is optional; deployments normally inject variables directly.
}

// Comma-separated allowlist, plus the platform's own public URL when it exposes
// one. A single-service deploy calls its own origin, and browsers send Origin on
// POST/PATCH/DELETE, so the deployed origin must be allowed automatically.
const configuredOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:8443,http://127.0.0.1:8443")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const platformOrigin =
  process.env.PUBLIC_ORIGIN?.trim() ||
  process.env.RENDER_EXTERNAL_URL?.trim() ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}` : "");
const corsOrigins = [...new Set([...configuredOrigins, platformOrigin].filter(Boolean))];

export const config = {
  env: process.env.NODE_ENV ?? "development",
  // Render/Railway inject PORT; API_PORT stays supported for local runs.
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 8787),
  host: process.env.API_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),

  // Postgres (Neon) is used whenever DATABASE_URL is set. The pooled URL serves
  // application traffic; the direct/unpooled URL runs migrations, because
  // PgBouncer's transaction mode does not preserve session state.
  databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
  databaseUrlUnpooled: process.env.DATABASE_URL_UNPOOLED?.trim() ?? "",

  // SQLite file used for local development and the API tests.
  databasePath: process.env.DATABASE_PATH ?? ".data/mechnow.sqlite",

  // Comma-separated list of allowed browser origins.
  corsOrigins,

  // Only trust X-Forwarded-For when a reverse proxy you control sets it.
  trustProxy: process.env.TRUST_PROXY === "true",

  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 24 * 14),
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),

  // Payment gateway selection. "dev" is a clearly-labelled local adapter that
  // never runs when env === "production".
  paymentsProvider: process.env.PAYMENTS_PROVIDER ?? "dev",
  allowDevPayments: process.env.ALLOW_DEV_PAYMENTS === "true",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET ?? "",

  // SMS provider boundary. "console" logs codes locally; "arkesel" sends real
  // SMS through Ghana's Arkesel gateway.
  smsProvider: process.env.SMS_PROVIDER ?? "console",
  smsSenderId: process.env.SMS_SENDER_ID ?? "MechNow",
  arkeselApiKey: process.env.ARKESEL_API_KEY ?? "",

  // Google Identity Services token model. The web client ID is public by
  // design; no client secret is required because access tokens are verified
  // against Google's tokeninfo endpoint on the server.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleTokenInfoUrl: process.env.GOOGLE_TOKENINFO_URL ?? "https://oauth2.googleapis.com/tokeninfo",

  seedDemoData: process.env.SEED_DEMO_DATA === "true",
  timezone: "Africa/Accra",
  currency: "GHS",
} as const;

export const isProduction = config.env === "production";
export const devPaymentsEnabled = !isProduction && config.paymentsProvider === "dev" && config.allowDevPayments;
