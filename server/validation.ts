import { badRequest } from "./errors.ts";
import { isValidPhone, normalisePhone } from "./util.ts";

export type Body = Record<string, unknown>;

const MAX_AVATAR_BYTES = 160 * 1024;
const AVATAR_SIGNATURES: Record<string, string> = {
  jpeg: "/9j/",
  png: "iVBORw0KGgo",
  webp: "UklGR",
};

const FIELD_LABELS: Record<string, string> = {
  phone: "Phone number",
  customerPhone: "Customer phone number",
  code: "Verification code",
  password: "Password",
  currentPassword: "Current password",
  name: "Name",
  businessName: "Business name",
  reason: "Reason",
  description: "Description",
  documentType: "Document type",
  documentRef: "Document reference",
  expiresAt: "Expiry date",
  plate: "Vehicle plate",
  make: "Vehicle make",
  model: "Vehicle model",
  year: "Vehicle year",
  idempotencyKey: "Payment key",
  amountGhs: "Amount",
  lat: "Latitude",
  lng: "Longitude",
};

function label(key: string) {
  return FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (value) => value.toUpperCase());
}

function fieldError(message: string, key: string) {
  return badRequest(message, { field: key });
}

function unit(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function asObject(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("The request body must be a JSON object.", { field: "body" });
  }
  return value as Body;
}

export function requireString(body: Body, key: string, options: { min?: number; max?: number } = {}): string {
  const value = body[key];
  if (value === undefined || value === null || value === "") throw fieldError(`${label(key)} is required.`, key);
  if (typeof value !== "string") throw fieldError(`${label(key)} must be text.`, key);
  const trimmed = value.trim();
  if (!trimmed) throw fieldError(`${label(key)} is required.`, key);
  if (options.min !== undefined && trimmed.length < options.min) {
    throw fieldError(`${label(key)} must be at least ${unit(options.min, "character")}.`, key);
  }
  if (options.max !== undefined && trimmed.length > options.max) {
    throw fieldError(`${label(key)} must be ${unit(options.max, "character")} or fewer.`, key);
  }
  return trimmed;
}

export function optionalString(body: Body, key: string, options: { max?: number } = {}): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw fieldError(`${label(key)} must be text.`, key);
  const trimmed = value.trim();
  if (options.max !== undefined && trimmed.length > options.max) {
    throw fieldError(`${label(key)} must be ${unit(options.max, "character")} or fewer.`, key);
  }
  return trimmed;
}

export function requireNumber(body: Body, key: string, options: { min?: number; max?: number } = {}): number {
  const value = body[key];
  if (value === undefined || value === null || value === "") throw fieldError(`${label(key)} is required.`, key);
  if (typeof value !== "number" && typeof value !== "string") throw fieldError(`${label(key)} must be a number.`, key);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw fieldError(`${label(key)} must be a number.`, key);
  if (options.min !== undefined && parsed < options.min) {
    throw fieldError(`${label(key)} must be at least ${options.min}.`, key);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw fieldError(`${label(key)} must be at most ${options.max}.`, key);
  }
  return parsed;
}

export function optionalNumber(body: Body, key: string): number | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" && typeof value !== "string") throw fieldError(`${label(key)} must be a number.`, key);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw fieldError(`${label(key)} must be a number.`, key);
  return parsed;
}

export function optionalBoolean(body: Body, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw fieldError(`${label(key)} must be true or false.`, key);
}

/**
 * Accepts a compact image data URL produced by the client's canvas resizer.
 * Keeping this as a data URL avoids introducing an unauthenticated file-serving
 * route while still letting the avatar survive reloads and new devices.
 */
export function optionalAvatarDataUrl(body: Body, key = "avatarUrl"): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw fieldError("Choose a JPG, PNG, or WebP image.", key);
  if (value.length > 230_000) throw fieldError("That photo is too large. Choose a smaller image.", key);

  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw fieldError("Choose a JPG, PNG, or WebP image.", key);
  const [, format, encoded] = match;
  if (!encoded.startsWith(AVATAR_SIGNATURES[format])) {
    throw fieldError("That image file doesn't match its type. Choose another photo.", key);
  }
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decodedBytes = Math.floor((encoded.length * 3) / 4) - padding;
  if (!decodedBytes || decodedBytes > MAX_AVATAR_BYTES) {
    throw fieldError("Choose a photo smaller than 160 KB.", key);
  }
  return value;
}

export function enumValue<T extends string>(body: Body, key: string, allowed: readonly T[]): T {
  const value = body[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw fieldError(`${label(key)} must be one of: ${allowed.join(", ")}.`, key);
  }
  return value as T;
}

export function optionalEnumValue<T extends string>(body: Body, key: string, allowed: readonly T[]): T | undefined {
  if (body[key] === undefined || body[key] === null) return undefined;
  return enumValue(body, key, allowed);
}

export function optionalArray<T>(body: Body, key: string): T[] | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw fieldError(`${label(key)} must be a list.`, key);
  return value as T[];
}

/** Validate and normalise a Ghanaian phone number before it reaches the auth layer. */
export function requirePhone(body: Body, key = "phone"): string {
  const value = requireString(body, key, { max: 32 });
  if (!isValidPhone(value)) {
    throw fieldError("Enter a valid Ghanaian phone number, like 024 123 4567.", key);
  }
  return normalisePhone(value);
}

export function optionalPhone(body: Body, key = "phone"): string | undefined {
  const value = optionalString(body, key, { max: 32 });
  if (value === undefined) return undefined;
  if (!isValidPhone(value)) {
    throw fieldError("Enter a valid Ghanaian phone number, like 024 123 4567.", key);
  }
  return normalisePhone(value);
}

export function requireOtpCode(body: Body, key = "code"): string {
  const value = requireString(body, key);
  if (!/^\d{6}$/.test(value)) throw fieldError("Enter the 6-digit code from your message.", key);
  return value;
}
