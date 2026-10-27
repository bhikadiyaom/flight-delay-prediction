import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { boot, iso, newUser } from './helpers.js';

let ctx;
const V1 = '/api/v1';
const body = (over = {}) => ({
  airline: 'DL', origin: 'atl', destination: 'jfk', scheduledDeparture: iso(1), flightNumber: 'DL100',
  originWeather: { temperatureC: 12, precipitationMm: 5, windSpeedKmh: 20 }, destWeather: { temperatureC: 8, precipitationMm: 0 }, ...over,
});
const post = (b, auth = {}) => ctx.api.post(`${V1}/predictions`).set(auth).send(b);

before(async () => { ctx = await boot(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => {
  await ctx.reset();
  ctx.m.env.AVIATIONSTACK_KEY = 'test-av-key';
});

describe('POST /predictions (manual)', () => {
  it('returns a camelCase prediction and sends the ml-service its snake_case contract', async () => {
    const r = await post(body());
    assert.equal(r.status, 200);
    const p = r.body.prediction;
    assert.equal(p.riskLevel, 'medium');
    assert.equal(p.modelVersion, 'vtest');
    assert.equal(p.predictedDelayMinutes, 40);
    assert.deepEqual(p.topFactors[0], { feature: 'o_prcp_band', value: 'light', shapValue: 0.3, direction: 'increases_delay_risk' });
    assert.equal(r.body.cached, false);

    const sent = ctx.ml.last.predict;
    assert.equal(sent.origin, 'ATL');
    assert.equal(sent.destination, 'JFK');
    assert.match(sent.scheduled_departure, /^\d{4}-\d{2}-\d{2}T09:30:00$/);
    assert.deepEqual(sent.origin_weather, { temperature_c: 12, precipitation_mm: 5, wind_speed_kmh: 20 });
    assert.equal(sent.flight_number, 'DL100');
  });

  it('is public, and logs the prediction (anonymous = null user, logged in = user id)', async () => {
    await post(body({ origin: 'ord' }));
    const u = await newUser(ctx);
    await post(body({ origin: 'den' }), u.auth);
    const logs = await ctx.m.PredictionLog.find({}).sort({ createdAt: 1 }).lean();
    assert.equal(logs.length, 2);
    assert.equal(logs[0].user, null);
    assert.equal(String(logs[1].user), u.user.id);
    assert.equal(logs[0].source, 'manual');
    assert.equal(logs[0].output.riskLevel, 'medium');
    assert.equal(logs[0].output.modelVersion, 'vtest');
    assert.ok(logs[0].latencyMs >= 0);
    assert.equal(logs[0].input.origin, 'ORD');
  });

  it('ignores a time zone offset (airport-local wall clock) and accepts minute precision', async () => {
    await post(body({ scheduledDeparture: '2026-12-22T17:05:00+05:30' }));
    assert.equal(ctx.ml.last.predict.scheduled_departure, '2026-12-22T17:05:00');
    await post(body({ scheduledDeparture: '2026-12-23T08:15' }));
    assert.equal(ctx.ml.last.predict.scheduled_departure, '2026-12-23T08:15:00');
  });

  it('validates input and never forwards bad data upstream', async () => {
    const bad = [
      body({ origin: 'ATLANTA' }), body({ destination: '12' }), body({ airline: '' }), body({ scheduledDeparture: 'tomorrow' }),
      body({ scheduledDeparture: '2026-02-30T10:00:00' }), body({ distanceMiles: -1 }), body({ originWeather: { precipitationMm: -5 } }),
      body({ originWeather: { temperatureC: 900 } }), body({ originWeather: { bogus: 1 } }), { airline: 'DL' }, body({ extra: 1, origin: 5 }),
    ];
    for (const b of bad) assert.equal((await post(b)).status, 400, JSON.stringify(b));
    assert.equal(ctx.ml.calls.predict, 0);
  });

  it('prediction cache (10 min): identical requests hit the ml-service once; flight number and tiny weather noise do not matter', async () => {
    const a = await post(body());
    const b = await post(body({ flightNumber: 'DL999', originWeather: { temperatureC: 12.02, precipitationMm: 5.01, windSpeedKmh: 20 } }));
    assert.equal(a.body.cached, false);
    assert.equal(b.body.cached, true);
    assert.equal(ctx.ml.calls.predict, 1);
    const hour = await post(body({ scheduledDeparture: iso(1, '15:30:00') }));
    assert.equal(hour.body.cached, false); // a different hour is a different prediction
    assert.equal(ctx.ml.calls.predict, 2);
    const logs = await ctx.m.PredictionLog.find({}).lean();
    assert.equal(logs.length, 3); // every request is logged...
    assert.equal(logs.filter((l) => l.cached).length, 1); // ...and the cached one is marked
    assert.equal((await ctx.m.LiveFlightCache.findOne({ kind: 'prediction' })).kind, 'prediction');
  });

  it('stale-if-error: an expired cached prediction is served when the ml-service is down', async () => {
    await post(body());
    await ctx.m.LiveFlightCache.updateMany({ kind: 'prediction' }, { $set: { freshUntil: new Date(Date.now() - 1000) } });
    ctx.ml.mode = 'down';
    const r = await post(body());
    assert.equal(r.status, 200);
    assert.equal(r.body.stale, true);
  });

  it('maps ml-service failures to clean errors', async () => {
    ctx.ml.mode = 'down';
    const down = await post(body());
    assert.equal(down.status, 503);
    assert.equal(down.body.error.code, 'ML_UNAVAILABLE');
    ctx.ml.mode = '500';
    const err = await post(body({ origin: 'lga' }));
    assert.equal(err.status, 502);
    assert.ok(!JSON.stringify(err.body).includes('boom'));
    ctx.ml.mode = '422';
    const rej = await post(body({ origin: 'den' }));
    assert.equal(rej.status, 400);
  });

  it('sends the shared secret to the ml-service on every call', async () => {
    await post(body());
    assert.equal(ctx.ml.badKeys, 0);
  });
});

describe('POST /predictions/live', () => {
  const liveP = (flight, auth = {}) => ctx.api.post(`${V1}/predictions/live`).set(auth).send({ flight });

  it('fetches the flight and both weathers, predicts, and returns prediction + flight + weather + source', async () => {
    const r = await liveP('aa 100');
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'live');
    assert.equal(r.body.demo, false);
    assert.equal(r.body.flight.flightIata, 'AA100');
    assert.equal(r.body.weather.origin.precipitationMm, 6.5);
    assert.equal(r.body.prediction.riskLevel, 'medium');
    const sent = ctx.ml.last.predict;
    assert.equal(sent.airline, 'AA'); // IATA code is the most reliable airline key
    assert.equal(sent.origin, 'JFK');
    assert.equal(sent.destination, 'LAX');
    assert.match(sent.scheduled_departure, /T14:00:00$/); // wall clock of the flight, offset dropped
    assert.equal(sent.origin_weather.precipitation_mm, 6.5);
    const log = await ctx.m.PredictionLog.findOne({}).lean();
    assert.equal(log.source, 'live');
    assert.equal(log.input.flight, 'AA100');
  });

  it('demo mode: mock flight, source mock, demo true', async () => {
    ctx.m.env.AVIATIONSTACK_KEY = '';
    const r = await liveP('UA200');
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'mock');
    assert.equal(r.body.demo, true);
    assert.equal(ctx.ml.last.predict.origin, 'ORD');
  });

  it('works without weather (Open-Meteo down): prediction still returned with the ml warning', async () => {
    ctx.om.mode = 'fail';
    const r = await liveP('AA100');
    assert.equal(r.status, 200);
    assert.equal(r.body.weather.origin, null);
    assert.ok(r.body.prediction.warnings.length > 0);
  });

  it('404 for an unknown flight, 400 for a bad code', async () => {
    assert.equal((await liveP('NF999')).status, 404);
    assert.equal((await liveP('???')).status, 400);
    assert.equal((await ctx.api.post(`${V1}/predictions/live`).send({})).status, 400);
  });
});

describe('rate limiting (logged-in users get more)', () => {
  it('anonymous: limit then 429; logged in: higher limit; budgets are per client', async () => {
    const limited = ctx.createApp({ anon: 3, user: 5 });
    const send = (auth = {}) => limited.post(`${V1}/predictions`).set(auth).send(body());
    const anon = [];
    for (let i = 0; i < 4; i += 1) anon.push((await send()).status);
    assert.deepEqual(anon, [200, 200, 200, 429]);
    const r = await send();
    assert.equal(r.body.error.code, 'RATE_LIMITED');
    assert.ok(r.headers['ratelimit-limit'] || r.headers['ratelimit']);

    const u1 = await newUser(ctx);
    const u2 = await newUser(ctx);
    const codes = [];
    for (let i = 0; i < 6; i += 1) codes.push((await send(u1.auth)).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]); // 5 for a logged-in user
    assert.equal((await send(u2.auth)).status, 200); // another user is unaffected
  });
});

describe('POST /predictions/bulk (CSV)', () => {
  const header = 'airline,origin,destination,scheduled_departure';
  const csv = (rows, h = header) => [h, ...rows].join('\n');
  const upload = (text, auth, name = 'flights.csv', type = 'text/csv') =>
    ctx.api.post(`${V1}/predictions/bulk`).set(auth ?? {}).attach('file', Buffer.from(text), { filename: name, contentType: type });

  it('requires authentication', async () => {
    assert.equal((await upload(csv(['DL,ATL,JFK,2026-12-22T09:00:00']))).status, 401);
  });

  it('predicts valid rows in one batch call and logs them as bulk', async () => {
    const u = await newUser(ctx);
    const r = await upload(csv(['DL,ATL,JFK,2026-12-22T09:00:00', 'UA,ord,sfo,2026-12-22T11:15', 'WN,DEN,LAS,2026-12-23T13:40:00']), u.auth);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.summary, { total: 3, ok: 3, failed: 0 });
    assert.deepEqual(r.body.results.map((x) => x.row), [2, 3, 4]);
    assert.ok(r.body.results.every((x) => x.status === 'ok' && x.prediction.riskLevel));
    assert.equal(ctx.ml.calls.batch, 1);
    assert.equal(ctx.ml.calls.predict, 0);
    assert.equal(ctx.ml.last.batch.items[1].origin, 'ORD'); // normalised
    assert.equal(await ctx.m.PredictionLog.countDocuments({ source: 'bulk', user: u.user.id }), 3);
  });

  it('reports bad rows by line number and still predicts the good ones', async () => {
    const u = await newUser(ctx);
    const r = await upload(csv(['DL,ATL,JFK,2026-12-22T09:00:00', 'DL,ATLANTA,JFK,2026-12-22T09:00:00', 'UA,ORD,SFO,not-a-date', 'WN,DEN,LAS,2026-12-23T13:40:00']), u.auth);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.summary, { total: 4, ok: 2, failed: 2 });
    assert.equal(r.body.results[1].status, 'error');
    assert.equal(r.body.results[1].row, 3);
    assert.match(r.body.results[1].errors[0], /origin/);
    assert.match(r.body.results[2].errors[0], /scheduled_departure/);
    assert.equal(ctx.ml.last.batch.items.length, 2);
  });

  it('maps optional weather and distance columns, tolerates BOM, case and blank cells', async () => {
    const u = await newUser(ctx);
    const h = 'Airline,Origin,Destination,Scheduled_Departure,distance_miles,origin_precipitation_mm,origin_snowfall_cm,dest_temperature_c';
    const text = `\uFEFF${h}\nDL,ATL,JFK,2026-12-22T09:00:00,760,12.5,,-3\n`;
    const r = await upload(text, u.auth);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const item = ctx.ml.last.batch.items[0];
    assert.equal(item.distance_miles, 760);
    assert.deepEqual(item.origin_weather, { precipitation_mm: 12.5 });
    assert.deepEqual(item.dest_weather, { temperature_c: -3 });
  });

  it('rejects structural problems with 400: no file, empty, missing columns, ragged rows, >500 rows, wrong type', async () => {
    const u = await newUser(ctx);
    assert.equal((await ctx.api.post(`${V1}/predictions/bulk`).set(u.auth)).status, 400);
    assert.equal((await upload(header, u.auth)).status, 400); // header only
    const miss = await upload('airline,origin\nDL,ATL', u.auth);
    assert.equal(miss.status, 400);
    assert.match(miss.body.error.message, /destination/);
    assert.equal((await upload(csv(['DL,ATL,JFK']), u.auth)).status, 400); // ragged
    const many = await upload(csv(Array.from({ length: 501 }, () => 'DL,ATL,JFK,2026-12-22T09:00:00')), u.auth);
    assert.equal(many.status, 400);
    assert.match(many.body.error.message, /500/);
    assert.equal((await upload('x', u.auth, 'evil.exe', 'application/octet-stream')).status, 400);
    assert.equal((await upload('x', u.auth, 'data.csv', 'image/png')).status, 400);
    assert.equal(ctx.ml.calls.batch, 0);
  });

  it('accepts exactly 500 rows and rejects an oversized file with 413', async () => {
    const u = await newUser(ctx);
    const ok = await upload(csv(Array.from({ length: 500 }, () => 'DL,ATL,JFK,2026-12-22T09:00:00')), u.auth);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.summary.ok, 500);
    const big = await upload(`${header}\n${'x'.repeat(600 * 1024)}`, u.auth);
    assert.equal(big.status, 413);
  });

  it('a ml-service outage on bulk is a clean 503', async () => {
    const u = await newUser(ctx);
    ctx.ml.mode = 'down';
    assert.equal((await upload(csv(['DL,ATL,JFK,2026-12-22T09:00:00']), u.auth)).status, 503);
  });
});

describe('GET /predictions/history', () => {
  it('needs auth, is private to the caller, paginates and filters by source', async () => {
    assert.equal((await ctx.api.get(`${V1}/predictions/history`)).status, 401);
    const a = await newUser(ctx);
    const b = await newUser(ctx);
    for (let i = 0; i < 5; i += 1) await post(body({ scheduledDeparture: iso(1, `${String(6 + i).padStart(2, '0')}:00:00`) }), a.auth);
    await post(body({ origin: 'ord' }), b.auth);
    await ctx.api.post(`${V1}/predictions/live`).set(a.auth).send({ flight: 'AA100' });

    const p1 = await ctx.api.get(`${V1}/predictions/history`).query({ limit: 4, page: 1 }).set(a.auth);
    assert.equal(p1.status, 200);
    assert.equal(p1.body.total, 6);
    assert.equal(p1.body.pages, 2);
    assert.equal(p1.body.items.length, 4);
    assert.equal(p1.body.items[0].source, 'live'); // newest first
    const p2 = await ctx.api.get(`${V1}/predictions/history`).query({ limit: 4, page: 2 }).set(a.auth);
    assert.equal(p2.body.items.length, 2);
    const manual = await ctx.api.get(`${V1}/predictions/history`).query({ source: 'manual' }).set(a.auth);
    assert.equal(manual.body.total, 5);
    const other = await ctx.api.get(`${V1}/predictions/history`).set(b.auth);
    assert.equal(other.body.total, 1);
    assert.ok(!('user' in p1.body.items[0]));
    assert.equal((await ctx.api.get(`${V1}/predictions/history`).query({ limit: 51 }).set(a.auth)).status, 400);
    assert.equal((await ctx.api.get(`${V1}/predictions/history`).query({ source: 'x' }).set(a.auth)).status, 400);
  });
});
