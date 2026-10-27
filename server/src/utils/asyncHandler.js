/** Wraps an async route handler so rejections reach the Express error middleware (Express 4 does not do this). */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
