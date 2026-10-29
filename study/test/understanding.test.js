import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibration, evidenceFor, understand } from '../server/understanding.js';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const topic = { id: 't', unit: 'U', name: 'Couplings' };
const right = (d, q) => ({ topicId: 't', verdict: 'right', questionId: q, at: ago(d) });
const teachBack = (score, gaps, d) => ({ unit: 'U', topic: 'Couplings', feedback: { score, gaps }, at: ago(d) });
const u = (lists, now = NOW) => understand(topic, { subtopics: [], teach: [], attempts: [], mocks: [], paperq: [], ...lists }, now);

test('the worked example in UNDERSTANDING.md: amber, held back by carrying it through (units)', () => {
  const r = u({
    teach: [teachBack(3, ['a', 'b'], 1)],
    attempts: [
      { topicId: 't', verdict: 'wrong', brokeAt: 3, errorType: 'units', questionId: 'q1', checkpoints: [{ errorType: 'concept-gap' }, { errorType: 'sign-convention' }, { errorType: 'units' }, {}, {}], at: ago(2) },
      right(0, 'q2'),
    ],
  });
  assert.ok(Math.abs(r.U - 0.58) < 0.01, r.U);
  assert.equal(r.status, 'amber');
  assert.equal(r.bottleneck, 'do');
  assert.match(r.next, /units/);
});

test('steps after the broken one say nothing: only the steps before it count as held', () => {
  const ev = evidenceFor(topic, { attempts: [{ topicId: 't', verdict: 'wrong', brokeAt: 2, errorType: 'units', checkpoints: [{ errorType: 'concept-gap' }, { errorType: 'units' }, { errorType: 'sign-convention' }, {}], at: ago(0) }] });
  assert.deepEqual(ev.map((e) => [e.layer, e.y]), [['why', 1], ['do', 0]]);
});

test('nothing tried is red; one lucky answer is not understood', () => {
  assert.equal(u({}).status, 'red');
  assert.equal(u({ attempts: [right(0, 'q1')] }).status, 'amber');
});

test('solving the same question again proves less than solving new ones', () => {
  const same = u({ attempts: [0, 1, 2, 3].map((d) => right(d, 'q1')) });
  const fresh = u({ attempts: [0, 1, 2, 3].map((d) => right(d, `q${d}`)) });
  assert.ok(fresh.lo > same.lo + 0.05, `${fresh.lo} vs ${same.lo}`);
});

test('a teach-back plus 4 different questions over 2 weeks is understood, and it fades if left alone', () => {
  const lists = { teach: [teachBack(5, [], 12)], attempts: [right(12, 'a'), right(8, 'b'), right(4, 'c'), right(1, 'd')] };
  const r = u(lists);
  assert.equal(r.status, 'green');
  assert.ok(r.lastsDays >= 4 && r.lastsDays <= 90, r.lastsDays);
  assert.equal(u(lists, NOW + 60 * 86400000).status, 'amber', 'two months untouched');
});

test('new unit slips pull an understood topic back, and say so', () => {
  const r = u({
    teach: [teachBack(5, [], 12)],
    attempts: [right(12, 'a'), right(8, 'b'), right(4, 'c'), right(3, 'd'),
      { topicId: 't', verdict: 'wrong', brokeAt: 4, errorType: 'units', questionId: 'e', checkpoints: [{}, {}, {}, {}], at: ago(1) },
      { topicId: 't', verdict: 'wrong', brokeAt: 3, errorType: 'units', questionId: 'f', checkpoints: [{}, {}, {}], at: ago(0) }],
  });
  assert.notEqual(r.status, 'green');
  assert.equal(r.bottleneck, 'do');
});

test('an untried sub-topic holds the topic back until it is tried', () => {
  const lists = { teach: [teachBack(5, [], 12)], attempts: [right(12, 'a'), right(8, 'b'), right(4, 'c'), right(1, 'd')] };
  const r = u({ ...lists, subtopics: [{ id: 's1', topicId: 't', name: 'Bolt shear', kind: 'method' }] });
  assert.notEqual(r.status, 'green');
  assert.match(r.next, /Bolt shear/);
});

test('self-ratings count only as far as they have proved right (calibration)', () => {
  const subtopics = [{ id: 's1', topicId: 't', name: 'Bolt shear', kind: 'method', audit: 'solid', auditAt: ago(1), auditFrom: 'you' }];
  const broke = (d, q) => ({ topicId: 't', subtopicId: 's1', verdict: 'wrong', brokeAt: 1, errorType: 'sign-convention', questionId: q, checkpoints: [{}], at: ago(d) });
  const overconfident = calibration([topic], { subtopics, teach: [], attempts: [broke(2, 'a'), broke(1, 'b')], mocks: [], paperq: [] }, NOW);
  const accurate = calibration([topic], { subtopics, teach: [], attempts: [right(2, 'a'), right(1, 'b')].map((a) => ({ ...a, subtopicId: 's1' })), mocks: [], paperq: [] }, NOW);
  assert.ok(overconfident < 0.5 && accurate > 0.8, `${overconfident} ${accurate}`);
});
