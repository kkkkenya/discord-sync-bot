// The shared unit library (server/shared.js): the first real list is shared, later ones don't overwrite it, the
// owner can replace it, and a solved question is found again by its wording.
import test from 'node:test';
import assert from 'node:assert/strict';

const { classList, listOf, offerList, questionKey, resetSharedForTests, shareSolution, sharedSolution } = await import('../server/shared.js');

const doc = {
  topics: [{ id: 't2', unit: 'EMM 302', name: 'Bending', order: 2 }, { id: 't1', unit: 'EMM 302', name: 'Torsion', order: 1 }, { id: 'x', unit: 'EMM 305', name: 'Gauges', order: 1 }],
  subtopics: [{ id: 's1', topicId: 't1', name: 'Polar moment', order: 1 }, { id: 's2', topicId: 't1', name: 'Angle of twist', order: 2 }],
};
const three = [{ name: 'A', subtopics: [] }, { name: 'B', subtopics: [] }, { name: 'C', subtopics: [] }];

test('a list is the unit\'s topics in outline order with their sub-topics', () => {
  assert.deepEqual(listOf(doc, 'EMM 302'), [{ name: 'Torsion', subtopics: ['Polar moment', 'Angle of twist'] }, { name: 'Bending', subtopics: [] }]);
});

test('the first list of 3+ topics is shared; later ones keep it; the owner can replace it', async () => {
  resetSharedForTests();
  assert.equal(await offerList('EMM 302', three.slice(0, 2), 'a'), null); // too short to share
  assert.equal(await classList('EMM 302'), null);
  await offerList('EMM 302', three, 'a');
  await offerList('EMM 302', [...three, { name: 'D', subtopics: [] }], 'b');
  assert.equal((await classList('EMM 302')).topics.length, 3);
  await offerList('EMM 302', [...three, { name: 'D', subtopics: [] }], 'owner', { force: true });
  assert.equal((await classList('EMM 302')).topics.length, 4);
});

test('a solved question is found again by unit and wording, whatever the spacing or case', async () => {
  resetSharedForTests();
  await shareSolution('EMM 302', 'A hollow shaft  has an inside diameter…', [{ step: 'Area ratio' }]);
  assert.deepEqual(await sharedSolution('EMM 302', 'a hollow shaft has an INSIDE diameter…'), { checkpoints: [{ step: 'Area ratio' }] });
  assert.equal(await sharedSolution('EMM 305', 'A hollow shaft has an inside diameter…'), null);
  assert.notEqual(questionKey('EMM 302', 'q'), questionKey('EMM 305', 'q'));
});

const { classHints, confirmHint, kitKey, resetMoreSharedForTests, shareHint, shareKit, sharedKit, SHARED_KITS } = await import('../server/shared.js');

test('class hints count each person once and never say who', async () => {
  resetMoreSharedForTests();
  await shareHint('EMM 302', { kind: 'focus', text: 'Beta functions are coming', topics: ['Beta functions'] }, 'a');
  const [h] = await classHints('EMM 302', 'b');
  assert.equal(h.count, 1); assert.equal(h.mine, false); assert.equal('by_ids' in h, false);
  await confirmHint(h.id, 'b'); await confirmHint(h.id, 'b');
  const [again] = await classHints('EMM 302', 'b');
  assert.equal(again.count, 2); assert.equal(again.mine, true);
  assert.deepEqual(await classHints('EMM 305', 'b'), []);
});

test('ladders and recipes are shared per unit, stage and topic; trap sheets never are', async () => {
  resetMoreSharedForTests();
  assert.deepEqual(SHARED_KITS, ['ladder', 'recipes']);
  const key = kitKey('EMM 302', 'ladder', 'adequate', 'Torsion');
  await shareKit(key, 'EMM 302', { title: 'Torsion ladder' });
  assert.deepEqual(await sharedKit(kitKey('EMM 302', 'ladder', 'adequate', 'torsion')), { title: 'Torsion ladder' });
  assert.equal(await sharedKit(kitKey('EMM 302', 'ladder', 'one-week', 'Torsion')), null);
});
