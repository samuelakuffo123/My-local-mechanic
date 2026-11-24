interface NameSource {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

const PLACEHOLDER_NAMES = new Set([
  "new customer",
  "mechnow customer",
  "mechnow driver",
  "driver",
  "there",
  "user",
]);

/**
 * True when a stored name is not safe to greet someone with. Older Google
 * accounts can have an email-like local part as their name, and phone signups
 * start as "New customer" until the driver edits their profile.
 */
export function isPlaceholderName(value: string | null | undefined): boolean {
  const name = value?.trim();
  if (!name) return true;
  if (name.includes("@")) return true;
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return true;
  // A single token with digits or separators is almost always an email local
  // part (for example "samuelakuffo123"), not a human first name.
  if (!/\s/.test(name) && /[\d._-]/.test(name)) return true;
  return false;
}

/** Returns a human name, or a neutral fallback instead of an email-like value. */
export function displayName(source: NameSource | null | undefined, fallback = "there"): string {
  if (isPlaceholderName(source?.name)) return fallback;
  return String(source?.name).trim();
}

/** First-name-only version used by greetings. */
export function displayFirstName(source: NameSource | null | undefined, fallback = "there"): string {
  return displayName(source, fallback).split(/\s+/)[0] || fallback;
}
