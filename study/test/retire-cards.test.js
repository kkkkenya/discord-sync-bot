import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { todayPlan, stats } = await import('../server/plan.js');
const { topicMastery } = await import('../server/mastery.js');
const { reply } = await import('../server/bot.js');

const TODAY = '2026-10-28';

test('a store with 500 old cards plans without any card or recall task', () => {
  assert.equal(data.cards.length, 500);
  const plan = todayPlan(TODAY);
  assert.ok(plan.length > 0);
  for (const p of plan) assert.ok(['teach', 'paper', 'topics', 'mock', 'prompt'].includes(p.task.kind), p.task.kind);
  assert.doesNotMatch(JSON.stringify(plan), /card|recall/i);
});

test('mastery no longer reads recall: teach-back 4/5 + 2 solved questions is green', () => {
  const m = topicMastery(data.topics.find((t) => t.name === 'Thick cylinders'), TODAY);
  assert.equal(m.status, 'green');
  assert.equal(m.recall, undefined);
  assert.doesNotMatch(m.why, /recall/);
  // Mohr's circle had cards and reviews but no teach-back or solved questions: red
  assert.equal(topicMastery(data.topics.find((t) => t.name === "Mohr's circle"), TODAY).status, 'red');
});

test('stats no longer count card reviews', () => {
  const s = stats(TODAY);
  assert.equal(s.reviewedToday, undefined);
  assert.equal(typeof s.activeToday, 'boolean');
});

test('a checked answer or a sub-topic audit counts as a study day', () => {
  assert.equal(stats(TODAY).activeToday, false);
  data.attempts.push({ id: 'chk1', unit: 'EMM 302', verdict: 'mismatch', at: `${TODAY}T09:00:00.000Z` });
  assert.equal(stats(TODAY).activeToday, true);
  data.attempts.pop();
  data.subtopics.push({ id: 'aud1', unit: 'EMM 302', name: 'x', audit: 'shaky', auditAt: `${TODAY}T10:00:00.000Z`, at: '2026-09-01T00:00:00.000Z' });
  assert.equal(stats(TODAY).activeToday, true);
  data.subtopics.pop();
});

test('the bot has no card commands and says so', async () => {
  const help = await reply('help');
  assert.doesNotMatch(help, /quiz|card/i);
  assert.match(await reply('quiz'), /retired/);
  assert.match(await reply('card EMM 302 | q | a'), /retired/);
  assert.equal(data.cards.length, 500);
});

test('the bot shows each unit\'s stage and counts TBA units', async () => {
  for (const u of data.units) u.catDate = 'TBA';
  const text = await reply('today');
  assert.match(text, /Stages: 4 Adequate Prep/);
  assert.match(text, /4 units with the date TBA/);
  assert.doesNotMatch(text, /CATs\*\* start in/, 'no KU-calendar countdown when every unit is TBA');
  assert.match(text, /_\(Adequate Prep\)_/);
});
