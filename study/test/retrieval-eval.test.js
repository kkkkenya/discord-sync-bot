// Retrieval eval tool (fixplan-e E7): fixture loading and the scoring of one case on a small file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useStore } from './helpers.js';

useStore(); // an empty throwaway store before the tool imports it
const { loadCases, scoreCase, topicFor } = await import('../tools/retrieval-eval.js');

// three pages: page 2 is the one about torsion
const pages = ['Shafts and beams, an introduction. ', 'Torsion in shafts. The torsion formula relates torque to twist. ', 'Bending of beams under load.'];
const starts = pages.reduce((acc, p, i) => [...acc, i === 0 ? 0 : acc[i - 1] + pages[i - 1].length], []);
const file = { id: '12', name: 'Mechanics notes', unit: 'EMM 302', text: pages.join(''), pageStarts: starts };
const topics = [{ id: 't1', unit: 'EMM 302', name: 'Torsion' }, { id: 't2', unit: 'EMM 302', name: 'Bending' }];

test('fixtures: arrays of cases, the README is ignored, a bad case says which', () => {
  const dir = mkdtempSync(join(tmpdir(), 'retr-'));
  writeFileSync(join(dir, 'README.md'), 'not a case file');
  writeFileSync(join(dir, 'a.json'), JSON.stringify([{ unit: 'EMM 302', question: 'What is torsion?', pages: [{ fileId: '12', page: 2 }] }]));
  assert.equal(loadCases(dir).length, 1);
  writeFileSync(join(dir, 'b.json'), JSON.stringify([{ unit: 'EMM 302', question: 'x' }]));
  assert.throws(() => loadCases(dir), /b\.json case 1: needs unit, question and pages/);
});

test('a case scores against the page that answers it: recall, MRR and the topic it was about', () => {
  const c = { unit: 'EMM 302', question: 'How does torsion twist a shaft?', pages: [{ fileId: '12', page: 2 }] };
  assert.equal(topicFor(c, topics).name, 'Torsion');
  const r = scoreCase(c, { topics, subtopics: [], files: [file], questions: [] });
  assert.equal(r.topic, 'Torsion');
  assert.equal(r.recall5, 1);
  assert.equal(r.mrr, 1);
  assert.ok(r.shown >= 1);
});

test('a gold page the path does not show scores 0, with no NaN', () => {
  const c = { unit: 'EMM 302', question: 'How does torsion twist a shaft?', topic: 'Torsion', pages: [{ fileId: '12', page: 3 }] };
  const r = scoreCase(c, { topics, subtopics: [], files: [file], questions: [] });
  assert.equal(r.recall5, 0);
  assert.equal(r.mrr, 0);
  assert.equal(r.recall10, 0);
});

test('a unit with no topic that fits is skipped, not scored as zero', () => {
  const r = scoreCase({ unit: 'EMM 302', question: 'Quantum chromodynamics', pages: [{ fileId: '12', page: 2 }] }, { topics: [], subtopics: [], files: [file], questions: [] });
  assert.match(r.skipped, /no topic/);
});
