// The hosted-models relay (server/ai-relay.js): plans, allowances, effort, the Gemini-busy fallback, and that
// only relay keys (not session cookies) get in. No network: the store and the upstream fetch are stand-ins.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CRUX_SESSION_SECRET = 'test-secret';
const { aiToken, effortFor, modelsFor, PLANS, providerEffort, relay, BUSY_MARK } = await import('../server/ai-relay.js');
const { sign } = await import('../../lib/session.js');

const NOW = Date.now();
const DAY = new Date(NOW).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const ENV = { GEMINI_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', GLM_API_KEY: 'z' };

function setup(rows = {}) {
  const writes = [];
  const store = {
    select: async (table, qs) => { const id = decodeURIComponent(qs.match(/user_id=eq\.([^&]+)/)[1]); return rows[id] ? [rows[id]] : []; },
    upsert: async (table, list) => { writes.push(list[0]); rows[list[0].user_id] = list[0]; },
  };
  return { store, writes, rows };
}
const req = (tier, body, { path = '/api/ai/v1/chat/completions', token } = {}) => [
  new Request(`https://crux.test${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token ?? aiToken({ id: 'u1', tier }, NOW).token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
  path,
];
const upstream = (status = 200, seen = []) => async (url, init) => { seen.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return new Response(status === 200 ? '{"choices":[]}' : 'busy', { status, headers: { 'content-type': 'application/json' } }); };

test('only a relay key gets in: no key, a session cookie token, or a stale key are refused', async () => {
  const { store } = setup();
  const deps = { store, fetchImpl: upstream(), now: () => NOW, env: ENV };
  assert.equal((await relay(...req('basic', null, { path: '/api/ai/v1/models', token: 'nope' }), deps)).status, 401);
  const session = sign({ id: 'u1', name: 'A', tier: 'premium', exp: NOW + 1e9 });
  assert.equal((await relay(...req('basic', null, { path: '/api/ai/v1/models', token: session }), deps)).status, 401, 'a session token is not a relay key');
  const stale = sign({ kind: 'ai', id: 'u1', tier: 'basic', exp: Date.now() - 1 });
  assert.equal((await relay(...req('basic', null, { path: '/api/ai/v1/models', token: stale }), deps)).status, 401);
});

test('DeepSeek first: every plan lists DeepSeek Flash first, as its fallback, and Gemini second (Track H1)', () => {
  for (const tier of Object.keys(PLANS)) {
    const live = modelsFor(tier).map((m) => m.id);
    assert.equal(live[0], 'deepseek-flash', tier);
    assert.equal(PLANS[tier].fallback ?? PLANS[tier].models[0], 'deepseek-flash', tier);
    assert.ok(live.includes('gemini-3.8-flash'), tier);
  }
  assert.deepEqual(modelsFor('basic').map((m) => m.id), ['deepseek-flash', 'gemini-3.8-flash']);
  assert.doesNotMatch(modelsFor('basic')[0].name, /busy/);
  assert.deepEqual(modelsFor('premium').map((m) => m.id), ['deepseek-flash', 'gemini-3.8-flash']); // GLM paused (2026-11-18)
  assert.ok(modelsFor('vvip').some((m) => m.id === 'deepseek-v4-pro'));
  assert.deepEqual(modelsFor('none'), []);
  assert.deepEqual([PLANS.basic.perDay, PLANS.premium.perDay, PLANS.vvip.perDay], [15, 40, 80]);
});

test('Gacrux can pick DeepSeek straight away: no Gemini-busy gate any more', async () => {
  const { store } = setup();
  const seen = [];
  const r = await relay(...req('basic', { model: 'deepseek-flash', messages: [] }), { store, fetchImpl: upstream(200, seen), now: () => NOW, env: ENV });
  assert.equal(r.status, 200);
  assert.match(seen[0].url, /deepseek/);
});

test('effort: Gacrux low, Mimosa up to medium, Acrux as asked', () => {
  assert.equal(effortFor(PLANS.basic, 'high'), 'low');
  assert.equal(effortFor(PLANS.basic, undefined), 'low');
  assert.equal(effortFor(PLANS.basic, 'minimal'), 'minimal');
  assert.equal(effortFor(PLANS.premium, 'high'), 'medium');
  assert.equal(effortFor(PLANS.premium, 'low'), 'low');
  assert.equal(effortFor(PLANS.vvip, 'high'), 'high');
});

test('a Gacrux answer goes to Gemini with the Hub key, low effort, and counts one answer', async () => {
  const { store, writes } = setup();
  const seen = [];
  const r = await relay(...req('basic', { model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }], reasoning_effort: 'high', stream: true }), { store, fetchImpl: upstream(200, seen), now: () => NOW, env: ENV });
  assert.equal(r.status, 200);
  assert.match(seen[0].url, /generativelanguage/);
  assert.equal(seen[0].auth, 'Bearer g');
  assert.equal(seen[0].body.reasoning_effort, 'low');
  assert.equal(seen[0].body.stream, true);
  assert.deepEqual(writes.at(-1), { user_id: 'u1', day: DAY, answers: 1, gemini_failed_at: null });
  assert.equal(r.headers.get('x-crux-answers-left'), '14');
});

test('a model outside the plan, or past the daily allowance, is refused before any call', async () => {
  const seen = [];
  const a = setup();
  assert.equal((await relay(...req('basic', { model: 'deepseek-v4-pro', messages: [] }), { store: a.store, fetchImpl: upstream(200, seen), now: () => NOW, env: ENV })).status, 403);
  const b = setup({ u1: { answers: 40, gemini_failed_at: null } });
  const r = await relay(...req('premium', { model: 'deepseek-flash', messages: [] }), { store: b.store, fetchImpl: upstream(200, seen), now: () => NOW, env: ENV });
  assert.equal(r.status, 429);
  assert.match((await r.json()).error.message, /40 answers/);
  assert.equal(seen.length, 0);
});

test('a refusal from the model (400) is not retried and does not open the fallback', async () => {
  const { store, rows } = setup();
  const seen = [];
  const r = await relay(...req('basic', { model: 'gemini-3.8-flash', messages: [] }), { store, fetchImpl: upstream(400, seen), now: () => NOW, env: ENV });
  assert.equal(r.status, 502);
  assert.equal(seen.length, 1);
  assert.equal(rows.u1, undefined);
});

test('usage and models endpoints', async () => {
  const { store } = setup({ u1: { answers: 3, gemini_failed_at: null } });
  const u = await (await relay(...req('premium', null, { path: '/api/ai/usage' }), { store, now: () => NOW, env: ENV })).json();
  assert.deepEqual(u, { tier: 'premium', answers: 3, perDay: 40, left: 37, day: DAY });
  const m = await (await relay(...req('vvip', null, { path: '/api/ai/v1/models' }), { store, now: () => NOW, env: ENV })).json();
  assert.equal(m.object, 'list');
});

test('each provider gets an effort word it accepts: GLM refuses medium, DeepSeek takes none', () => {
  assert.equal(providerEffort('glm', 'medium'), 'low', 'a plan capped at medium never goes above it');
  assert.equal(providerEffort('glm', 'minimal'), 'low');
  assert.equal(providerEffort('glm', 'high'), 'high');
  assert.equal(providerEffort('glm', 'max'), 'max');
  assert.equal(providerEffort('gemini', 'medium'), 'medium');
  assert.equal(providerEffort('gemini', 'max'), 'high');
  assert.equal(providerEffort('deepseek', 'high'), null);
  assert.equal(providerEffort('glm', null), null);
});

test('GLM is paused: no plan lists it', () => {
  for (const tier of ['premium', 'vvip', 'owner']) assert.equal(modelsFor(tier).some((m) => /glm/.test(m.id)), false, tier);
  assert.ok(modelsFor('premium').some((m) => m.id === 'deepseek-flash'));
});

test('a session that still names a paused GLM model is answered by the plan\'s first live model', async () => {
  const seen = [];
  const a = setup();
  const r = await relay(...req('premium', { model: 'glm-5.3-flash', messages: [{ role: 'user', content: 'hi' }] }), { store: a.store, fetchImpl: upstream(200, seen), now: () => NOW, env: ENV });
  assert.equal(r.status, 200);
  assert.match(seen[0].url, /deepseek/);
  assert.equal(seen[0].body.model, 'deepseek-flash');
});
