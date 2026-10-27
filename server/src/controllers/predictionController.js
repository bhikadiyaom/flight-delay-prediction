import { parse } from 'csv-parse/sync';
import { PredictionLog } from '../models/PredictionLog.js';
import { getFlightStatus } from '../services/aviationStackService.js';
import { getWeatherForFlight } from '../services/openMeteoService.js';
import { runBulk, runPrediction } from '../services/predictionService.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dto, pageMeta } from '../utils/dto.js';
import { BULK_MAX_ROWS, bulkRowSchema, rowToPrediction } from '../validators/predictionValidator.js';

/** POST /predictions: manual prediction (public, rate limited; logged-in users get a higher limit). */
export const createManual = asyncHandler(async (req, res) => {
  const { prediction, cached, stale } = await runPrediction(req.body, { userId: req.user?.id ?? null, source: 'manual' });
  res.json({ prediction, cached, stale });
});

/** POST /predictions/live: fetch the flight (cache -> live -> stale -> mock) + weather, predict, explain. */
export const createLive = asyncHandler(async (req, res) => {
  const f = await getFlightStatus(req.body.flight);
  const { origin, destination } = f.data;
  if (!/^[A-Z]{3}$/.test(origin.iata ?? '') || !/^[A-Z]{3}$/.test(destination.iata ?? '') || !origin.scheduled) {
    throw new ApiError(422, 'Flight data is incomplete (missing airports or scheduled time), cannot predict', { code: 'FLIGHT_INCOMPLETE' });
  }
  const wx = await getWeatherForFlight(f.data);
  const input = {
    airline: f.data.airline.iata ?? f.data.airline.name,
    origin: origin.iata,
    destination: destination.iata,
    scheduledDeparture: String(origin.scheduled).slice(0, 19), // airport-local wall clock
    flightNumber: f.data.flightIata,
    originWeather: wx.origin ?? undefined,
    destWeather: wx.destination ?? undefined,
  };
  const { prediction, cached, stale } = await runPrediction(input, {
    userId: req.user?.id ?? null, source: 'live', extra: { flight: f.data.flightIata, flightSource: f.source },
  });
  res.json({
    prediction,
    flight: f.data,
    weather: { origin: wx.origin, destination: wx.destination },
    source: f.source,
    demo: f.source === 'mock',
    cached,
    stale: stale || f.stale,
  });
});

/** POST /predictions/bulk (auth): CSV upload, max 500 rows. Invalid rows are reported, valid rows are predicted. */
export const createBulk = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Attach a CSV file in the "file" field');
  let records;
  try {
    records = parse(req.file.buffer, {
      columns: (h) => h.map((c) => String(c).trim().toLowerCase()),
      skip_empty_lines: true, bom: true, trim: true, max_record_size: 4096,
    });
  } catch (err) {
    throw ApiError.badRequest(`Could not read the CSV: ${err.message}`);
  }
  if (!records.length) throw ApiError.badRequest('The CSV has no data rows');
  if (records.length > BULK_MAX_ROWS) throw ApiError.badRequest(`Too many rows (${records.length}); the maximum is ${BULK_MAX_ROWS}`);
  const required = ['airline', 'origin', 'destination', 'scheduled_departure'];
  const missing = required.filter((c) => !(c in records[0]));
  if (missing.length) throw ApiError.badRequest(`Missing required column(s): ${missing.join(', ')}`);

  const results = new Array(records.length);
  const inputs = [];
  const slots = [];
  records.forEach((rec, i) => {
    const r = bulkRowSchema.safeParse(rec);
    if (r.success) {
      inputs.push(rowToPrediction(r.data));
      slots.push(i);
    } else {
      results[i] = { row: i + 2, status: 'error', errors: r.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`) };
    }
  });
  if (inputs.length) {
    const preds = await runBulk(inputs, { userId: req.user.id });
    preds.forEach((prediction, k) => { results[slots[k]] = { row: slots[k] + 2, status: 'ok', input: inputs[k], prediction }; });
  }
  res.json({ summary: { total: records.length, ok: inputs.length, failed: records.length - inputs.length }, results });
});

/** GET /predictions/history (auth): the caller's own predictions, newest first. */
export const history = asyncHandler(async (req, res) => {
  const { page, limit, source } = req.query;
  const filter = { user: req.user.id, ...(source ? { source } : {}) };
  const [items, total] = await Promise.all([
    PredictionLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PredictionLog.countDocuments(filter),
  ]);
  res.json({ items: items.map((d) => dto(d, { drop: ['user', 'updatedAt'] })), ...pageMeta(total, page, limit) });
});
