import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let srv;
before(async () => { srv = await startServer('legacy-study.json'); });
after(() => srv.stop());

test('add sub-topics under a topic, deduplicated and ordered', async () => {
  const r = await srv.call('POST', 'subtopics', { topicId: 't1', names: ['Sign convention', 'Principal stresses', 'sign convention', ' '] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.added.map((x) => [x.name, x.audit, x.kind, x.unit, x.order]), [['Sign convention', 'untested', 'concept', 'EMM 302', 1], ['Principal stresses', 'untested', 'concept', 'EMM 302', 2]]);
  const more = await srv.call('POST', 'subtopics', { topicId: 't1', name: 'Mohr circle construction', kind: 'method' });
  assert.equal(more.body.added[0].order, 3);
  assert.equal((await srv.call('POST', 'subtopics', { topicId: 'nope', name: 'x' })).status, 400);
  assert.equal((await srv.call('POST', 'subtopics', { topicId: 't1', name: '' })).status, 400);
});

test('the self-audit saves ratings and who made them; bad values are refused', async () => {
  const subs = (await srv.call('GET', 'state')).body.data.subtopics;
  const [a, b] = subs;
  const s = (await srv.call('POST', 'subtopics/audit', { ratings: { [a.id]: 'solid', [b.id]: 'stuck' } })).body;
  const got = Object.fromEntries(s.data.subtopics.map((x) => [x.name, x]));
  assert.equal(got['Sign convention'].audit, 'solid');
  assert.equal(got['Principal stresses'].audit, 'stuck');
  assert.equal(got['Principal stresses'].auditFrom, 'you');
  assert.ok(got['Principal stresses'].auditAt);
  assert.equal((await srv.call('POST', 'subtopics/audit', { ratings: { [a.id]: 'meh' } })).status, 400);
  assert.equal((await srv.call('PATCH', `subtopics/${a.id}`, { kind: 'trick' })).status, 400);
  assert.equal((await srv.call('PATCH', `subtopics/${a.id}`, { kind: 'derivation' })).body.kind, 'derivation');
});

test('delete then undo brings the same sub-topic back', async () => {
  const sub = (await srv.call('GET', 'state')).body.data.subtopics.find((x) => x.name === 'Principal stresses');
  assert.equal((await srv.call('DELETE', `subtopics/${sub.id}`)).body.removed, true);
  const back = (await srv.call('POST', 'subtopics', { restore: sub })).body.added[0];
  assert.deepEqual(back, sub);
});

test('AI suggestions explain themselves without a key', async () => {
  const r = await srv.call('POST', 'subtopics/suggest', { topicId: 't1' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /No AI key/);
});

test('a teach-back without AI is saved and flags nothing', async () => {
  const r = await srv.call('POST', 'teach', { unit: 'EMM 302', topic: "Mohr's circle", text: 'Mohr circle plots normal against shear stress on rotated planes' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.flags.flagged, []);
});

test('the weakspots endpoint ranks the unit\'s sub-topics', async () => {
  assert.equal((await srv.call('GET', 'weakspots?unit=XYZ%20999')).status, 400);
  const w = (await srv.call('GET', 'weakspots?unit=EMM%20302')).body;
  assert.equal(w.critical[0].name, 'Principal stresses', 'stuck beats untested');
  assert.equal(w.critical[0].audit, 'stuck');
  assert.ok(!w.critical.some((c) => c.audit === 'solid'));
  assert.deepEqual(w.errors, { total: 0, counts: [], takeaway: '' });
});
