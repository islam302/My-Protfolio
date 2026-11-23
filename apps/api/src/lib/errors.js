// @ts-check

/**
 * Application error carrying an HTTP status and a contract error code.
 * The error handler turns it into `{ error: { code, message, details?, requestId } }`.
 */
export class AppError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code
   * @param {string} message
   * @param {unknown[]} [details]
   */
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const unauthenticated = (message = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const csrfFailed = (message = 'CSRF validation failed') => new AppError(403, 'CSRF_FAILED', message);
