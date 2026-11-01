// Focus counts (server/focus.js) and the bell's new-material grouping (server/inbox.js).
import test from 'node:test';
import assert from 'node:assert/strict';

const { focusCount, setFocus, resetFocusForTests } = await import('../server/focus.js');
const { group, newMaterial } = await import('../server/inbox.js');

test('focus counts others studying now, never yourself, and forgets ended blocks', async () => {
  resetFocusForTests();
  const now = Date.parse('2026-11-02T08:00:00Z');
  await setFocus('a', '2026-11-02T08:25:00Z', now);
  await setFocus('b', '2026-11-02T08:10:00Z', now);
  assert.equal((await setFocus('me', '2026-11-02T08:25:00Z', now)).others, 2);
  assert.equal(await focusCount('me', Date.parse('2026-11-02T08:15:00Z')), 1); // b's block ended
  await setFocus('a', null, now);
  assert.equal(await focusCount('me', now), 1);
  await assert.rejects(setFocus('me', 'soon', now), /must be a date/);
});

test('new material groups files by unit, newest first, three names each', () => {
  const rows = [
    { unit_code: 'EMM 302', name: 'CAT 2 2025.pdf', created_at: '2026-11-02T07:00:00Z' },
    { unit_code: 'EMM 305', name: 'Notes 4.pdf', created_at: '2026-11-02T06:00:00Z' },
    { unit_code: 'EMM 302', name: 'TUT 4.docx', created_at: '2026-11-01T20:00:00Z' },
  ];
  assert.deepEqual(group(rows), [
    { unit: 'EMM 302', count: 2, latest: '2026-11-02T07:00:00Z', names: ['CAT 2 2025.pdf', 'TUT 4.docx'] },
    { unit: 'EMM 305', count: 1, latest: '2026-11-02T06:00:00Z', names: ['Notes 4.pdf'] },
  ]);
});

test('without the hub (local runs) or a valid date, there is no new material and no query', async () => {
  assert.deepEqual(await newMaterial(['EMM 302'], '2026-11-01T00:00:00Z'), { files: [], announcements: [] });
  assert.deepEqual(await newMaterial(['EMM 302'], 'never'), { files: [], announcements: [] });
});

test('study rooms count people focusing in the same unit, separately from everyone', async () => {
  resetFocusForTests();
  const now = Date.parse('2026-11-02T08:00:00Z');
  const { focusCounts } = await import('../server/focus.js');
  await setFocus('a', '2026-11-02T08:25:00Z', now, 'EMM 302');
  await setFocus('b', '2026-11-02T08:25:00Z', now, 'EMM 305');
  await setFocus('c', '2026-11-02T08:25:00Z', now);
  assert.deepEqual(await setFocus('me', '2026-11-02T08:25:00Z', now, 'EMM 302'), { others: 3, room: 1 });
  assert.deepEqual(await focusCounts('me', null, now), { others: 3, room: null });
});
