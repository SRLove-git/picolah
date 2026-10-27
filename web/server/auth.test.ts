import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_REQUIRED = 'true';
process.env.PICOLAH_DB_PATH = ':memory:';

const { app } = await import('./index.ts');
const { recordOfferClick } = await import('./profile.ts');
const server = await new Promise<import('node:http').Server>((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;

after(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);

function cookieFrom(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'expected a session cookie');
  return cookie.split(';')[0];
}

async function requestCode(email: string, purpose: 'register' | 'reset' = 'register') {
  const response = await fetch(`${baseUrl}/api/auth/email-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, purpose }),
  });
  if (response.status !== 200) return { response, code: '' };
  const body = (await response.json()) as { devCode?: string };
  return { response, code: body.devCode || '' };
}

async function register(email: string, password = 'correct horse 9') {
  const { code } = await requestCode(email, 'register');
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, code: code || '000000', displayName: 'Test Pico' }),
  });
}

test('registers, authenticates and logs out with an http-only session', async () => {
  const email = `profile-${Date.now()}@example.com`;
  const created = await register(email);
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as { user: { id: string; email: string }; required: boolean };
  assert.equal(createdBody.required, true);
  assert.equal(createdBody.user.email, email);
  assert.equal('password_hash' in createdBody.user, false);

  const cookie = cookieFrom(created);
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  const session = (await me.json()) as { user: { email: string } | null };
  assert.equal(session.user?.email, email);

  const duplicate = await register(email);
  assert.equal(duplicate.status, 409);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 200);
  const afterLogout = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
  const afterBody = (await afterLogout.json()) as { user: null };
  assert.equal(afterBody.user, null);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse 9' }),
  });
  assert.equal(login.status, 200);
  cookieFrom(login);
});

test('rejects invalid credentials and short passwords', async () => {
  const email = `invalid-${Date.now()}@example.com`;
  const short = await register(email, 'short');
  assert.equal(short.status, 422);

  const missing = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong password' }),
  });
  assert.equal(missing.status, 401);
});

test('keeps public routes open while account data asks for sign-in', async () => {
  for (const path of ['/api/conversations', '/api/catalog', '/api/reels']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `${path} should stay open to guests`);
  }

  for (const path of ['/api/watchlist', '/api/alerts', '/api/account/export']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, `${path} should require an account`);
  }
});

test('merges the anonymous shopping profile into the new account', async () => {
  const anonymous = `anon-${Date.now()}`;
  recordOfferClick(anonymous, {
    type: 'offer_click',
    market: 'SG',
    platformId: 'shopee',
    price: 29.9,
    isLowest: true,
    position: 1,
  });

  const email = `merge-${Date.now()}@example.com`;
  const { code } = await requestCode(email, 'register');
  const created = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-picolah-user': anonymous },
    body: JSON.stringify({ email, password: 'correct horse 9', code, displayName: 'Merged Pico' }),
  });
  assert.equal(created.status, 201);
  const body = (await created.json()) as { mergedEvents: number; user: { id: string } };
  assert.equal(body.mergedEvents, 1);

  const cookie = cookieFrom(created);
  const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers: { cookie } });
  const profile = (await profileResponse.json()) as {
    profile: { totals: { clicks: number }; user: { anonymousId: string } };
  };
  assert.equal(profile.profile.totals.clicks, 1);
  assert.equal(profile.profile.user.anonymousId, body.user.id);
});

test('exports and deletes the signed-in account with password confirmation', async () => {
  const email = `privacy-${Date.now()}@example.com`;
  const created = await register(email);
  assert.equal(created.status, 201);
  const cookie = cookieFrom(created);

  const exported = await fetch(`${baseUrl}/api/account/export`, { headers: { cookie } });
  assert.equal(exported.status, 200);
  const body = (await exported.json()) as { account: { email: string }; profile: unknown };
  assert.equal(body.account.email, email);
  assert.ok(body.profile);

  const wrong = await fetch(`${baseUrl}/api/account`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ password: 'wrong password' }),
  });
  assert.equal(wrong.status, 401);

  const deleted = await fetch(`${baseUrl}/api/account`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ password: 'correct horse 9' }),
  });
  assert.equal(deleted.status, 200);

  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
  assert.equal(((await me.json()) as { user: null }).user, null);
});

test('resets a forgotten password with an emailed code', async () => {
  const email = `reset-${Date.now()}@example.com`;
  const created = await register(email, 'correct horse 9');
  assert.equal(created.status, 201);

  const forgot = await fetch(`${baseUrl}/api/auth/password/forgot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(forgot.status, 200);
  const forgotBody = (await forgot.json()) as { devCode?: string };
  assert.ok(forgotBody.devCode, 'expected a dev reset code');

  const reset = await fetch(`${baseUrl}/api/auth/password/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: forgotBody.devCode, password: 'new correct 9' }),
  });
  assert.equal(reset.status, 200);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'new correct 9' }),
  });
  assert.equal(login.status, 200);

  const stale = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse 9' }),
  });
  assert.equal(stale.status, 401);
});
