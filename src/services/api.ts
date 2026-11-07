import { useAppStore } from "../state/store"

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown }

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message)

    this.name = "ApiError"
  }
}

function getErrorMessage(path: string, status: number, serverMessage: unknown) {
  if (status === 401) {
    return path === "/auth/login"
      ? "Those sign-in details don't match our records. Check them and try again."
      : "Your session has expired. Sign in again to continue."
  }

  if (status === 403) return "You don't have permission to do that."

  if (status === 404) {
    return typeof serverMessage === "string" && serverMessage !== "Not found."
      ? serverMessage
      : "We couldn't find that. Refresh the page and try again."
  }

  if (status === 429)
    return "You're trying too quickly. Wait a moment, then try again."

  if (status >= 500)
    return "We're having trouble right now. Please try again in a moment."

  if (typeof serverMessage === "string" && serverMessage.trim())
    return serverMessage

  return "We couldn't complete that. Please try again."
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body !== undefined)
    headers.set("Content-Type", "application/json")

  let response: Response

  try {
    response = await fetch(`/api${path}`, {
      ...options,

      headers,

      credentials: "same-origin",

      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(
      "We couldn't connect. Check your internet connection and try again.",
      503,
    )
  }

  let payload: { error?: unknown } | null

  try {
    payload = ((await response.json()) as { error?: unknown } | null)
  } catch {
    throw new ApiError("We couldn't read the response. Please try again.", 502)
  }

  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      useAppStore.getState().signOut()
    }

    const message = getErrorMessage(path, response.status, payload?.error)

    throw new ApiError(message, response.status)
  }

  return payload as T
}
