import { SavedSearch } from '../models/SavedSearch.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dto } from '../utils/dto.js';

export const MAX_SAVED_SEARCHES = 50;
const out = (d) => dto(d, { drop: ['user'] });

export const list = asyncHandler(async (req, res) => {
  const filter = { user: req.user.id };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.favorite !== undefined) filter.isFavorite = req.query.favorite;
  const items = await SavedSearch.find(filter).sort({ isFavorite: -1, createdAt: -1 }).lean();
  res.json({ items: items.map(out) });
});

export const create = asyncHandler(async (req, res) => {
  if ((await SavedSearch.countDocuments({ user: req.user.id })) >= MAX_SAVED_SEARCHES) {
    throw ApiError.badRequest(`You can save at most ${MAX_SAVED_SEARCHES} searches`);
  }
  const { alert, ...rest } = req.body;
  const doc = await SavedSearch.create({ ...rest, user: req.user.id, alert: { enabled: alert?.enabled ?? false, threshold: alert?.threshold ?? 0.5 } });
  res.status(201).json({ item: out(doc.toObject()) });
});

export const patch = asyncHandler(async (req, res) => {
  const { label, isFavorite, alert } = req.body;
  const set = {};
  if (label !== undefined) set.label = label;
  if (isFavorite !== undefined) set.isFavorite = isFavorite;
  if (alert?.enabled !== undefined) set['alert.enabled'] = alert.enabled;
  if (alert?.threshold !== undefined) set['alert.threshold'] = alert.threshold;
  if (alert) set['alert.lastRiskLevel'] = null; // a changed alert setting is evaluated from scratch
  // ownership is part of the query: other users' ids behave exactly like missing ones (404, no existence leak)
  const doc = await SavedSearch.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { $set: set }, { new: true, runValidators: true }).lean();
  if (!doc) throw ApiError.notFound('Saved search not found');
  res.json({ item: out(doc) });
});

export const remove = asyncHandler(async (req, res) => {
  const r = await SavedSearch.deleteOne({ _id: req.params.id, user: req.user.id });
  if (!r.deletedCount) throw ApiError.notFound('Saved search not found');
  res.status(204).end();
});
