import { Router } from 'express';
import * as c from '../controllers/adminController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validateRequest.js';

export default function adminRoutes() {
  const r = Router();
  r.use(requireAuth, requireAdmin);
  r.get('/metrics', validate({ query: c.adminMetricsQuery }), c.metrics);
  r.post('/metrics/refresh', c.refreshMetrics);
  r.get('/predictions', validate({ query: c.adminPredictionsQuery }), c.predictions);
  r.get('/stats', c.stats);
  return r;
}
