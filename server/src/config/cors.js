import cors from 'cors';
import { env } from './env.js';

/** Exact-origin allowlist from CLIENT_URL (comma separated, no trailing slash). Auth is a Bearer header, not a cookie. */
export function buildCors() {
  return cors({
    origin(origin, cb) {
      // no Origin header = curl / server-to-server / same-origin: allowed; browsers always send one
      if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}
