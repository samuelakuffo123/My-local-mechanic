import { ApiError } from "./mockApi";

// Shared HTTP client for the MechNow backend. The token is kept in localStorage
// under the same prefix the mock layer uses so switching modes does not lose the
// session. Nothing here fabricates success: a failure throws an ApiError whose
// message comes from the server, with a friendly fallback when it does not.

const TOKEN_KEY = "mechnow-api:token";
const BASE_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode): session stays in memory only.
  }
}

export function clearToken() {
  setToken(null);
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  requestId?: unknown;
}

function cleanServerMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (!message || message.length > 300 || /<[a-z][\s\S]*>/i.test(message)) return null;
  return message;
}

function fallbackMessage(status: number, path: string, serverMessage: string | null) {
  if (status === 400) return serverMessage ?? "Check the details and try again.";
  if (status === 401) {
    return path.includes("/auth/login")
      ? "Those sign-in details don't match our records. Check them and try again."
      : "Your session has expired. Sign in again to continue.";
  }
  if (status === 403) return serverMessage ?? "You don't have permission to do that.";
  if (status === 404) return serverMessage ?? "We couldn't find that. Refresh and try again.";
  if (status === 405) return "That action isn't supported. Refresh the page and try again.";
  if (status === 409) return serverMessage ?? "That change conflicts with the current state. Refresh and try again.";
  if (status === 413) return "That request is too large. Try again with less information.";
  if (status === 415) return "This app sent an unsupported request format. Please try again.";
  if (status === 429) return "Too many attempts. Wait a moment, then try again.";
  if (status >= 500) return "We're having trouble right now. Please try again in a moment.";
  return serverMessage ?? "We couldn't complete that request. Please try again.";
}

function readErrorPayload(payload: unknown): ErrorPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  return error && typeof error === "object" ? (error as ErrorPayload) : null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, headers = {}, signal } = options;
  const requestHeaders: Record<string, string> = { ...headers };
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError("You're offline. Check your connection and try again.", 0);
  }

  if (response.status === 204) return undefined as T;

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiError(fallbackMessage(response.status, path, null), response.status);
  }
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const errorPayload = readErrorPayload(payload);
    const serverMessage = cleanServerMessage(errorPayload?.message);
    const code = typeof errorPayload?.code === "string" ? errorPayload.code : undefined;
    const requestId = typeof errorPayload?.requestId === "string" ? errorPayload.requestId : undefined;
    if (response.status >= 500 && requestId) console.error(`[api] ${response.status} ${path} reference=${requestId}`);
    throw new ApiError(fallbackMessage(response.status, path, serverMessage), response.status, code, requestId, errorPayload?.details);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Health probe used by "auto" mode to decide whether the backend is reachable. */
export async function pingServer(): Promise<boolean> {
  try {
    await apiRequest("/health", { auth: false, signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}
