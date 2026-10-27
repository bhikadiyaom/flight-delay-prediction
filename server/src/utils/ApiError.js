export class ApiError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} message safe, user-facing message
   * @param {object} [opts] { code, details }
   */
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(msg, details) { return new ApiError(400, msg, { code: 'BAD_REQUEST', details }); }
  static unauthorized(msg = 'Authentication required') { return new ApiError(401, msg, { code: 'UNAUTHORIZED' }); }
  static forbidden(msg = 'Forbidden') { return new ApiError(403, msg, { code: 'FORBIDDEN' }); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg, { code: 'NOT_FOUND' }); }
  static conflict(msg) { return new ApiError(409, msg, { code: 'CONFLICT' }); }
  static unavailable(msg, code = 'UNAVAILABLE') { return new ApiError(503, msg, { code }); }
}
