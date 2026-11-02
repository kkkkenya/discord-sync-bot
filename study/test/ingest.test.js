import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentOf, outlineContext } from '../server/ingest.js';

test('topic suggestions read the course outline first, then past-paper questions, then notes', () => {
  const files = {
    a: { unit: 'EMM 318', name: 'Welded_joints.pdf', paper: false, text: 'Welded joints notes' },
    b: { unit: 'EMM 318', name: 'EAR_306_Course_Outline.pdf', paper: false, text: 'Week 1 Design process. Week 2 Shafts.' },
    c: { unit: 'EMM 318', name: 'EAR_306_CAT_1.pdf', paper: true, text: 'raw paper text' },
    d: { unit: 'EMM 302', name: 'Other_outline.pdf', paper: false, text: 'another unit' },
  };
  const { text, sources } = outlineContext('EMM 318', ['Design a shaft for torsion', 'Size a fillet weld'], files);
  assert.deepEqual(sources, ['EAR_306_Course_Outline.pdf', '2 past-paper questions', 'Welded_joints.pdf']);
  assert.ok(text.indexOf('Week 1 Design') < text.indexOf('Design a shaft') && text.indexOf('Design a shaft') < text.indexOf('Welded joints notes'));
  assert.doesNotMatch(text, /raw paper text|another unit/);
  assert.deepEqual(outlineContext('EMM 318', [], {}), { text: '', sources: [], outline: false });
  assert.equal(outlineContext('EMM 318', [], files).outline, true);
});

test('a file is found on a plain message and on a forwarded one', () => {
  const file = { filename: 'a.pdf', url: 'https://cdn/a.pdf' };
  assert.equal(attachmentOf({ attachments: [file] }), file);
  assert.equal(attachmentOf({ attachments: [], message_snapshots: [{ message: { attachments: [file] } }] }), file);
  assert.equal(attachmentOf({ attachments: [] }), null);
});

test('Word\'s Symbol-font Greek and signs come out as real characters', async () => {
  const { symbolFont } = await import('../server/extract.js');
  assert.equal(symbolFont('C = 4.5 x 10-5 m; st = 1.17;  = 50 MPa; 20C; '), 'ΔC = 4.5 x 10-5 m; αst = 1.17; τ = 50 MPa; 20°C; σ×π');
  assert.equal(symbolFont('plain text, nothing to change'), 'plain text, nothing to change');
});

test('book examples: numbered examples and exercises from notes and books, not past papers, within the budget', async () => {
  const { bookExamples } = await import('../server/ingest.js');
  const body = 'A steel bar 2 m long and 25 mm in diameter carries an axial pull of 50 kN. Find the stress and the extension, taking E = 200 GPa.';
  const files = {
    a: { unit: 'EMM 302', paper: false, text: `Chapter 1. Intro, for example stress. Example 1.1 ${body} Example 1.2 ${body} Problem 3 ${body}` },
    b: { unit: 'EMM 302', paper: true, text: `Example 9 ${body}` },
    c: { unit: 'EMM 305', paper: false, text: `Example 4 ${body}` },
  };
  const out = bookExamples('EMM 302', 14000, files, () => 0.5);
  assert.equal(out.split('--- ').filter(Boolean).length, 3);
  assert.doesNotMatch(out, /Example 9|Example 4 /);
  assert.ok(bookExamples('EMM 302', 300, files, () => 0.5).length <= 300);
});
