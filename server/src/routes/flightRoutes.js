import { Router } from 'express';
import * as c from '../controllers/flightController.js';
import { validate } from '../middleware/validateRequest.js';
import { airportsQuerySchema, historicalQuerySchema, liveFlightQuerySchema, routeQuerySchema } from '../validators/predictionValidator.js';

export default function flightRoutes() {
  const r = Router();
  r.get('/live', validate(liveFlightQuerySchema), c.getLive);
  r.get('/live/route', validate(routeQuerySchema), c.getRoute);
  r.get('/historical', validate(historicalQuerySchema), c.getHistorical);
  r.get('/airports', validate(airportsQuerySchema), c.getAirports);
  return r;
}
