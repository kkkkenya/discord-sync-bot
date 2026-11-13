// The Vercel router: sessions, one document per student, saved once, conflicts surfaced.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
process.env.SESSION_SECRET = 'test-secret';
const { sign } = await import('../../lib/session.js');
const { makeRouter } = await import('../api/router.js');
const { emptyDoc } = await import('../server/store.js');
const { tierFor } = await import('../server/auth.js');
const { ROLES } = await import('../../lib/config.js');
const noNetwork = { db: { upsert: async () => [] }, member: async () => { throw new Error('no network in tests'); } };

function memoryDocs() {
  const docs = new Map();
  const saves = [];
  return {
    saves,
    load: async (id) => ({ rev: docs.get(id)?.rev || 0, doc: structuredClone(docs.get(id)?.doc || emptyDoc()) }),
    save: async (id, rev, doc) => {
      if ((docs.get(id)?.rev || 0) !== rev) throw Object.assign(new Error('Your data changed in another tab. Reloading.'), { status: 409 });
      docs.set(id, { rev: rev + 1, doc: structuredClone(doc) });
      saves.push(id);
      return rev + 1;
    },
    bump: (id) => { docs.get(id).rev++; },
  };
}
const cookie = (id, extra = {}) => `crux_session=${sign({ id, name: id, tier: 'basic', checked: Date.now(), exp: Date.now() + 60e3, ...extra })}`;
const call = (router, method, path, { user, body, session } = {}) => router(new Request(`https://crux.test/api/router?path=${path}`, {
  method, headers: { ...(user ? { cookie: cookie(user, session) } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
})).then(async (r) => ({ status: r.status, body: await r.json() }));

test('health needs no sign-in', async () => {
  const r = await call(makeRouter(memoryDocs(), noNetwork), 'GET', 'health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('everything else needs a valid session', async () => {
  const router = makeRouter(memoryDocs(), noNetwork);
  assert.equal((await call(router, 'GET', 'state')).status, 401);
  const forged = await router(new Request('https://crux.test/api/router?path=state', { headers: { cookie: 'crux_session=eyJpZCI6IjEifQ.bad' } }));
  assert.equal(forged.status, 401);
});

test('writes land in the signed-in student\'s document only, saved once per request', async () => {
  const docs = memoryDocs();
  const router = makeRouter(docs, noNetwork);
  const r = await call(router, 'POST', 'sessions', { user: 'amina', body: { unit: 'EMM 302', minutes: 45 } });
  assert.equal(r.status, 200);
  assert.deepEqual(docs.saves, ['amina']);
  assert.equal((await docs.load('amina')).doc.sessions.length, 1);
  assert.equal((await docs.load('brian')).doc.sessions.length, 0);
});

test('a read saves nothing; a stale save is a 409', async () => {
  const docs = memoryDocs();
  const router = makeRouter(docs, noNetwork);
  await call(router, 'POST', 'sessions', { user: 'amina', body: { unit: 'EMM 302', minutes: 10 } });
  await call(router, 'GET', 'catalog', { user: 'amina' });
  assert.equal(docs.saves.length, 1);
  const slow = { ...docs, load: async (id) => { const d = await docs.load(id); docs.bump(id); return d; } }; // another tab saves meanwhile
  const r = await call(makeRouter(slow, noNetwork), 'POST', 'sessions', { user: 'amina', body: { unit: 'EMM 302', minutes: 20 } });
  assert.equal(r.status, 409);
});

test('bad JSON is a 400', async () => {
  const r = await makeRouter(memoryDocs(), noNetwork)(new Request('https://crux.test/api/router?path=hints', { method: 'POST', headers: { cookie: cookie('amina') }, body: '{nope' }));
  assert.equal(r.status, 400);
});

test('tier from server roles: premium beats basic beats trial; the owner is owner; no roles or no member is none', () => {
  assert.equal(tierFor({ roles: [ROLES.trial, ROLES.premium] }, '1', 'x'), 'premium');
  assert.equal(tierFor({ roles: [ROLES.paid, ROLES.premium, ROLES.vvip] }, '1', 'x'), 'vvip');
  assert.equal(tierFor({ roles: [ROLES.paid] }, '1', 'x'), 'basic');
  assert.equal(tierFor({ roles: [ROLES.trial] }, '1', 'x'), 'trial');
  assert.equal(tierFor({ roles: [] }, '1', 'x'), 'none');
  assert.equal(tierFor(null, '1', 'x'), 'none');
  assert.equal(tierFor(null, 'x', 'x'), 'owner');
});

test('no membership is a 403 no-access; /api/me tells the app who is signed in', async () => {
  const router = makeRouter(memoryDocs(), noNetwork);
  const none = await call(router, 'GET', 'state', { user: 'zed', session: { tier: 'none' } });
  assert.deepEqual([none.status, none.body.error], [403, 'no-access']);
  const me = await call(router, 'GET', 'me', { user: 'amina' });
  assert.deepEqual(me.body, { id: 'amina', name: 'amina', tier: 'basic', avatar: null });
  const pic = 'https://cdn.discordapp.com/avatars/amina/abc.png?size=96';
  const withPic = await makeRouter(memoryDocs(), noNetwork)(new Request('https://crux.test/api/router?path=me', { headers: { cookie: cookie('amina', { avatar: pic }) } }));
  assert.equal((await withPic.json()).avatar, pic);
});

test('a day-old session reads the roles again and gets a fresh cookie', async () => {
  const seen = [];
  const deps = { db: { upsert: async (t, rows) => { seen.push(rows[0].tier); return rows; } }, member: async () => ({ roles: [ROLES.premium], nick: 'Amina W' }) };
  const r = await makeRouter(memoryDocs(), deps)(new Request('https://crux.test/api/router?path=me', { headers: { cookie: cookie('amina', { checked: Date.now() - 25 * 3600e3 }) } }));
  assert.deepEqual(await r.json(), { id: 'amina', name: 'Amina W', tier: 'premium', avatar: null });
  assert.match(r.headers.get('set-cookie'), /crux_session=/);
  assert.deepEqual(seen, ['premium']);
});

test('if Discord is down during the daily role check, the member keeps their tier', async () => {
  const deps = { db: { upsert: async () => [] }, member: async () => { throw new Error('discord 503'); } };
  const r = await makeRouter(memoryDocs(), deps)(new Request('https://crux.test/api/router?path=me', { headers: { cookie: cookie('amina', { checked: Date.now() - 25 * 3600e3 }) } }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).tier, 'basic');
});

test('an AI request that loses a save race is redone on the newer document without calling the AI again', async () => {
  const docs = memoryDocs();
  const router = makeRouter(docs, { ...noNetwork, db: { ...noNetwork.db, select: async () => [], rpc: async () => ({ ok: true, used: 1 }) } });
  await call(router, 'PUT', 'units', { user: 'amina', body: [{ code: 'EMM 302', title: 'Strength of Materials' }] });
  const realFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes('generativelanguage')) return realFetch(url, opts);
    calls += 1;
    docs.bump('amina'); // another tab saved while the AI was working
    const out = { topics: [{ name: 'Bending stress', why: 'paper' }, { name: 'Shear force', why: 'paper' }, { name: 'Torsion', why: 'paper' }] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await call(router, 'POST', 'topics/suggest', { user: 'amina', body: { unit: 'EMM 302' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY; }
});

test('an Acrux sign-in still saves its row on a database that predates the Acrux tier', async () => {
  const { rememberUser } = await import('../server/auth.js');
  const saved = [];
  const db = { upsert: async (t, rows) => { if (rows[0].tier === 'vvip') throw new Error('23514 tier check'); saved.push(rows[0].tier); return rows; } };
  await rememberUser(db, { id: '9', name: 'a', tier: 'vvip' });
  assert.deepEqual(saved, ['premium']);
  await assert.rejects(rememberUser({ upsert: async () => { throw new Error('down'); } }, { id: '9', name: 'a', tier: 'basic' }));
});
