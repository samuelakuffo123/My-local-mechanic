import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";

export const nowIso = () => new Date().toISOString();

export const newId = () => randomUUID();

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Compare two strings without revealing their contents through response time. */
export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** Human-facing reference like MN-7F3A9C. */
export function publicRef(prefix = "MN") {
  return `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function isExpired(iso: string | null | undefined, reference = new Date()) {
  if (!iso) return false;
  return new Date(iso).getTime() <= reference.getTime();
}

/**
 * Very small in-memory sliding-window rate limiter. Good enough for a single
 * P0 instance; swap for Redis in a horizontally scaled deployment.
 */
interface RateBucket {
  timestamps: number[];
  windowMs: number;
}

const buckets = new Map<string, RateBucket>();
const CLEANUP_INTERVAL_MS = 60_000;
const MAX_BUCKETS = 10_000;
let lastCleanup = Date.now();

function cleanExpiredBuckets(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((value) => now - value < bucket.windowMs);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
  // Bound memory if an attacker rotates through many identifiers.
  if (buckets.size > MAX_BUCKETS) {
    for (const key of buckets.keys()) {
      if (buckets.size <= MAX_BUCKETS) break;
      buckets.delete(key);
    }
  }
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  cleanExpiredBuckets(now);
  const bucket = buckets.get(key) ?? { timestamps: [], windowMs };
  bucket.windowMs = windowMs;
  bucket.timestamps = bucket.timestamps.filter((value) => now - value < windowMs);
  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return true;
}

export function resetRateLimits() {
  buckets.clear();
  lastCleanup = Date.now();
}

/** Accept Ghanaian local, `0…`, `233…` and `+233…` phone formats. */
export function isValidPhone(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const value = input.trim();
  if (!/^\+?[\d\s()-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+")) return /^233\d{9}$/.test(digits);
  if (digits.startsWith("233")) return /^233\d{9}$/.test(digits);
  if (digits.startsWith("0")) return /^0\d{9}$/.test(digits);
  return /^\d{9}$/.test(digits);
}

/** Normalise a Ghanaian phone number to the +233XXXXXXXXX form where possible. */
export function normalisePhone(input: string) {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  if (digits.length === 9) return `+233${digits}`;
  return input.trim();
}
