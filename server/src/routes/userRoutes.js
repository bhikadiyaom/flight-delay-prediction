import { Router } from 'express';
import * as c from '../controllers/userController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateRequest.js';
import { updateMeSchema } from '../validators/authValidator.js';

export default function userRoutes() {
  const r = Router();
  r.use(requireAuth);
  r.get('/me', c.getMe);
  r.patch('/me', validate(updateMeSchema), c.updateMe);
  return r;
}
