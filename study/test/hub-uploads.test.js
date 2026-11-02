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
