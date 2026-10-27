import { Router } from 'express';
import * as c from '../controllers/analyticsController.js';
import { validate } from '../middleware/validateRequest.js';
import { riskMapQuerySchema, trendsQuerySchema } from '../validators/predictionValidator.js';

export default function analyticsRoutes() {
  const r = Router();
  r.get('/overview', c.overview);
  r.get('/trends', validate(trendsQuerySchema), c.trends);
  r.get('/risk-map', validate(riskMapQuerySchema), c.riskMap);
  r.get('/models/compare', c.modelsCompare);
  return r;
}
