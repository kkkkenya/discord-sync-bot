import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_SESSION_SECRET ||= 'test-secret';
const { authRoute, signInState, stateOk } = await import('../server/auth.js');

test('the sign-in state works in any browser for 15 minutes, and a forged one does not', () => {
  assert.ok(stateOk(signInState()));
  assert.ok(!stateOk(signInState(Date.now() - 16 * 60e3)));
  assert.ok(!stateOk('eyJuIjoiMSJ9.forged'));
  assert.ok(!stateOk(null));
});

test('a callback in a browser without the starting cookie is not sent back as expired', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 }); // Discord refuses the code
  try {
    const url = `https://crux.test/auth/callback?code=abc&state=${encodeURIComponent(signInState())}`;
    const r = await authRoute('callback', new Request(url), { db: {} });
    assert.equal(r.headers.get('Location'), '/#/signin?problem=discord');
    const bad = await authRoute('callback', new Request('https://crux.test/auth/callback?code=abc&state=nope'), { db: {} });
    assert.equal(bad.headers.get('Location'), '/#/signin?problem=expired');
  } finally {
    globalThis.fetch = realFetch;
  }
});
