import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  res.json({ user: user.toPublic() });
});

export const updateMe = asyncHandler(async (req, res) => {
  const { name, preferences } = req.body;
  const set = {};
  if (name !== undefined) set.name = name;
  if (preferences?.theme !== undefined) set['preferences.theme'] = preferences.theme;
  if (preferences?.alertsEnabled !== undefined) set['preferences.alertsEnabled'] = preferences.alertsEnabled;
  const user = await User.findByIdAndUpdate(req.user.id, { $set: set }, { new: true, runValidators: true });
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  res.json({ user: user.toPublic() });
});
