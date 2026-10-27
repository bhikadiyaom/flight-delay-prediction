import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { validate } from '../middleware/validateRequest.js';
import { loginSchema, registerSchema } from '../validators/authValidator.js';

export default function authRoutes({ limiters }) {
  const r = Router();
  r.post('/register', limiters.auth, validate(registerSchema), c.register);
  r.post('/login', limiters.auth, validate(loginSchema), c.login);
  return r; // no /refresh and no /logout (Decision 2): logout = delete the token client-side
}
