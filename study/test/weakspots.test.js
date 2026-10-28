import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { teachFlags } = await import('../server/weakspots.js');

test('a marked teach-back flags the sub-topics its gaps name, under the right topic only', () => {
  data.subtopics.push(
    { id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Sign convention', audit: 'solid', at: 'x' },
    { id: 's2', unit: 'EMM 302', topicId: 't1', name: 'Principal stresses', audit: 'stuck', at: 'x' },
    { id: 's3', unit: 'EMM 302', topicId: 't2', name: 'Sign convention', audit: 'solid', at: 'x' },
  );
  const r = teachFlags('EMM 302', "mohr's circle", { score: 2, gaps: ['Sign convention for shear was reversed', 'Principal stresses never computed', 'No worked example'] });
  assert.deepEqual(r.flagged, ['Sign convention', 'Principal stresses']);
  assert.deepEqual(r.unmatched, ['No worked example']);
  assert.equal(r.topicId, 't1');
  assert.equal(data.subtopics.find((s) => s.id === 's1').audit, 'shaky');
  assert.equal(data.subtopics.find((s) => s.id === 's2').audit, 'stuck');
  assert.equal(data.subtopics.find((s) => s.id === 's3').audit, 'solid', 'another topic is untouched');
});

test('an unknown topic or no feedback flags nothing', () => {
  assert.deepEqual(teachFlags('EMM 302', 'Nope', { gaps: ['x'] }).flagged, []);
  assert.deepEqual(teachFlags('EMM 302', "Mohr's circle", null).flagged, []);
});
