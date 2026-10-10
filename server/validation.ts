import { badRequest } from "./errors.ts";

export type Body = Record<string, unknown>;

export function asObject(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("Expected a JSON object body.");
  return value as Body;
}

export function requireString(body: Body, key: string, options: { min?: number; max?: number } = {}): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw badRequest(`"${key}" is required.`);
  const trimmed = value.trim();
  if (options.min !== undefined && trimmed.length < options.min) throw badRequest(`"${key}" is too short.`);
  if (options.max !== undefined && trimmed.length > options.max) throw badRequest(`"${key}" is too long.`);
  return trimmed;
}

export function optionalString(body: Body, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw badRequest(`"${key}" must be a string.`);
  return value.trim();
}

export function requireNumber(body: Body, key: string, options: { min?: number; max?: number } = {}): number {
  const value = Number(body[key]);
  if (!Number.isFinite(value)) throw badRequest(`"${key}" must be a number.`);
  if (options.min !== undefined && value < options.min) throw badRequest(`"${key}" must be at least ${options.min}.`);
  if (options.max !== undefined && value > options.max) throw badRequest(`"${key}" must be at most ${options.max}.`);
  return value;
}

export function optionalNumber(body: Body, key: string): number | undefined {
  if (body[key] === undefined || body[key] === null) return undefined;
  const value = Number(body[key]);
  if (!Number.isFinite(value)) throw badRequest(`"${key}" must be a number.`);
  return value;
}

export function optionalBoolean(body: Body, key: string): boolean | undefined {
  if (body[key] === undefined || body[key] === null) return undefined;
  return Boolean(body[key]);
}

export function enumValue<T extends string>(body: Body, key: string, allowed: readonly T[]): T {
  const value = body[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`"${key}" must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function optionalArray<T>(body: Body, key: string): T[] | undefined {
  if (body[key] === undefined || body[key] === null) return undefined;
  if (!Array.isArray(body[key])) throw badRequest(`"${key}" must be an array.`);
  return body[key] as T[];
}
