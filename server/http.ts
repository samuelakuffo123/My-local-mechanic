import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError } from "./errors.ts";
import { config } from "./config.ts";

export interface AuthContext {
  userId: string;
  role: "driver" | "mechanic" | "tow" | "vendor" | "admin";
  name: string;
}

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  auth: AuthContext | null;
  ip: string;
}

export type Handler = (context: RequestContext) => Promise<unknown> | unknown;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
  public: boolean;
}

const routes: Route[] = [];

function register(method: string, pattern: string, handler: Handler, isPublic: boolean) {
  routes.push({ method, segments: pattern.split("/").filter(Boolean), handler, public: isPublic });
}

export const get = (pattern: string, handler: Handler, isPublic = false) => register("GET", pattern, handler, isPublic);
export const post = (pattern: string, handler: Handler, isPublic = false) => register("POST", pattern, handler, isPublic);
export const patch = (pattern: string, handler: Handler, isPublic = false) => register("PATCH", pattern, handler, isPublic);
export const del = (pattern: string, handler: Handler, isPublic = false) => register("DELETE", pattern, handler, isPublic);

function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const parts = path.split("/").filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < route.segments.length; index += 1) {
      const segment = route.segments[index];
      if (segment.startsWith(":")) {
        params[segment.slice(1)] = decodeURIComponent(parts[index]);
      } else if (segment !== parts[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

function applyCors(res: ServerResponse, origin: string | undefined) {
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Idempotency-Key");
  res.setHeader("Access-Control-Max-Age", "600");
}

const MAX_BODY_BYTES = 256 * 1024;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new AppError("Request body too large.", 413, "payload_too_large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return null;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Request body must be valid JSON.", 400, "invalid_json");
  }
}

export interface ServerHooks {
  authenticate: (token: string) => AuthContext | null;
}

export function createRequestHandler(hooks: ServerHooks) {
  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    applyCors(res, origin);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";
    const routeMatch = matchRoute(method, url.pathname);

    res.setHeader("X-Content-Type-Options", "nosniff");

    try {
      const token = extractToken(req);
      const auth = token ? hooks.authenticate(token) : null;
      const body = method === "GET" || method === "DELETE" ? null : await readBody(req);

      if (!routeMatch) {
        throw new AppError("No such endpoint.", 404, "not_found");
      }
      if (!routeMatch.route.public && !auth) {
        throw new AppError("Sign in to continue.", 401, "unauthorized");
      }

      const context: RequestContext = {
        req,
        res,
        method,
        path: url.pathname,
        params: routeMatch.params,
        query: url.searchParams,
        body,
        auth,
        ip: clientIp(req),
      };

      const result = await routeMatch.route.handler(context);
      sendJson(res, result === undefined ? 204 : 200, result);
    } catch (error) {
      if (error instanceof AppError) {
        sendJson(res, error.status, { error: { code: error.code, message: error.message, details: error.details } });
      } else {
        const message = error instanceof Error ? error.message : "Unexpected server error.";
        // Never leak internals in production responses.
        sendJson(res, 500, { error: { code: "internal_error", message: config.env === "production" ? "Unexpected server error." : message } });
        if (config.env !== "test") console.error("[api] unhandled", error);
      }
    }
  };
}

export function extractToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

export function sendJson(res: ServerResponse, status: number, payload: unknown) {
  if (status === 204 || payload === undefined) {
    res.statusCode = 204;
    res.end();
    return;
  }
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}
