import { getOrFetch, hashKey } from './cacheService.js';
import { mlClient } from './mlClientService.js';

/** Historical 2023 flights (ml-service/DuckDB). Static data, so results use the 24 h analytics cache. */
export async function searchHistorical({ origin, dest, date, airline, limit }) {
  const params = Object.fromEntries(Object.entries({ origin, dest, date, airline, limit }).filter(([, v]) => v !== undefined && v !== ''));
  const r = await getOrFetch({ key: `hist:${hashKey(params)}`, kind: 'analytics', fetcher: () => mlClient.analytics.historical(params) });
  return { ...r.data, cached: r.source === 'cache' };
}
