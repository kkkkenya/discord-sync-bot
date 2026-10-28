import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let srv;
before(async () => { srv = await startServer('legacy-study.json'); });
after(() => srv.stop());

test('predictions need one of your units', async () => {
  assert.equal((await srv.call('GET', 'predict?unit=XYZ%20999')).status, 400);
  const { body } = await srv.call('GET', 'predict?unit=ECU%20300');
  assert.deepEqual(body.questions, []);
  assert.equal(body.ranked.length, 2);
});

test('pasted questions + a lecturer hint rank the topics, with the hint pinned', async () => {
  const paste = await srv.call('POST', 'predict/paste', { unit: 'ECU 300', label: '2023 CAT 1', text: 'QUESTION ONE (20 MARKS) Show that Gamma(n+1) = n Gamma(n). QUESTION TWO (10 MARKS) Evaluate the gamma function at 5/2.' });
  assert.equal(paste.body.added.length, 2);
  let r = (await srv.call('GET', 'predict?unit=ECU%20300')).body.ranked;
  assert.equal(r[0].name, 'Gamma functions');
  const h = (await srv.call('POST', 'hints', { unit: 'ECU 300', text: 'The exam will mainly focus on beta functions' })).body;
  assert.equal(h.kind, 'focus');
  assert.deepEqual(h.topicIds, ['t3']);
  r = (await srv.call('GET', 'predict?unit=ECU%20300')).body.ranked;
  assert.equal(r[0].name, 'Beta functions');
  assert.equal(r[0].pinned, true);
  assert.equal((await srv.call('PATCH', `hints/${h.id}`, { kind: 'loud' })).status, 400);
  assert.equal((await srv.call('PATCH', `hints/${h.id}`, { topicIds: ['nope'] })).status, 400);
  assert.equal((await srv.call('POST', 'hints', { unit: 'ECU 300', text: ' ' })).status, 400);
});

test('your topic pick for a question is kept as yours', async () => {
  const q = (await srv.call('GET', 'predict?unit=ECU%20300')).body.questions[1];
  const after = (await srv.call('PATCH', `paperq/${q.id}`, { topicId: 't3' })).body;
  assert.equal(after.topicFrom, 'you');
});

test('a predicted mock comes from the mapped questions; nothing mapped says why', async () => {
  const m = (await srv.call('POST', 'mocks', { unit: 'ECU 300', predicted: true })).body;
  assert.ok(m.questions.length >= 1);
  assert.match(m.name, /predicted/);
  const none = await srv.call('POST', 'mocks', { unit: 'EMM 312', predicted: true });
  assert.equal(none.status, 400);
  assert.match(none.body.error, /Predictions/);
});

test('reading papers without a synced library, and AI mapping without a key, explain themselves', async () => {
  const r = (await srv.call('POST', 'predict/parse', { unit: 'EMM 302' })).body;
  assert.equal(r.papers, 0);
  assert.equal((await srv.call('POST', 'predict/map', { unit: 'ECU 300' })).status, 400);
  // pasted questions survive a re-read
  assert.equal((await srv.call('GET', 'predict?unit=ECU%20300')).body.questions.length, 2);
});
