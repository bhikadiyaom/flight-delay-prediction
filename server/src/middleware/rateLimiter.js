import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;

const handler = (req, res, _next, options) => {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.', retryAfterSeconds: Math.ceil(options.windowMs / 1000) },
  });
};

const base = { windowMs: WINDOW_MS, standardHeaders: true, legacyHeaders: false, handler };

/**
 * Built per app instance so tests can pass tiny limits.
 * - global: every request, per user id or IP
 * - predictions: logged-in users get a higher limit than anonymous clients
 * - auth: login/register brute-force protection, per IP
 */
export function createRateLimiters(overrides = {}) {
  const o = {
    global: env.RATE_LIMIT_GLOBAL, anon: env.RATE_LIMIT_ANON, user: env.RATE_LIMIT_USER, auth: env.RATE_LIMIT_AUTH, ...overrides,
  };
  return {
    global: rateLimit({ ...base, limit: o.global, keyGenerator: (req) => req.user?.id ?? req.ip }),
    predictions: rateLimit({
      ...base,
      limit: (req) => (req.user ? o.user : o.anon),
      keyGenerator: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
    }),
    auth: rateLimit({ ...base, limit: o.auth, skipSuccessfulRequests: false, keyGenerator: (req) => req.ip }),
  };
}
