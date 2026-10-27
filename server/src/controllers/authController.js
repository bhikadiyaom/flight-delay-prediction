import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';

// compared against when the email is unknown, so login time does not reveal whether an account exists
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS);

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const role = env.adminEmails.includes(email) ? 'admin' : 'user';
  const user = await User.create({ name, email, passwordHash, role, lastLoginAt: new Date() });
  res.status(201).json({ token: signToken(user), user: user.toPublic() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new ApiError(401, 'Invalid email or password', { code: 'INVALID_CREDENTIALS' });
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: signToken(user), user: user.toPublic() });
});
