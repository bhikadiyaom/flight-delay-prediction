import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { boot } from './helpers.js';

let ctx;
const V1 = '/api/v1';
const live = (f) => ctx.api.get(`${V1}/flights/live`).query({ flight: f });

before(async () => { ctx = await boot(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => {
  await ctx.reset();
  ctx.m.env.AVIATIONSTACK_KEY = 'test-av-key';
  ctx.m.env.AVIATIONSTACK_MONTHLY_LIMIT = 100;
});

describe('GET /flights/live: source, cache, normalised keys', () => {
  it('fetches live, then serves from cache; AA100 = aa 100 = AA-100 (one upstream call)', async () => {
    const a = await live('AA100');
    assert.equal(a.status, 200);
    assert.equal(a.body.source, 'live');
    assert.equal(a.body.demo, false);
    assert.equal(a.body.flight.flightIata, 'AA100');
    assert.equal(a.body.flight.origin.iata, 'JFK');
    for (const variant of ['aa 100', 'AA-100', ' aa100 ']) {
      const r = await live(variant);
      assert.equal(r.status, 200, variant);
      assert.equal(r.body.source, 'cache', variant);
    }
    assert.equal(ctx.av.calls, 1);
    assert.equal(ctx.av.keys[0], 'test-av-key');
  });

  it('adds weather for both airports from Open-Meteo in model units', async () => {
    const r = await live('AA100');
    assert.deepEqual(r.body.weather.origin, { temperatureC: 15.5, temperatureMinC: 10.2, precipitationMm: 6.5, windSpeedKmh: 22.1, snowfallCm: 0 });
    assert.deepEqual(r.body.weather.destination, r.body.weather.origin);
    assert.equal(ctx.om.calls, 2);
    assert.equal(ctx.om.last.latitude !== undefined, true);
    await live('AA100');
    assert.equal(ctx.om.calls, 2); // weather cached (30 min)
  });

  it('weather outage does not fail the request: weather is null', async () => {
    ctx.om.mode = 'fail';
    const r = await live('AA100');
    assert.equal(r.status, 200);
    assert.equal(r.body.weather.origin, null);
  });

  it('no AVIATIONSTACK_KEY -> demo (mock) data, flagged, never cached, no upstream call', async () => {
    ctx.m.env.AVIATIONSTACK_KEY = '';
    const r = await live('dl 400');
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'mock');
    assert.equal(r.body.demo, true);
    assert.equal(r.body.flight.demo, true);
    assert.equal(r.body.flight.origin.iata, 'ATL');
    assert.equal(ctx.av.calls, 0);
    assert.equal(await ctx.m.LiveFlightCache.countDocuments({ kind: 'flight' }), 0);
  });

  it('unknown flight: 404 from live API; 404 explaining demo data when live is unavailable', async () => {
    const a = await live('NF999');
    assert.equal(a.status, 404);
    ctx.m.env.AVIATIONSTACK_KEY = '';
    const b = await live('ZZ1234');
    assert.equal(b.status, 404);
    assert.match(b.body.error.message, /demo data/);
  });

  it('validates the flight code', async () => {
    for (const bad of ['', 'x', 'A', '12345678901234', 'AA', 'AA10000', '<script>']) {
      assert.equal((await live(bad)).status, 400, bad);
    }
    assert.equal((await ctx.api.get(`${V1}/flights/live`)).status, 400);
  });
});

describe('quota counter (stop at ~90%) and fallbacks', () => {
  const codes = ['AA100', 'DL400', 'UA200', 'WN500', 'B6623', 'AS3', 'NK300', 'F9800', 'HA11', 'OO5400', 'AA2200', 'DL2500'];

  it('counts every upstream call and stops at 90% of the monthly limit, then serves mock', async () => {
    ctx.m.env.AVIATIONSTACK_MONTHLY_LIMIT = 10; // cap = 9
    const sources = [];
    for (const c of codes) sources.push((await live(c)).body.source);
    assert.deepEqual(sources, [...Array(9).fill('live'), 'mock', 'mock', 'mock']);
    assert.equal(ctx.av.calls, 9);
    const q = await ctx.m.ApiQuota.findOne({});
    assert.equal(q.used, 9);
    assert.equal(q.limit, 10);
    assert.match(q.month, /^\d{4}-\d{2}$/);
  });

  it('is atomic under concurrency (never exceeds the cap)', async () => {
    ctx.m.env.AVIATIONSTACK_MONTHLY_LIMIT = 10;
    await Promise.all(codes.map((c) => live(c)));
    assert.equal(ctx.av.calls, 9);
    assert.equal((await ctx.m.ApiQuota.findOne({})).used, 9);
  });

  it('AviationStack error body (usage_limit_reached) falls back to mock', async () => {
    ctx.av.mode = 'error-body';
    const r = await live('AA100');
    assert.equal(r.body.source, 'mock');
  });

  it('stale-if-error: an expired cache entry is served before mock when upstream fails', async () => {
    const first = await live('AA100');
    assert.equal(first.body.source, 'live');
    await ctx.m.LiveFlightCache.updateOne({ key: 'flight:AA100' }, { $set: { freshUntil: new Date(Date.now() - 1000) } });
    ctx.av.mode = 'fail';
    const r = await live('AA100');
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'cache');
    assert.equal(r.body.stale, true);
    assert.equal(r.body.demo, false);
    assert.equal(r.body.flight.flightIata, 'AA100');
  });

  it('expired entry + healthy upstream refreshes (source live again)', async () => {
    await live('AA100');
    await ctx.m.LiveFlightCache.updateOne({ key: 'flight:AA100' }, { $set: { freshUntil: new Date(Date.now() - 1000) } });
    const r = await live('AA100');
    assert.equal(r.body.source, 'live');
    assert.equal(ctx.av.calls, 2);
  });

  it('upstream failure with nothing cached -> mock', async () => {
    ctx.av.mode = 'fail';
    const r = await live('AA100');
    assert.equal(r.body.source, 'mock');
  });

  it('never leaks the API key into responses', async () => {
    ctx.av.mode = 'fail';
    const r = await live('AA100');
    assert.ok(!JSON.stringify(r.body).includes('test-av-key'));
  });
});

describe('cache entries', () => {
  it('stores kind, freshUntil (5 min) and a later expiresAt, and the TTL index exists', async () => {
    await live('AA100');
    const doc = await ctx.m.LiveFlightCache.findOne({ key: 'flight:AA100' }).lean();
    assert.equal(doc.kind, 'flight');
    const fresh = (doc.freshUntil - doc.fetchedAt) / 1000;
    assert.ok(Math.abs(fresh - 300) < 2, `fresh ttl ${fresh}`);
    assert.ok(doc.expiresAt > doc.freshUntil);
    const idx = await ctx.m.LiveFlightCache.collection.indexes();
    assert.ok(idx.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0), 'TTL index on expiresAt');
    assert.ok(idx.some((i) => i.key.key === 1 && i.unique), 'unique index on key');
    const w = await ctx.m.LiveFlightCache.findOne({ kind: 'weather' }).lean();
    assert.ok(Math.abs((w.freshUntil - w.fetchedAt) / 1000 - 1800) < 2); // weather 30 min
  });

  it('concurrent identical misses share one upstream call (single flight)', async () => {
    await Promise.all(Array.from({ length: 8 }, () => live('UA200')));
    assert.equal(ctx.av.calls, 1);
  });
});

describe('GET /flights/live/route', () => {
  it('lists upcoming flights (landed ones filtered), caches, and normalises codes', async () => {
    const r = await ctx.api.get(`${V1}/flights/live/route`).query({ origin: 'jfk', destination: 'lax' });
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'live');
    assert.deepEqual(r.body.flights.map((f) => f.flightIata), ['AA100', 'DL400']);
    assert.equal(ctx.av.last.dep_iata, 'JFK');
    const again = await ctx.api.get(`${V1}/flights/live/route`).query({ origin: 'JFK', destination: 'LAX' });
    assert.equal(again.body.source, 'cache');
    assert.equal(ctx.av.calls, 1);
  });

  it('demo data without a key, sorted by departure', async () => {
    ctx.m.env.AVIATIONSTACK_KEY = '';
    const r = await ctx.api.get(`${V1}/flights/live/route`).query({ origin: 'JFK', destination: 'LAX' });
    assert.equal(r.body.source, 'mock');
    assert.deepEqual(r.body.flights.map((f) => f.flightIata), ['B6623', 'AA100']); // 07:45 before 08:00
  });

  it('validates airports', async () => {
    assert.equal((await ctx.api.get(`${V1}/flights/live/route`).query({ origin: 'JFKX', destination: 'LAX' })).status, 400);
    assert.equal((await ctx.api.get(`${V1}/flights/live/route`).query({ origin: 'JFK' })).status, 400);
  });
});

describe('GET /flights/historical and /flights/airports', () => {
  it('maps parameters to the ml-service, caches, and requires origin or dest', async () => {
    const r = await ctx.api.get(`${V1}/flights/historical`).query({ origin: 'atl', dest: 'jfk', date: '2023-07-04', airline: 'DL', limit: 10 });
    assert.equal(r.status, 200);
    assert.deepEqual(ctx.ml.last.historical, { origin: 'ATL', dest: 'JFK', date: '2023-07-04', airline: 'DL', limit: '10' });
    assert.equal(r.body.cached, false);
    const again = await ctx.api.get(`${V1}/flights/historical`).query({ origin: 'ATL', dest: 'JFK', date: '2023-07-04', airline: 'DL', limit: 10 });
    assert.equal(again.body.cached, true);
    assert.equal(ctx.ml.calls.historical, 1);
    for (const bad of [{}, { airline: 'DL' }, { origin: 'ATL', date: '2023-13-45' }, { origin: 'ATL', limit: 9999 }, { origin: "A'; DROP" }]) {
      assert.equal((await ctx.api.get(`${V1}/flights/historical`).query(bad)).status, 400, JSON.stringify(bad));
    }
  });

  it('autocompletes airports by code, city and name', async () => {
    const by = async (q) => (await ctx.api.get(`${V1}/flights/airports`).query({ q })).body.airports.map((a) => a.iata);
    assert.deepEqual((await by('chi')), ['ORD']);
    assert.equal((await by('jfk'))[0], 'JFK');
    assert.deepEqual((await by('new york')).sort(), ['JFK', 'LGA']);
    assert.equal((await by('')).length, 6);
    assert.deepEqual(await by('zzzz'), []);
    assert.equal(ctx.ml.calls.airports, 1); // memoised
  });
});
