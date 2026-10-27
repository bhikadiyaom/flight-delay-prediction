import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { boot } from './helpers.js';

let ctx;
const V1 = '/api/v1/analytics';

before(async () => { ctx = await boot(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

describe('analytics proxy + 24h cache (kind analytics)', () => {
  it('overview is public, cached for 24 h (one ml call), and flagged as cached', async () => {
    const a = await ctx.api.get(`${V1}/overview`);
    assert.equal(a.status, 200);
    assert.equal(a.body.totals.flights, 123);
    assert.equal(a.body.cached, false);
    const b = await ctx.api.get(`${V1}/overview`);
    assert.equal(b.body.cached, true);
    assert.equal(ctx.ml.calls.overview, 1);
    const doc = await ctx.m.LiveFlightCache.findOne({ key: 'analytics:overview' }).lean();
    assert.equal(doc.kind, 'analytics');
    assert.ok(Math.abs((doc.freshUntil - doc.fetchedAt) / 3600000 - 24) < 0.01);
  });

  it('stale-if-error: serves the expired aggregate when the ml-service is down; 503 when nothing is cached', async () => {
    assert.equal((await (ctx.ml.mode = 'down', ctx.api.get(`${V1}/overview`))).status, 503);
    ctx.ml.mode = 'ok';
    await ctx.api.get(`${V1}/overview`);
    await ctx.m.LiveFlightCache.updateOne({ key: 'analytics:overview' }, { $set: { freshUntil: new Date(Date.now() - 1000) } });
    ctx.ml.mode = 'down';
    const r = await ctx.api.get(`${V1}/overview`);
    assert.equal(r.status, 200);
    assert.equal(r.body.stale, true);
  });

  it('trends: validated and forwarded, separate cache entry per filter set', async () => {
    const a = await ctx.api.get(`${V1}/trends`).query({ granularity: 'month', origin: 'atl' });
    assert.equal(a.status, 200);
    assert.deepEqual(ctx.ml.last.trends, { granularity: 'month', origin: 'ATL' });
    await ctx.api.get(`${V1}/trends`).query({ granularity: 'week' });
    assert.equal(await ctx.m.LiveFlightCache.countDocuments({ key: /^analytics:trends:/ }), 2);
    assert.equal((await ctx.api.get(`${V1}/trends`).query({ granularity: 'year' })).status, 400);
    assert.equal((await ctx.api.get(`${V1}/trends`).query({ origin: 'ATLANTA' })).status, 400);
  });

  it('risk-map and models/compare are public; risk-map validates minFlights', async () => {
    assert.equal((await ctx.api.get(`${V1}/risk-map`)).status, 200);
    assert.equal((await ctx.api.get(`${V1}/risk-map`).query({ minFlights: 5 })).status, 400);
    const c = await ctx.api.get(`${V1}/models/compare`);
    assert.equal(c.status, 200);
    assert.equal(c.body.production_model, 'xgboost');
    await ctx.api.get(`${V1}/models/compare`);
    assert.equal(ctx.ml.calls.compare, 1);
  });
});

describe('GET /health', () => {
  it('ok when db and ml-service are up', async () => {
    const r = await ctx.api.get('/api/v1/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.db.connected, true);
    assert.deepEqual(r.body.ml, { reachable: true, modelVersion: 'vtest', analyticsAvailable: true });
  });

  it('degraded (still 200) when the ml-service is unreachable', async () => {
    ctx.ml.mode = 'down';
    const r = await ctx.api.get('/api/v1/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'degraded');
    assert.equal(r.body.ml.reachable, false);
  });
});
