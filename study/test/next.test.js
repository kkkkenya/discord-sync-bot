// Today's next actions (server/next.js), on small documents built here.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
const { emptyDoc, withDoc } = await import('../server/store.js');
const { nextActions, whenText } = await import('../server/next.js');

const TODAY = '2026-11-01';
const run = async (doc, prepared = []) => (await withDoc(doc, () => nextActions(TODAY, { prepared: new Set(prepared) }))).result;
const unit = (code, catDate, extra = {}) => ({ code, title: code, catDate, confidence: 3, ...extra });
const docWith = (patch) => Object.assign(emptyDoc(), patch);

test('no units: no actions (the first run takes over)', async () => {
  assert.deepEqual(await run(emptyDoc()), []);
});

test('an owner-like doc: units with no files read yet ask to be prepared first, nearest first', async () => {
  const doc = docWith({ units: [unit('ECU 300', 'TBA'), unit('EAR 307', '2026-11-07'), unit('EMM 302', '2026-11-20')] });
  const out = await run(doc);
  assert.equal(out.length, 3);
  assert.equal(out[0].unit, 'EAR 307');
  assert.ok(out.every((a) => a.kind === 'prepare' && a.label.startsWith('Prepare ')));
  assert.equal(out[0].href, '#/unit/EAR-307/notes');
  assert.match(out[0].reason, /CAT in 6 days/);
});

test('prepared but no topics: list them; topics but none rated: rate them', async () => {
  const doc = docWith({ units: [unit('EMM 302', '2026-11-20')] });
  const [list] = await run(doc, ['EMM 302']);
  assert.deepEqual([list.kind, list.label, list.href], ['audit', 'List EMM 302 topics', '#/unit/EMM-302/topics']);
  doc.topics.push({ id: 't1', unit: 'EMM 302', name: 'Torsion' });
  const [rate] = await run(doc, ['EMM 302']);
  assert.equal(rate.label, 'Rate EMM 302 topics');
});

test('a stuck, heavily examined sub-topic becomes the task, and the reason names it', async () => {
  const doc = docWith({
    units: [unit('EMM 302', '2026-11-20')],
    topics: [{ id: 't1', unit: 'EMM 302', name: 'Torsion' }, { id: 't2', unit: 'EMM 302', name: 'Beams' }],
    subtopics: [{ id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Polar moment of inertia', kind: 'concept', audit: 'stuck', auditAt: '2026-10-30T10:00:00Z' },
      { id: 's2', unit: 'EMM 302', topicId: 't2', name: 'Shear force diagrams', kind: 'method', audit: 'solid', auditAt: '2026-10-30T10:00:00Z' }],
    paperq: [1, 2, 3].map((n) => ({ id: `q${n}`, unit: 'EMM 302', fileId: 'f1', source: 'CAT 2024', year: 2024, number: n, marks: 20, text: 'torque on a shaft', topicId: 't1', subtopicIds: ['s1'] })),
  });
  const [a] = await run(doc, ['EMM 302']);
  assert.equal(a.kind, 'practise');
  assert.match(a.label, /Polar moment|Torsion/);
  assert.match(a.reason, /weakest: Polar moment of inertia/);
  assert.ok(a.minutes > 0);
});

test('exam eve: a walk-through, not a new paper', async () => {
  const doc = docWith({ units: [unit('EMM 302', '2026-11-01')], topics: [{ id: 't1', unit: 'EMM 302', name: 'Torsion', status: 'red' }],
    subtopics: [{ id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Twist angle', kind: 'method', audit: 'shaky', auditAt: '2026-10-31T10:00:00Z' }] });
  const [a] = await run(doc, ['EMM 302']);
  assert.match(a.label, /^Walk through|sheet/);
  assert.match(a.reason, /CAT today/);
});

test('every unit TBA still gives actions, with the date shown as to be set', async () => {
  const doc = docWith({ units: [unit('EMM 302', 'TBA'), unit('EMM 305', 'TBA')] });
  const out = await run(doc, ['EMM 302', 'EMM 305']);
  assert.equal(out.length, 2);
  assert.ok(out.every((a) => a.reason.startsWith('Date to be set')));
  assert.equal(whenText(1), 'CAT in 1 day');
});
