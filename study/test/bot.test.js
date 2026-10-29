import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
for (const k of ['GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY']) delete process.env[k]; // no AI: keys come from the question
const { data } = await import('../server/store.js');
const { eveningText, reply } = await import('../server/bot.js');

const TODAY = '2026-10-28';
data.subtopics.push({ id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Principal stresses', audit: 'shaky', at: 'x' });
data.paperq.push({
  id: 'q1', unit: 'EMM 302', fileId: 'f1', source: 'EMM 302 CAT 1 2023.pdf', year: 2023, type: 'CAT1', number: 1, marks: 10,
  text: 'A plane stress element has sx = 80 MPa, sy = 20 MPa and txy = 40 MPa. Find the maximum principal stress.', topicId: 't1', subtopicIds: ['s1'], topicFrom: 'you',
  key: { answer: '100 MPa', source: 'you', checkpoints: [
    { n: 1, step: 'Mean stress', equation: '(80+20)/2', value: '50 MPa', subtopicId: 's1', errorType: null },
    { n: 2, step: 'Radius', equation: 'sqrt(30^2+40^2)', value: '50 MPa', subtopicId: 's1', errorType: 'algebra-calculus' },
  ] },
});

test('mark gives a past-paper question to try, then checks a final answer in any unit', async () => {
  assert.match(await reply('mark 5 kN'), /mark EMM 302/, 'no question yet: it says how to get one');
  const q = await reply('mark EMM 302');
  assert.match(q, /EMM 302 CAT 1 2023\.pdf Q1/);
  assert.match(q, /maximum principal stress/);
  assert.match(await reply('mark 0.1 GPa'), /Matches the key/);
});

test('a wrong answer lists the checkpoints, and "mark broke" logs where the working broke', async () => {
  await reply('mark EMM 302');
  const r = await reply('mark 90 MPa');
  assert.match(r, /Doesn.t match/);
  assert.match(r, /2\. Radius/);
  assert.match(r, /mark broke/);
  const b = await reply('mark broke 2 units');
  assert.match(b, /Radius/);
  assert.match(b, /Units \/ conversion/);
  const a = data.attempts.at(-1);
  assert.deepEqual([a.verdict, a.brokeAt, a.errorType, a.subtopicId], ['wrong', 2, 'units', 's1']);
});

test('mark explains itself: a photo, a dispute', async () => {
  assert.match(await reply('mark EMM 302', { photo: true }), /type your final answer/i);
  await reply('mark EMM 302');
  await reply('mark 70 MPa');
  assert.match(await reply('mark dispute'), /nothing is held against you/i);
  assert.equal(data.attempts.at(-1).verdict, 'disputed');
});

test('help lists mark, and the evening nudge speaks to the most urgent unit\'s stage', async () => {
  assert.match(await reply('help'), /`mark EMM 302`/);
  data.units.find((u) => u.code === 'EMM 302').catDate = '2026-10-29';
  data.attempts = data.attempts.filter((a) => !a.at.startsWith(TODAY));
  assert.match(eveningText(TODAY), /EMM 302.*tomorrow/);
  assert.match(eveningText(TODAY), /Study kit/);
  data.units.find((u) => u.code === 'EMM 302').catDate = 'TBA';
  assert.doesNotMatch(eveningText(TODAY), /tomorrow/);
});

test('learn: study a topic from Discord, read and examples first, questions last', async () => {
  const t = await reply("learn EMM 302 mohr");
  assert.match(t, /\*\*Study Mohr's circle\*\* \(EMM 302\)/);
  assert.ok(t.indexOf('1. Read') < t.indexOf('2. Worked examples') && t.indexOf('2. Worked examples') < t.indexOf('3. Explain it'));
  assert.match(await reply('learn EMM 302 knitting'), /No topic like "knitting"/);
  assert.match(await reply('help'), /`learn EMM 302 torsion`/);
});
