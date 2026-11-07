export class ApiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = "ApiError";
  }
}

const STORAGE_PREFIX = "mechnow:local:";

export function mockRequest<T>(operation: () => T | Promise<T>): Promise<T> {
  return Promise.resolve().then(operation);
}

export function readPersisted<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  if (value === null) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ApiError(`Saved local ${key} data is invalid.`, 500);
  }
}

export function writePersisted<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new ApiError(`Local ${key} data could not be saved.`, 500);
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
}
