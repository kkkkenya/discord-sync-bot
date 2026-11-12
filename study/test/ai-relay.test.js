// The hosted-models relay (server/ai-relay.js): plans, allowances, effort, the Gemini-busy fallback, and that
// only relay keys (not session cookies) get in. No network: the store and the upstream fetch are stand-ins.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.CRUX_SESSION_SECRET = 'test-secret';
const { aiToken, effortFor, modelsFor, PLANS, relay, BUSY_MARK } = await import('../server/ai-relay.js');
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

test('each plan sees its models; the entry plans see DeepSeek only as the Gemini-busy choice', () => {
  assert.deepEqual(modelsFor('basic').map((m) => m.id), ['gemini-3.8-flash', 'deepseek-flash']);
  assert.match(modelsFor('basic')[1].name, /when Gemini is busy/);
  assert.deepEqual(modelsFor('premium').map((m) => m.id), ['gemini-3.8-flash', 'deepseek-flash', 'glm-5.3-flash']);
  assert.ok(modelsFor('vvip').some((m) => m.id === 'glm-5.3') && modelsFor('vvip').some((m) => m.id === 'deepseek-v4-pro'));
  assert.deepEqual(modelsFor('none'), []);
  assert.deepEqual([PLANS.basic.perDay, PLANS.premium.perDay, PLANS.vvip.perDay], [15, 40, 80]);
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
  assert.equal((await relay(...req('basic', { model: 'glm-5.3', messages: [] }), { store: a.store, fetchImpl: upstream(200, seen), now: () => NOW, env: ENV })).status, 403);
  const b = setup({ u1: { answers: 40, gemini_failed_at: null } });
  const r = await relay(...req('premium', { model: 'glm-5.3-flash', messages: [] }), { store: b.store, fetchImpl: upstream(200, seen), now: () => NOW, env: ENV });
  assert.equal(r.status, 429);
  assert.match((await r.json()).error.message, /40 answers/);
  assert.equal(seen.length, 0);
});

test('Gemini busy twice on Gacrux: the student is told to switch, and DeepSeek opens for 30 minutes', async () => {
  const { store, rows } = setup();
  const seen = [];
  const busy = await relay(...req('basic', { model: 'gemini-3.8-flash', messages: [] }), { store, fetchImpl: upstream(503, seen), now: () => NOW, env: ENV });
  assert.equal(busy.status, 503);
  assert.equal(seen.length, 2, 'two tries');
  assert.ok((await busy.json()).error.message.includes(BUSY_MARK));
  assert.ok(rows.u1.gemini_failed_at);
  // DeepSeek now works for this student
  const ds = await relay(...req('basic', { model: 'deepseek-flash', messages: [], reasoning_effort: 'low' }), { store, fetchImpl: upstream(200, seen), now: () => NOW + 60e3, env: ENV });
  assert.equal(ds.status, 200);
  assert.match(seen.at(-1).url, /deepseek/);
  assert.equal(seen.at(-1).body.reasoning_effort, undefined, 'DeepSeek gets no effort parameter');
  // and closes again after 30 minutes
  const later = await relay(...req('basic', { model: 'deepseek-flash', messages: [] }), { store, fetchImpl: upstream(200, seen), now: () => NOW + 31 * 60e3, env: ENV });
  assert.equal(later.status, 403);
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
