import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { boot, newUser } from './helpers.js';

let ctx;
let me;
let other;
const V1 = '/api/v1/saved-searches';

before(async () => { ctx = await boot(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => {
  await ctx.reset();
  me = await newUser(ctx);
  other = await newUser(ctx);
});

const route = (over = {}) => ({ type: 'route', label: 'NYC to LA', origin: 'jfk', destination: 'lax', ...over });

describe('saved searches CRUD', () => {
  it('requires authentication on every method', async () => {
    assert.equal((await ctx.api.get(V1)).status, 401);
    assert.equal((await ctx.api.post(V1).send(route())).status, 401);
    assert.equal((await ctx.api.patch(`${V1}/${'a'.repeat(24)}`).send({ label: 'x' })).status, 401);
    assert.equal((await ctx.api.delete(`${V1}/${'a'.repeat(24)}`)).status, 401);
  });

  it('creates with normalised codes and default alert settings', async () => {
    const r = await ctx.api.post(V1).set(me.auth).send(route());
    assert.equal(r.status, 201);
    assert.equal(r.body.item.origin, 'JFK');
    assert.equal(r.body.item.destination, 'LAX');
    assert.deepEqual({ enabled: r.body.item.alert.enabled, threshold: r.body.item.alert.threshold }, { enabled: false, threshold: 0.5 });
    assert.equal(r.body.item.isFavorite, false);
    assert.ok(!('user' in r.body.item) && !('_id' in r.body.item) && r.body.item.id);
  });

  it('validates per type', async () => {
    const bad = [
      route({ origin: undefined }), route({ destination: undefined }), route({ label: '' }), route({ origin: 'JF' }),
      { type: 'flight', label: 'x' }, { type: 'flight', label: 'x', flightNumber: '!!' }, { type: 'airport', label: 'x' },
      { type: 'airport', label: 'x', origin: 'ORD', alert: { enabled: true } }, { type: 'other', label: 'x' },
      route({ alert: { threshold: 0.99 } }), route({ alert: { threshold: 0.01 } }), route({ alert: { bogus: 1 } }),
    ];
    for (const b of bad) assert.equal((await ctx.api.post(V1).set(me.auth).send(b)).status, 400, JSON.stringify(b));
    const ok = await ctx.api.post(V1).set(me.auth).send({ type: 'flight', label: 'My flight', flightNumber: 'aa 100', alert: { enabled: true, threshold: 0.3 } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.item.flightNumber, 'AA100');
    assert.equal(ok.body.item.alert.enabled, true);
    assert.equal((await ctx.api.post(V1).set(me.auth).send({ type: 'airport', label: 'ORD', origin: 'ord' })).status, 201);
  });

  it('lists only the caller\'s searches, favourites first, with filters', async () => {
    await ctx.api.post(V1).set(me.auth).send(route({ label: 'plain' }));
    await ctx.api.post(V1).set(me.auth).send(route({ label: 'fav', isFavorite: true }));
    await ctx.api.post(V1).set(me.auth).send({ type: 'flight', label: 'flt', flightNumber: 'DL400' });
    await ctx.api.post(V1).set(other.auth).send(route({ label: 'not mine' }));
    const all = await ctx.api.get(V1).set(me.auth);
    assert.deepEqual(all.body.items.map((i) => i.label), ['fav', 'flt', 'plain']);
    assert.equal((await ctx.api.get(V1).query({ type: 'flight' }).set(me.auth)).body.items.length, 1);
    assert.equal((await ctx.api.get(V1).query({ favorite: 'true' }).set(me.auth)).body.items.length, 1);
    assert.equal((await ctx.api.get(V1).query({ favorite: 'maybe' }).set(me.auth)).status, 400);
  });

  it('patches label, favourite and alert; unknown/forbidden fields are rejected', async () => {
    const { body } = await ctx.api.post(V1).set(me.auth).send(route());
    const id = body.item.id;
    const r = await ctx.api.patch(`${V1}/${id}`).set(me.auth).send({ label: 'Renamed', isFavorite: true, alert: { enabled: true, threshold: 0.4 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.item.label, 'Renamed');
    assert.equal(r.body.item.isFavorite, true);
    assert.deepEqual({ e: r.body.item.alert.enabled, t: r.body.item.alert.threshold }, { e: true, t: 0.4 });
    for (const bad of [{}, { user: other.user.id }, { type: 'flight' }, { alert: { threshold: 5 } }, { origin: 'ORD' }]) {
      assert.equal((await ctx.api.patch(`${V1}/${id}`).set(me.auth).send(bad)).status, 400, JSON.stringify(bad));
    }
  });

  it('changing an alert resets lastRiskLevel so it is evaluated from scratch', async () => {
    const { body } = await ctx.api.post(V1).set(me.auth).send(route({ alert: { enabled: true } }));
    await ctx.m.SavedSearch.updateOne({ _id: body.item.id }, { $set: { 'alert.lastRiskLevel': 'high' } });
    await ctx.api.patch(`${V1}/${body.item.id}`).set(me.auth).send({ alert: { threshold: 0.7 } });
    assert.equal((await ctx.m.SavedSearch.findById(body.item.id)).alert.lastRiskLevel, null);
  });

  it('deletes (204) and then 404s', async () => {
    const { body } = await ctx.api.post(V1).set(me.auth).send(route());
    assert.equal((await ctx.api.delete(`${V1}/${body.item.id}`).set(me.auth)).status, 204);
    assert.equal((await ctx.api.delete(`${V1}/${body.item.id}`).set(me.auth)).status, 404);
  });

  it('other users cannot read, edit or delete it: they get 404, same as a missing id', async () => {
    const { body } = await ctx.api.post(V1).set(me.auth).send(route());
    const id = body.item.id;
    assert.equal((await ctx.api.patch(`${V1}/${id}`).set(other.auth).send({ label: 'hijack' })).status, 404);
    assert.equal((await ctx.api.delete(`${V1}/${id}`).set(other.auth)).status, 404);
    assert.equal((await ctx.m.SavedSearch.findById(id)).label, 'NYC to LA');
    assert.equal((await ctx.api.get(V1).set(other.auth)).body.items.length, 0);
  });

  it('bad ids are 400, never a crash', async () => {
    for (const id of ['abc', '123', '{"$ne":1}', 'g'.repeat(24)]) {
      assert.equal((await ctx.api.delete(`${V1}/${encodeURIComponent(id)}`).set(me.auth)).status, 400, id);
    }
  });

  it('caps a user at 50 saved searches', async () => {
    await ctx.m.SavedSearch.insertMany(Array.from({ length: 50 }, (_, i) => ({ user: me.user.id, type: 'airport', label: `a${i}`, origin: 'ORD' })));
    const r = await ctx.api.post(V1).set(me.auth).send(route());
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /50/);
    assert.equal((await ctx.api.post(V1).set(other.auth).send(route())).status, 201);
  });
});
