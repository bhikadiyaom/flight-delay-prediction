import express from 'express';
import helmet from 'helmet';
import { buildCors } from './config/cors.js';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createRateLimiters } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import buildRouter from './routes/index.js';

/** @param {{ limits?: object }} [opts] limits: override rate limits (tests) */
export function createApp({ limits } = {}) {
  const app = express();
  if (env.isProd) app.set('trust proxy', 1); // Render sits behind one proxy: needed for correct client IPs in rate limiting
  app.disable('x-powered-by');

  // pure JSON API: no scripts, frames or sub-resources are ever needed from it (XSS hardening, Decision 2 risk note)
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(buildCors());
  app.use(express.json({ limit: '100kb' }));
  if (!env.isTest) app.use(requestLogger);

  const limiters = createRateLimiters(limits);
  app.use('/api/v1', limiters.global, buildRouter({ limiters }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
