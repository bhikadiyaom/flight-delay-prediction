import axios from 'axios';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const http = axios.create({
  baseURL: env.ML_SERVICE_URL,
  timeout: env.ML_TIMEOUT_MS,
  headers: { 'X-Internal-Key': env.ML_INTERNAL_KEY },
});

const WEATHER_TO_SNAKE = {
  temperatureC: 'temperature_c', temperatureMinC: 'temperature_min_c', precipitationMm: 'precipitation_mm',
  windSpeedKmh: 'wind_speed_kmh', visibilityKm: 'visibility_km', snowfallCm: 'snowfall_cm',
};

const weatherToSnake = (w) => (w ? Object.fromEntries(Object.entries(w).map(([k, v]) => [WEATHER_TO_SNAKE[k] ?? k, v])) : undefined);

/** API (camelCase) prediction input -> ml-service PredictRequest (snake_case). */
export function toMlPayload(p) {
  return {
    airline: p.airline,
    origin: p.origin,
    destination: p.destination,
    flight_number: p.flightNumber,
    scheduled_departure: p.scheduledDeparture,
    distance_miles: p.distanceMiles,
    origin_weather: weatherToSnake(p.originWeather),
    dest_weather: weatherToSnake(p.destWeather),
  };
}

/** ml-service PredictResponse -> API shape (camelCase). */
export function fromMlPrediction(r) {
  return {
    delayProbability: r.delay_probability,
    cancelProbability: r.cancel_probability,
    predictedDelayMinutes: r.predicted_delay_minutes,
    riskLevel: r.risk_level,
    topFactors: (r.top_factors ?? []).map((f) => ({ feature: f.feature, value: f.value, shapValue: f.shap_value, direction: f.direction })),
    modelVersion: r.model_version,
    warnings: r.warnings ?? [],
  };
}

function mapError(err) {
  if (err instanceof ApiError) return err;
  if (err.response) {
    const { status, data } = err.response;
    if (status === 422 || status === 400) {
      return ApiError.badRequest('Prediction service rejected the input', data?.detail);
    }
    if (status === 503) return ApiError.unavailable(data?.detail || 'Prediction service feature unavailable', 'ML_FEATURE_UNAVAILABLE');
    logger.error('ml-service error', { status, detail: typeof data?.detail === 'string' ? data.detail : undefined });
    return new ApiError(502, 'Prediction service error', { code: 'ML_ERROR' });
  }
  logger.error('ml-service unreachable', { err: err.message });
  return ApiError.unavailable('Prediction service is unavailable, please try again shortly', 'ML_UNAVAILABLE');
}

async function call(config, { retry = false } = {}) {
  try {
    return (await http.request(config)).data;
  } catch (err) {
    if (retry && !err.response) {
      try {
        return (await http.request(config)).data;
      } catch (err2) {
        throw mapError(err2);
      }
    }
    throw mapError(err);
  }
}

export const mlClient = {
  async predict(input) {
    return fromMlPrediction(await call({ method: 'post', url: '/predict', data: toMlPayload(input) }));
  },
  async predictBatch(inputs) {
    const r = await call({ method: 'post', url: '/predict/batch', data: { items: inputs.map(toMlPayload) } });
    return r.results.map(fromMlPrediction);
  },
  compare: () => call({ url: '/models/compare' }, { retry: true }),
  production: () => call({ url: '/models/production' }, { retry: true }),
  health: () => call({ url: '/health', timeout: 4000 }),
  airports: () => call({ url: '/analytics/airports' }, { retry: true }),
  analytics: {
    overview: () => call({ url: '/analytics/overview' }, { retry: true }),
    historical: (params) => call({ url: '/analytics/historical', params }, { retry: true }),
    riskMap: (params) => call({ url: '/analytics/risk-map', params }, { retry: true }),
    trends: (params) => call({ url: '/analytics/trends', params }, { retry: true }),
  },
};
