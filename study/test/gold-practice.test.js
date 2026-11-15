// Shared gold solutions in practice (fixplan-e E1): a checked solution is used without AI, a typed key or a pasted
// paper is never shared, a cheap solve never replaces a checked one, and a flag counts once per student.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { checkAnswer, classExplain, disputeSolution, ensureCheckpoints, explainQuestion } = await import('../server/practice.js');
const { resetSharedForTests, shareSolution, sharedSolution } = await import('../server/shared.js');

const Q = 'A solid shaft transmits 50 kW at 300 rpm. Find the torque transmitted by the shaft in kNm.';
const PASTED = 'A pasted question: a cantilever of length 2 m carries 5 kN at the free end. Find the fixed-end moment.';
data.paperq.push(
  { id: 'g1', unit: 'EMM 302', fileId: 'f9', source: 'EMM 302 CAT 1 2024.pdf', year: 2024, type: 'CAT1', number: 1, marks: 10, text: Q, topicId: 't1', subtopicIds: [], topicFrom: 'auto' },
  { id: 'p1', unit: 'EMM 302', fileId: 'paste-abc', source: 'Pasted', type: 'CAT', number: 1, text: PASTED, topicId: 't1', subtopicIds: [], topicFrom: 'auto' },
);
const CP = [{ step: 'Angular speed', equation: '2π·300/60', value: '31.4 rad/s', subtopic: '', errorType: 'units' }, { step: 'Torque', equation: '50000/31.4', value: '1.59 kNm', subtopic: '', errorType: 'algebra-calculus' }];
const SOLUTION = { breakdown: '## Solution\nT = P/ω = 1.59 kNm', fbd: '', diagram: null, answer: '1.59 kNm', schemeFile: null };
const noAi = { ready: () => true, solve: async () => { throw new Error('the AI should not be called'); } };
const cheap = { ready: () => true, solve: async () => ({ answer: '9 kNm', checkpoints: [{ step: 'cheap guess', equation: '', value: '', subtopic: '', errorType: 'units' }] }) };

test('an agreed shared solution is the key, with its checkpoints and its level, and no AI is called', async () => {
  resetSharedForTests();
  await shareSolution('EMM 302', Q, CP, { level: 'agreed', model: 'opus', answer: '1.59 kNm', solution: SOLUTION });
  const right = await checkAnswer({ unit: 'EMM 302', questionId: 'g1', answer: '1.59 kNm' }, noAi);
  assert.equal(right.verdict, 'right');
  assert.equal(right.key.label, 'two solvers agree');
  assert.equal(right.key.level, 'agreed');
  assert.equal(right.attempt.fromClass, true);
  const wrong = await checkAnswer({ unit: 'EMM 302', questionId: 'g1', answer: '2 kNm' }, noAi);
  assert.equal(wrong.verdict, 'wrong');
  assert.equal(wrong.checkpoints.length, 2);
});

test('a strong single solve is used too, and labelled as not double-checked', async () => {
  resetSharedForTests();
  delete data.paperq.find((q) => q.id === 'g1').key;
  await shareSolution('EMM 302', Q, CP, { level: 'single', model: 'opus', answer: '1.59 kNm' });
  const r = await checkAnswer({ unit: 'EMM 302', questionId: 'g1', answer: '1.59 kNm' }, noAi);
  assert.equal(r.key.label, 'solved once, not double-checked');
});

test('a cheap shared solve is not used as a key', async () => {
  resetSharedForTests();
  delete data.paperq.find((q) => q.id === 'g1').key;
  await shareSolution('EMM 302', Q, CP, { level: 'single', model: 'gemini-3.8-flash', answer: '1.59 kNm' });
  const r = await checkAnswer({ unit: 'EMM 302', questionId: 'g1', answer: '9 kNm' }, cheap);
  assert.equal(r.key.source, 'ai');
});

test('the full solution comes from the class, with its level', async () => {
  resetSharedForTests();
  const row = data.paperq.find((q) => q.id === 'g1');
  delete row.explain;
  await shareSolution('EMM 302', Q, CP, { level: 'key', model: 'opus', answer: '1.59 kNm', solution: SOLUTION });
  const sol = await explainQuestion({ unit: 'EMM 302', questionId: 'g1' }, { explain: async () => { throw new Error('no AI'); }, ready: () => true });
  assert.equal(sol.level, 'key');
  assert.match(sol.breakdown, /1\.59 kNm/);
  assert.equal(await classExplain(data.paperq.find((q) => q.id === 'p1')), null); // a pasted question never reads shared rows
});

test('a typed key and a pasted question are never shared', async () => {
  resetSharedForTests();
  const shared = { get: sharedSolution, put: shareSolution };
  const typed = data.attempts.length;
  data.attempts.push({ id: 'at-typed', unit: 'EMM 302', questionId: 'g1', topicId: 't1', verdict: 'right', keySource: 'you', keyAnswer: '7 kNm', checkpoints: [] });
  data.attempts.push({ id: 'at-paste', unit: 'EMM 302', questionId: 'p1', topicId: 't1', verdict: 'right', keySource: 'ai', keyAnswer: '10 kNm', checkpoints: [] });
  await ensureCheckpoints({ id: 'at-typed' }, { ...cheap, shared, modelName: () => 'gemini-3.8-flash' });
  await ensureCheckpoints({ id: 'at-paste' }, { ...cheap, shared, modelName: () => 'gemini-3.8-flash' });
  assert.equal(await sharedSolution('EMM 302', Q), null);
  assert.equal(await sharedSolution('EMM 302', PASTED), null);
  assert.ok(data.attempts.length >= typed);
});

test('a cheap solve on a question from the files is shared as single, and never over a checked one', async () => {
  resetSharedForTests();
  const shared = { get: sharedSolution, put: shareSolution };
  data.attempts.push({ id: 'at-ai', unit: 'EMM 302', questionId: 'g1', topicId: 't1', verdict: 'right', keySource: 'ai', keyAnswer: '9 kNm', checkpoints: [] });
  await ensureCheckpoints({ id: 'at-ai' }, { ...cheap, shared, modelName: () => 'gemini-3.8-flash' });
  assert.equal((await sharedSolution('EMM 302', Q)).model, 'gemini-3.8-flash');
  await shareSolution('EMM 302', Q, CP, { level: 'key', model: 'opus', answer: '1.59 kNm' });
  assert.equal(await shareSolution('EMM 302', Q, [{ step: 'cheap' }], { level: 'single', model: 'gemini-3.8-flash' }), false);
  assert.equal((await sharedSolution('EMM 302', Q)).level, 'key');
});

test('a flag on a shared solution counts once per student', async () => {
  resetSharedForTests();
  delete data.paperq.find((q) => q.id === 'g1').key;
  await shareSolution('EMM 302', Q, CP, { level: 'agreed', model: 'opus', answer: '1.59 kNm' });
  const flags = [];
  const flag = async (unit, text) => { flags.push(text); };
  const one = await checkAnswer({ unit: 'EMM 302', questionId: 'g1', answer: '3 kNm' }, noAi);
  const two = await checkAnswer({ unit: 'EMM 302', questionId: 'g1', answer: '4 kNm' }, noAi);
  await disputeSolution({ id: one.attempt.id, step: 2 }, { flag });
  await disputeSolution({ id: two.attempt.id, step: 2 }, { flag });
  assert.equal(flags.length, 1);
});
