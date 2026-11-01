// Insights across units (server/insights.js), checked against numbers worked out by hand.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
const { emptyDoc, withDoc } = await import('../server/store.js');
const { insights } = await import('../server/insights.js');

const TODAY = '2026-11-01';
const at = (day) => `${day}T09:00:00.000Z`;
function doc() {
  const d = emptyDoc();
  d.units = [{ code: 'EMM 302', title: 'Strength of Materials', catDate: '2026-11-20' }, { code: 'EMM 305', title: 'Metrology', catDate: '2026-11-25' }];
  d.topics = [{ id: 't1', unit: 'EMM 302', name: 'Torsion' }, { id: 't2', unit: 'EMM 305', name: 'Gauges' }];
  d.subtopics = [
    { id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Angle of twist', kind: 'method', audit: 'stuck' },
    { id: 's2', unit: 'EMM 305', topicId: 't2', name: 'Slip gauges', kind: 'concept', audit: 'stuck' },
  ];
  // Torsion: in 2 of 2 papers at 20 marks → weight (2/2) × 20 = 20. Gauges: no questions → the floor, 1.
  d.paperq = [
    { id: 'q1', unit: 'EMM 302', fileId: 'f1', source: 'CAT 2023', number: 1, marks: 20, text: 'shaft', topicId: 't1', subtopicIds: ['s1'] },
    { id: 'q2', unit: 'EMM 302', fileId: 'f2', source: 'CAT 2024', number: 1, marks: 20, text: 'shaft', topicId: 't1', subtopicIds: ['s1'] },
  ];
  d.attempts = [
    { id: 'a1', unit: 'EMM 302', questionId: 'q1', subtopicId: 's1', topicId: 't1', verdict: 'wrong', errorType: 'units', at: at('2026-10-30') },
    { id: 'a2', unit: 'EMM 302', questionId: 'q2', subtopicId: 's1', topicId: 't1', verdict: 'right', at: at('2026-10-31') },
    { id: 'a3', unit: 'EMM 302', questionId: 'q1', subtopicId: 's1', topicId: 't1', verdict: 'wrong', errorType: 'units', at: at('2026-09-01') }, // too old
  ];
  return d;
}

test('weakspots rank by exam weight × weakness, across units', async () => {
  const { result } = await withDoc(doc(), () => insights(TODAY));
  const [first, second] = result.weakspots;
  assert.equal(first.name, 'Angle of twist');
  assert.equal(first.weight, 20);
  assert.equal(second.weight, 1);
  for (const w of result.weakspots) assert.equal(w.priority, Math.round(w.weight * w.weakness * 10) / 10);
  assert.deepEqual(first.errorTypes, ['Units / conversion']);
  assert.equal(first.lastTried, '2026-10-31');
  assert.equal(second.lastTried, null);
});

test('mistakes by type count wrong answers from the last 14 days only', async () => {
  const { result } = await withDoc(doc(), () => insights(TODAY));
  assert.equal(result.errors.length, 7);
  assert.equal(result.errors.find((e) => e.id === 'units').n, 1);
});

test('the trend has one bar per day for 14 days, ending today', async () => {
  const { result } = await withDoc(doc(), () => insights(TODAY));
  assert.equal(result.trend.length, 14);
  assert.equal(result.trend.at(-1).day, TODAY);
  assert.deepEqual(result.trend.find((d) => d.day === '2026-10-31'), { day: '2026-10-31', tried: 1, right: 1 });
});
