import test from 'node:test';
import assert from 'node:assert/strict';
import { dueJobs, revealReady, REVEAL_GAP_MS } from '../src/due.js';

const SCHEDULE = [{ job: 'trivia', at: '10:00' }, { job: 'reveal', at: '16:00' }, { job: 'news', at: '19:00' }];
const DAY = '2026-11-01';
const at = (h, m = 0) => h * 60 + m;

test('nothing is due before its slot', () => {
  assert.deepEqual(dueJobs(SCHEDULE, {}, DAY, at(9, 59)), []);
});

test('jobs are due from their slot time, in schedule order', () => {
  assert.deepEqual(dueJobs(SCHEDULE, {}, DAY, at(10)), ['trivia']);
  assert.deepEqual(dueJobs(SCHEDULE, {}, DAY, at(20)), ['trivia', 'reveal', 'news']);
});

test('a job already done today is skipped; one done yesterday is due again', () => {
  assert.deepEqual(dueJobs(SCHEDULE, { trivia: DAY }, DAY, at(16, 5)), ['reveal']);
  assert.deepEqual(dueJobs(SCHEDULE, { trivia: '2026-10-31' }, DAY, at(10, 5)), ['trivia']);
});

test('--now runs everything not done today, except an early reveal', () => {
  assert.deepEqual(dueJobs(SCHEDULE, { news: DAY }, DAY, at(8), { now: true }), ['trivia']);
  assert.deepEqual(dueJobs(SCHEDULE, {}, DAY, at(17), { now: true }), ['trivia', 'reveal', 'news']);
});

test('the reveal waits 3 hours after the trivia was posted', () => {
  const postedAt = Date.parse('2026-11-01T10:30:00+03:00');
  assert.equal(revealReady({ postedAt }, postedAt + REVEAL_GAP_MS - 1), false);
  assert.equal(revealReady({ postedAt }, postedAt + REVEAL_GAP_MS), true);
});

test('an old trivia row without postedAt counts as old enough', () => {
  assert.equal(revealReady({ day: DAY }, Date.now()), true);
});
