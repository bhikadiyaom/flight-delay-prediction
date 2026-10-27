import axios from 'axios';
import { env } from '../config/env.js';
import mock from '../data/mockFlights.json' with { type: 'json' };
import { ApiQuota } from '../models/ApiQuota.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { getOrFetch } from './cacheService.js';

const PROVIDER = 'aviationstack';
const QUOTA_STOP_RATIO = 0.9; // Decision 3: stop calling the API at ~90% of the monthly limit

export class UpstreamUnavailable extends Error {
  constructor(reason, message) {
    super(message ?? reason);
    this.reason = reason; // 'no_key' | 'quota' | 'upstream'
  }
}
class FlightNotFound extends Error {}

export const currentMonth = (d = new Date()) => d.toISOString().slice(0, 7);

// ------------------------------------------------------------------------------------------- quota
/** Atomically take one request from this month's budget. False when the 90% line is reached. */
export async function consumeQuota() {
  const limit = env.AVIATIONSTACK_MONTHLY_LIMIT;
  const cap = Math.max(1, Math.floor(limit * QUOTA_STOP_RATIO));
  try {
    const doc = await ApiQuota.findOneAndUpdate(
      { provider: PROVIDER, month: currentMonth(), used: { $lt: cap } },
      { $inc: { used: 1 }, $setOnInsert: { limit } },
      { upsert: true, new: true }
    );
    return Boolean(doc);
  } catch (err) {
    if (err.code === 11000) return false; // doc exists and used >= cap: the upsert collided on the unique index
    throw err;
  }
}

export async function quotaStatus() {
  const doc = await ApiQuota.findOne({ provider: PROVIDER, month: currentMonth() }).lean();
  const limit = env.AVIATIONSTACK_MONTHLY_LIMIT;
  return { provider: PROVIDER, month: currentMonth(), used: doc?.used ?? 0, limit, stopsAt: Math.max(1, Math.floor(limit * QUOTA_STOP_RATIO)) };
}

// ------------------------------------------------------------------------------------------- live API
const http = axios.create({ baseURL: env.AVIATIONSTACK_BASE_URL, timeout: env.UPSTREAM_TIMEOUT_MS });

async function fetchFromApi(params) {
  if (!env.AVIATIONSTACK_KEY) throw new UpstreamUnavailable('no_key', 'AVIATIONSTACK_KEY is not set');
  if (!(await consumeQuota())) throw new UpstreamUnavailable('quota', 'AviationStack monthly quota nearly exhausted');
  try {
    const { data } = await http.get('/flights', { params: { access_key: env.AVIATIONSTACK_KEY, ...params } });
    if (data?.error) throw new UpstreamUnavailable('upstream', `AviationStack error: ${data.error.code}`);
    return Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    if (err instanceof UpstreamUnavailable) throw err;
    // never log err.config: it contains the access key in the query string
    logger.warn('aviationstack request failed', { status: err.response?.status, err: err.code || err.message });
    throw new UpstreamUnavailable('upstream', 'AviationStack request failed');
  }
}

const endpoint = (e) => ({
  iata: e?.iata ?? null,
  airport: e?.airport ?? null,
  terminal: e?.terminal ?? null,
  gate: e?.gate ?? null,
  scheduled: e?.scheduled ?? null,
  estimated: e?.estimated ?? null,
  actual: e?.actual ?? null,
  delayMinutes: Number.isFinite(e?.delay) ? e.delay : 0,
});

/** AviationStack flight record -> normalised flight. */
export function normalizeApiFlight(r) {
  return {
    flightIata: String(r.flight?.iata ?? '').toUpperCase(),
    flightDate: r.flight_date ?? null,
    airline: { name: r.airline?.name ?? null, iata: r.airline?.iata ?? null },
    status: r.flight_status ?? 'unknown',
    origin: endpoint(r.departure),
    destination: endpoint(r.arrival),
    aircraft: r.aircraft?.iata ?? null,
    demo: false,
  };
}

// ------------------------------------------------------------------------------------------- mock data
const pad = (n) => String(n).padStart(2, '0');
const naive = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

function hydrateMock(m, now = new Date()) {
  const dep = new Date(now.getFullYear(), now.getMonth(), now.getDate(), m.depHour, m.depMinute);
  const arr = new Date(dep.getTime() + m.durationMin * 60000);
  const est = (d) => (m.delayMinutes ? naive(new Date(d.getTime() + m.delayMinutes * 60000)) : null);
  const name = (c) => mock.airports[c] ?? c;
  return {
    flightIata: m.flightIata,
    flightDate: naive(dep).slice(0, 10),
    airline: m.airline,
    status: m.status,
    origin: { iata: m.origin, airport: name(m.origin), terminal: m.terminal, gate: m.gate, scheduled: naive(dep), estimated: est(dep), actual: null, delayMinutes: m.delayMinutes },
    destination: { iata: m.destination, airport: name(m.destination), terminal: null, gate: null, scheduled: naive(arr), estimated: est(arr), actual: null, delayMinutes: m.delayMinutes },
    aircraft: m.aircraft,
    demo: true,
  };
}

export const findMockFlight = (code) => {
  const m = mock.flights.find((f) => f.flightIata === code);
  return m ? hydrateMock(m) : null;
};
export const findMockRoute = (origin, destination) =>
  mock.flights.filter((f) => f.origin === origin && f.destination === destination).map((f) => hydrateMock(f))
    .sort((a, b) => a.origin.scheduled.localeCompare(b.origin.scheduled));

// ------------------------------------------------------------------------------------------- public API
/**
 * Flight status for a normalised code (AA100). Order: fresh cache -> live API -> stale cache -> mock demo data.
 * Returns { data, source: 'live'|'cache'|'mock', stale, fetchedAt }.
 */
export async function getFlightStatus(code) {
  try {
    return await getOrFetch({
      key: `flight:${code}`,
      kind: 'flight',
      fetcher: async () => {
        const rows = (await fetchFromApi({ flight_iata: code, limit: 20 })).map(normalizeApiFlight).filter((f) => f.flightIata === code);
        if (!rows.length) throw new FlightNotFound(code);
        const today = new Date().toISOString().slice(0, 10);
        return rows.find((f) => f.flightDate === today) ?? rows[0];
      },
    });
  } catch (err) {
    if (err instanceof FlightNotFound) throw ApiError.notFound(`Flight ${code} was not found`);
    const demo = findMockFlight(code);
    if (demo) {
      logger.info('serving mock flight', { code, reason: err.reason ?? err.message });
      return { data: demo, source: 'mock', stale: false, fetchedAt: new Date() };
    }
    throw ApiError.notFound(`Flight ${code} was not found in demo data (live flight data is unavailable: ${err.reason ?? 'error'})`);
  }
}

/** Upcoming flights on a route (max 15, soonest first). Same fallback chain as getFlightStatus. */
export async function getRouteFlights(origin, destination) {
  try {
    return await getOrFetch({
      key: `route:${origin}-${destination}`,
      kind: 'flight',
      fetcher: async () =>
        (await fetchFromApi({ dep_iata: origin, arr_iata: destination, limit: 100 }))
          .map(normalizeApiFlight)
          .filter((f) => f.flightIata && !['cancelled', 'landed', 'diverted'].includes(f.status))
          .sort((a, b) => String(a.origin.scheduled).localeCompare(String(b.origin.scheduled)))
          .slice(0, 15),
    });
  } catch (err) {
    logger.info('serving mock route', { origin, destination, reason: err.reason ?? err.message });
    return { data: findMockRoute(origin, destination), source: 'mock', stale: false, fetchedAt: new Date() };
  }
}
