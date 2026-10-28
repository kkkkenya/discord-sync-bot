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

const { reply } = await import('../server/bot.js');
const { parsePapers, pastePaper, predictFor } = await import('../server/weakspots.js');
const { library } = await import('../server/ingest.js');

test('synced past papers become mapped questions; your corrections survive a re-read', () => {
  library.files.f1 = { unit: 'ECU 300', name: 'ECU 300 CAT 1 2023.pdf', paper: true, text: 'QUESTION ONE (20 MARKS) Evaluate the beta function B(2,3) and relate it to gamma. QUESTION TWO (10 MARKS) Prove Gamma(n+1) = n Gamma(n) by integration by parts.' };
  library.files.f2 = { unit: 'ECU 300', name: 'ECU 300 Exam 2022 scanned.pdf', paper: true, text: '' };
  const r = parsePapers('ECU 300');
  assert.equal(r.questions, 2);
  assert.deepEqual(r.scanned, [{ fileId: 'f2', name: 'ECU 300 Exam 2022 scanned.pdf' }]);
  const qs = data.paperq.filter((q) => q.unit === 'ECU 300');
  assert.deepEqual(qs.map((q) => [q.number, q.marks, q.year, q.type, q.topicId]), [[1, 20, 2023, 'CAT1', 't3'], [2, 10, 2023, 'CAT1', 't4']]);
  qs[1].topicId = 't3'; qs[1].topicFrom = 'you';
  parsePapers('ECU 300');
  assert.equal(data.paperq.find((q) => q.id === 'f1-2').topicId, 't3', 'kept');
  assert.equal(data.paperq.filter((q) => q.unit === 'ECU 300').length, 2, 'no duplicates');
});

test('a pasted paper adds its questions', () => {
  const rows = pastePaper('ECU 300', '2022 Exam', 'QUESTION ONE Show that Gamma(1/2) = sqrt(pi) (8 marks)');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].year, 2022);
  assert.equal(rows[0].topicId, 't4');
});

test('the bot saves a hint and predicts with it', async () => {
  assert.match(await reply('hint ECU 300 the exam will mainly focus on beta functions'), /\*\*focus\*\* hint for ECU 300 on Beta functions/);
  const p = await reply('predict ECU 300');
  assert.match(p, /1\. \*\*Beta functions\*\* 📌 pinned by lecturer/);
  assert.equal(predictFor('ECU 300', '2026-10-28')[0].name, 'Beta functions');
  assert.match(await reply('predict XYZ 999'), /Like this/);
});

const { topicMastery } = await import('../server/mastery.js');
const { todayPlan } = await import('../server/plan.js');
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

test('mastery colours follow the guide: stuck or repeated failures are red, all solid + evidence is green', () => {
  const thick = data.topics.find((t) => t.id === 't2'); // teach-back 4/5 + 2 solved mock questions
  assert.equal(topicMastery(thick, today()).status, 'green', 'no sub-topics listed');
  data.subtopics.splice(0, data.subtopics.length,
    { id: 'k1', unit: 'EMM 302', topicId: 't2', name: 'Lame equations', audit: 'solid', at: 'x' },
    { id: 'k2', unit: 'EMM 302', topicId: 't2', name: 'Compound cylinders', audit: 'shaky', at: 'x' });
  assert.equal(topicMastery(thick, today()).status, 'amber', 'a shaky sub-topic');
  data.subtopics[1].audit = 'stuck';
  const m = topicMastery(thick, today());
  assert.equal(m.status, 'red');
  assert.match(m.next, /unstuck on Compound cylinders/);
  data.subtopics[1].audit = 'solid';
  assert.equal(topicMastery(thick, today()).status, 'green');
  data.attempts.push({ id: 'a1', unit: 'EMM 302', subtopicId: 'k2', verdict: 'wrong', errorType: 'units', at: iso(1) });
  assert.equal(topicMastery(thick, today()).status, 'amber', 'one failure this week');
  data.attempts.push({ id: 'a2', unit: 'EMM 302', subtopicId: 'k2', verdict: 'wrong', errorType: 'units', at: iso(2) });
  assert.equal(topicMastery(thick, today()).status, 'red', 'repeated failures');
  assert.match(topicMastery(thick, today()).why, /2 broken checkpoints this week/);
});

test('Today and the bot point at the critical weakspot', async () => {
  for (const u of data.units) { u.catDate = 'TBA'; u.stage = null; }
  data.settings.stage = null;
  const p = todayPlan(today()).find((x) => x.code === 'EMM 302');
  assert.equal(p.weak.name, 'Compound cylinders');
  const text = await reply('weakspots EMM 302');
  assert.match(text, /1\. \*\*Compound cylinders\*\* \(Thick cylinders\) · solid · 2 broken checkpoints in 14 days \(mostly units \/ conversion\)/);
  assert.match(text, /tracking every unit/);
  assert.match(await reply('weakspots EMM 305'), /No weakspots on record/);
});
