import { ApiError } from "./mockApi";

/**
 * Turns a thrown value into copy that is safe to show in the UI.
 *
 * The API client already curates most status codes, but some server errors and
 * browser errors still carry technical text. Callers pass the action-specific
 * fallback so the message always tells the user what failed and what to do.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === "AbortError") return fallback;

  if (error instanceof ApiError) {
    if (error.status === 0) return "You're offline. Check your connection and try again.";
    if (error.status === 401) {
      return /sign-in details|sign in again|session has expired/i.test(error.message) ? error.message : "Your session has expired. Sign in again to continue.";
    }
    if (error.status === 403) return fallback;
    if (error.status === 404) return fallback;
    // Conflict messages explain exactly why a request cannot proceed (for
    // example, a stale job stage), so keep them when they are presentable.
    if (error.status === 409) return presentable(error.message) ? error.message : fallback;
    if (error.status === 413) return "That request is too large. Try again with less information.";
    if (error.status === 415) return "This app sent an unsupported request format. Please try again.";
    if (error.status === 429) return "Too many attempts. Wait a moment, then try again.";
    // 502/503 errors carry deliberately safe, user-facing copy from the API
    // (for example an SMS provider outage). Keep it so the message is useful.
    if (error.status === 502 || error.status === 503) {
      const message = presentable(error.message) ? error.message : fallback;
      const reference = error.requestId ? ` Reference: ${error.requestId.slice(0, 8)}.` : "";
      return `${message}${reference}`;
    }
    if (error.status >= 500) {
      const reference = error.requestId ? ` Reference: ${error.requestId.slice(0, 8)}.` : "";
      return `${fallback}${reference}`;
    }
    return presentable(error.message) ? error.message : fallback;
  }

  return error instanceof Error && presentable(error.message) ? error.message : fallback;
}

function presentable(message: string): boolean {
  const value = message.trim();
  if (!value || value.length > 200) return false;
  return !/\b(undefined|null|NaN|Error:|at [\w./-]+|failed to fetch|illegal transition|may not move)\b/i.test(value);
}
