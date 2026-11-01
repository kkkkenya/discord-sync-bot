// The request-scoped store: in production every request has its own student's document.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1'; // as on Vercel: no local document to fall back to
const { add, data, emptyDoc, save, withDoc } = await import('../server/store.js');
const { docStore } = await import('../server/doc-store.js');

const tick = () => new Promise((ok) => setTimeout(ok, 5));

test('two interleaved requests never see each other\'s data', async () => {
  const a = emptyDoc(), b = emptyDoc();
  const seen = {};
  await Promise.all([
    withDoc(a, async () => { add('topics', { unit: 'EMM 302', name: 'Torsion' }); await tick(); seen.a = data.topics.map((t) => t.name); }),
    withDoc(b, async () => { await tick(); add('topics', { unit: 'ECU 300', name: 'Stats' }); await tick(); seen.b = data.topics.map((t) => t.name); }),
  ]);
  assert.deepEqual(seen, { a: ['Torsion'], b: ['Stats'] });
  assert.equal(a.topics.length, 1);
  assert.equal(b.topics.length, 1);
});

test('spread, JSON.stringify, `in` and list reassignment work through data', async () => {
  const doc = emptyDoc();
  doc.topics.push({ id: 't1', name: 'Beams' });
  const { result, dirty } = await withDoc(doc, () => {
    const { cards, ...shown } = data;
    data.topics = data.topics.filter((t) => t.id !== 't1');
    return { keys: Object.keys(shown), json: JSON.parse(JSON.stringify(data)).topics.length, has: 'units' in data };
  });
  assert.ok(result.keys.includes('units') && result.keys.includes('settings'));
  assert.equal(result.json, 0);
  assert.equal(result.has, true);
  assert.equal(doc.topics.length, 0);
  assert.equal(dirty, false); // reassigning isn't a save; save() is
  assert.equal((await withDoc(doc, () => save())).dirty, true);
});

test('using data outside a request throws', () => {
  assert.throws(() => data.units, /outside a request/);
});

// an in-memory crux_docs that understands the store's three queries
function fakeDb() {
  const rows = new Map();
  const id = (qs) => decodeURIComponent(qs.match(/user_id=eq\.([^&]+)/)[1]);
  return {
    rows,
    select: async (t, qs) => (rows.has(id(qs)) ? [structuredClone(rows.get(id(qs)))] : []),
    insert: async (t, [row]) => (rows.has(row.user_id) ? [] : (rows.set(row.user_id, structuredClone(row)), [row])),
    update: async (t, qs, patch) => {
      const row = rows.get(id(qs));
      const rev = Number(qs.match(/rev=eq\.(\d+)/)[1]);
      if (!row || row.rev !== rev) return [];
      Object.assign(row, structuredClone(patch));
      return [{ rev: row.rev }];
    },
  };
}

test('a save against a stale rev is a 409; a fresh load then saves', async () => {
  const db = fakeDb();
  const tabA = docStore(db), tabB = docStore(db); // two instances, each with its own cache
  const first = await tabA.load('u1');
  assert.equal(first.rev, 0);
  assert.equal(await tabA.save('u1', 0, first.doc), 1);

  const a = await tabA.load('u1'), b = await tabB.load('u1');
  a.doc.units.push({ code: 'EMM 302' });
  await tabA.save('u1', a.rev, a.doc);
  b.doc.units.push({ code: 'ECU 300' });
  await assert.rejects(tabB.save('u1', b.rev, b.doc), (e) => e.status === 409);

  const again = await tabB.load('u1');
  assert.deepEqual(again.doc.units.map((u) => u.code), ['EMM 302']);
  assert.equal(await tabB.save('u1', again.rev, again.doc), 3);
});

test('the cache serves an unchanged document, and callers get their own copy', async () => {
  const db = fakeDb();
  const store = docStore(db);
  await store.save('u2', 0, emptyDoc());
  const one = await store.load('u2');
  one.doc.units.push({ code: 'X' }); // not saved
  const two = await store.load('u2');
  assert.equal(two.doc.units.length, 0);
});
