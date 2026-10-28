import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapQuestion, paperInfo, parseQuestions, predictedMock, predictions, readHint } from '../server/predict.js';

const PAPER = 'KENYATTA UNIVERSITY ECU 300 ENGINEERING MATHEMATICS INSTRUCTIONS: Answer question ONE and any other TWO questions. '
  + 'QUESTION ONE (30 MARKS) a) Evaluate the beta function B(3,4) using its relation to the gamma function (6 marks) b) Show that Gamma(1/2) = sqrt(pi) (8 marks) c) Solve the Laplace transform of t sin t (16 marks) '
  + 'QUESTION TWO a) Express the integral of sin^5 x cos^3 x as a beta function (10 marks) b) Hence evaluate it (10 marks) '
  + 'QUESTION THREE (20 MARKS) Use Fourier series to expand f(x) = x on (-pi, pi) and deduce a series for pi/4. '
  + 'QUESTION FOUR (20 MARKS) Solve the heat equation by separation of variables for a rod with insulated ends. END';

test('a squashed KU paper splits into its questions, ignoring the instructions', () => {
  const qs = parseQuestions(PAPER);
  assert.deepEqual(qs.map((q) => [q.number, q.marks]), [[1, 30], [2, 20], [3, 20], [4, 20]]);
  assert.match(qs[0].text, /^a\) Evaluate the beta function/);
  assert.doesNotMatch(qs[0].text, /QUESTION TWO/);
  assert.equal(parseQuestions('no questions here at all').length, 0);
});

test('Q1 / Q2 style headers work too', () => {
  const qs = parseQuestions('Q1. Derive the Lame equations for a thick cylinder under internal pressure [15 marks] Q2. Draw Mohr circle for the stress state given and find principal stresses (10 marks)');
  assert.deepEqual(qs.map((q) => [q.number, q.marks]), [[1, 15], [2, 10]]);
});

test('paper year and type from the file name', () => {
  assert.deepEqual(paperInfo('ECU 300 CAT 1 2023.pdf'), { year: 2023, type: 'CAT1' });
  assert.deepEqual(paperInfo('emm302_cat-ii_2021'), { year: 2021, type: 'CAT2' });
  assert.deepEqual(paperInfo('EMM 302 Main Exam Dec 2022.pdf'), { year: 2022, type: 'Exam' });
  assert.deepEqual(paperInfo('notes'), { year: null, type: 'Exam' });
});

const TOPICS = [{ id: 'beta', name: 'Beta functions' }, { id: 'gamma', name: 'Gamma functions' }, { id: 'fourier', name: 'Fourier series' }, { id: 'pde', name: 'Heat equation' }];

test('questions map to the topic they name', () => {
  const qs = parseQuestions(PAPER);
  assert.equal(mapQuestion(qs[1].text, TOPICS).topicId, 'beta');
  assert.equal(mapQuestion(qs[2].text, TOPICS).topicId, 'fourier');
  assert.equal(mapQuestion(qs[3].text, TOPICS).topicId, 'pde');
  assert.equal(mapQuestion('Explain the working of a governor', TOPICS).topicId, null);
  const sub = mapQuestion(qs[1].text, TOPICS, [{ id: 's1', topicId: 'beta', name: 'Trig integrals as beta functions' }]);
  assert.deepEqual(sub.subtopicIds, ['s1']);
});

test('hints: kind from the wording, topics from the names', () => {
  assert.deepEqual(readHint('The exam will mainly focus on beta functions', TOPICS), { kind: 'focus', topicIds: ['beta'] });
  assert.deepEqual(readHint('Skip Fourier series, it was covered last sem', TOPICS), { kind: 'exclude', topicIds: ['fourier'] });
  assert.deepEqual(readHint('Bring a calculator', TOPICS), { kind: 'note', topicIds: [] });
});

const Q = [
  { fileId: 'p1', topicId: 'fourier', marks: 20, year: 2021 }, { fileId: 'p2', topicId: 'fourier', marks: 20, year: 2022 }, { fileId: 'p3', topicId: 'fourier', marks: 20, year: 2023 },
  { fileId: 'p1', topicId: 'pde', marks: 20, year: 2021 }, { fileId: 'p2', topicId: 'pde', marks: 10, year: 2022 },
  { fileId: 'p3', topicId: 'gamma', marks: 6, year: 2023 },
].map((q, i) => ({ ...q, id: `q${i}`, text: `question ${i}`, source: q.fileId }));

test('ranking is exam weight: frequency × average marks, explained', () => {
  const r = predictions({ topics: TOPICS, questions: Q });
  assert.deepEqual(r.map((x) => x.topicId), ['fourier', 'pde', 'gamma', 'beta']);
  assert.equal(r[0].weight, 20);      // 3/3 papers × 20 marks
  assert.equal(r[1].weight, 10);      // 2/3 × 15
  assert.equal(r[0].evidence, 'appeared in 3 of 3 papers, 3 questions, avg 20 marks');
  assert.equal(r[3].evidence, 'no past-paper questions mapped yet');
});

test('a focus hint pins the topic to #1 with 2.5×; exclude halves it early and mutes it late', () => {
  const hints = [
    { kind: 'focus', topicIds: ['beta'], text: 'exam will mainly focus on beta functions', at: '2026-10-20' },
    { kind: 'exclude', topicIds: ['fourier'], text: 'skip fourier', at: '2026-10-21' },
  ];
  const early = predictions({ topics: TOPICS, questions: Q, hints });
  assert.equal(early[0].topicId, 'beta');
  assert.equal(early[0].pinned, true);
  assert.equal(early[0].weight, 2.5);
  assert.equal(early.at(-1).topicId, 'fourier');
  assert.equal(early.at(-1).weight, 10);
  const late = predictions({ topics: TOPICS, questions: Q, hints, late: true });
  assert.equal(late.find((x) => x.topicId === 'fourier').weight, 0);
  // the newest hint about a topic wins
  const flip = predictions({ topics: TOPICS, questions: Q, hints: [...hints, { kind: 'focus', topicIds: ['fourier'], text: 'actually do fourier', at: '2026-10-25' }] });
  assert.equal(flip.find((x) => x.topicId === 'fourier').pinned, true);
});

test('a predicted mock covers ~65% of the weight with one recent question per topic, never muted ones', () => {
  const ranked = predictions({ topics: TOPICS, questions: Q });
  const mock = predictedMock(ranked, Q);
  assert.deepEqual(mock.map((m) => [m.topic, m.year]), [['Fourier series', 2023], ['Heat equation', 2022]]);
  // a key saved by "Check my answer" travels with the question, so the mock can be marked against it
  const keyed = Q.map((q) => (q.topicId === 'fourier' && q.year === 2023 ? { ...q, key: { answer: '4/pi', source: 'you' } } : q));
  assert.deepEqual(predictedMock(ranked, keyed).map((m) => m.key), [{ answer: '4/pi', source: 'you' }, null]);
  const muted = predictions({ topics: TOPICS, questions: Q, hints: [{ kind: 'exclude', topicIds: ['fourier'], at: 'x' }], late: true });
  assert.ok(!predictedMock(muted, Q).some((m) => m.topic === 'Fourier series'));
});

test('bare 1. 2. numbering works, and figure or decimal numbers do not split a question', () => {
  const qs = parseQuestions('EAR 306 : CAT 2 ( Due 20 - 11 - 2023 ) 1. Two steel plates are joined by double transverse fillet welds as shown in Figure 1 . Find the length of the weld. 2. Using sketches differentiate between Through Bolt, Tap Bolt and Stud. 3. Discuss FIVE advantages of welded joints compared to rivetted joints. (5 marks) 4. Describe FIVE types of welded joints with neat sketches. (5 marks)');
  assert.deepEqual(qs.map((q) => [q.number, q.marks]), [[1, null], [2, null], [3, 5], [4, 5]]);
  assert.equal(parseQuestions('1. Plates carry a stress of 110 N/mm 2 . Find the required length of the weld for the plates. 2. Name any FOUR regions where fatigue failure is likely to occur.').length, 2);
  assert.match(qs[0].text, /Figure 1 \. Find the length/);
});

test('an unnumbered paper splits at each (n marks)', () => {
  const qs = parseQuestions('EMM 305: METROLOGY Continuous Assessment Test Questions State the requirements that the material used to manufacture gauges should satisfy. (5 marks) Define a comparator and give THREE classification of comparators. (5 marks) Discuss the metrological applications of an optical projector (4Marks)');
  assert.deepEqual(qs.map((q) => [q.number, q.marks]), [[1, 5], [2, 5], [3, 4]]);
});

test('an unnumbered paper printed twice on one sheet counts its questions once', () => {
  const sheet = 'SMA 230: VECTOR ANALYSIS - CAT I a) Determine the angle between the two vectors A and B (5 marks) b) Given the vectors A, B and C, determine (A - C) x (B - C) (5 marks) c) Prove the associative property of vector addition (5 marks)';
  const qs = parseQuestions(`${sheet} ${sheet.replace('Determine', 'D etermine').replace(' x ', 'x ')}`);
  assert.deepEqual(qs.map((q) => [q.number, q.marks]), [[1, 5], [2, 5], [3, 5]]);
  assert.match(qs[2].text, /^c\) Prove/);
});
