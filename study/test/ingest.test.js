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
  assert.deepEqual(outlineContext('EMM 318', [], {}), { text: '', sources: [] });
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
