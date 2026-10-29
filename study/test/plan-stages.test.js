import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let srv;
before(async () => { srv = await startServer('legacy-study.json'); });
after(() => srv.stop());

const day = (n) => { const d = new Date(); d.setUTCHours(12); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const unit = (s, code) => s.data.units.find((u) => u.code === code);
const planOf = (s, code) => s.plan.find((p) => p.code === code);

test('every unit gets a stage from its own date', async () => {
  await srv.call('PATCH', 'units?code=EMM%20302', { catDate: day(1) });
  await srv.call('PATCH', 'units?code=EMM%20305', { catDate: day(3) });
  await srv.call('PATCH', 'units?code=ECU%20300', { catDate: day(6) });
  const s = (await srv.call('PATCH', 'units?code=EMM%20312', { catDate: 'TBA' })).body;
  assert.equal(s.units['EMM 302'].stage.id, 'exam-eve');
  assert.equal(s.units['EMM 305'].stage.id, 'last-minute');
  assert.equal(s.units['ECU 300'].stage.id, 'one-week');
  assert.deepEqual(s.units['EMM 312'], { cat: null, days: null, stage: { id: 'adequate', name: 'Adequate Prep', source: 'tba' } });
  assert.deepEqual(s.stageMix.map((m) => m.n), [1, 1, 1, 1]);
});

test('Today follows the stage: exam-eve and last-minute get sheets and walkthroughs', async () => {
  const s = (await srv.call('GET', 'state')).body;
  assert.equal(planOf(s, 'EMM 302').stage.id, 'exam-eve');
  assert.equal(planOf(s, 'EMM 302').task.kind, 'prompt');
  assert.ok(['teach', 'formula'].includes(planOf(s, 'EMM 302').task.promptKind));
  assert.equal(planOf(s, 'EMM 302').days, 1);
  assert.equal(s.plan[0].code, 'EMM 302', 'the eve comes first');
});

test('moving a date reshapes Today straight away', async () => {
  const s = (await srv.call('PATCH', 'units?code=EMM%20302', { catDate: 'TBA' })).body;
  assert.equal(s.units['EMM 302'].stage.id, 'adequate');
  const p = planOf(s, 'EMM 302');
  if (p) assert.notEqual(p.task.kind, 'prompt');
  assert.ok(!s.plan.some((x) => x.code === 'EMM 302' && x.stage.id !== 'adequate'));
});

test('a unit override beats the date, and the all-units override fills in the rest', async () => {
  let s = (await srv.call('PATCH', 'units?code=EMM%20312', { stage: 'exam-eve' })).body;
  assert.deepEqual(s.units['EMM 312'].stage, { id: 'exam-eve', name: 'Exam-Eve Triage', source: 'unit' });
  assert.ok(s.plan.some((p) => p.code === 'EMM 312' && ['prompt', 'kit'].includes(p.task.kind)), 'an exam-eve override puts a TBA unit into Today');
  assert.equal((await srv.call('PATCH', 'units?code=EMM%20312', { stage: 'tomorrow' })).status, 400);
  assert.equal((await srv.call('POST', 'settings', { stage: 'soon' })).status, 400);
  s = (await srv.call('POST', 'settings', { stage: 'one-week' })).body;
  assert.equal(s.units['EMM 302'].stage.source, 'all');
  assert.equal(s.units['EMM 302'].stage.id, 'one-week');
  assert.equal(s.units['EMM 312'].stage.id, 'exam-eve', 'the unit override still wins');
  s = (await srv.call('POST', 'settings', { stage: null })).body;
  s = (await srv.call('PATCH', 'units?code=EMM%20312', { stage: null })).body;
  assert.equal(s.units['EMM 312'].stage.source, 'tba');
  assert.equal(unit(s, 'EMM 312').stage, null);
});

test('a passed date counts as adequate, not as forever-urgent', async () => {
  const s = (await srv.call('PATCH', 'units?code=EMM%20305', { catDate: day(-2) })).body;
  assert.equal(s.units['EMM 305'].stage.source, 'past');
  assert.equal(s.units['EMM 305'].stage.id, 'adequate');
});

test('with past-paper questions, a practice task opens Check answer on a real question', async () => {
  await srv.call('PATCH', 'units?code=ECU%20300', { catDate: day(6), stage: null });
  const { added } = (await srv.call('POST', 'predict/paste', { unit: 'ECU 300', label: '2024 CAT 1', text: 'QUESTION ONE (10 MARKS) Show that Gamma(n+1) = n Gamma(n) for n > 0. QUESTION TWO (10 MARKS) Express the integral of sin^5 x cos^3 x as a beta function.' })).body;
  const p = planOf((await srv.call('GET', 'state')).body, 'ECU 300');
  assert.equal(p.task.kind, 'practice', p.task.text);
  assert.ok(added.some((q) => q.id === p.task.questionId));
});

test('an empty store has no stages and no plan', async () => {
  const empty = await startServer();
  try {
    const s = (await empty.call('GET', 'state')).body;
    assert.deepEqual(s.stageMix, []);
    assert.deepEqual(s.plan, []);
    assert.equal(s.stages.length, 4);
  } finally { empty.stop(); }
});
