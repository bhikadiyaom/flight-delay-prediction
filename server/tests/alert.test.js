import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { boot, newUser } from './helpers.js';

let ctx;
let alerts;
let job;
const mails = [];

before(async () => {
  ctx = await boot();
  alerts = await import('../src/services/alertService.js');
  job = await import('../src/jobs/riskAlertJob.js');
  alerts.setTransport({ sendMail: async (m) => { mails.push(m); return { message: '{}' }; } });
});
after(async () => { await ctx.stop(); });
beforeEach(async () => {
  await ctx.reset();
  mails.length = 0;
  ctx.m.env.AVIATIONSTACK_KEY = '';
});

const make = async (over = {}, user) => {
  const u = user ?? (await newUser(ctx));
  const s = await ctx.m.SavedSearch.create({ user: u.user.id, type: 'flight', label: 'Morning flight', flightNumber: 'AA100', alert: { enabled: true, threshold: 0.2 }, ...over });
  return { u, s };
};

describe('risk alerts', () => {
  it('emails when the probability crosses the threshold and the risk level changed, then stays quiet', async () => {
    const { u, s } = await make();
    const first = await alerts.evaluateAlerts();
    assert.deepEqual(first, { checked: 1, notified: 1, skipped: 0, errors: 0 });
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, u.body.email);
    assert.match(mails[0].subject, /Delay risk MEDIUM/);
    assert.match(mails[0].text, /AA100/);
    assert.match(mails[0].text, /demo flight data/);
    const stored = await ctx.m.SavedSearch.findById(s._id);
    assert.equal(stored.alert.lastRiskLevel, 'medium');
    assert.ok(stored.alert.lastNotifiedAt);

    const second = await alerts.evaluateAlerts(); // same level: no repeat email
    assert.equal(second.notified, 0);
    assert.equal(mails.length, 1);

    await ctx.m.SavedSearch.updateOne({ _id: s._id }, { $set: { 'alert.lastRiskLevel': 'low' } }); // level changed since last check
    assert.equal((await alerts.evaluateAlerts()).notified, 1);
    assert.equal(mails.length, 2);
  });

  it('does not email below the user\'s threshold, but still records the level', async () => {
    const { s } = await make({ alert: { enabled: true, threshold: 0.9 } });
    const r = await alerts.evaluateAlerts();
    assert.equal(r.notified, 0);
    assert.equal((await ctx.m.SavedSearch.findById(s._id)).alert.lastRiskLevel, 'medium');
  });

  it('skips disabled alerts, airport searches, users who turned alerts off, and unknown flights', async () => {
    await make({ alert: { enabled: false } });
    await make({ type: 'airport', origin: 'ORD', flightNumber: undefined });
    const off = await newUser(ctx);
    await ctx.m.User.updateOne({ _id: off.user.id }, { $set: { 'preferences.alertsEnabled': false } });
    await make({}, off);
    await make({ flightNumber: 'ZZ1234' });
    const r = await alerts.evaluateAlerts();
    assert.equal(r.notified, 0);
    assert.equal(mails.length, 0);
    assert.equal(r.checked, 1); // only the unknown flight was attempted, and it errored cleanly
    assert.equal(r.errors, 1);
  });

  it('evaluates route searches via the next upcoming flight on the route', async () => {
    await make({ type: 'route', origin: 'JFK', destination: 'LAX', flightNumber: undefined });
    const r = await alerts.evaluateAlerts();
    assert.equal(r.notified, 1);
    assert.match(mails[0].text, /B6623|AA100/);
  });

  it('a failing prediction service is counted as an error, never thrown', async () => {
    await make();
    ctx.ml.mode = 'down';
    const r = await alerts.evaluateAlerts();
    assert.deepEqual(r, { checked: 1, notified: 0, skipped: 0, errors: 1 });
  });

  it('the scheduled job runs one pass at a time and returns the summary', async () => {
    await make();
    const [a, b] = await Promise.all([job.runOnce(), job.runOnce()]);
    assert.ok((a === null) !== (b === null)); // second concurrent call is a no-op
    assert.equal((a ?? b).notified, 1);
  });
});
