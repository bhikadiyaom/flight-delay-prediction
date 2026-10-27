// Shared test harness: real MongoDB (mongodb-memory-server) + stub HTTP servers for the ml-service,
// AviationStack and Open-Meteo. Env is set BEFORE the app modules are imported (they read env at import time).
import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readJson = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
  });

export const ML_KEY = 'test-ml-key-0123456789abcdef';

export const AIRPORTS = [
  { iata: 'JFK', name: 'John F Kennedy International', city: 'New York', state: 'NY', lat: 40.64, lon: -73.78 },
  { iata: 'LGA', name: 'LaGuardia', city: 'New York', state: 'NY', lat: 40.78, lon: -73.87 },
  { iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', state: 'CA', lat: 33.94, lon: -118.41 },
  { iata: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', state: 'GA', lat: 33.64, lon: -84.43 },
  { iata: 'ORD', name: "Chicago O'Hare International", city: 'Chicago', state: 'IL', lat: 41.98, lon: -87.9 },
  { iata: 'DEN', name: 'Denver International', city: 'Denver', state: 'CO', lat: 39.86, lon: -104.67 },
];

function mlStub() {
  const s = { mode: 'ok', calls: { predict: 0, batch: 0, compare: 0, overview: 0, historical: 0, health: 0, airports: 0 }, last: {}, badKeys: 0 };
  const predictOne = (p) => {
    const rain = p.origin_weather?.precipitation_mm ?? 0;
    const prob = Math.min(0.9, 0.15 + rain * 0.03);
    return {
      delay_probability: prob, cancel_probability: 0.01, predicted_delay_minutes: prob >= 0.2 ? 40 : null,
      risk_level: prob >= 0.4 ? 'high' : prob >= 0.2 ? 'medium' : 'low',
      top_factors: [{ feature: 'o_prcp_band', value: 'light', shap_value: 0.3, direction: 'increases_delay_risk' }],
      model_version: 'vtest', warnings: p.origin_weather ? [] : ['origin weather not supplied'],
    };
  };
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.headers['x-internal-key'] !== ML_KEY) { s.badKeys += 1; return send(res, 403, { detail: 'invalid or missing X-Internal-Key' }); }
    if (s.mode === 'down') return req.socket.destroy(); // simulates the service being unreachable
    if (s.mode === '500') return send(res, 500, { detail: 'boom' });
    if (url.pathname === '/health') { s.calls.health += 1; return send(res, 200, { status: 'ok', model_version: 'vtest', analytics_available: true }); }
    if (url.pathname === '/analytics/airports') { s.calls.airports += 1; return send(res, 200, { airports: AIRPORTS }); }
    if (url.pathname === '/predict' && req.method === 'POST') {
      const body = await readJson(req);
      s.last.predict = body;
      s.calls.predict += 1;
      if (s.mode === '422') return send(res, 422, { detail: [{ loc: ['body', 'origin'], msg: 'bad' }] });
      return send(res, 200, predictOne(body));
    }
    if (url.pathname === '/predict/batch' && req.method === 'POST') {
      const body = await readJson(req);
      s.last.batch = body;
      s.calls.batch += 1;
      return send(res, 200, { results: body.items.map((i) => ({ ...predictOne(i), top_factors: [] })), model_version: 'vtest' });
    }
    if (url.pathname === '/analytics/overview') { s.calls.overview += 1; return send(res, 200, { totals: { flights: 123 }, by_airline: [], by_airport: [], by_month: [], by_day_of_week: [], by_time_of_day: [], by_weather: [], delay_causes: [] }); }
    if (url.pathname === '/analytics/historical') {
      s.calls.historical += 1;
      s.last.historical = Object.fromEntries(url.searchParams);
      return send(res, 200, { summary: { flights: 1 }, flights: [{ origin: url.searchParams.get('origin') }], by_airline: [] });
    }
    if (url.pathname === '/analytics/risk-map') return send(res, 200, { airports: [] });
    if (url.pathname === '/analytics/trends') { s.last.trends = Object.fromEntries(url.searchParams); return send(res, 200, { granularity: url.searchParams.get('granularity'), points: [] }); }
    if (url.pathname === '/models/compare') {
      s.calls.compare += 1;
      return send(res, 200, {
        version: 'vtest', generated_at: '2026-10-27T08:00:00+00:00', production_model: 'xgboost',
        models: [
          { model_name: 'xgboost', task: 'classifier', target: 'delay', version: 'vtest', is_production: true, threshold: 0.2, metrics: { accuracy: 0.67, precision: 0.24, recall: 0.53, f1: 0.33, roc_auc: 0.66, brier: 0.12 }, per_class: {}, confusion_matrix: [[1, 2], [3, 4]] },
          { model_name: 'logreg', task: 'classifier', target: 'delay', version: 'vtest', is_production: false, threshold: 0.46, metrics: { accuracy: 0.66, roc_auc: 0.65 } },
          { model_name: 'xgboost', task: 'regressor', target: 'delay_minutes', version: 'vtest', is_production: true, metrics: { mae: 35.9, rmse: 71.9 } },
        ],
        roc: {}, calibration: {}, feature_importance: {},
      });
    }
    return send(res, 404, { detail: 'not found' });
  };
  return { s, handler };
}

function avStub() {
  const s = { mode: 'ok', calls: 0, keys: [], flights: {}, last: null };
  const record = (code, dep = 'JFK', arr = 'LAX') => ({
    flight_date: new Date().toISOString().slice(0, 10), flight_status: 'scheduled',
    departure: { airport: `${dep} Airport`, iata: dep, terminal: '4', gate: 'B1', delay: 5, scheduled: `${new Date().toISOString().slice(0, 10)}T14:00:00+00:00`, estimated: null, actual: null },
    arrival: { airport: `${arr} Airport`, iata: arr, terminal: '1', gate: null, delay: null, scheduled: `${new Date().toISOString().slice(0, 10)}T20:30:00+00:00`, estimated: null, actual: null },
    airline: { name: 'American Airlines', iata: code.slice(0, 2) },
    flight: { number: code.slice(2), iata: code, icao: `${code.slice(0, 2)}X${code.slice(2)}` }, aircraft: { iata: 'B738' },
  });
  const handler = (req, res) => {
    const url = new URL(req.url, 'http://x');
    s.calls += 1;
    s.keys.push(url.searchParams.get('access_key'));
    s.last = Object.fromEntries(url.searchParams);
    if (s.mode === 'fail') return send(res, 500, { error: 'upstream down' });
    if (s.mode === 'error-body') return send(res, 200, { error: { code: 'usage_limit_reached', message: 'limit' } });
    const code = url.searchParams.get('flight_iata');
    if (code) {
      if (code === 'NF999') return send(res, 200, { data: [] });
      return send(res, 200, { data: s.flights[code] ?? [record(code)] });
    }
    const dep = url.searchParams.get('dep_iata');
    const arr = url.searchParams.get('arr_iata');
    return send(res, 200, { data: [record('AA100', dep, arr), record('DL400', dep, arr), { ...record('AA999', dep, arr), flight_status: 'landed' }] });
  };
  return { s, handler, record };
}

function omStub() {
  const s = { mode: 'ok', calls: 0, last: null };
  const handler = (req, res) => {
    const url = new URL(req.url, 'http://x');
    s.calls += 1;
    s.last = { path: url.pathname, ...Object.fromEntries(url.searchParams) };
    if (s.mode === 'fail') return send(res, 500, { error: true });
    const d = url.searchParams.get('start_date');
    return send(res, 200, { daily: { time: [d], temperature_2m_mean: [15.5], temperature_2m_min: [10.2], precipitation_sum: [6.5], snowfall_sum: [0], wind_speed_10m_mean: [22.1] } });
  };
  return { s, handler };
}

/**
 * Boot everything. Returns { api (supertest), m (app modules), ml, av, om (stub state), reset, stop }.
 * `env` entries override the defaults; `limits` are passed to createApp().
 */
export async function boot({ env = {}, limits } = {}) {
  const mongo = await MongoMemoryServer.create();
  const mlS = mlStub();
  const avS = avStub();
  const omS = omStub();
  const [ml, av, om] = await Promise.all([listen(mlS.handler), listen(avS.handler), listen(omS.handler)]);

  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri('flight-test'), JWT_SECRET: 'j'.repeat(48), ML_INTERNAL_KEY: ML_KEY,
    ML_SERVICE_URL: ml.url, AVIATIONSTACK_BASE_URL: av.url, OPEN_METEO_BASE_URL: om.url, OPEN_METEO_ARCHIVE_URL: om.url,
    BCRYPT_ROUNDS: '4', ALERTS_ENABLED: 'false', RATE_LIMIT_GLOBAL: '100000', RATE_LIMIT_ANON: '100000', RATE_LIMIT_USER: '100000',
    RATE_LIMIT_AUTH: '100000', CLIENT_URL: 'http://localhost:5173', ML_TIMEOUT_MS: '3000', UPSTREAM_TIMEOUT_MS: '3000', ...env,
  });

  const m = {
    env: (await import('../src/config/env.js')).env,
    db: await import('../src/config/db.js'),
    createApp: (await import('../src/app.js')).createApp,
    User: (await import('../src/models/User.js')).User,
    SavedSearch: (await import('../src/models/SavedSearch.js')).SavedSearch,
    PredictionLog: (await import('../src/models/PredictionLog.js')).PredictionLog,
    LiveFlightCache: (await import('../src/models/LiveFlightCache.js')).LiveFlightCache,
    ApiQuota: (await import('../src/models/ApiQuota.js')).ApiQuota,
    ModelMetricSnapshot: (await import('../src/models/ModelMetricSnapshot.js')).ModelMetricSnapshot,
    cache: await import('../src/services/cacheService.js'),
    directory: await import('../src/services/airportDirectory.js'),
    jwt: await import('../src/utils/jwt.js'),
  };
  await m.db.connectDB();
  await Promise.all([m.User.init(), m.LiveFlightCache.init(), m.ApiQuota.init(), m.ModelMetricSnapshot.init()]);
  const api = request(m.createApp({ limits }));

  const reset = async () => {
    await Promise.all([m.PredictionLog.deleteMany({}), m.LiveFlightCache.deleteMany({}), m.ApiQuota.deleteMany({}), m.SavedSearch.deleteMany({})]);
    m.directory.resetAirportDirectory();
    Object.assign(mlS.s, { mode: 'ok', last: {}, badKeys: 0 });
    Object.keys(mlS.s.calls).forEach((k) => { mlS.s.calls[k] = 0; });
    Object.assign(avS.s, { mode: 'ok', calls: 0, keys: [], flights: {}, last: null });
    Object.assign(omS.s, { mode: 'ok', calls: 0, last: null });
  };

  const stop = async () => {
    await m.db.disconnectDB();
    await mongo.stop();
    await Promise.all([ml, av, om].map((x) => new Promise((r) => { x.server.closeAllConnections?.(); x.server.close(r); })));
  };

  return { api, m, ml: mlS.s, av: avS.s, om: omS.s, avRecord: avS.record, reset, stop, createApp: (l) => request(m.createApp({ limits: l })) };
}

let n = 0;
/** Register a fresh user, return { token, user, auth: {Authorization} }. */
export async function newUser(ctx, over = {}) {
  n += 1;
  const body = { name: 'Test User', email: `user${n}-${Date.now()}@example.com`, password: 'Password123', ...over };
  const r = await ctx.api.post('/api/v1/auth/register').send(body);
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.token, user: r.body.user, body, auth: { Authorization: `Bearer ${r.body.token}` } };
}

export const iso = (daysFromNow = 1, hh = '09:30:00') => `${new Date(Date.now() + daysFromNow * 864e5).toISOString().slice(0, 10)}T${hh}`;
