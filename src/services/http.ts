import { ApiError } from "./mockApi";

// Shared HTTP client for the MechNow backend. The token is kept in localStorage
// under the same prefix the mock layer uses so switching modes does not lose the
// session. Nothing here fabricates success: a failure throws an ApiError whose
// message comes from the server response.

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

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message
      ?? "We couldn't complete that request. Please try again.";
    throw new ApiError(message, response.status);
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
