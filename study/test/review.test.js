// Reviews in Today (fixplan-e E2): the pure due list and the question it asks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReviews, pickQuestion } from '../server/review.js';

const green = (lastsDays) => ({ status: 'green', lastsDays });
const topics = [
  { id: 't1', unit: 'EMM 302', name: 'Torsion' },
  { id: 't2', unit: 'EMM 302', name: 'Bending' },
  { id: 't3', unit: 'ECU 300', name: 'Filters' },
];
const questions = [
  { id: 'q1', unit: 'EMM 302', topicId: 't1' },
  { id: 'q2', unit: 'EMM 302', topicId: 't2' },
  { id: 'q3', unit: 'ECU 300', topicId: 't3' },
];
const run = (o) => dueReviews({ topics, questions, units: [{ code: 'EMM 302', days: 20 }, { code: 'ECU 300', days: 30 }], ...o });

test('nothing due on an empty record', () => {
  assert.deepEqual(run({ understandingOf: () => ({ status: 'red', lastsDays: null }) }), []);
  assert.deepEqual(dueReviews({}), []);
});

test('a green topic is due at 2 days left, not at 4', () => {
  const at = (days) => run({ topics: [topics[0]], understandingOf: () => green(days) });
  assert.equal(at(2).length, 1);
  assert.equal(at(1).length, 1);
  assert.deepEqual(at(4), []);
  assert.deepEqual(run({ topics: [topics[0]], understandingOf: () => ({ status: 'amber', lastsDays: 1 }) }), [], 'amber is not green');
});

test('a review says what it is and which question it asks, with the plain reason', () => {
  const [r] = run({ topics: [topics[0]], understandingOf: () => green(1) });
  assert.deepEqual({ unit: r.unit, topicId: r.topicId, topic: r.topic, lastsDays: r.lastsDays, questionId: r.questionId }, { unit: 'EMM 302', topicId: 't1', topic: 'Torsion', lastsDays: 1, questionId: 'q1' });
  assert.equal(r.reason, 'Fades in about 1 day. One question keeps it.');
});

test('at most two a day, less the ones done today', () => {
  const u = { understandingOf: () => green(2) };
  assert.equal(run(u).length, 2);
  assert.equal(run({ ...u, doneToday: 1 }).length, 1);
  assert.deepEqual(run({ ...u, doneToday: 2 }), []);
});

test('soonest paper first, then lowest lastsDays', () => {
  const understandingOf = (id) => ({ t1: green(2), t2: green(1), t3: green(1) }[id]);
  const out = run({ understandingOf, doneToday: 0 });
  assert.deepEqual(out.map((r) => r.topicId), ['t2', 't1']); // EMM 302 (20 days) first, lower lastsDays first; the cap of two drops ECU 300 (30 days)
  const [first] = run({ understandingOf, units: [{ code: 'EMM 302', days: 20 }, { code: 'ECU 300', days: 5 }] });
  assert.equal(first.unit, 'ECU 300');
});

test('a unit whose paper has passed gives no reviews; a TBA unit still does', () => {
  const understandingOf = () => green(1);
  const out = run({ understandingOf, units: [{ code: 'EMM 302', days: -1 }, { code: 'ECU 300', days: null }] });
  assert.deepEqual(out.map((r) => r.unit), ['ECU 300']);
});

test('in the last three days before a paper, only that unit gets reviews', () => {
  const understandingOf = () => green(1);
  const out = run({ understandingOf, units: [{ code: 'EMM 302', days: 2 }, { code: 'ECU 300', days: 30 }] });
  assert.ok(out.length > 0);
  assert.ok(out.every((r) => r.unit === 'EMM 302'));
  const day3 = run({ understandingOf, units: [{ code: 'EMM 302', days: 3 }, { code: 'ECU 300', days: 30 }] });
  assert.ok(day3.every((r) => r.unit === 'EMM 302'));
  // four days out is no quiet period: the other unit's green topic is offered
  const day4 = run({ understandingOf: (id) => (id === 't3' ? green(1) : { status: 'red', lastsDays: null }), units: [{ code: 'EMM 302', days: 4 }, { code: 'ECU 300', days: 30 }] });
  assert.deepEqual(day4.map((r) => r.unit), ['ECU 300']);
});

test('a topic with no question makes no review', () => {
  assert.deepEqual(run({ topics: [topics[0]], questions: [], understandingOf: () => green(1) }), []);
});

test('question choice: not attempted first, then the least recently attempted, then a key', () => {
  const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(pickQuestion({ questions: qs, attempts: [{ questionId: 'a', at: '2026-11-10T00:00:00Z' }] }).id, 'b');
  const old = [{ questionId: 'a', at: '2026-11-01T00:00:00Z' }, { questionId: 'b', at: '2026-11-10T00:00:00Z' }];
  assert.equal(pickQuestion({ questions: [{ id: 'a' }, { id: 'b' }], attempts: old }).id, 'a');
  const levels = { a: 'single', b: 'key' };
  assert.equal(pickQuestion({ questions: [{ id: 'a' }, { id: 'b' }], levelOf: (q) => levels[q.id] }).id, 'b', 'a key wins a tie');
  assert.equal(pickQuestion({ questions: [] }), null);
});
