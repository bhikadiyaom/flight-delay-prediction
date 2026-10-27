import { z } from 'zod';

export const iata = z.string().trim().regex(/^[A-Za-z]{3}$/, 'must be a 3-letter IATA code').transform((s) => s.toUpperCase());

/** "aa 100", "AA-100", "aa100" -> "AA100" (cache keys and lookups are normalised, Decision 3). */
export const normalizeFlight = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
export const flightCode = z
  .string()
  .trim()
  .max(12)
  .transform(normalizeFlight)
  .refine((s) => /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(s), 'must look like AA100');

const num = (min, max) => z.number().finite().min(min).max(max);

export const weatherSchema = z
  .object({
    temperatureC: num(-80, 60).optional(),
    temperatureMinC: num(-90, 60).optional(),
    precipitationMm: num(0, 1500).optional(),
    windSpeedKmh: num(0, 450).optional(),
    visibilityKm: num(0, 200).optional(),
    snowfallCm: num(0, 500).optional(),
  })
  .strict();

/** Real calendar check: Date.parse silently rolls 2026-02-30 over to March, so compare the parts back. */
export function isRealDateTime(s) {
  const [, y, mo, d, h = '0', mi = '0', se = '0'] = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/) ?? [];
  if (!y) return false;
  const [Y, M, D, H, I, S] = [y, mo, d, h, mi, se].map(Number);
  const t = new Date(Date.UTC(Y, M - 1, D, H, I, S));
  return t.getUTCFullYear() === Y && t.getUTCMonth() === M - 1 && t.getUTCDate() === D && H < 24 && I < 60 && S < 60;
}

/** ISO date-time. The wall-clock part is what matters (airport local time), so any offset is ignored. */
export const scheduledDeparture = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, 'must be an ISO date-time')
  .refine(isRealDateTime, 'invalid date')
  .transform((s) => (s.length === 16 ? `${s}:00` : s.slice(0, 19)));

export const predictionBase = {
  airline: z.string().trim().min(2).max(60),
  origin: iata,
  destination: iata,
  scheduledDeparture,
  flightNumber: z.string().trim().max(12).optional(),
  distanceMiles: z.number().positive().max(8000).optional(),
  originWeather: weatherSchema.optional(),
  destWeather: weatherSchema.optional(),
};

export const manualPredictionSchema = { body: z.object(predictionBase) };

export const livePredictionSchema = { body: z.object({ flight: flightCode }) };

export const liveFlightQuerySchema = { query: z.object({ flight: flightCode }) };

export const routeQuerySchema = { query: z.object({ origin: iata, destination: iata }) };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine(isRealDateTime, 'invalid date');

export const historicalQuerySchema = {
  query: z
    .object({
      origin: iata.optional(),
      dest: iata.optional(),
      date: isoDate.optional(),
      airline: z.string().trim().min(2).max(60).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    })
    .refine((q) => q.origin || q.dest, { message: 'provide origin or dest' }),
};

export const airportsQuerySchema = {
  query: z.object({ q: z.string().trim().max(40).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }),
};

export const trendsQuerySchema = {
  query: z.object({
    granularity: z.enum(['day', 'week', 'month']).default('day'),
    origin: iata.optional(),
    airline: z.string().trim().min(2).max(60).optional(),
  }),
};

export const riskMapQuerySchema = { query: z.object({ minFlights: z.coerce.number().int().min(100).max(100000).default(3000) }) };

export const historyQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    source: z.enum(['manual', 'live', 'bulk']).optional(),
  }),
};

// ---- bulk CSV rows (header names are lower-cased snake_case; see docs/api-spec.md) ----
const csvNum = (min, max) =>
  z.preprocess((v) => (v === '' || v === undefined || v === null ? undefined : Number(v)), num(min, max).optional());

export const bulkRowSchema = z.object({
  airline: predictionBase.airline,
  origin: iata,
  destination: iata,
  scheduled_departure: scheduledDeparture,
  flight_number: z.string().trim().max(12).optional().or(z.literal('').transform(() => undefined)),
  distance_miles: csvNum(1, 8000),
  origin_temperature_c: csvNum(-80, 60), origin_temperature_min_c: csvNum(-90, 60), origin_precipitation_mm: csvNum(0, 1500),
  origin_wind_speed_kmh: csvNum(0, 450), origin_snowfall_cm: csvNum(0, 500),
  dest_temperature_c: csvNum(-80, 60), dest_temperature_min_c: csvNum(-90, 60), dest_precipitation_mm: csvNum(0, 1500),
  dest_wind_speed_kmh: csvNum(0, 450), dest_snowfall_cm: csvNum(0, 500),
});

export const BULK_MAX_ROWS = 500;

const wxFromRow = (r, p) => {
  const w = {
    temperatureC: r[`${p}_temperature_c`], temperatureMinC: r[`${p}_temperature_min_c`],
    precipitationMm: r[`${p}_precipitation_mm`], windSpeedKmh: r[`${p}_wind_speed_kmh`], snowfallCm: r[`${p}_snowfall_cm`],
  };
  const clean = Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined));
  return Object.keys(clean).length ? clean : undefined;
};

/** Validated CSV row -> the same camelCase shape as a manual prediction. */
export function rowToPrediction(r) {
  return {
    airline: r.airline, origin: r.origin, destination: r.destination, scheduledDeparture: r.scheduled_departure,
    flightNumber: r.flight_number, distanceMiles: r.distance_miles,
    originWeather: wxFromRow(r, 'origin'), destWeather: wxFromRow(r, 'dest'),
  };
}
