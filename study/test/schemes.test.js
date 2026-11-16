// Marking schemes (server/schemes.js): each scheme beside its paper, papers without one, asking, and the free download.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
const { schemeList, askText, firstAsk, freeScheme } = await import('../server/schemes.js');
const { downloadLink } = await import('../server/downloads.js');
const { bump, resetUsageForTests } = await import('../server/usage.js');

const files = [
  { id: 1, name: 'EMM302_CAT_1.pdf', paper: true },
  { id: 2, name: 'EMM 302 CAT 1 2026-27 Marking Scheme.pdf', paper: true },
  { id: 3, name: 'EMM 302 Solid and Structural Mechanics I Exam 2017-2018.pdf', paper: true },
  { id: 4, name: 'EMM 302 Exam 2017-2018 marking scheme.pdf', paper: true },
  { id: 5, name: 'KU EMM 302 TUT 2.pdf', paper: false },
  { id: 6, name: 'EMM 302 CAT 2 2025.pdf', paper: true },
  { id: 7, name: 'Strength of Materials (Rajput).pdf', paper: false },
  { id: 8, name: 'EMM 302 memo old.pdf', paper: false },
];

test('each scheme sits beside the paper it marks; papers with none are listed apart, newest first', () => {
  const { schemes, missing } = schemeList(files);
  assert.deepEqual(schemes.map((s) => [s.id, s.paper]), [
    ['2', null], // CAT 1 2026-27: the paper on the hub has no year, so Crux can't be sure it is the same one
    ['4', 'EMM 302 Solid and Structural Mechanics I Exam 2017-2018.pdf'],
    ['8', null],
  ]);
  assert.deepEqual(missing.map((m) => m.id), ['6', '1']);
  assert.ok(!missing.some((m) => m.id === '3'), 'a paper with its scheme is not "missing"');
  assert.ok(!missing.some((m) => m.id === '5' || m.id === '7'), 'notes and books are not papers');
});

test('empty or odd input gives empty lists', () => {
  assert.deepEqual(schemeList(undefined), { schemes: [], missing: [] });
  assert.deepEqual(schemeList([{ id: 1 }, null]), { schemes: [], missing: [] });
});

test('asking: one DM per student, paper and day; names cannot carry Discord markdown or mentions', () => {
  assert.equal(askText('EMM 302', 'EMM 302 CAT 2 2025.pdf', 'Wanjiku'), 'Marking scheme asked for: **EMM 302** · EMM 302 CAT 2 2025 (by Wanjiku).');
  assert.equal(askText('EMM 302', '**big** @everyone.pdf', '<@123> `x`'), 'Marking scheme asked for: **EMM 302** · big everyone (by 123 x).');
  assert.equal(firstAsk('u1', 'EMM 302', '6', '2026-11-17'), true);
  assert.equal(firstAsk('u1', 'EMM 302', '6', '2026-11-17'), false);
  assert.equal(firstAsk('u2', 'EMM 302', '6', '2026-11-17'), true);
  assert.equal(firstAsk('u1', 'EMM 302', '6', '2026-11-18'), true);
});

test('five asks a day for students, none counted for the owner', async () => {
  resetUsageForTests();
  const student = { id: 's1', tier: 'premium' };
  for (let i = 0; i < 5; i++) assert.equal((await bump(student, 'ask')).ok, true);
  assert.equal((await bump(student, 'ask')).ok, false);
  assert.equal((await bump({ id: 'o', tier: 'owner' }, 'ask')).ok, true);
});

test('only files named a marking scheme, and not book-sized, skip the download count', () => {
  assert.equal(freeScheme({ name: 'EMM 302 CAT 1 Marking Scheme.pdf', size: 500e3 }), true);
  assert.equal(freeScheme({ name: 'EMM 302 marking-schemes.pdf' }), true, 'no size known: still free');
  assert.equal(freeScheme({ name: 'Memo.pdf', size: 1e5 }), false, 'a bare "memo" is not enough');
  assert.equal(freeScheme({ name: 'Rajput marking scheme.pdf', size: 40e6 }), false, 'a book renamed as a scheme still counts');
});

test('a marking scheme never uses a daily download; papers still do', async () => {
  resetUsageForTests();
  const user = { id: 'b1', tier: 'basic' };
  const deps = (name, size = 400e3) => ({ lookup: async (id) => [{ id, name, size, channel_id: 'c', message_id: 'm' }], link: async () => 'https://cdn.discordapp.com/x.pdf' });
  for (let i = 0; i < 5; i++) {
    const r = await downloadLink(user, '2', deps('EMM 302 CAT 1 Marking Scheme.pdf'));
    assert.equal(r.left, null);
  }
  const paper = await downloadLink(user, '1', deps('EMM302_CAT_1.pdf'));
  assert.equal(paper.left, 1, 'papers still count: the first of two');
  const memo = await downloadLink(user, '8', deps('Memo.pdf'));
  assert.equal(memo.left, 0, 'a file only called memo counts');
});
