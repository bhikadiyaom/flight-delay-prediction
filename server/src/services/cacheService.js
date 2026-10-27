import { createHash } from 'node:crypto';
import { LiveFlightCache } from '../models/LiveFlightCache.js';
import { logger } from '../utils/logger.js';

// Decision 3 TTLs (seconds) + how long an expired entry stays available for stale-if-error.
export const TTL = {
  flight: { fresh: 5 * 60, grace: 24 * 3600 },
  weather: { fresh: 30 * 60, grace: 24 * 3600 },
  prediction: { fresh: 10 * 60, grace: 3600 },
  analytics: { fresh: 24 * 3600, grace: 7 * 24 * 3600 },
};

const inflight = new Map(); // key -> Promise: concurrent identical misses share one upstream call

/** Stable short hash for cache keys built from objects (prediction payloads). */
export const hashKey = (obj) => createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 24);

/**
 * Read-through cache with stale-if-error.
 *   1. fresh entry            -> { source: 'cache', stale: false }
 *   2. miss/expired -> fetch  -> store, { source: 'live' }
 *   3. fetch fails + expired entry exists -> serve it { source: 'cache', stale: true }
 *   4. fetch fails + nothing  -> rethrow (callers fall back to mock data)
 * The fetcher may return `undefined` to mean "do not cache" (e.g. mock data).
 */
export async function getOrFetch({ key, kind, fetcher, ttl = TTL[kind] }) {
  const now = new Date();
  const doc = await LiveFlightCache.findOne({ key }).lean();
  if (doc && doc.freshUntil > now) {
    return { data: doc.payload, source: 'cache', stale: false, fetchedAt: doc.fetchedAt };
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const data = await fetcher();
      if (data === undefined) return { data: undefined, fetchedAt: new Date() };
      const fetchedAt = new Date();
      const freshUntil = new Date(fetchedAt.getTime() + ttl.fresh * 1000);
      const expiresAt = new Date(freshUntil.getTime() + ttl.grace * 1000);
      await LiveFlightCache.updateOne({ key }, { $set: { kind, payload: data, fetchedAt, freshUntil, expiresAt } }, { upsert: true });
      return { data, fetchedAt };
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    const { data, fetchedAt } = await pending;
    return { data, source: 'live', stale: false, fetchedAt };
  } catch (err) {
    if (doc) {
      logger.warn('serving stale cache entry after upstream error', { key, kind, err: err.message });
      return { data: doc.payload, source: 'cache', stale: true, fetchedAt: doc.fetchedAt };
    }
    throw err;
  }
}

export const cacheStats = () =>
  LiveFlightCache.aggregate([{ $group: { _id: '$kind', entries: { $sum: 1 }, newest: { $max: '$fetchedAt' } } }]);
