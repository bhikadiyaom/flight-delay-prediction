import { getOrFetch, hashKey } from '../services/cacheService.js';
import { mlClient } from '../services/mlClientService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** All analytics are aggregates over static 2023 data: cached in Mongo (kind analytics, 24 h) with stale-if-error. */
const cached = (key, fetcher) => getOrFetch({ key, kind: 'analytics', fetcher });

const send = (res, r) => res.json({ ...r.data, cached: r.source === 'cache', stale: r.stale, fetchedAt: r.fetchedAt });

export const overview = asyncHandler(async (_req, res) => send(res, await cached('analytics:overview', mlClient.analytics.overview)));

export const trends = asyncHandler(async (req, res) => {
  const params = Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== undefined));
  send(res, await cached(`analytics:trends:${hashKey(params)}`, () => mlClient.analytics.trends(params)));
});

export const riskMap = asyncHandler(async (req, res) => {
  const params = { min_flights: req.query.minFlights };
  send(res, await cached(`analytics:riskmap:${params.min_flights}`, () => mlClient.analytics.riskMap(params)));
});

export const modelsCompare = asyncHandler(async (_req, res) => send(res, await cached('models:compare', mlClient.compare)));
