// Reviews in Today, with the store (fixplan-e E2): the review action in nextActions, its focus, the daily count, and the
// review flag on a checked answer.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
const { add, emptyDoc, withDoc } = await import('../server/store.js');
const { nextActions } = await import('../server/next.js');
const { reviewsDoneOn, reviewsToday } = await import('../server/review-store.js');
const { checkAnswer } = await import('../server/practice.js');

const { nairobiDay } = await import('../server/plan.js');
// Today, and answer times counted back from the moment the test runs: mastery reads "now" on the real today, so fixed
// clock times would make the fade depend on the hour the tests run.
const NOW = Date.now();
const TODAY = nairobiDay(new Date(NOW));
const at = (daysAgo) => new Date(NOW - daysAgo * 864e5).toISOString();

// one topic, five right answers over three weeks: green, and it fades in about two days
const record = () => {
  const doc = emptyDoc();
  doc.units = [{ code: 'EMM 302', title: 'Mechanics', catDate: '2026-12-20', confidence: 3 }];
  doc.topics = [{ id: 't1', unit: 'EMM 302', name: 'Torsion' }];
  doc.subtopics = [{ id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Twist angle', kind: 'method', audit: 'solid', auditAt: at(30) }];
  const ages = [21, 17, 13, 9, 5];
  doc.paperq = ages.map((_, n) => ({ id: `q${n}`, unit: 'EMM 302', topicId: 't1', subtopicIds: ['s1'], fileId: 'f1', source: 'CAT 1 2025', number: n + 1, marks: 10, text: `Torsion question ${n} about a shaft carrying torque.`, year: 2025, key: { answer: '1', source: 'sheet' } }));
  doc.attempts = ages.map((a, n) => ({ id: `a${n}`, unit: 'EMM 302', questionId: `q${n}`, topicId: 't1', subtopicId: 's1', verdict: 'right', at: at(a), answer: '1', checkpoints: [], keySource: 'sheet', keyAnswer: '1' }));
  return doc;
};
const run = async (doc) => (await withDoc(doc, () => nextActions(TODAY, { prepared: new Set(['EMM 302']) }))).result;

test('a green topic that fades within two days is offered as a review, before practise', async () => {
  const out = await run(record());
  const review = out.find((a) => a.kind === 'review');
  assert.ok(review, 'a review action');
  assert.equal(review.label, 'Keep Torsion');
  assert.equal(review.reason, 'Fades in about 2 days. One question keeps it.');
  assert.equal(review.minutes, 10);
  assert.equal(review.focus.section, 'practice');
  assert.equal(review.focus.review, true);
  assert.match(review.focus.questionId, /^q\d$/);
  const kinds = out.map((a) => a.kind);
  assert.ok(kinds.indexOf('review') < kinds.indexOf('practise'), `review before practise: ${kinds}`);
});

test('reviews done today count distinct questions, so a repeat submit or a second tab uses one slot', async () => {
  const doc = record();
  // two separate adds of the same review question (a double submit): one slot
  const { result: one } = await withDoc(doc, () => {
    add('attempts', { unit: 'EMM 302', questionId: 'q0', verdict: 'right', review: true, at: at(0) });
    add('attempts', { unit: 'EMM 302', questionId: 'q0', verdict: 'right', review: true, at: at(0) });
    return reviewsDoneOn(TODAY);
  });
  assert.equal(one, 1);
  // a second, different review question: two slots used, none left
  const { result: two } = await withDoc(doc, () => {
    add('attempts', { unit: 'EMM 302', questionId: 'q1', verdict: 'right', review: true, at: at(0) });
    return reviewsDoneOn(TODAY);
  });
  assert.equal(two, 2);
  const { result: left } = await withDoc(doc, () => reviewsToday(TODAY));
  assert.deepEqual(left, [], 'two done today: none left');
});

test('a review made on another day does not count today', async () => {
  const doc = record();
  doc.attempts.push({ id: 'old', unit: 'EMM 302', questionId: 'q0', verdict: 'right', review: true, at: at(1) });
  const { result } = await withDoc(doc, () => reviewsDoneOn(TODAY));
  assert.equal(result, 0);
});

test('the review flag is kept only for today\'s due review question; any other flag is ignored', async () => {
  const check = (questionId) => withDoc(record(), async () => (await checkAnswer({ unit: 'EMM 302', questionId, answer: '1', review: true }, { ready: () => false })).attempt);
  // q0 is the least recently attempted question on the fading topic: the one the review asks
  const due = (await check('q0')).result;
  assert.equal(due.verdict, 'right');
  assert.equal(due.review, true);
  // q4 was attempted most recently and is not what today's review asks: the flag is dropped
  const other = (await check('q4')).result;
  assert.equal(other.review, undefined);
});
