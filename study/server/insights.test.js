import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nairobiHour, activeHours, performanceHours, focusVsPerformance, deeperDive, insights } from './insights.js';

const empty = { units: [], topics: [], cards: [], reviews: [], sessions: [], papers: [], teach: [], questions: [], mocks: [] };

test('nairobiHour is UTC+3', () => {
  assert.equal(nairobiHour('2026-10-26T02:00:00Z'), 5); // 02:00Z = 05:00 Nairobi
  assert.equal(nairobiHour('2026-10-26T23:00:00Z'), 2); // 23:00Z = 02:00 next day
});

test('empty store yields sensible output', () => {
  const r = insights(empty, 30, () => 10);
  assert.equal(r.activeHours.every((x) => x === 0), true);
  assert.equal(r.deeper.length, 0);
  assert.equal(r.focus.n, 0);
});

test('activeHours puts sessions and reviews in the right hour', () => {
  const db = {
    ...empty,
    sessions: [{ id: 's1', unit: 'EMM 302', minutes: 50, at: '2026-10-26T03:00:00Z' }],
    reviews: [{ card: 'c1', unit: 'EMM 302', grade: 3, at: '2026-10-26T03:30:00Z' }],
  };
  const r = activeHours(db, 30);
  assert.equal(r.hours[6], 51); // 50 min + 1 event, 06:00 Nairobi
  assert.equal(r.events[6], 2);
});

test('performanceHours computes recall accuracy and scores', () => {
  const db = {
    ...empty,
    reviews: [
      { card: 'c1', unit: 'EMM 302', grade: 4, at: '2026-10-26T03:00:00Z' },
      { card: 'c1', unit: 'EMM 302', grade: 1, at: '2026-10-26T03:30:00Z' },
    ],
    mocks: [{ id: 'm1', unit: 'EMM 302', score: 8, outOf: 10, at: '2026-10-26T03:00:00Z' }],
  };
  const r = performanceHours(db, 30);
  assert.equal(r[6].recall, 50);
  assert.equal(r[6].recallN, 2);
  assert.equal(r[6].score, 80);
});

test('focusVsPerformance buckets reviews after a rated session', () => {
  const db = {
    ...empty,
    sessions: [{ id: 's1', unit: 'EMM 302', minutes: 25, focus: 5, at: '2026-10-26T03:00:00Z' }],
    reviews: [
      { card: 'c1', unit: 'EMM 302', grade: 4, at: '2026-10-26T03:20:00Z' }, // during session
      { card: 'c1', unit: 'EMM 302', grade: 3, at: '2026-10-26T04:30:00Z' }, // within 2h after
    ],
  };
  const r = focusVsPerformance(db, 30);
  assert.equal(r.n, 2);
  assert.equal(r.buckets[4].pct, 100); // focus 5
});

test('deeperDive ranks a lapsing, untaught topic above a well-taught one', () => {
  const now = Date.now();
  const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
  const db = {
    ...empty,
    topics: [
      { id: 't1', unit: 'EMM 302', name: 'Mohr circle' },
      { id: 't2', unit: 'EMM 302', name: 'Bending' },
    ],
    cards: [
      { id: 'c1', unit: 'EMM 302', topic: 'Mohr circle' },
      { id: 'c2', unit: 'EMM 302', topic: 'Bending' },
    ],
    reviews: [
      { card: 'c1', unit: 'EMM 302', grade: 1, at: iso(60) },
      { card: 'c1', unit: 'EMM 302', grade: 1, at: iso(50) },
      { card: 'c1', unit: 'EMM 302', grade: 3, at: iso(40) },
      { card: 'c2', unit: 'EMM 302', grade: 4, at: iso(60) },
      { card: 'c2', unit: 'EMM 302', grade: 4, at: iso(40) },
    ],
    teach: [{ unit: 'EMM 302', topic: 'Bending', feedback: { score: 5 }, at: iso(30) }],
  };
  const d = deeperDive(db, { examDays: () => 20, now });
  assert.equal(d[0].topic, 'Mohr circle');
  assert.equal(d[1].topic, 'Bending');
  assert.equal(d[0].next, 'Teach-back now');
});
