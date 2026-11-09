// Your study days (one square a day, like a commit graph) and the top contributors of files to the hub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { activity } = await import('../server/insights.js');
const { contributors } = await import('../server/hub-uploads.js');

test('20 whole weeks, Monday first, ending today; each thing done counts on its Nairobi day', () => {
  data.attempts = [{ at: '2026-11-11T21:30:00Z' }, { at: '2026-11-10T08:00:00Z' }, { at: '2026-01-01T08:00:00Z' }]; // 00:30 on the 12th in Nairobi
  data.sessions = [{ at: '2026-11-11T07:00:00Z', minutes: 25 }];
  data.teach = [];
  data.mocks = [{ finishedAt: '2026-11-09T09:00:00Z' }, { finishedAt: null }];
  const a = activity('2026-11-12', ['2026-11-11T10:00:00Z']); // a Thursday
  assert.equal(a.days[0].day, '2026-06-29');
  assert.equal(new Date(`${a.days[0].day}T12:00:00Z`).getUTCDay(), 1, 'starts on a Monday');
  assert.equal(a.days.length, 19 * 7 + 4);
  const on = (day) => a.days.find((d) => d.day === day);
  assert.deepEqual([on('2026-11-12').n, on('2026-11-11').n, on('2026-11-10').n, on('2026-11-09').n], [1, 2, 1, 1]);
  assert.equal(on('2026-11-11').files, 1);
  assert.equal(a.total, 5, 'January is outside the 20 weeks');
  assert.equal(a.streak, 4);
  assert.equal(activity('2026-11-13').streak, 4, 'a day with nothing yet keeps yesterday\'s streak');
});

test('top contributors count posted files this semester, and say where you stand', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  const rows = [...Array(3).fill({ user_id: 'a', user_name: 'Amina' }), ...Array(5).fill({ user_id: 'b', user_name: 'Brian' }), { user_id: 'c', user_name: 'Chebet' }];
  const select = async (table, query) => { assert.match(query, /status=eq\.posted&created_at=gte\./); return rows; };
  const c = await contributors({ id: 'c' }, { limit: 2, select });
  assert.deepEqual(c.top, [{ name: 'Brian', files: 5, you: false }, { name: 'Amina', files: 3, you: false }]);
  assert.deepEqual(c.you, { rank: 3, files: 1 });
  assert.equal((await contributors({ id: 'z' }, { select })).you, null);
  delete process.env.SUPABASE_URL;
});
