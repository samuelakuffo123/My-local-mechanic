const storagePrefix = "mechnow-api:";

export class ApiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export async function mockRequest<T>(
  operation: () => T,
  options: { latency?: [number, number]; failureRate?: number } = {},
): Promise<T> {
  const [min, max] = options.latency ?? [250, 800];
  await new Promise((resolve) => window.setTimeout(resolve, min + Math.random() * (max - min)));
  if (!navigator.onLine) throw new ApiError("You're offline. Check your connection and try again.", 0);
  if (Math.random() < (options.failureRate ?? .04)) throw new ApiError("We couldn't complete that request. Please try again.");
  return operation();
}

export function readPersisted<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(storagePrefix + key);
  return value ? JSON.parse(value) as T : fallback;
}

export function writePersisted<T>(key: string, value: T) {
  localStorage.setItem(storagePrefix + key, JSON.stringify(value));
  return value;
}
