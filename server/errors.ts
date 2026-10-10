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
export const unauthorized = (message = "Sign in to continue.") =>
  new AppError(message, 401, "unauthorized");
export const forbidden = (message = "You don't have permission to do that.") =>
  new AppError(message, 403, "forbidden");
export const notFound = (message = "Not found.") => new AppError(message, 404, "not_found");
export const conflict = (message: string, details?: unknown) =>
  new AppError(message, 409, "conflict", details);
export const tooMany = (message = "Too many attempts. Please wait and try again.") =>
  new AppError(message, 429, "rate_limited");
