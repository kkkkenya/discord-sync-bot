import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTeachGaps, checkSubtopic, matchGaps, words } from '../server/analysis.js';

const subs = () => [
  { id: 'a', name: 'Sign convention', audit: 'solid' },
  { id: 'b', name: 'Principal stresses', audit: 'untested' },
  { id: 'c', name: 'Max in-plane vs 3D shear', audit: 'stuck' },
  { id: 'd', name: 'Drawing the circle', audit: 'solid' },
];

test('words drops filler and plurals', () => {
  assert.deepEqual(words('The principal stresses and the sign conventions'), ['principal', 'stress', 'sign', 'convention']);
});

test('teach-back gaps map to the sub-topic they name', () => {
  const r = matchGaps([
    'Did not state the sign convention for shear on the element',
    'Missing how principal stresses come from the circle centre and radius',
    'Units of stress never given',
  ], subs());
  assert.deepEqual(r.matched.map((m) => m.id), ['a', 'b']);
  assert.deepEqual(r.unmatched, ['Units of stress never given']);
});

test('a gap flags solid/untested as shaky but never softens stuck', () => {
  const list = subs();
  const r = applyTeachGaps(list, ['sign convention wrong', 'confused max in-plane shear with 3D shear', 'principal stresses missing'], '2026-10-28T10:00:00Z');
  assert.deepEqual(r.flagged.sort(), ['a', 'b', 'c']);
  assert.equal(list[0].audit, 'shaky');
  assert.equal(list[0].auditFrom, 'teach');
  assert.equal(list[1].audit, 'shaky');
  assert.equal(list[2].audit, 'stuck');
  assert.equal(list[2].lastTested, '2026-10-28T10:00:00Z');
  assert.equal(list[3].audit, 'solid', 'untouched');
});

test('sub-topic validation', () => {
  assert.deepEqual(checkSubtopic({ name: ' Mohr ' }, { create: true }), { name: 'Mohr', audit: 'untested', kind: 'concept', mistakeCount: 0 });
  assert.throws(() => checkSubtopic({ name: '' }, { create: true }), /name/);
  assert.throws(() => checkSubtopic({ audit: 'ok' }), /audit/);
  assert.throws(() => checkSubtopic({ kind: 'trick' }), /kind/);
  assert.deepEqual(checkSubtopic({ audit: 'stuck' }), { audit: 'stuck' });
});

const { weakness, weakspotReport } = await import('../server/analysis.js');
const NOW = Date.parse('2026-10-28T12:00:00Z');
const at = (daysAgo) => new Date(NOW - daysAgo * 86400000).toISOString();

test('weakness: audit base, +0.1 per recent failure, -0.1 per clean solve, clamped', () => {
  const sub = { id: 'x', audit: 'shaky' };
  assert.equal(weakness(sub, [], NOW), 0.6);
  const attempts = [
    { subtopicId: 'x', verdict: 'wrong', errorType: 'units', at: at(1) },
    { subtopicId: 'x', verdict: 'wrong', errorType: 'units', at: at(3) },
    { subtopicId: 'x', verdict: 'wrong', errorType: 'units', at: at(20) }, // too old
    { subtopicId: 'x', verdict: 'right', at: at(2) },
  ];
  assert.equal(weakness(sub, attempts, NOW), 0.7);
  assert.equal(weakness({ id: 'y', audit: 'untested' }, [], NOW), 0.7);
  assert.equal(weakness({ id: 'x', audit: 'stuck' }, attempts, NOW), 1);
  assert.equal(weakness({ id: 'z', audit: 'solid' }, [{ subtopicId: 'z', verdict: 'right', at: at(1) }, { subtopicId: 'z', verdict: 'right', at: at(1) }], NOW), 0);
});

test('the matrix ranks by exam weight × weakness, explains itself, and skips solid or muted', () => {
  const topics = [{ id: 'beta', name: 'Beta functions' }, { id: 'four', name: 'Fourier series' }, { id: 'pde', name: 'Heat equation' }];
  const subtopics = [
    { id: 'b1', unit: 'ECU 300', topicId: 'beta', name: 'Trig integrals as beta', audit: 'shaky' },
    { id: 'b2', unit: 'ECU 300', topicId: 'beta', name: 'B(m,n) via gamma', audit: 'solid' },
    { id: 'f1', unit: 'ECU 300', topicId: 'four', name: 'Half-range series', audit: 'stuck' },
    { id: 'p1', unit: 'ECU 300', topicId: 'pde', name: 'Separation of variables', audit: 'untested' },
  ];
  const ranked = [
    { topicId: 'beta', weight: 25, pinned: true, questions: 1, evidence: 'appeared in 1 of 1 paper' },
    { topicId: 'four', weight: 0, muted: true, questions: 2, evidence: 'x' },
    { topicId: 'pde', weight: 10, questions: 2, evidence: 'appeared in 2 of 3 papers' },
  ];
  const attempts = [
    { subtopicId: 'b1', verdict: 'wrong', errorType: 'sign-convention', at: at(1) },
    { subtopicId: 'b1', verdict: 'wrong', errorType: 'sign-convention', at: at(2) },
    { subtopicId: 'p1', verdict: 'wrong', errorType: 'units', at: at(2) },
    { subtopicId: 'p1', verdict: 'wrong', errorType: 'units', at: at(3) },
    { subtopicId: 'p1', verdict: 'wrong', errorType: 'units', at: at(4) },
    { subtopicId: 'b2', verdict: 'wrong', errorType: 'algebra-calculus', at: at(40) },
  ];
  const r = weakspotReport({ topics, subtopics, attempts, ranked, now: NOW });
  assert.deepEqual(r.critical.map((c) => [c.subtopicId, c.priority]), [['b1', 20], ['p1', 10]]);
  assert.match(r.critical[0].reason, /shaky · 2 broken checkpoints in 14 days \(mostly sign convention\) · pinned by the lecturer/);
  assert.match(r.critical[0].next, /sign convention down first/);
  assert.match(r.critical[1].next, /tracking every unit/);
  assert.ok(!r.critical.some((c) => c.subtopicId === 'f1'), 'muted by the lecturer near the paper');
  assert.ok(!r.critical.some((c) => c.subtopicId === 'b2'), 'solid with no recent failures');
  assert.equal(r.errors.total, 5);
  assert.deepEqual(r.errors.counts.map((c) => [c.id, c.n]), [['units', 3], ['sign-convention', 2]]);
  assert.equal(r.errors.takeaway, '5 of your last 5 errors were units / conversion and sign convention, not formula recall.');
});

test('no data: an untested sub-topic still shows, with a way in; no errors, no takeaway', () => {
  const r = weakspotReport({ topics: [{ id: 't', name: 'T' }], subtopics: [{ id: 's', unit: 'U', topicId: 't', name: 'S', audit: 'untested' }], now: NOW });
  assert.equal(r.critical[0].priority, 0.7);
  assert.equal(r.critical[0].action, 'audit');
  assert.deepEqual(r.errors, { total: 0, counts: [], takeaway: '' });
});
