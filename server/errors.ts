export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status = 500, code = "internal_error", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(message, 400, "bad_request", details);
export const unsupportedMediaType = (message = "Requests with a body must use JSON.") =>
  new AppError(message, 415, "unsupported_media_type");
export const originNotAllowed = () =>
  new AppError("This request came from an origin that is not allowed.", 403, "origin_not_allowed");
export const unauthorized = (message = "Sign in to continue.") =>
  new AppError(message, 401, "unauthorized");
export const forbidden = (message = "You don't have permission to do that.") =>
  new AppError(message, 403, "forbidden");
export const notFound = (message = "We couldn't find what you were looking for.") => new AppError(message, 404, "not_found");
export const methodNotAllowed = () => new AppError("That request method isn't supported.", 405, "method_not_allowed");
export const conflict = (message: string, details?: unknown) =>
  new AppError(message, 409, "conflict", details);
export const tooMany = (message = "Too many attempts. Please wait and try again.") =>
  new AppError(message, 429, "rate_limited");
