import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Decision 2: single access JWT, 12h, no refresh tokens. Algorithm is pinned so `alg: none` / key confusion is impossible.
export function signToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: String(user._id ?? user.id),
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}
