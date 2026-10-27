import { Router } from 'express';
import * as c from '../controllers/predictionController.js';
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateRequest.js';
import { uploadCsv } from '../middleware/uploadMiddleware.js';
import { historyQuerySchema, livePredictionSchema, manualPredictionSchema } from '../validators/predictionValidator.js';

export default function predictionRoutes({ limiters }) {
  const r = Router();
  // public* = anonymous allowed but rate limited; a valid token raises the limit (optionalAuth runs first)
  r.post('/', optionalAuth, limiters.predictions, validate(manualPredictionSchema), c.createManual);
  r.post('/live', optionalAuth, limiters.predictions, validate(livePredictionSchema), c.createLive);
  r.post('/bulk', requireAuth, limiters.predictions, uploadCsv, c.createBulk);
  r.get('/history', requireAuth, validate(historyQuerySchema), c.history);
  return r;
}
