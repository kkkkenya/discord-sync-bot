// What the Drop folder turns into PDFs, and when: Office files one by one, a folder of photos as one, loose photos
// one each, and nothing that changed in the last two minutes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { SETTLE, plan } from '../src/uploader/dropconvert.js';

const DROP = 'G:\Hub Dumper\Drop';
const at = (...p) => join(DROP, ...p);
const NOW = 1_000_000_000;

test('Office files, a folder of photos and loose photos', () => {
  const files = [at('EMM 302 slides.pptx'), at('EMM 302 CAT 2023', 'page 10.jpg'), at('EMM 302 CAT 2023', 'page 2.jpg'), at('board.png'), at('notes.pdf')];
  const jobs = plan(DROP, files, () => NOW - SETTLE, NOW);
  assert.deepEqual(jobs, [
    { out: at('EMM 302 slides.pdf'), from: [at('EMM 302 slides.pptx')] },
    { out: at('EMM 302 CAT 2023', 'EMM 302 CAT 2023.pdf'), from: [at('EMM 302 CAT 2023', 'page 2.jpg'), at('EMM 302 CAT 2023', 'page 10.jpg')] },
    { out: at('board.pdf'), from: [at('board.png')] },
  ]);
});

test('a folder still filling up waits for all of its photos', () => {
  const files = [at('CAT', 'a.jpg'), at('CAT', 'b.jpg')];
  const mtime = (f) => (f.endsWith('b.jpg') ? NOW - 5000 : NOW - SETTLE);
  assert.deepEqual(plan(DROP, files, mtime, NOW), []);
});

test('a batch from Crux goes in one folder named with its unit, first file and sender', async () => {
  const { batchFolder } = await import('../src/uploader/fromcrux.js');
  const row = { unit_code: 'EMM 302', name: 'page 2.jpg', user_name: 'Amina W.' };
  assert.equal(batchFolder(row, 'CAT 1 2023 page 1.jpg'), 'EMM 302 CAT 1 2023 page 1 (from Amina W.)');
  assert.equal(batchFolder({ ...row, user_name: 'a/b:c' }, 'x.pdf'), 'EMM 302 x (from a b c)');
});
