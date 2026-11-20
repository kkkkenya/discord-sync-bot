// Files for the hub: wrong types and sizes are refused before any storage is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
process.env.SUPABASE_URL = 'https://example.supabase.co';
const { data } = await import('../server/store.js');
const { startUpload, MAX_BYTES } = await import('../server/hub-uploads.js');
const user = { id: 'u1', name: 'Amina' };
const unit = data.units[0]?.code;
const never = async () => { throw new Error('storage should not be called'); };

test('only PDFs, photos, PowerPoint and Word, up to the size limit, for one of your units', async () => {
  await assert.rejects(startUpload({ unit, name: 'virus.exe', size: 10 }, user, { store: never }), /PDFs, photos/);
  await assert.rejects(startUpload({ unit, name: 'big.pdf', size: MAX_BYTES + 1 }, user, { store: never }), /Up to 50 MB/);
  await assert.rejects(startUpload({ unit: 'NOT 999', name: 'a.pdf', size: 10 }, user, { store: never }), /your units/);
});

test('ten posted files this semester make a trial or Basic member Premium until the exams end', async () => {
  const { withReward, forgetCredits } = await import('../server/rewards.js');
  const { REWARD } = await import('../../lib/rewards.js');
  const nine = { select: async () => Array(9).fill({}) };
  const ten = { select: async () => Array(10).fill({}) };
  forgetCredits('b1');
  assert.equal((await withReward({ id: 'b1', tier: 'basic' }, '2026-11-02', nine)).tier, 'basic');
  forgetCredits('b1');
  assert.equal((await withReward({ id: 'b1', tier: 'basic' }, '2026-11-02', ten)).tier, 'premium');
  forgetCredits('b1');
  assert.equal((await withReward({ id: 'b1', tier: 'basic' }, '2026-12-11', ten)).tier, 'basic', `after ${REWARD.end}`);
  assert.equal((await withReward({ id: 'x', tier: 'none' }, '2026-11-02', ten)).tier, 'none');
});

// Track H4 (2026-11-20): Supabase Storage refuses object keys with characters outside its set (InvalidKey, seen live
// for "Lecturer’s notes.pdf", "Thermo – Chapter 2.pdf", "Résumé of topics.pdf", "Week 3 notes 📘.pdf"), and a long
// name lost its extension and was refused as "not a PDF".
test('the storage key is in the set Supabase Storage accepts; the name the student sees is kept', async () => {
  const { storageKey, safeName } = await import('../server/hub-uploads.js');
  const STORAGE_OK = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/; // supabase/storage's own key check
  for (const name of ['Lecturer’s notes.pdf', 'Thermo – Chapter 2.pdf', 'Résumé of topics.pdf', 'Week 3 notes 📘.pdf', 'نوٹس.pdf', 'Plain notes.pdf']) {
    const key = storageKey(safeName(name));
    assert.match(key, STORAGE_OK, name);
    assert.match(key, /\.pdf$/, name);
  }
  assert.equal(storageKey('Résumé of topics.pdf'), 'Resume of topics.pdf');
  assert.equal(storageKey("Lecturer’s notes.pdf"), "Lecturer's notes.pdf");
  assert.equal(safeName('Lecturer’s notes.pdf'), 'Lecturer’s notes.pdf', 'the hub posts it under its real name');
});

test('a long file name keeps its extension, so it is not refused as the wrong type', async () => {
  const { safeName } = await import('../server/hub-uploads.js');
  const long = `EMM 314 Work study and ergonomics complete lecture notes chapters one to five revised edition for semester one of the year.pdf`;
  const out = safeName(long);
  assert.ok(out.length <= 120, out.length);
  assert.match(out, /\.pdf$/);
  assert.match(out, /^EMM 314 Work study/);
});
