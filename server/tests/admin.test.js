import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { boot, iso, newUser } from './helpers.js';

let ctx;
let admin;
let user;
const V1 = '/api/v1/admin';

before(async () => {
  ctx = await boot();
});
after(async () => { await ctx.stop(); });
beforeEach(async () => {
  await ctx.reset();
  await ctx.m.ModelMetricSnapshot.deleteMany({});
  await ctx.m.User.deleteMany({});
  if (!ctx.m.env.adminEmails.includes('root@example.com')) ctx.m.env.adminEmails.push('root@example.com');
  admin = await newUser(ctx, { email: 'root@example.com' });
  user = await newUser(ctx);
  ctx.m.env.AVIATIONSTACK_KEY = '';
});

const predict = (auth, over = {}) => ctx.api.post('/api/v1/predictions').set(auth ?? {}).send({
  airline: 'DL', origin: 'ATL', destination: 'JFK', scheduledDeparture: iso(1), originWeather: { precipitationMm: 0 }, ...over });

describe('access control', () => {
  it('401 without a token, 403 for a normal user, 200 for an admin on every admin route', async () => {
    const routes = [['get', '/metrics'], ['get', '/predictions'], ['get', '/stats'], ['post', '/metrics/refresh']];
    for (const [m, p] of routes) {
      assert.equal((await ctx.api[m](`${V1}${p}`)).status, 401, p);
      assert.equal((await ctx.api[m](`${V1}${p}`).set(user.auth)).status, 403, p);
      assert.equal((await ctx.api[m](`${V1}${p}`).set(admin.auth)).status, 200, p);
    }
  });
});

describe('GET /admin/stats', () => {
  it('summarises users, predictions, latency, quota and cache', async () => {
    await predict(null);
    await predict(user.auth, { origin: 'ORD' });
    await predict(user.auth, { origin: 'ORD' }); // cache hit
    await ctx.api.post('/api/v1/predictions/live').set(user.auth).send({ flight: 'AA100' });
    const r = await ctx.api.get(`${V1}/stats`).set(admin.auth);
    assert.equal(r.body.users.total, 2);
    assert.equal(r.body.users.admins, 1);
    assert.equal(r.body.predictions.total, 4);
    assert.equal(r.body.predictions.last24h, 4);
    assert.deepEqual(r.body.predictions.bySource, { manual: 3, live: 1 });
    assert.equal(r.body.predictions.byModelVersion.vtest, 4);
    assert.ok(r.body.predictions.byRiskLevel.low >= 1);
    assert.ok(r.body.performance.cachedShare > 0);
    assert.equal(r.body.aviationStackQuota.limit, 100);
    assert.equal(r.body.aviationStackQuota.stopsAt, 90);
    assert.ok(r.body.cache.some((c) => c.kind === 'prediction'));
  });
});

describe('GET /admin/predictions', () => {
  it('lists all users\' logs with filters and pagination, including who made them', async () => {
    await predict(null);
    await predict(user.auth, { origin: 'ORD' });
    await ctx.api.post('/api/v1/predictions/live').set(user.auth).send({ flight: 'AA100' });
    const all = await ctx.api.get(`${V1}/predictions`).set(admin.auth);
    assert.equal(all.body.total, 3);
    assert.equal(all.body.items.find((i) => i.source === 'live').user.email, user.body.email);
    assert.equal((await ctx.api.get(`${V1}/predictions`).query({ source: 'live' }).set(admin.auth)).body.total, 1);
    assert.equal((await ctx.api.get(`${V1}/predictions`).query({ user: user.user.id }).set(admin.auth)).body.total, 2);
    assert.equal((await ctx.api.get(`${V1}/predictions`).query({ riskLevel: 'high' }).set(admin.auth)).body.total, 0);
    const future = new Date(Date.now() + 864e5).toISOString();
    assert.equal((await ctx.api.get(`${V1}/predictions`).query({ from: future }).set(admin.auth)).body.total, 0);
    const page = await ctx.api.get(`${V1}/predictions`).query({ limit: 2, page: 2 }).set(admin.auth);
    assert.equal(page.body.items.length, 1);
    for (const bad of [{ limit: 500 }, { source: 'zzz' }, { user: 'nope' }, { from: 'yesterday' }]) {
      assert.equal((await ctx.api.get(`${V1}/predictions`).query(bad).set(admin.auth)).status, 400, JSON.stringify(bad));
    }
  });
});

describe('model metrics snapshots', () => {
  it('refresh pulls from the ml-service, maps names, is idempotent, and marks the production models', async () => {
    const r = await ctx.api.post(`${V1}/metrics/refresh`).set(admin.auth);
    assert.deepEqual({ v: r.body.version, n: r.body.upserted }, { v: 'vtest', n: 3 });
    await ctx.api.post(`${V1}/metrics/refresh`).set(admin.auth);
    assert.equal(await ctx.m.ModelMetricSnapshot.countDocuments(), 3); // upsert, no duplicates
    const all = await ctx.api.get(`${V1}/metrics`).set(admin.auth);
    const xgb = all.body.items.find((i) => i.modelName === 'xgboost' && i.task === 'classifier');
    assert.equal(xgb.isProduction, true);
    assert.equal(xgb.metrics.rocAuc, 0.66);
    assert.equal(xgb.target, 'delay');
    assert.deepEqual(xgb.confusionMatrix, [[1, 2], [3, 4]]);
    const reg = all.body.items.find((i) => i.task === 'regressor');
    assert.equal(reg.metrics.mae, 35.9);
    const prod = await ctx.api.get(`${V1}/metrics`).query({ production: 'true' }).set(admin.auth);
    assert.equal(prod.body.items.length, 2);
  });

  it('marks older versions as not production and busts the public comparison cache', async () => {
    await ctx.m.ModelMetricSnapshot.create({ modelName: 'xgboost', task: 'classifier', target: 'delay', version: 'vold', isProduction: true });
    await ctx.api.get('/api/v1/analytics/models/compare'); // fills the cache
    assert.equal(await ctx.m.LiveFlightCache.countDocuments({ key: 'models:compare' }), 1);
    await ctx.api.post(`${V1}/metrics/refresh`).set(admin.auth);
    assert.equal((await ctx.m.ModelMetricSnapshot.findOne({ version: 'vold' })).isProduction, false);
    assert.equal(await ctx.m.LiveFlightCache.countDocuments({ key: 'models:compare' }), 0);
  });

  it('refresh reports a clean 503 when the ml-service is down', async () => {
    ctx.ml.mode = 'down';
    assert.equal((await ctx.api.post(`${V1}/metrics/refresh`).set(admin.auth)).status, 503);
  });
});
