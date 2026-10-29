import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoStage, stageFor, stageMix, validStage } from '../server/stages.js';

test('stage boundaries, in days to the paper', () => {
  assert.equal(autoStage(0), 'exam-eve');   // paper today
  assert.equal(autoStage(1), 'exam-eve');   // the eve
  assert.equal(autoStage(2), 'last-minute');
  assert.equal(autoStage(3), 'last-minute');
  assert.equal(autoStage(4), 'one-week');
  assert.equal(autoStage(7), 'one-week');
  assert.equal(autoStage(8), 'adequate');
  assert.equal(autoStage(60), 'adequate');
});

test('TBA, no date and a passed date are adequate', () => {
  assert.deepEqual(stageFor({}, null), { id: 'adequate', name: 'Adequate Prep', source: 'tba' });
  assert.equal(stageFor({}, -3).source, 'past');
  assert.equal(stageFor({}, -3).id, 'adequate');
});

test('a unit override beats the all-units override, which beats the date', () => {
  assert.equal(stageFor({}, 30, 'one-week').id, 'one-week');
  assert.equal(stageFor({}, 30, 'one-week').source, 'all');
  assert.equal(stageFor({ stage: 'exam-eve' }, 30, 'one-week').id, 'exam-eve');
  assert.equal(stageFor({ stage: 'exam-eve' }, null).source, 'unit');
  assert.equal(stageFor({ stage: 'nonsense' }, 1).id, 'exam-eve', 'an unknown override is ignored');
});

test('stage mix lists latest stages first and skips empty ones', () => {
  const mix = stageMix([{ id: 'adequate' }, { id: 'exam-eve' }, { id: 'adequate' }]);
  assert.deepEqual(mix.map((m) => [m.id, m.n]), [['exam-eve', 1], ['adequate', 2]]);
});

test('validStage', () => {
  assert.equal(validStage(null), true);
  assert.equal(validStage('one-week'), true);
  assert.equal(validStage('soon'), false);
});
