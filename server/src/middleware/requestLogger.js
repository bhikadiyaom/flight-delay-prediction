import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

/** One structured line per request: id, method, path (no query string, which may hold search terms), status, ms. */
export function requestLogger(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info('request', {
      id, method: req.method, path: req.baseUrl + req.path, status: res.statusCode, ms: Math.round(ms), user: req.user?.id,
    });
  });
  next();
}
