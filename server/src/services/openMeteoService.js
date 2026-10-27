import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getAirport } from './airportDirectory.js';
import { getOrFetch } from './cacheService.js';

const DAILY = 'temperature_2m_mean,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_mean';
const http = axios.create({ timeout: env.UPSTREAM_TIMEOUT_MS });
const DAY = 24 * 3600 * 1000;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Open-Meteo daily arrays -> the same DAILY units the model was trained on (C, mm/day, km/h, cm/day). */
export function mapDaily(daily) {
  const w = {
    temperatureC: num(daily?.temperature_2m_mean?.[0]),
    temperatureMinC: num(daily?.temperature_2m_min?.[0]),
    precipitationMm: num(daily?.precipitation_sum?.[0]),
    windSpeedKmh: num(daily?.wind_speed_10m_mean?.[0]),
    snowfallCm: num(daily?.snowfall_sum?.[0]),
  };
  return Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined));
}

async function fetchDaily(lat, lon, date) {
  const t = Date.parse(`${date}T12:00:00Z`);
  const ageDays = (Date.now() - t) / DAY;
  if (ageDays < -15.5) return null; // forecast horizon is 16 days
  const base = ageDays > 85 ? `${env.OPEN_METEO_ARCHIVE_URL}/archive` : `${env.OPEN_METEO_BASE_URL}/forecast`;
  const { data } = await http.get(base, {
    params: { latitude: lat.toFixed(4), longitude: lon.toFixed(4), daily: DAILY, timezone: 'auto', start_date: date, end_date: date },
  });
  const w = mapDaily(data?.daily);
  return Object.keys(w).length ? w : null;
}

/**
 * Daily weather for an airport on a date (YYYY-MM-DD). NEVER throws: weather is an enhancement, and the ml-service
 * fills any gap with typical values plus a warning. Returns { data: {...}|null, source, stale }.
 */
export async function getAirportWeather(iata, date) {
  try {
    const ap = await getAirport(iata);
    if (!ap) return { data: null, source: 'unavailable', stale: false, reason: 'unknown airport' };
    const r = await getOrFetch({
      key: `weather:${iata}:${date}`,
      kind: 'weather',
      fetcher: async () => (await fetchDaily(ap.lat, ap.lon, date)) ?? undefined, // undefined = not cached (out of range)
    });
    return r.data ? r : { data: null, source: 'unavailable', stale: false, reason: 'no forecast for this date' };
  } catch (err) {
    logger.warn('weather lookup failed', { iata, date, err: err.message });
    return { data: null, source: 'unavailable', stale: false, reason: 'weather service unavailable' };
  }
}

/** Weather at both ends of a normalised flight. */
export async function getWeatherForFlight(flight) {
  const [o, d] = await Promise.all([
    getAirportWeather(flight.origin.iata, String(flight.origin.scheduled).slice(0, 10)),
    getAirportWeather(flight.destination.iata, String(flight.destination.scheduled ?? flight.origin.scheduled).slice(0, 10)),
  ]);
  return { origin: o.data, destination: d.data, source: o.source === 'unavailable' && d.source === 'unavailable' ? 'unavailable' : (o.source === 'live' || d.source === 'live' ? 'live' : 'cache') };
}
