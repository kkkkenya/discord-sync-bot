import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let srv;
before(async () => { srv = await startServer('legacy-study.json'); });
after(() => srv.stop());

test('a pack for a topic, with no AI key, carries its hint, weakspots and questions', async () => {
  await srv.call('POST', 'subtopics', { topicId: 't3', names: ['Trig integrals as beta'] });
  await srv.call('POST', 'hints', { unit: 'ECU 300', text: 'The exam will mainly focus on beta functions' });
  const q = (await srv.call('POST', 'predict/paste', { unit: 'ECU 300', label: '2023 CAT 1', text: 'QUESTION ONE (20 MARKS) Express the integral of sin^5 x cos^3 x as a beta function.' })).body.added[0];
  const r = await srv.call('POST', 'pack', { unit: 'ECU 300', topic: 'beta functions' });
  assert.equal(r.status, 200);
  assert.equal(r.body.filename, 'ECU-300-Beta-functions-context.md');
  assert.match(r.body.prompt, /mainly focus on beta functions/);
  assert.match(r.body.prompt, /Not tried yet: Trig integrals as beta/);
  assert.match(r.body.md, /2023 CAT 1 · Q1 · 20 marks/);
  assert.ok(r.body.tokens > 0);
  const solve = (await srv.call('POST', 'pack', { unit: 'ECU 300', questionId: q.id })).body;
  assert.equal(solve.goal, 'solution');
  assert.match(solve.md, /## Target question/);
});

test('bad input is refused', async () => {
  assert.equal((await srv.call('POST', 'pack', { unit: 'XYZ 999' })).status, 400);
  assert.equal((await srv.call('POST', 'pack', { unit: 'ECU 300', goal: 'magic' })).status, 400);
  assert.equal((await srv.call('POST', 'pack', { unit: 'EMM 312' })).body.filename, 'EMM-312-unit-context.md');
});
