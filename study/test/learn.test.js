import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnPath } from '../server/learn.js';

// a 6-page notes PDF: torsion on pages 3-4, beams on page 6
const pages = [
  'Introduction to solid mechanics and the course plan for the semester ahead.',
  'Stress and strain in tension. Hooke law and Young modulus with worked examples.',
  'Torsion of circular shafts. The torsion formula T/J = tau/r = G theta/L relates torque, shear stress and angle of twist.',
  'Torsion continued: hollow shafts, polar moment of area J = pi (D^4 - d^4)/32, power transmitted by a shaft P = 2 pi N T / 60.',
  'Thin walled pressure vessels: hoop and longitudinal stress.',
  'Shear force and bending moment diagrams for simply supported beams.',
];
let at = 0;
const pageStarts = pages.map((p) => { const s = at; at += p.length + 1; return s; });
const files = [
  { id: 'n1', name: 'EMM 302 lecture notes.pdf', paper: false, text: pages.join(' '), pageStarts, url: 'https://discord/n1' },
  { id: 'w1', name: 'Shafts summary.docx', paper: false, text: 'A short summary. Angle of twist in shafts depends on G and J. Torsion of hollow shafts saves weight.' },
  { id: 'p1', name: 'EMM 302 CAT 1 2023.pdf', paper: true, text: 'Question one: torsion of a hollow shaft carrying torque.' },
  { id: 'o1', name: 'EMM 302 OUTLINE.docx', paper: false, text: 'Simple torsion analysis, torsion of solid and hollow circular shafts, angle of twist.' },
];
const topic = { id: 't1', unit: 'EMM 302', name: 'Torsion of shafts' };
const subtopics = [{ id: 's1', topicId: 't1', name: 'Angle of twist' }, { id: 's2', topicId: 't1', name: 'Power transmission' }];
const questions = [
  { id: 'q-old', topicId: 't1', source: 'EMM 302 CAT 1 2019.pdf', type: 'CAT1', year: 2019, number: 2, text: 'Find the torque.' },
  { id: 'q-new', topicId: 't1', source: 'EMM 302 CAT 1 2023.pdf', type: 'CAT1', year: 2023, number: 1, text: 'Find the angle of twist.' },
  { id: 'q-tut', topicId: 't1', source: 'KU EMM 302 TUT 3.docx', type: 'Tutorial', year: null, number: 2, text: 'Max torque of a hollow shaft.', key: { answer: '175 kNm', parts: ['175 kNm', '4.3°'], source: 'sheet' } },
  { id: 'q-beam', topicId: 't9', source: 'x', number: 1, text: 'A beam.' },
];

test('read: the pages that cover the topic, as a range, best first; papers and the outline are not reading', () => {
  const p = learnPath({ topic, subtopics, files, questions });
  assert.deepEqual(p.read[0], { ...p.read[0], fileId: 'n1', pages: [3, 4] });
  assert.match(p.read[0].snippet, /Torsion of circular shafts/i);
  assert.ok(p.read[0].excerpt.includes('hollow shafts'));
  const word = p.read.find((r) => r.fileId === 'w1');
  assert.equal(word.pages, null, 'a Word file has no page numbers');
  assert.match(word.find, /torsion|twist/i, 'so it quotes what to look for');
  assert.ok(!p.read.some((r) => r.fileId === 'p1' || r.fileId === 'o1'));
});

test('attempt: questions with a printed answer first, then the newest papers', () => {
  const p = learnPath({ topic, subtopics, files, questions });
  assert.deepEqual(p.attempt.map((q) => q.id), ['q-tut', 'q-new', 'q-old']);
  assert.equal(p.attempt[0].hasKey, true);
});

test('only when it applies: a topic the notes do not cover gets no made-up reference, and points elsewhere', () => {
  const p = learnPath({ topic: { id: 't2', unit: 'EMM 302', name: 'Strain energy in shear' }, subtopics: [], files, questions });
  assert.deepEqual(p.read, []);
  assert.deepEqual(p.attempt, []);
  assert.ok(p.then.some((s) => s.kind === 'kit'), 'no notes on it: a study kit ladder is offered');
  const covered = learnPath({ topic, subtopics, files, questions });
  assert.ok(!covered.then.some((s) => s.kind === 'prompt'), 'covered by your notes and questions: no outside AI suggested');
});

test('study first: worked examples in your notes are listed apart from plain reading; none found offers a ladder', () => {
  const withExample = [...files, { id: 'b1', name: 'Hearn Mechanics of Materials.pdf', paper: false, text: 'Chapter 8 Torsion. Example 8.1: a solid shaft transmits torque; find the shear stress and angle of twist. Solution: J = pi d^4/32 ...', pageStarts: [0] }];
  const p = learnPath({ topic, subtopics, files: withExample, questions });
  assert.deepEqual(p.examples.map((e) => [e.fileId, e.pages]), [['b1', [1, 1]]]);
  assert.ok(!p.read.some((r) => r.fileId === 'b1'), 'an example page is not listed twice');
  assert.ok(!p.then.some((s) => s.kind === 'kit'));
  const noExamples = learnPath({ topic, subtopics, files, questions });
  assert.deepEqual(noExamples.examples, []);
  assert.ok(noExamples.then.some((s) => s.kind === 'kit' && /worked example/i.test(s.text)), 'no worked example in your files: a ladder makes one');
});
