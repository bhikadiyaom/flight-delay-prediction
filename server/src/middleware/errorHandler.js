import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export const notFound = (req, _res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.path}`, { code: 'NOT_FOUND' }));

const body = (status, code, message, details) => ({ status, payload: { error: { code, message, ...(details ? { details } : {}) } } });

function normalise(err) {
  if (err instanceof ApiError) return body(err.status, err.code ?? 'ERROR', err.message, err.details);
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? body(413, 'FILE_TOO_LARGE', 'File is too large (max 512 KB)')
      : body(400, 'UPLOAD_ERROR', `Upload failed: ${err.message}`);
  }
  if (err.type === 'entity.parse.failed') return body(400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (err.type === 'entity.too.large') return body(413, 'BODY_TOO_LARGE', 'Request body is too large');
  if (err.name === 'TokenExpiredError') return body(401, 'TOKEN_EXPIRED', 'Session expired, please log in again');
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') return body(401, 'INVALID_TOKEN', 'Invalid token');
  if (err.name === 'ValidationError' && err.errors) {
    return body(400, 'VALIDATION_ERROR', 'Validation failed', Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })));
  }
  if (err.name === 'CastError') return body(400, 'INVALID_ID', 'Invalid identifier');
  if (err.code === 11000) return body(409, 'DUPLICATE', 'Resource already exists');
  return null;
}

export function errorHandler(err, req, res, _next) {
  const known = normalise(err);
  if (known) {
    if (known.status >= 500) logger.error('request failed', { path: req.path, err: err.message });
    return res.status(known.status).json(known.payload);
  }
  logger.error('unhandled error', { path: req.path, err: err.message, stack: err.stack });
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }); // never leak internals
}
