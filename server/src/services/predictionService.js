import { PredictionLog } from '../models/PredictionLog.js';
import { logger } from '../utils/logger.js';
import { getOrFetch, hashKey } from './cacheService.js';
import { mlClient } from './mlClientService.js';

const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);

/** Canonical form for the cache key: flight number is irrelevant to the model, weather is rounded to 0.1. */
function canonical(p) {
  const wx = (w) => (w ? Object.fromEntries(Object.entries(w).sort().map(([k, v]) => [k, r1(v)])) : null);
  return {
    a: p.airline, o: p.origin, d: p.destination, t: String(p.scheduledDeparture).slice(0, 13), // date + hour is all the model uses
    m: r1(p.distanceMiles ?? null), ow: wx(p.originWeather), dw: wx(p.destWeather),
  };
}

const outputOf = (pred) => ({
  delayProbability: pred.delayProbability, cancelProbability: pred.cancelProbability,
  predictedDelayMinutes: pred.predictedDelayMinutes, riskLevel: pred.riskLevel, modelVersion: pred.modelVersion,
});

async function writeLog(doc) {
  try {
    return await PredictionLog.create(doc);
  } catch (err) {
    logger.error('failed to write prediction log', { err: err.message }); // logging must never break a prediction
    return null;
  }
}

/**
 * One prediction through the 10-minute cache, logged to PredictionLog.
 * @returns {{prediction, cached: boolean, stale: boolean}}
 */
export async function runPrediction(input, { userId = null, source, extra = {} }) {
  const t0 = Date.now();
  const r = await getOrFetch({ key: `pred:${hashKey(canonical(input))}`, kind: 'prediction', fetcher: () => mlClient.predict(input) });
  await writeLog({
    user: userId, source, input: { ...input, ...extra }, output: outputOf(r.data), cached: r.source === 'cache', latencyMs: Date.now() - t0,
  });
  return { prediction: r.data, cached: r.source === 'cache', stale: r.stale };
}

/** Bulk: one ml-service batch call (no SHAP), one insertMany for the logs. Inputs are already validated. */
export async function runBulk(inputs, { userId }) {
  const t0 = Date.now();
  const preds = await mlClient.predictBatch(inputs);
  const latency = Math.round((Date.now() - t0) / Math.max(inputs.length, 1));
  try {
    await PredictionLog.insertMany(
      inputs.map((input, i) => ({ user: userId, source: 'bulk', input, output: outputOf(preds[i]), latencyMs: latency })),
      { ordered: false }
    );
  } catch (err) {
    logger.error('failed to write bulk prediction logs', { err: err.message });
  }
  return preds;
}
