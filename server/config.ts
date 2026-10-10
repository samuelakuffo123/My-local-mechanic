// Central runtime configuration. Every value is environment-driven so that no
// secret, credential or environment assumption is hardcoded in source.
//
// Ghana-first defaults: Africa/Accra timezone, GHS currency, GMT offset.

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 8787),
  host: process.env.API_HOST ?? "127.0.0.1",

  // SQLite file for local/dev. In production point DATABASE_URL at Postgres
  // through the storage adapter (see server/db.ts migration notes).
  databasePath: process.env.DATABASE_PATH ?? ".data/mechnow.sqlite",

  // Comma-separated list of allowed browser origins.
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:8443,http://127.0.0.1:8443")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),

  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 24 * 14),
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),

  // Payment gateway selection. "dev" is a clearly-labelled local adapter that
  // never runs when env === "production".
  paymentsProvider: process.env.PAYMENTS_PROVIDER ?? "dev",
  allowDevPayments: process.env.ALLOW_DEV_PAYMENTS === "true",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET ?? "",

  // SMS provider boundary. "console" logs codes locally; wire a real Ghanaian
  // SMS/WhatsApp provider before production.
  smsProvider: process.env.SMS_PROVIDER ?? "console",
  smsSenderId: process.env.SMS_SENDER_ID ?? "MechNow",

  seedDemoData: process.env.SEED_DEMO_DATA === "true",
  timezone: "Africa/Accra",
  currency: "GHS",
} as const;

export const isProduction = config.env === "production";
export const devPaymentsEnabled = !isProduction && config.paymentsProvider === "dev" && config.allowDevPayments;
