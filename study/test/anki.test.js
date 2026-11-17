// Anki export (fixplan-e E9): the import text, the cards, and the download route's glue.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
const { emptyDoc, withDoc } = await import('../server/store.js');
const { cardsFor, deckName, markdownToAnkiHtml, noteTags, renderAnki, stableGuid } = await import('../server/anki.js');
const { ankiExport } = await import('../server/anki-store.js');

const recipe = { id: 'm1', unit: 'EMM 302', kind: 'recipes', content: { recipes: [
  { name: 'Torsion of a solid shaft', when: 'a shaft carries a torque', shortcut: 'T/J = G theta / L', steps: ['x'] },
  { name: 'No when given', when: '' },
] } };
const paperq = [{ id: 'q1', unit: 'EMM 302', source: 'CAT 1 2024', number: 2, label: 'Q2', text: 'A solid shaft carries 5 kNm. Find the max shear stress.' }];

test('the import file starts with Anki 2.1.55+ tab headers, then five columns a row', () => {
  const text = renderAnki([{ front: 'Q $x^2$', back: 'A\nB', unit: 'EMM 302', guid: 'g1' }]);
  const lines = text.split('\n');
  assert.deepEqual(lines.slice(0, 6), ['#separator:tab', '#html:true', '#notetype:Basic', '#deck column:3', '#tags column:4', '#guid column:5']);
  const row = lines[6].split('\t');
  assert.equal(row.length, 5);
  assert.equal(row[2], 'Crux::EMM 302');
  assert.equal(row[3], 'crux emm-302');
  assert.equal(row[4], 'g1');
  assert.ok(text.endsWith('\n'));
});

test('no raw tab or newline ends up inside a field', () => {
  const text = renderAnki([{ front: 'a\tb\n\nc', back: 'x\r\ny', unit: 'EMM\t302', guid: 'g' }]);
  const rows = text.trimEnd().split('\n').slice(6);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].split('\t').length, 5);
});

test('the deck and tags are safe for odd unit names', () => {
  assert.equal(deckName('A::B'), 'Crux::A — B');
  assert.equal(deckName(''), 'Crux::Untitled');
  assert.equal(noteTags('  '), 'crux');
  assert.equal(noteTags('ECU 300'), 'crux ecu-300');
});

test('markdown becomes safe, plain Anki HTML with MathJax', () => {
  assert.equal(markdownToAnkiHtml('**Bold** and *it* and `x<y`'), '<p><b>Bold</b> and <i>it</i> and <code>x&lt;y</code></p>');
  assert.equal(markdownToAnkiHtml('Use $T/J = G\\theta/L$.'), '<p>Use \\(T/J = G\\theta/L\\).</p>');
  assert.equal(markdownToAnkiHtml('$$a^2$$'), '<p>\\[a^2\\]</p>');
  assert.equal(markdownToAnkiHtml('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(markdownToAnkiHtml('one\n\ntwo\nthree'), '<p>one</p><p>two<br>three</p>');
  assert.equal(markdownToAnkiHtml(''), '');
});

test('GUIDs are the same every time for the same Crux ids, and differ between ids', () => {
  assert.equal(stableGuid('recipe', 'm1', 0), stableGuid('recipe', 'm1', 0));
  assert.notEqual(stableGuid('recipe', 'm1', 0), stableGuid('recipe', 'm1', 1));
  assert.match(stableGuid('x'), /^crux-[0-9a-f]{24}$/);
});

test('cards: one per recipe that has a when, and one per question wrong (latest answer, the broken step)', () => {
  const attempts = [
    { id: 'a1', unit: 'EMM 302', questionId: 'q1', verdict: 'mismatch', keyAnswer: '50 MPa', answer: '40', at: '2026-11-01T10:00:00Z', brokeAt: null, checkpoints: [] },
    { id: 'a2', unit: 'EMM 302', questionId: 'q1', verdict: 'wrong', keyAnswer: '62.5 MPa', answer: '50', at: '2026-11-05T10:00:00Z', brokeAt: 2, errorType: 'units', checkpoints: [{ step: 'Polar moment J', equation: '', errorType: 'algebra-calculus' }, { step: 'Convert kNm to Nm', equation: '', errorType: 'units' }] },
    { id: 'a3', unit: 'EMM 302', questionId: 'q1', verdict: 'right', keyAnswer: '62.5 MPa', answer: '62.5', at: '2026-11-06T10:00:00Z', checkpoints: [] },
    { id: 'a4', unit: 'ECU 300', questionId: 'q9', verdict: 'wrong', keyAnswer: '1', answer: '2', at: '2026-11-06T10:00:00Z', checkpoints: [] },
  ];
  const cards = cardsFor({ unit: 'EMM 302', materials: [recipe], attempts, paperq });
  assert.equal(cards.length, 2);
  const [rec, wrong] = cards;
  assert.equal(rec.front, 'Torsion of a solid shaft');
  assert.equal(rec.back, 'Use when: a shaft carries a torque\n\nShortcut: T/J = G theta / L');
  assert.match(wrong.front, /^CAT 1 2024 Q2: A solid shaft/);
  assert.equal(wrong.back, 'Final answer: 62.5 MPa\n\nBroke at: Convert kNm to Nm (Units / conversion)');
});

test('a wrong answer with no key yet still makes a card, saying so', () => {
  const cards = cardsFor({ unit: 'EMM 302', attempts: [{ id: 'a', unit: 'EMM 302', questionId: null, question: 'Find the moment in a beam with a point load.', verdict: 'mismatch', answer: '5', at: '2026-11-01T00:00:00Z', checkpoints: [] }] });
  assert.equal(cards.length, 1);
  assert.match(cards[0].back, /Your answer was 5; no key/);
});

test('the route glue: no cards is a plain error, cards make a text file for the unit', async () => {
  const empty = emptyDoc();
  empty.units = [{ code: 'EMM 302', title: 'Mechanics' }];
  await assert.rejects(withDoc(empty, () => ankiExport('EMM 302')), /No cards for EMM 302/);
  await assert.rejects(withDoc(empty, () => ankiExport('ECU 300')), /Pick one of your units/);

  const doc = emptyDoc();
  doc.units = [{ code: 'EMM 302', title: 'Mechanics' }];
  doc.materials = [recipe];
  const { result } = await withDoc(doc, () => ankiExport('EMM 302'));
  assert.equal(result.count, 1);
  assert.equal(result.filename, 'crux-emm-302-anki.txt');
  assert.match(result.text, /^#separator:tab/);
});

test('recipe GUIDs follow the recipe name: reordering, deleting or re-making the sheet keeps them', () => {
  const sheet = { id: 'm1', unit: 'EMM 302', kind: 'recipes', content: { recipes: [
    { name: 'Torsion', when: 'a shaft carries a torque' }, { name: 'Bending', when: 'a beam carries a load' },
  ] } };
  const guids = (materials) => Object.fromEntries(cardsFor({ unit: 'EMM 302', materials }).map((c) => [c.front, c.guid]));
  const before = guids([sheet]);
  assert.notEqual(before.Torsion, before.Bending);
  const reordered = { ...sheet, content: { recipes: [sheet.content.recipes[1], sheet.content.recipes[0]] } };
  assert.deepEqual(guids([reordered]), before);
  const deleted = { ...sheet, content: { recipes: [sheet.content.recipes[1]] } };
  assert.equal(guids([deleted]).Bending, before.Bending);
  const remade = { ...sheet, id: 'm2', content: { recipes: sheet.content.recipes } };
  assert.deepEqual(guids([remade]), before);
  const spaced = { ...sheet, content: { recipes: [{ name: '  torsion  ', when: 'x' }] } };
  assert.equal(guids([spaced]).torsion, before.Torsion, 'case and spacing do not change the GUID');
});

test('plain text with * and $ stays as typed', () => {
  assert.equal(markdownToAnkiHtml('multiply 2*3 and 4*5'), '<p>multiply 2*3 and 4*5</p>');
  assert.equal(markdownToAnkiHtml('Cost $5 and $10'), '<p>Cost $5 and $10</p>');
});

test('real maths and emphasis still convert', () => {
  assert.equal(markdownToAnkiHtml('$x^2$ and *emphasis*'), '<p>\\(x^2\\) and <i>emphasis</i></p>');
});
