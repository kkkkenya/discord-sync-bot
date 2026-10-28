import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { KIT_FOR, makeKitFor } = await import('../server/kit.js');

const day = (n) => { const d = new Date(); d.setUTCHours(12); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const asked = [];
const ai = { ready: () => true, make: async (input) => { asked.push(input); return { title: 'made', kind: input.kind }; } };
const noAi = { ready: () => false, make: async () => { throw new Error('should not be called'); } };
const unit = (code) => data.units.find((u) => u.code === code);

test('each stage gets its own kind of material', () => {
  assert.deepEqual(KIT_FOR, { adequate: 'ladder', 'one-week': 'recipes', 'last-minute': 'sheet', 'exam-eve': 'sheet' });
});

test('a unit far off gets a ladder on its weakest topic, saved for next time', async () => {
  unit('EMM 302').catDate = 'TBA';
  const m = await makeKitFor({ unit: 'EMM 302' }, ai);
  assert.equal(m.kind, 'ladder');
  assert.equal(m.stage, 'adequate');
  assert.ok(m.topicId, 'a ladder is about one topic');
  assert.equal(asked.at(-1).topic, data.topics.find((t) => t.id === m.topicId).name);
  assert.ok(data.materials.some((x) => x.id === m.id));
});

test('a unit 2 days out gets a formula sheet over its likely topics, with the student\'s own traps', async () => {
  unit('EMM 302').catDate = day(2);
  data.attempts.push({ id: 'k1', unit: 'EMM 302', verdict: 'wrong', errorType: 'units', subtopicId: null, at: new Date().toISOString() });
  const m = await makeKitFor({ unit: 'EMM 302' }, ai);
  assert.equal(m.kind, 'sheet');
  assert.equal(m.topicId, null);
  assert.ok(asked.at(-1).focus.length > 0);
  assert.match(asked.at(-1).traps.join(' '), /unit/i);
});

test('you can ask for another kind, and with no AI key it points at the Prompt Builder goal', async () => {
  assert.equal((await makeKitFor({ unit: 'EMM 302', kind: 'recipes' }, ai)).kind, 'recipes');
  const r = await makeKitFor({ unit: 'EMM 302', kind: 'sheet' }, noAi);
  assert.equal(r.needKey, true);
  assert.equal(r.goal, 'sheet');
  await assert.rejects(makeKitFor({ unit: 'XYZ 999' }, ai), /your units/);
  await assert.rejects(makeKitFor({ unit: 'EMM 302', kind: 'poem' }, ai), /kind/);
});
