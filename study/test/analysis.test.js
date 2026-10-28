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
