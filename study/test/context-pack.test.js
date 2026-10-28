import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPack, defaultGoal } from '../server/context-pack.js';

const base = {
  unit: { code: 'ECU 300', title: 'Engineering Mathematics V' },
  cohort: { name: 'Mechanical', year: 3, sem: 1 },
  stage: 'one-week',
  topic: { id: 't3', name: 'Beta functions' },
  subtopics: [
    { name: 'Trig integrals as beta', kind: 'method', audit: 'stuck' },
    { name: 'B(m,n) via gamma', kind: 'derivation', audit: 'shaky' },
    { name: 'Definition', kind: 'concept', audit: 'solid' },
  ],
  weak: [{ name: 'Trig integrals as beta', reason: 'stuck · pinned by the lecturer' }],
  errors: [{ id: 'sign-convention', label: 'Sign convention', n: 3 }],
  hints: [{ text: 'the exam will mainly focus on beta functions', kind: 'focus', at: '2026-10-20T08:00:00Z' }],
  questions: [{ source: 'ECU 300 CAT 1 2023', number: 2, marks: 20, year: 2023, text: 'Express the integral of sin^5 x cos^3 x as a beta function, using the figure shown.' }],
  failures: [{ at: '2026-10-27T08:00:00Z', question: 'B(2,3)', brokeAt: 2, checkpoint: 'substitute', errorType: 'sign-convention', answer: '-1/12' }],
  files: [
    { name: 'Beta and gamma notes.pdf', paper: false, text: 'beta function notes '.repeat(500) },
    { name: 'Fourier notes.pdf', paper: false, text: 'fourier '.repeat(500) },
    { name: 'ECU 300 Exam 2021 scan.pdf', paper: true, text: '' },
  ],
  today: '2026-10-28',
};

test('the stage picks the default goal; a target question means solve it', () => {
  assert.equal(defaultGoal('adequate'), 'breakdown');
  assert.equal(defaultGoal('one-week'), 'shortcuts');
  assert.equal(defaultGoal('last-minute'), 'sheet');
  assert.equal(defaultGoal('adequate', { id: 'q' }), 'solution');
});

test('the Master Prompt is stage-, hint- and weakspot-aware and asks for SI-unit checkpoints', () => {
  const p = buildPack(base);
  assert.equal(p.goal, 'shortcuts');
  assert.equal(p.filename, 'ECU-300-Beta-functions-context.md');
  assert.match(p.prompt, /Mechanical engineering, year 3 semester 1/);
  assert.match(p.prompt, /Study stage: 1-Week Mode/);
  assert.match(p.prompt, /"the exam will mainly focus on beta functions" \(focus\)/);
  assert.match(p.prompt, /Stuck .*: Trig integrals as beta/);
  assert.match(p.prompt, /Mistakes I keep making: sign convention \(3\)/);
  assert.match(p.prompt, /Already solid .*: Definition/);
  assert.match(p.prompt, /Checkpoint n/);
  assert.match(p.prompt, /SI units/);
  assert.match(p.prompt, /ECU-300-Beta-functions-context\.md/);
});

test('the pack holds questions, hints, weakspots and broken checkpoints, topic material first', () => {
  const { md } = buildPack(base);
  for (const h of ['## My weakspot profile', '## What the lecturer said', '## Past-paper and CAT questions on Beta functions', '## Where my working broke recently', '## Course material']) assert.ok(md.includes(h), h);
  assert.match(md, /broke at checkpoint 2 \(substitute\), sign-convention; my answer: -1\/12/);
  assert.ok(md.indexOf('Beta and gamma notes') < md.indexOf('Fourier notes'));
});

test('over the budget: notes are cut and listed, the fixed sections stay', () => {
  const p = buildPack({ ...base, budget: 2000 });
  assert.ok(p.md.length < 2000 * 4 + 1000);
  assert.ok(p.cut.includes('Fourier notes.pdf'));
  assert.match(p.md, /## Not included/);
  assert.match(p.md, /## Past-paper and CAT questions/);
  assert.ok(p.checklist.some((c) => /left out of the pack: .*Fourier notes/.test(c)));
});

test('the checklist names the file, figures, scanned papers and reasoning mode', () => {
  const { checklist } = buildPack({ ...base, question: base.questions[0] });
  assert.equal(checklist[0], 'Attach the downloaded file ECU-300-Beta-functions-context.md.');
  assert.ok(checklist.some((c) => /figure in ECU 300 CAT 1 2023, Q2/.test(c)));
  assert.ok(checklist.some((c) => /Scanned papers .*ECU 300 Exam 2021 scan\.pdf/.test(c)));
  assert.match(checklist.at(-1), /extended thinking/);
});

test('works with nothing but a unit', () => {
  const p = buildPack({ unit: { code: 'EMM 312', title: '' }, today: '2026-10-28' });
  assert.equal(p.goal, 'breakdown');
  assert.match(p.prompt, /Not audited yet/);
  assert.equal(p.filename, 'EMM-312-unit-context.md');
  assert.equal(p.cut.length, 0);
});
