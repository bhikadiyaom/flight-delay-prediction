import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { boot, newUser } from './helpers.js';

let ctx;
const V1 = '/api/v1';

before(async () => { ctx = await boot(); });
after(async () => { await ctx.stop(); });

describe('register', () => {
  it('creates an account, returns a token and a public user (no password hash)', async () => {
    const r = await ctx.api.post(`${V1}/auth/register`).send({ name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'Analytical1' });
    assert.equal(r.status, 201);
    assert.ok(r.body.token.split('.').length === 3);
    assert.equal(r.body.user.email, 'ada@example.com'); // lower-cased
    assert.equal(r.body.user.role, 'user');
    assert.equal(r.body.user.preferences.theme, 'system');
    assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
    const stored = await ctx.m.User.findOne({ email: 'ada@example.com' }).select('+passwordHash');
    assert.match(stored.passwordHash, /^\$2[aby]\$/); // bcrypt, never plaintext
  });

  it('rejects duplicate emails (case-insensitive) with 409', async () => {
    const r = await ctx.api.post(`${V1}/auth/register`).send({ name: 'Ada Two', email: 'ADA@example.com', password: 'Analytical1' });
    assert.equal(r.status, 409);
  });

  it('validates input', async () => {
    const bad = [
      { name: 'A', email: 'a@example.com', password: 'Password1' },
      { name: 'Valid Name', email: 'not-an-email', password: 'Password1' },
      { name: 'Valid Name', email: 'v@example.com', password: 'short1' },
      { name: 'Valid Name', email: 'v@example.com', password: 'allletters' },
      { name: 'Valid Name', email: 'v@example.com', password: '12345678' },
      { name: 'Valid Name', email: 'v@example.com', password: 'x1'.repeat(40) },
      {},
    ];
    for (const b of bad) {
      const r = await ctx.api.post(`${V1}/auth/register`).send(b);
      assert.equal(r.status, 400, JSON.stringify(b));
      assert.equal(r.body.error.message, 'Validation failed');
    }
  });

  it('is not vulnerable to NoSQL operator injection', async () => {
    const r = await ctx.api.post(`${V1}/auth/login`).send({ email: { $gt: '' }, password: { $gt: '' } });
    assert.equal(r.status, 400);
  });

  it('makes ADMIN_EMAILS accounts admins', async () => {
    ctx.m.env.adminEmails.push('boss@example.com');
    const r = await ctx.api.post(`${V1}/auth/register`).send({ name: 'The Boss', email: 'boss@example.com', password: 'Password123' });
    assert.equal(r.body.user.role, 'admin');
  });

  it('does not let a client choose its own role', async () => {
    const r = await ctx.api.post(`${V1}/auth/register`).send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'Password123', role: 'admin' });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'user');
  });
});

describe('login', () => {
  it('logs in and updates lastLoginAt', async () => {
    const r = await ctx.api.post(`${V1}/auth/login`).send({ email: 'ada@example.com', password: 'Analytical1' });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.ok(r.body.user.lastLoginAt);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const a = await ctx.api.post(`${V1}/auth/login`).send({ email: 'ada@example.com', password: 'WrongPass1' });
    const b = await ctx.api.post(`${V1}/auth/login`).send({ email: 'nobody@example.com', password: 'WrongPass1' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body); // no account enumeration
  });

  it('issues a 12h HS256 token whose subject is the user id', async () => {
    const u = await newUser(ctx);
    const p = jwt.decode(u.token);
    assert.equal(p.sub, u.user.id);
    assert.equal(p.exp - p.iat, 12 * 3600);
    assert.equal(jwt.decode(u.token, { complete: true }).header.alg, 'HS256');
  });

  it('has no refresh or logout endpoints (Decision 2)', async () => {
    assert.equal((await ctx.api.post(`${V1}/auth/refresh`)).status, 404);
    assert.equal((await ctx.api.post(`${V1}/auth/logout`)).status, 404);
  });
});

describe('protected routes and tokens', () => {
  it('GET /users/me needs a valid token', async () => {
    const u = await newUser(ctx);
    const ok = await ctx.api.get(`${V1}/users/me`).set(u.auth);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, u.body.email);
    assert.equal((await ctx.api.get(`${V1}/users/me`)).status, 401);
    assert.equal((await ctx.api.get(`${V1}/users/me`).set('Authorization', 'Basic abc')).status, 401);
  });

  it('rejects tampered, expired, wrong-secret and alg=none tokens', async () => {
    const u = await newUser(ctx);
    const tampered = u.token.slice(0, -3) + (u.token.endsWith('aaa') ? 'bbb' : 'aaa');
    assert.equal((await ctx.api.get(`${V1}/users/me`).set('Authorization', `Bearer ${tampered}`)).status, 401);

    const expired = jwt.sign({ role: 'user' }, 'j'.repeat(48), { subject: u.user.id, expiresIn: -10 });
    const e = await ctx.api.get(`${V1}/users/me`).set('Authorization', `Bearer ${expired}`);
    assert.equal(e.status, 401);
    assert.equal(e.body.error.code, 'TOKEN_EXPIRED');

    const foreign = jwt.sign({ role: 'admin' }, 'z'.repeat(48), { subject: u.user.id });
    assert.equal((await ctx.api.get(`${V1}/users/me`).set('Authorization', `Bearer ${foreign}`)).status, 401);

    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: u.user.id, role: 'admin' })).toString('base64url')}.`;
    assert.equal((await ctx.api.get(`${V1}/users/me`).set('Authorization', `Bearer ${none}`)).status, 401);
  });

  it('a token for a deleted account stops working; role comes from the DB, not the token', async () => {
    const u = await newUser(ctx);
    const forgedRole = jwt.sign({ role: 'admin' }, 'j'.repeat(48), { subject: u.user.id });
    assert.equal((await ctx.api.get(`${V1}/admin/stats`).set('Authorization', `Bearer ${forgedRole}`)).status, 403);
    await ctx.m.User.deleteOne({ _id: u.user.id });
    assert.equal((await ctx.api.get(`${V1}/users/me`).set(u.auth)).status, 401);
  });

  it('PATCH /users/me updates name and preferences, and validates', async () => {
    const u = await newUser(ctx);
    const r = await ctx.api.patch(`${V1}/users/me`).set(u.auth).send({ name: 'New Name', preferences: { theme: 'dark', alertsEnabled: false } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'New Name');
    assert.deepEqual(r.body.user.preferences, { theme: 'dark', alertsEnabled: false });
    const partial = await ctx.api.patch(`${V1}/users/me`).set(u.auth).send({ preferences: { theme: 'light' } });
    assert.equal(partial.body.user.preferences.alertsEnabled, false); // untouched
    for (const bad of [{}, { preferences: { theme: 'neon' } }, { name: 'x' }]) {
      assert.equal((await ctx.api.patch(`${V1}/users/me`).set(u.auth).send(bad)).status, 400);
    }
    // cannot escalate privileges through the profile endpoint
    const esc = await ctx.api.patch(`${V1}/users/me`).set(u.auth).send({ name: 'Still User', role: 'admin' });
    assert.equal(esc.body.user.role, 'user');
  });
});

describe('platform hardening', () => {
  it('sets security headers and hides x-powered-by', async () => {
    const r = await ctx.api.get(`${V1}/health`);
    assert.equal(r.headers['x-powered-by'], undefined);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  });

  it('CORS allows only listed origins', async () => {
    const ok = await ctx.api.get(`${V1}/health`).set('Origin', 'http://localhost:5173');
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
    const bad = await ctx.api.get(`${V1}/health`).set('Origin', 'https://evil.example');
    assert.equal(bad.headers['access-control-allow-origin'], undefined);
  });

  it('answers unknown routes and malformed JSON with JSON errors', async () => {
    const nf = await ctx.api.get(`${V1}/nope`);
    assert.equal(nf.status, 404);
    assert.equal(nf.body.error.code, 'NOT_FOUND');
    const bad = await ctx.api.post(`${V1}/auth/login`).set('Content-Type', 'application/json').send('{"email":');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_JSON');
  });

  it('rate-limits login/register per IP (brute-force protection)', async () => {
    const limited = ctx.createApp({ auth: 3 });
    const codes = [];
    for (let i = 0; i < 5; i += 1) codes.push((await limited.post(`${V1}/auth/login`).send({ email: 'x@example.com', password: 'Whatever1' })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  });
});
