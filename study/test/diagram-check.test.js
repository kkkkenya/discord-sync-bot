import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTruss, jointResiduals, memberLabel } from '../server/diagram-check.js';

// EMM 302 CAT 1 Q3 (Bhavikatti Example 4.4): the lecturer's printed answers.
export const CAT1_TRUSS = {
  kind: 'truss',
  nodes: [
    { id: 'A', x: 0, y: 0 }, { id: 'B', x: 2, y: 0 }, { id: 'D', x: 4, y: 0 }, { id: 'F', x: 6, y: 0 }, { id: 'H', x: 9, y: 0 },
    { id: 'C', x: 2, y: -4 / 3 }, { id: 'E', x: 4, y: -8 / 3 }, { id: 'G', x: 6, y: -4 },
  ],
  members: [
    { a: 'A', b: 'B', force: 15 }, { a: 'B', b: 'D', force: 15 }, { a: 'D', b: 'F', force: 15 }, { a: 'F', b: 'H', force: 15 },
    { a: 'A', b: 'C', force: -18.03 }, { a: 'C', b: 'E', force: -18.03 }, { a: 'E', b: 'G', force: -18.03 },
    { a: 'B', b: 'C', force: 0 }, { a: 'C', b: 'D', force: 0 }, { a: 'D', b: 'E', force: 0 }, { a: 'E', b: 'F', force: 0 },
    { a: 'F', b: 'G', force: -12 }, { a: 'H', b: 'G', force: -25 },
  ],
  supports: [{ node: 'A', type: 'roller' }, { node: 'G', type: 'pin' }],
  loads: [{ node: 'F', fx: 0, fy: -12, label: '12 kN' }, { node: 'H', fx: 0, fy: -20, label: '20 kN' }],
  reactions: [{ node: 'A', fx: 0, fy: -10, label: 'V_A = 10 kN' }, { node: 'G', fx: 0, fy: 42, label: 'R_G = 42 kN' }],
};

test('the CAT 1 truss balances at every joint with the printed answers', () => {
  const r = checkTruss(CAT1_TRUSS);
  assert.equal(r.ok, true, `unbalanced: ${r.unbalanced}`);
  assert.ok(r.worst < 0.05);
});

test('one wrong member force is caught at both of its joints', () => {
  const wrong = { ...CAT1_TRUSS, members: CAT1_TRUSS.members.map((m) => (m.a === 'H' ? { ...m, force: 25 } : m)) };
  const r = checkTruss(wrong);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unbalanced.sort(), ['G', 'H']);
});

test('a wrong reaction is caught, and a missing force means not checked', () => {
  const r = checkTruss({ ...CAT1_TRUSS, reactions: [{ node: 'A', fx: 0, fy: 10 }, { node: 'G', fx: 0, fy: 22 }] });
  assert.equal(r.ok, false);
  const gap = checkTruss({ ...CAT1_TRUSS, members: CAT1_TRUSS.members.map((m, i) => (i ? m : { ...m, force: null })) });
  assert.equal(gap.complete, false);
  assert.equal(gap.ok, false);
});

test('joint residuals: a two-member joint in tension pulls toward both members', () => {
  const d = { nodes: [{ id: 'P', x: 0, y: 0 }, { id: 'Q', x: 1, y: 0 }], members: [{ a: 'P', b: 'Q', force: 5 }] };
  const [p, q] = jointResiduals(d);
  assert.deepEqual([p.fx, q.fx], [5, -5]);
});

test('member labels say tension or compression', () => {
  assert.equal(memberLabel(15), '15.0 T');
  assert.equal(memberLabel(-18.03), '18.0 C');
  assert.equal(memberLabel(0), '0');
  assert.equal(memberLabel(-2.5), '2.50 C');
});

test('a member force 0.4 kN off is caught (a tolerance set by the largest force in the truss let it through)', () => {
  for (const [a, b, force] of [['A', 'B', 15.4], ['A', 'C', -18.43], ['F', 'G', -12.4]]) {
    const d = { ...CAT1_TRUSS, members: CAT1_TRUSS.members.map((m) => (m.a === a && m.b === b ? { ...m, force } : m)) };
    assert.equal(checkTruss(d).ok, false, `${a}${b} = ${force}`);
  }
});

test('bad data is never checked: no position, a non-number, an unknown joint, null entries', () => {
  const noX = { ...CAT1_TRUSS, nodes: CAT1_TRUSS.nodes.map((n) => (n.id === 'B' ? { id: 'B', y: 0 } : n)) };
  const word = { ...CAT1_TRUSS, loads: [{ node: 'F', fx: 0, fy: 'abc' }, CAT1_TRUSS.loads[1]] };
  const ghost = { ...CAT1_TRUSS, members: [...CAT1_TRUSS.members, { a: 'A', b: 'Z', force: 9 }] };
  const nulls = { ...CAT1_TRUSS, nodes: [...CAT1_TRUSS.nodes, null], members: [null, ...CAT1_TRUSS.members], loads: null };
  for (const d of [noX, word, ghost]) {
    const r = checkTruss(d);
    assert.equal(r.ok, false);
    assert.ok(r.problems.length);
  }
  assert.doesNotThrow(() => checkTruss(nulls));
  assert.doesNotThrow(() => checkTruss(null));
  assert.equal(checkTruss(null).ok, false);
});

test('an indeterminate truss is not marked checked even when it balances', () => {
  const extra = { ...CAT1_TRUSS, members: [...CAT1_TRUSS.members, { a: 'B', b: 'E', force: 0 }] };
  const r = checkTruss(extra);
  assert.equal(r.unbalanced.length, 0);
  assert.equal(r.determinate, false);
  assert.equal(r.ok, false);
});
