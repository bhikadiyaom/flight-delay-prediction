import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyToken } from '../utils/jwt.js';

function bearer(req) {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

async function resolveUser(token) {
  const payload = verifyToken(token); // throws JsonWebTokenError / TokenExpiredError -> 401 via errorHandler
  const user = await User.findById(payload.sub).select('name email role preferences').lean();
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  // role is read from the DB, not the token, so a demotion takes effect immediately
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, preferences: user.preferences };
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw ApiError.unauthorized();
  req.user = await resolveUser(token);
  next();
});

/** Public route that gives logged-in users extra benefits (higher rate limit, history). A bad token = anonymous. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = bearer(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
});
