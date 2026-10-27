import { z } from 'zod';
import { LiveFlightCache } from '../models/LiveFlightCache.js';
import { ModelMetricSnapshot } from '../models/ModelMetricSnapshot.js';
import { PredictionLog } from '../models/PredictionLog.js';
import { User } from '../models/User.js';
import { quotaStatus } from '../services/aviationStackService.js';
import { cacheStats } from '../services/cacheService.js';
import { mlClient } from '../services/mlClientService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dto, pageMeta } from '../utils/dto.js';

export const adminPredictionsQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  source: z.enum(['manual', 'live', 'bulk']).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  user: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const adminMetricsQuery = z.object({ production: z.enum(['true', 'false']).optional() });

/** GET /admin/metrics: stored model snapshots (refresh them with POST /admin/metrics/refresh). */
export const metrics = asyncHandler(async (req, res) => {
  const filter = req.query.production ? { isProduction: req.query.production === 'true' } : {};
  const items = await ModelMetricSnapshot.find(filter).sort({ isProduction: -1, task: 1, modelName: 1 }).lean();
  res.json({ items: items.map((d) => dto(d)) });
});

const METRIC_KEYS = { accuracy: 'accuracy', precision: 'precision', recall: 'recall', f1: 'f1', roc_auc: 'rocAuc', pr_auc: 'prAuc', brier: 'brier', mae: 'mae', rmse: 'rmse', r2: 'r2' };

/** POST /admin/metrics/refresh: pull model_metrics from the ml-service into Mongo (idempotent upsert). */
export const refreshMetrics = asyncHandler(async (_req, res) => {
  const cmp = await mlClient.compare();
  let upserted = 0;
  for (const m of cmp.models) {
    const metrics = {};
    for (const [src, dst] of Object.entries(METRIC_KEYS)) if (typeof m.metrics?.[src] === 'number') metrics[dst] = m.metrics[src];
    await ModelMetricSnapshot.updateOne(
      { modelName: m.model_name, task: m.task, target: m.target ?? null, version: m.version },
      { $set: { isProduction: Boolean(m.is_production), metrics, perClass: m.per_class ?? null, confusionMatrix: m.confusion_matrix ?? null, threshold: m.threshold ?? null, trainedAt: new Date(cmp.generated_at) } },
      { upsert: true }
    );
    upserted += 1;
  }
  await ModelMetricSnapshot.updateMany({ version: { $ne: cmp.version } }, { $set: { isProduction: false } }); // older versions are history
  await LiveFlightCache.deleteOne({ key: 'models:compare' }); // the public comparison cache must not serve the old version
  res.json({ version: cmp.version, upserted });
});

/** GET /admin/predictions: all users' prediction logs with filters. */
export const predictions = asyncHandler(async (req, res) => {
  const { page, limit, source, riskLevel, user, from, to } = req.query;
  const filter = {};
  if (source) filter.source = source;
  if (riskLevel) filter['output.riskLevel'] = riskLevel;
  if (user) filter.user = user;
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const [items, total] = await Promise.all([
    PredictionLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'email name').lean(),
    PredictionLog.countDocuments(filter),
  ]);
  res.json({ items: items.map((d) => dto(d, { drop: ['updatedAt'] })), ...pageMeta(total, page, limit) });
});

/** GET /admin/stats: usage + operational numbers for the dashboard cards. */
export const stats = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [users, admins, total, last24h, bySource, byRisk, latency, quota, cache, byVersion] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    PredictionLog.countDocuments(),
    PredictionLog.countDocuments({ createdAt: { $gte: since } }),
    PredictionLog.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]),
    PredictionLog.aggregate([{ $group: { _id: '$output.riskLevel', n: { $sum: 1 } } }]),
    PredictionLog.aggregate([{ $group: { _id: null, avg: { $avg: '$latencyMs' }, cachedShare: { $avg: { $cond: ['$cached', 1, 0] } } } }]),
    quotaStatus(),
    cacheStats(),
    PredictionLog.aggregate([{ $group: { _id: '$output.modelVersion', n: { $sum: 1 } } }]),
  ]);
  const toMap = (rows) => Object.fromEntries(rows.filter((r) => r._id).map((r) => [r._id, r.n]));
  res.json({
    users: { total: users, admins },
    predictions: { total, last24h, bySource: toMap(bySource), byRiskLevel: toMap(byRisk), byModelVersion: toMap(byVersion) },
    performance: { avgLatencyMs: Math.round(latency[0]?.avg ?? 0), cachedShare: Number((latency[0]?.cachedShare ?? 0).toFixed(3)) },
    aviationStackQuota: quota,
    cache: cache.map((c) => ({ kind: c._id, entries: c.entries, newest: c.newest })),
  });
});
