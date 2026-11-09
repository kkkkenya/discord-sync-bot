// Marking schemes and the model-answer layout: a scheme sent from Crux is named for its paper, pairs with that
// paper's questions (tutorial sheets by number), is never read as a second copy of them, and a solution made before
// it came in is made again from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { library } = await import('../server/ingest.js');
const { isScheme, sheetNo } = await import('../server/predict.js');
const { samePaper, parsePapers } = await import('../server/weakspots.js');
const { breakdownOf, explainQuestion, freshScheme, savedExplain, schemeFor } = await import('../server/practice.js');
const { schemeName, unitPapers } = await import('../server/hub-uploads.js');

test('a marking scheme is told apart by its name, and a tutorial sheet by its number', () => {
  assert.equal(isScheme('EMM 302 2023 Exam marking scheme.pdf'), true);
  assert.equal(isScheme('Thermo CAT memo.pdf'), true);
  assert.equal(isScheme('memory devices notes.pdf'), false);
  assert.deepEqual(['EMM 302 TUT 3.docx', 'Tutorial Problems 3', 'tut_12 2024', 'EMM 302 2023 Exam'].map(sheetNo), [3, 3, 12, null]);
  assert.equal(samePaper('KU EMM 302 TUT 3.docx', 'TUT 3 marking scheme.pdf'), true);
  assert.equal(samePaper('KU EMM 302 TUT 3.docx', 'TUT 2 marking scheme.pdf'), false);
  assert.equal(samePaper('EMM 302 2023 Exam.pdf', 'EMM 302 2022 Exam marking scheme.pdf'), false);
});

test('a scheme sent from Crux is named for its paper, without the unit code the hub adds', () => {
  data.paperq.push({ id: 'p1', unit: 'EMM 302', fileId: 'f-tut', source: 'EMM 302 TUT 3.docx', year: null, type: 'Tutorial', number: 1, text: 'A hollow shaft...' });
  assert.ok(unitPapers('EMM 302').some((p) => p.label === 'EMM 302 TUT 3'));
  assert.equal(schemeName('EMM 302', 'IMG_1.JPG', { paper: 'EMM 302 TUT 3' }), 'TUT 3 marking scheme.jpg');
  assert.equal(schemeName('EMM 302', 'x.docx', { type: 'CAT 2', year: '2022' }), '2022 CAT 2 marking scheme.docx');
  assert.equal(schemeName('EMM 302', 'x.pdf', { type: 'Tutorial', sheet: '4' }), 'Tutorial 4 marking scheme.pdf');
  assert.throws(() => schemeName('EMM 302', 'x.pdf', { paper: 'Some other paper' }), /Pick the paper/);
  assert.throws(() => schemeName('EMM 302', 'x.pdf', { type: 'Exam', year: '' }), /year/);
  assert.throws(() => schemeName('EMM 302', 'x.pdf', { type: 'Tutorial' }), /tutorial number/);
});

test('a scheme for a paper the hub has adds no questions; the paper\'s questions use it', () => {
  library.files['f-paper'] = { unit: 'ZZZ 101', name: 'ZZZ 101 TUT 3.pdf', paper: true, text: 'QUESTION ONE (10 marks)\nA shaft of 50 mm diameter carries a torque of 2 kN m. Find the maximum shear stress in it.\nQUESTION TWO (10 marks)\nFind the twist of the same shaft over 2 m when G is 80 GPa.' };
  library.files['f-scheme'] = { unit: 'ZZZ 101', name: 'ZZZ 101 TUT 3 marking scheme (from Amina).pdf', paper: true, text: 'QUESTION ONE (10 marks)\nτ = 16T/πd³ = 81.5 MPa\nQUESTION TWO (10 marks)\nθ = TL/GJ = 0.0815 rad' };
  library.files['f-other'] = { unit: 'ZZZ 101', name: 'ZZZ 101 TUT 2 marking scheme.pdf', paper: true, text: 'QUESTION ONE (10 marks)\nsomething else entirely for sheet two' };
  parsePapers('ZZZ 101');
  const rows = data.paperq.filter((q) => q.unit === 'ZZZ 101');
  assert.deepEqual([...new Set(rows.map((q) => q.fileId))].sort(), ['f-other', 'f-paper'], 'sheet 2 has no paper, so its scheme is kept as questions');
  const q1 = rows.find((q) => q.fileId === 'f-paper');
  assert.equal(schemeFor(q1).name, 'ZZZ 101 TUT 3 marking scheme (from Amina).pdf');
  assert.equal(freshScheme(q1), 'ZZZ 101 TUT 3 marking scheme (from Amina).pdf');
});

test('a solution made before the marking scheme came in is made again from it, once', async () => {
  const q1 = data.paperq.find((q) => q.fileId === 'f-paper');
  q1.explain = { breakdown: 'old', fbd: '', diagram: null, answer: '80 MPa', schemeFile: null };
  assert.equal(savedExplain(q1), null);
  const seen = [];
  const explain = async ({ scheme }) => {
    seen.push(scheme);
    return { given: ['$T = 2$ kN·m'], find: 'τmax', assumptions: [], fbd: '', diagram: { kind: 'none', length: 0 }, method: 'Torsion formula.',
      steps: [{ math: '$\\tau = \\frac{16T}{\\pi d^3} = 81.49\\ \\text{MPa}$', reason: '[τ = TR/J]', note: '' }], answer: '81.5 MPa', check: 'Units: Pa.', trap: 'Using radius for d.', realLife: '' };
  };
  const a = await explainQuestion({ unit: 'ZZZ 101', questionId: q1.id }, { explain, ready: () => true });
  assert.match(seen[0], /81\.5 MPa/);
  assert.equal(a.schemeFile, 'ZZZ 101 TUT 3 marking scheme (from Amina).pdf');
  assert.deepEqual(a.steps[0], { math: '\\tau = \\frac{16T}{\\pi d^3} = 81.49\\ \\text{MPa}', reason: 'τ = TR/J', note: '' }, '$ signs and brackets are tidied away');
  assert.match(a.breakdown, /## Solution\n1\. \$\\tau/);
  await explainQuestion({ unit: 'ZZZ 101', questionId: q1.id }, { explain, ready: () => true });
  assert.equal(seen.length, 1, 'kept after that');
});

test('the solution reads as one text for Ask about this', () => {
  const t = breakdownOf({ given: ['a = 1'], find: 'b', assumptions: ['small angles'], fbd: 'ΣM = 0', method: 'm', steps: [{ math: 'b = 2a', reason: 'twice', note: 'why' }], check: 'c', trap: 't', realLife: '' });
  assert.equal(t, '## Given\n- a = 1\nFind: b\n## Assumptions\n- small angles\n## Free body diagram\nΣM = 0\n## Method\nm\n## Solution\n1. $b = 2a$ [twice]\nwhy\n## Check\nc\nTrap: t');
});
