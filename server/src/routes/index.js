import { Router } from 'express';
import { dbReady } from '../config/db.js';
import { mlClient } from '../services/mlClientService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import adminRoutes from './adminRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import authRoutes from './authRoutes.js';
import flightRoutes from './flightRoutes.js';
import predictionRoutes from './predictionRoutes.js';
import savedSearchRoutes from './savedSearchRoutes.js';
import userRoutes from './userRoutes.js';

export default function buildRouter(deps) {
  const r = Router();

  // 503 only when the DB is down; an unreachable ml-service is "degraded" (the site still serves cached/historical data)
  r.get('/health', asyncHandler(async (_req, res) => {
    const db = dbReady();
    let ml = { reachable: false };
    try {
      const h = await mlClient.health();
      ml = { reachable: true, modelVersion: h.model_version, analyticsAvailable: h.analytics_available };
    } catch { /* reported below */ }
    const status = !db ? 'down' : ml.reachable ? 'ok' : 'degraded';
    res.status(db ? 200 : 503).json({ status, uptimeSeconds: Math.round(process.uptime()), db: { connected: db }, ml });
  }));

  r.use('/auth', authRoutes(deps));
  r.use('/users', userRoutes(deps));
  r.use('/flights', flightRoutes(deps));
  r.use('/predictions', predictionRoutes(deps));
  r.use('/analytics', analyticsRoutes(deps));
  r.use('/saved-searches', savedSearchRoutes(deps));
  r.use('/admin', adminRoutes(deps));
  return r;
}
