// The Vercel router: sessions, one document per student, saved once, conflicts surfaced.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
process.env.SESSION_SECRET = 'test-secret';
const { sign } = await import('../../lib/session.js');
const { makeRouter } = await import('../api/router.js');
const { emptyDoc } = await import('../server/store.js');

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
const cookie = (id) => `crux_session=${sign({ id, name: id, tier: 'basic', exp: Date.now() + 60e3 })}`;
const call = (router, method, path, { user, body } = {}) => router(new Request(`https://crux.test/api/router?path=${path}`, {
  method, headers: { ...(user ? { cookie: cookie(user) } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
})).then(async (r) => ({ status: r.status, body: await r.json() }));

test('health needs no sign-in', async () => {
  const r = await call(makeRouter(memoryDocs()), 'GET', 'health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('everything else needs a valid session', async () => {
  const router = makeRouter(memoryDocs());
  assert.equal((await call(router, 'GET', 'state')).status, 401);
  const forged = await router(new Request('https://crux.test/api/router?path=state', { headers: { cookie: 'crux_session=eyJpZCI6IjEifQ.bad' } }));
  assert.equal(forged.status, 401);
});

test('writes land in the signed-in student\'s document only, saved once per request', async () => {
  const docs = memoryDocs();
  const router = makeRouter(docs);
  const r = await call(router, 'POST', 'sessions', { user: 'amina', body: { unit: 'EMM 302', minutes: 45 } });
  assert.equal(r.status, 200);
  assert.deepEqual(docs.saves, ['amina']);
  assert.equal((await docs.load('amina')).doc.sessions.length, 1);
  assert.equal((await docs.load('brian')).doc.sessions.length, 0);
});

test('a read saves nothing; a stale save is a 409', async () => {
  const docs = memoryDocs();
  const router = makeRouter(docs);
  await call(router, 'POST', 'sessions', { user: 'amina', body: { unit: 'EMM 302', minutes: 10 } });
  await call(router, 'GET', 'catalog', { user: 'amina' });
  assert.equal(docs.saves.length, 1);
  const slow = { ...docs, load: async (id) => { const d = await docs.load(id); docs.bump(id); return d; } }; // another tab saves meanwhile
  const r = await call(makeRouter(slow), 'POST', 'sessions', { user: 'amina', body: { unit: 'EMM 302', minutes: 20 } });
  assert.equal(r.status, 409);
});

test('bad JSON is a 400', async () => {
  const r = await makeRouter(memoryDocs())(new Request('https://crux.test/api/router?path=hints', { method: 'POST', headers: { cookie: cookie('amina') }, body: '{nope' }));
  assert.equal(r.status, 400);
});
