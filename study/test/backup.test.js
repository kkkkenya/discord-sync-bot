// The nightly backup (server/backup.js) and its cron guard, with Supabase faked.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
const { runBackup } = await import('../server/backup.js');
const { makeRouter } = await import('../api/router.js');

function fakeStorage(existing = {}) {
  const files = new Map(Object.entries(existing));
  const calls = [];
  const storage = async (method, path, body) => {
    calls.push(`${method} ${path}`);
    if (path === '/bucket') return {};
    if (path.startsWith('/object/list/')) {
      const names = [...files.keys()].filter((k) => k.startsWith(body.prefix)).map((k) => k.slice(body.prefix.length).split('/')[0]);
      return [...new Set(names)].map((name) => ({ name }));
    }
    if (method === 'DELETE') { for (const f of body.prefixes) files.delete(f); return []; }
    files.set(path.replace('/object/crux-backups/', ''), body);
    return {};
  };
  return { storage, files, calls };
}

const NOW = Date.parse('2026-11-01T23:00:00Z'); // 02:00 on 2 Nov in Nairobi
const db = { select: async (t, qs) => { assert.match(qs, /updated_at=gte\./); return [{ user_id: '42', rev: 3, doc: { units: [] } }, { user_id: '7', rev: 1, doc: { units: [] } }]; } };

test('changed documents are saved under the day, and days older than 14 are deleted', async () => {
  const { storage, files } = fakeStorage({ '2026-10-10/42.json': {}, '2026-10-10/7.json': {}, '2026-10-25/42.json': {} });
  const out = await runBackup({ db, storage, now: NOW });
  assert.equal(out.day, '2026-11-02');
  assert.equal(out.saved, 2);
  assert.deepEqual(out.deletedDays, ['2026-10-10']);
  assert.deepEqual([...files.keys()].sort(), ['2026-10-25/42.json', '2026-11-02/42.json', '2026-11-02/7.json']);
});

test('the cron route needs the CRON_SECRET', async () => {
  process.env.CRON_SECRET = 'cron-test';
  const { storage } = fakeStorage();
  const router = makeRouter(null, { db, storage });
  const call = (auth) => router(new Request('https://crux.test/api/router?path=cron/backup', { headers: auth ? { authorization: auth } : {} }));
  assert.equal((await call()).status, 401);
  assert.equal((await call('Bearer wrong')).status, 401);
  const ok = await call('Bearer cron-test');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).saved, 2);
});
