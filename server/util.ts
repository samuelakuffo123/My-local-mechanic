import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";

export const nowIso = () => new Date().toISOString();

export const newId = () => randomUUID();

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((value) => now - value < windowMs);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}

/** Normalise a Ghanaian phone number to the +233XXXXXXXXX form where possible. */
export function normalisePhone(input: string) {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  if (digits.length === 9) return `+233${digits}`;
  return input.trim();
}
