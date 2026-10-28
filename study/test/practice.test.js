import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { weakness } = await import('../server/analysis.js');
const { breakOf, checkAnswer, ensureCheckpoints, flagCheckpoint, markBroke, schemeFor } = await import('../server/practice.js');

data.subtopics.push(
  { id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Sign convention', audit: 'solid', at: 'x' },
  { id: 's2', unit: 'EMM 302', topicId: 't1', name: 'Principal stresses', audit: 'shaky', at: 'x' },
);
const row = () => ({ id: 'q1', unit: 'EMM 302', fileId: 'f1', source: 'EMM 302 CAT 1 2023.pdf', year: 2023, type: 'CAT1', number: 1, marks: 10, text: 'A plane stress element has sx = 80 MPa, sy = 20 MPa and txy = 40 MPa. Find the maximum principal stress.', topicId: 't1', subtopicIds: ['s2'], topicFrom: 'you' });
data.paperq.push(row());

const SOLVED = { answer: '90 MPa', checkpoints: [
  { step: 'State the sign convention', equation: 'tension positive', value: '-', subtopic: 'Sign convention', errorType: 'sign-convention' },
  { step: 'Mean stress', equation: '(80+20)/2', value: '50 MPa', subtopic: 'Principal stresses', errorType: 'algebra-calculus' },
  { step: 'Radius', equation: 'sqrt(30^2+40^2)', value: '50 MPa', subtopic: 'Principal stresses', errorType: 'wrong-equation' },
  { step: 'Maximum principal stress', equation: '50+50', value: '100 MPa', subtopic: 'Nonsense', errorType: 'bogus' },
] };
let calls = 0;
const ai = { ready: () => true, solve: async () => { calls++; return structuredClone(SOLVED); } };
const noAi = { ready: () => false, solve: async () => { throw new Error('should not be called'); } };
const ask = (body, o = ai) => checkAnswer({ unit: 'EMM 302', questionId: 'q1', ...body }, o);

test('with no key and no AI it asks for a key instead of guessing', async () => {
  const r = await ask({ answer: '90 MPa' }, noAi);
  assert.equal(r.needKey, true);
  assert.equal(data.attempts.length, 0);
});

test('a typed key accepts the right answer in other units, with no AI at all', async () => {
  const r = await ask({ answer: '0.09 GPa', key: '90 MPa' }, noAi);
  assert.deepEqual([r.verdict, r.key.source, r.key.label], ['right', 'you', 'your answer key']);
  assert.deepEqual(data.attempts.map((a) => [a.verdict, a.keySource, a.subtopicId]), [['right', 'you', 's2']]);
  assert.equal(data.paperq[0].key.answer, '90 MPa', 'the key is kept for next time');
});

test('an unreadable answer is not saved or marked', async () => {
  const before = data.attempts.length;
  const r = await ask({ answer: 'about 90' }, noAi);
  assert.equal(r.verdict, 'unreadable');
  assert.equal(data.attempts.length, before);
});

test('an AI-solved key is labelled "verify", and a wrong answer shows tidy checkpoints but blames nothing yet', async () => {
  delete data.paperq[0].key;
  data.attempts.length = 0;
  const r = await ask({ answer: '100 MPa' });
  assert.deepEqual([r.verdict, r.key.source, r.key.label], ['wrong', 'ai', 'AI-solved: verify']);
  assert.deepEqual(r.checkpoints.map((c) => [c.n, c.subtopicId, c.errorType]), [[1, 's1', 'sign-convention'], [2, 's2', 'algebra-calculus'], [3, 's2', 'wrong-equation'], [4, 's2', null]]);
  assert.equal(data.attempts[0].verdict, 'mismatch');
  const s2 = data.subtopics.find((s) => s.id === 's2');
  assert.equal(weakness(s2, data.attempts), 0.6, 'a mismatch does not move the weakspot');
  await ask({ answer: '90 MPa' });
  assert.equal(calls, 1, 'the saved key and checkpoints are reused');
});

test('Broke here counts as a failure on that sub-topic; marking again replaces the mark', () => {
  const s1 = data.subtopics.find((x) => x.id === 's1');
  const s2 = data.subtopics.find((x) => x.id === 's2');
  const id = data.attempts.find((a) => a.verdict === 'mismatch').id;
  data.attempts = data.attempts.filter((a) => a.verdict !== 'right'); // so only the failure moves the score
  const a = markBroke({ id, step: 2, subtopicId: 's2', errorType: 'algebra-calculus' });
  assert.deepEqual([a.verdict, a.brokeAt, a.errorType, a.subtopicId], ['wrong', 2, 'algebra-calculus', 's2']);
  assert.equal(s2.mistakeCount, 1);
  assert.equal(weakness(s2, data.attempts), 0.7, 'shaky 0.6 + 0.1 for one broken checkpoint');
  markBroke({ id, step: 1, subtopicId: 's1', errorType: 'sign-convention' });
  assert.deepEqual([s1.mistakeCount, s2.mistakeCount], [1, 0]);
  assert.equal(weakness(s2, data.attempts), 0.6);
  assert.equal(weakness(s1, data.attempts), 0.2, 'solid 0.1 + 0.1');
  // the context pack's "where my working broke" needs the question and the step, not just ids
  const f = breakOf(data.attempts.find((x) => x.id === id));
  assert.match(f.question, /^EMM 302 CAT 1 2023\.pdf Q1: A plane stress element/);
  assert.equal(f.checkpoint, 'State the sign convention');
});

test('Broke here refuses a step that is not a checkpoint, an unknown mistake type, and a right answer', async () => {
  const id = data.attempts.find((a) => a.verdict === 'wrong').id;
  assert.throws(() => markBroke({ id, step: 9, errorType: 'units' }), /numbered checkpoints/);
  assert.throws(() => markBroke({ id, step: 1, errorType: 'bad' }), /kind of mistake/);
  assert.throws(() => markBroke({ id, step: 1, subtopicId: 'nope', errorType: 'units' }), /sub-topic/);
  await ask({ answer: '90 MPa' });
  const right = data.attempts.at(-1);
  assert.equal(right.verdict, 'right');
  assert.throws(() => markBroke({ id: right.id, step: 1, errorType: 'units' }), /no broken step/);
  assert.throws(() => flagCheckpoint({ id: right.id }), /nothing to dispute/);
});

test('"This checkpoint looks wrong" saves the flag, holds nothing against you, and forgets an AI key', async () => {
  const before = data.subtopics.map((x) => [x.id, x.mistakeCount || 0]);
  await ask({ answer: '95 MPa' });
  const id = data.attempts.at(-1).id;
  assert.equal(data.attempts.at(-1).verdict, 'mismatch');
  const a = flagCheckpoint({ id, step: 3, note: 'radius should be 50' });
  assert.deepEqual([a.verdict, a.flag.step, a.flag.note], ['disputed', 3, 'radius should be 50']);
  assert.deepEqual(data.subtopics.map((x) => [x.id, x.mistakeCount || 0]), before);
  assert.equal(data.attempts.filter((x) => x.verdict === 'wrong').length, 1, 'only the earlier Broke here counts');
  assert.equal(data.paperq[0].key, undefined, 'the AI key is dropped so it is solved again');
  assert.throws(() => flagCheckpoint({ id: data.attempts.find((x) => x.verdict === 'wrong').id }), /already marked/);
});

test('a key you typed survives a dispute, and replaces the AI key', async () => {
  await ask({ answer: '95 MPa', key: '100 MPa' });
  assert.equal(data.paperq[0].key.source, 'you');
  assert.equal(data.paperq[0].key.checkpoints.length, 4, 'checkpoints for the typed key were written');
  flagCheckpoint({ id: data.attempts.at(-1).id, step: 1 });
  assert.equal(data.paperq[0].key.answer, '100 MPa');
});

test('a pasted question works too, and an AI failure falls back to asking for a key', async () => {
  const r = await checkAnswer({ unit: 'EMM 302', question: 'Find the deflection of a cantilever of length 2 m under 5 kN at the tip.', answer: '3 mm', key: '3.0 mm' }, noAi);
  assert.equal(r.verdict, 'right');
  assert.equal(data.attempts.at(-1).questionId, null);
  const failing = { ready: () => true, solve: async () => { throw new Error('Gemini 503'); } };
  const f = await checkAnswer({ unit: 'EMM 302', question: 'Find the deflection of a cantilever of length 2 m under 5 kN at the tip.', answer: '3 mm' }, failing);
  assert.match(f.message, /Gemini 503/);
  await assert.rejects(checkAnswer({ unit: 'EMM 302', question: 'short', answer: '1' }, noAi), /Pick a past-paper question/);
  await assert.rejects(checkAnswer({ unit: 'XYZ 1', question: 'long enough question text here', answer: '1' }, noAi), /Pick one of your units/);
});

test('a marking scheme is found by the paper itself saying so, or by name, year and type', () => {
  const files = {
    f1: { unit: 'EMM 302', name: 'EMM 302 CAT 1 2023.pdf', text: 'CAT 1 questions' },
    f2: { unit: 'EMM 302', name: 'EMM 302 CAT 1 2023 marking scheme.pdf', text: 'Q1 answer 90 MPa' },
    f3: { unit: 'EMM 302', name: 'EMM 302 CAT 1 2019 marking scheme.pdf', text: 'old' },
    f4: { unit: 'EMM 308', name: 'EAR 302 CAT Solution.pdf', text: 'CAT Solution Answer all questions' },
  };
  assert.equal(schemeFor({ unit: 'EMM 302', fileId: 'f1', year: 2023, type: 'CAT1' }, files).name, 'EMM 302 CAT 1 2023 marking scheme.pdf');
  assert.equal(schemeFor({ unit: 'EMM 302', fileId: 'f1', year: 2021, type: 'CAT1' }, files), null);
  assert.equal(schemeFor({ unit: 'EMM 308', fileId: 'f4', type: 'CAT' }, files).name, 'EAR 302 CAT Solution.pdf');
  assert.equal(schemeFor({ unit: 'EMM 302' }, files), null);
});

test('"Show checkpoints" on a right answer writes them once, without a second attempt', async () => {
  data.paperq[0].key = { answer: '100 MPa', source: 'you', checkpoints: [] };
  await ask({ answer: '100 MPa' }, noAi);
  const a = data.attempts.at(-1);
  assert.deepEqual([a.verdict, a.checkpoints.length], ['right', 0]);
  const none = await ensureCheckpoints({ id: a.id }, noAi);
  assert.match(none.note, /need the built-in AI/);
  const n = data.attempts.length;
  const got = await ensureCheckpoints({ id: a.id }, ai);
  assert.equal(got.checkpoints.length, 4);
  assert.equal(data.attempts.length, n);
  assert.equal(data.attempts.at(-1).checkpoints.length, 4);
  assert.equal(data.paperq[0].key.checkpoints.length, 4);
  await assert.rejects(ensureCheckpoints({ id: 'nope' }, ai), /not found/);
});
