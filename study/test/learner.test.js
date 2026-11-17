// The learner file (fixplan-e E5): the pure file and block, the edits, the prompt helpers, and the rule that nothing
// personal reaches the shared writers. Pure tests first; the store-backed ones use a throwaway data directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ABOUT_RULE, aboutLine, aboutSystem, editLearner, learnerFile } from '../server/learner.js';
import { LEARNER } from '../server/defs.js';

const DAY = 864e5;
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const NOW = Date.now();
const at = (days) => new Date(NOW - days * DAY).toISOString();
const topic = (id, name, unit = 'EMM 302') => ({ id, unit, name });
const sub = (id, topicId, name, audit = 'untested', extra = {}) => ({ id, unit: 'EMM 302', topicId, name, kind: 'method', audit, ...extra });
const wrong = (n, extra = {}) => ({ id: `a${n}-${Math.random().toString(36).slice(2, 6)}`, verdict: 'wrong', brokeAt: 1, at: at(extra.days ?? 2), unit: 'EMM 302', ...extra });
const base = (over = {}) => ({ units: [{ code: 'EMM 302', title: 'Mechanics' }], topics: [], subtopics: [], attempts: [], teach: [], mocks: [], paperq: [], learner: { notes: [], hidden: [] }, ...over });
const lineIds = (file) => file.lines.map((l) => l.id);

test('nothing is said until the evidence clears the floors', () => {
  const two = base({ attempts: [wrong(1, { errorType: 'units' }), wrong(2, { errorType: 'units' })] });
  assert.deepEqual(learnerFile(two, { today: TODAY }), { lines: [], block: '' });
  const three = base({ attempts: [1, 2, 3].map((n) => wrong(n, { errorType: 'units' })) });
  const file = learnerFile(three, { today: TODAY });
  assert.equal(file.lines.length, 1);
  assert.equal(file.lines[0].text, 'Units and conversion slips: 3 in the last 60 days.');
  assert.equal(file.block, `- ${file.lines[0].text}`);
});

test('mistakes older than 60 days do not count', () => {
  const old = [1, 2, 3].map((n) => wrong(n, { errorType: 'units', days: 90 }));
  assert.deepEqual(learnerFile(base({ attempts: old }), { today: TODAY }).lines, []);
});

test('a sub-topic that breaks twice is named; once is not', () => {
  const doc = base({
    topics: [topic('t1', 'Torsion')],
    subtopics: [sub('s1', 't1', 'Twist angle')],
    attempts: [wrong(1, { subtopicId: 's1', errorType: 'concept-gap' }), wrong(2, { subtopicId: 's1', errorType: 'concept-gap' })],
  });
  const line = learnerFile(doc, { today: TODAY }).lines.find((l) => l.kind === 'break');
  assert.equal(line.text, 'Keeps breaking on Twist angle (Torsion): 2 times in the last 60 days.');
  assert.equal(learnerFile({ ...doc, attempts: doc.attempts.slice(0, 1) }, { today: TODAY }).lines.filter((l) => l.kind === 'break').length, 0);
});

test('the weakest link is named when it is the bottleneck in 3 or more topics', () => {
  // a units slip breaks at the "do" layer, so carrying it through is the bottleneck in each topic
  const topics = [topic('t1', 'A'), topic('t2', 'B'), topic('t3', 'C')];
  const attempts = topics.map((t, i) => ({ ...wrong(i, { errorType: 'units', topicId: t.id }) }));
  const file = learnerFile(base({ topics, attempts }), { today: TODAY });
  const link = file.lines.find((l) => l.kind === 'link');
  assert.equal(link?.text, 'Carrying it through is the weakest step in 3 topics.');
  const two = learnerFile(base({ topics: topics.slice(0, 2), attempts: attempts.slice(0, 2) }), { today: TODAY });
  assert.equal(two.lines.filter((l) => l.kind === 'link').length, 0);
});

test('calibration appears only when the ratings are clearly off', () => {
  // rated solid, but the checked answers broke at that sub-topic: ratings run higher than results
  const doc = base({
    topics: [topic('t1', 'Torsion')],
    subtopics: [sub('s1', 't1', 'Twist angle', 'solid', { auditFrom: 'you', auditAt: at(30) })],
    attempts: [wrong(1, { subtopicId: 's1', errorType: 'units', topicId: 't1' }), wrong(2, { subtopicId: 's1', errorType: 'units', topicId: 't1' })],
  });
  const cal = learnerFile(doc, { today: TODAY }).lines.find((l) => l.kind === 'calibration');
  assert.equal(cal?.text, 'Your own ratings run higher than your results in EMM 302.');
});

test('hidden lines leave the block, but stay in the file so they can be shown again', () => {
  const doc = base({ attempts: [1, 2, 3].map((n) => wrong(n, { errorType: 'units' })), learner: { notes: [], hidden: ['mistake:units'] } });
  const file = learnerFile(doc, { today: TODAY });
  assert.equal(file.lines[0].hidden, true);
  assert.equal(file.block, '');
  assert.equal(learnerFile({ ...doc, learner: { notes: [], hidden: [] } }, { today: TODAY }).block.length > 0, true);
});

test('the block is at most 600 characters and only whole lines', () => {
  const notes = [1, 2, 3, 4, 5].map((n) => ({ id: `n${n}`, text: 'x'.repeat(140), at: at(1) }));
  const doc = base({ attempts: [1, 2, 3].map((n) => wrong(n, { errorType: 'units' })), learner: { notes, hidden: [] } });
  const { block, lines } = learnerFile(doc, { today: TODAY });
  assert.ok(block.length <= LEARNER.blockChars, `block is ${block.length} characters`);
  assert.ok(block.split('\n').every((l) => l.startsWith('- ')), 'every line is whole');
  assert.ok(lines.length > block.split('\n').length, 'the file keeps lines the block could not fit');
});

test('notes: five at most, cleaned of @ and Discord-style ids, and never a name the code knows', () => {
  const notes = [{ id: 'n1', text: 'Ping @someone about 123456789012345678 signs', at: at(1) }, ...[2, 3, 4, 5, 6].map((n) => ({ id: `n${n}`, text: `Note ${n}`, at: at(1) }))];
  const file = learnerFile(base({ learner: { notes, hidden: [] } }), { today: TODAY });
  const notesShown = file.lines.filter((l) => l.kind === 'note');
  assert.equal(notesShown.length, 5);
  assert.equal(notesShown[0].text, 'Ping someone about signs');
  assert.doesNotMatch(file.block, /@|\d{15,}/);
});

test('the file and block come from the record only: no Discord id or user name is in them', () => {
  const doc = base({ attempts: [1, 2, 3].map((n) => wrong(n, { errorType: 'units' })) });
  const { lines, block } = learnerFile({ ...doc, user: { id: '123456789012345678', name: 'Grego' } }, { today: TODAY });
  const text = JSON.stringify({ lines, block });
  assert.doesNotMatch(text, /123456789012345678|Grego/);
});

test('editLearner: add, delete, hide, show and clear, with the limits', () => {
  const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  let i = 0;
  const opts = { newId: () => ids[i++], at: at(0), lineIds: ['mistake:units', 'note:a1'] };
  let learner = { notes: [], hidden: [] };
  learner = editLearner(learner, { action: 'addNote', text: '  Signs in beams  ' }, opts);
  assert.deepEqual(learner.notes.map((n) => n.text), ['Signs in beams']);
  assert.throws(() => editLearner(learner, { action: 'addNote', text: '   ' }, opts), /Write the note/);
  assert.throws(() => editLearner(learner, { action: 'addNote', text: 'x'.repeat(141) }, opts), /140/);
  let full = learner;
  for (let n = 0; n < 4; n++) full = editLearner(full, { action: 'addNote', text: `n${n}` }, opts);
  assert.equal(full.notes.length, 5);
  assert.throws(() => editLearner(full, { action: 'addNote', text: 'one more' }, opts), /5 notes at most/);

  learner = editLearner(learner, { action: 'hide', id: 'mistake:units' }, opts);
  assert.deepEqual(learner.hidden, ['mistake:units']);
  assert.throws(() => editLearner(learner, { action: 'hide', id: 'not-a-line' }, opts), /not in your file/);
  learner = editLearner(learner, { action: 'show', id: 'mistake:units' }, opts);
  assert.deepEqual(learner.hidden, []);

  const noteId = learner.notes[0].id;
  learner = editLearner({ ...learner, hidden: [`note:${noteId}`] }, { action: 'deleteNote', id: noteId }, opts);
  assert.deepEqual(learner.notes, []);
  assert.deepEqual(learner.hidden, [], 'a deleted note takes its hidden flag with it');
  assert.throws(() => editLearner(learner, { action: 'deleteNote', id: 'gone' }, opts), /not found/);

  const cleared = editLearner({ notes: [{ id: 'x', text: 'y', at: '' }], hidden: [] }, { action: 'clear' }, opts);
  assert.deepEqual(cleared.notes, []);
  assert.deepEqual(cleared.hidden, ['mistake:units', 'note:a1']);
  assert.throws(() => editLearner(learner, { action: 'nonsense' }, opts), /Pick what to change/);
});

test('aboutSystem and aboutLine add nothing when there is no block', () => {
  assert.equal(aboutSystem('SYS', ''), 'SYS');
  assert.equal(aboutLine(''), '');
  assert.equal(aboutSystem('SYS', '- a'), `SYS\n\n${ABOUT_RULE}`);
  assert.match(aboutLine('- a'), /never mention it/);
});

test('shared writers never take the block: their source has no about argument', () => {
  const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const kit = read('../server/kit.js');
  const guide = read('../server/guide.js');
  const gold = read('../tools/gold.js');
  for (const [name, src] of [['kit.js', kit], ['guide.js', guide], ['tools/gold.js', gold]]) {
    assert.doesNotMatch(src, /aboutStudent|\babout\s*[:,})]/, `${name} must not pass a block`);
  }
  const practice = read('../server/practice.js');
  const body = practice.slice(practice.indexOf('export async function ensureCheckpoints'), practice.indexOf('// "Full worked solution"'));
  assert.ok(body.length > 200);
  assert.doesNotMatch(body, /aboutStudent|\babout\s*[:,})]/, 'ensureCheckpoints writes shared checkpoints');
});

// ---- the store: the explain path gets the block; the shared writers get none, even with a block on the record ----
process.env.CRUX_STRICT = '1';
process.env.STUDY_DATA_DIR = mkdtempSync(tmpdir() + '/crux-learner-');
const { emptyDoc, normalize, VERSION, withDoc, data } = await import('../server/store.js');
const { explainQuestion, ensureCheckpoints } = await import('../server/practice.js');
const { makeGuideFor } = await import('../server/guide.js');
const { aboutStudent, learnerState, learnerUpdate } = await import('../server/learner-store.js');

// a record where the student has a units slip three times and a note of their own
const seed = () => {
  const doc = emptyDoc();
  doc.units = [{ code: 'EMM 302', title: 'Mechanics', catDate: '2026-12-20', confidence: 3 }];
  doc.topics = [{ id: 't1', unit: 'EMM 302', name: 'Torsion' }];
  doc.subtopics = [{ id: 's1', unit: 'EMM 302', topicId: 't1', name: 'Twist angle', kind: 'method', audit: 'untested' }];
  doc.paperq = [{ id: 'q1', unit: 'EMM 302', topicId: 't1', subtopicIds: ['s1'], fileId: 'f1', source: 'CAT 1 2025', number: 1, marks: 10, text: 'A shaft of 40 mm carries 2 kN m. Find the shear stress.' }];
  doc.attempts = [1, 2, 3].map((n) => wrong(n, { errorType: 'units', questionId: 'q1', topicId: 't1', subtopicId: 's1' }));
  doc.learner = { notes: [{ id: 'n1', text: 'I mix up signs in beams', at: at(1) }], hidden: [] };
  return doc;
};

test('explain gets the block; a shared writer does not, and nothing personal goes to shared rows', async () => {
  await withDoc(seed(), async () => {
    const block = aboutStudent();
    assert.match(block, /Units and conversion slips: 3/);
    assert.match(block, /I mix up signs in beams/);

    // personal: the explanation of one question gets the block
    let seen = null;
    await assert.rejects(explainQuestion({ unit: 'EMM 302', questionId: 'q1' }, { explain: async (args) => { seen = args; throw new Error('stop after the call'); }, ready: () => true, shared: { get: async () => null } }), /stop/);
    assert.equal(seen.about, block);

    // shared: the checkpoints that are shared are written without the block
    const solveArgs = [];
    const puts = [];
    await ensureCheckpoints({ id: data.attempts[0].id }, {
      solve: async (args) => { solveArgs.push(args); return { checkpoints: [{ n: 1, step: 'Find the torque', equation: 'T = 2 kN m', value: '2 kN m', subtopic: '', errorType: 'units' }] }; },
      ready: () => true,
      shared: { get: async () => null, put: async (u, q, cps, meta) => { puts.push({ u, q, cps, meta }); } },
      modelName: () => 'test',
    });
    assert.equal(solveArgs.length, 1);
    assert.equal('about' in solveArgs[0], false);
    assert.equal(puts.length, 1, 'the shareable question was written to the shared table');
    assert.doesNotMatch(JSON.stringify(puts), /signs in beams|Units and conversion/);

    // shared: a study guide is made and shared without the block
    const guideArgs = [];
    const guideShares = [];
    await makeGuideFor({ unit: 'EMM 302', topicId: 't1' }, {
      make: async (args) => { guideArgs.push(args); return { overview: 'o', outline: [], exam: '', plan: [], checklist: [] }; },
      ready: () => true,
      shared: { get: async () => null, put: async (k, u, g) => { guideShares.push(JSON.stringify({ k, g })); } },
    });
    assert.equal(guideArgs.length, 1);
    assert.equal('about' in guideArgs[0], false);
    assert.doesNotMatch(guideShares.join(''), /signs in beams|Units and conversion/);
  });
});

test('the document carries the learner field; old documents get it on load', () => {
  assert.equal(VERSION, 3);
  assert.deepEqual(normalize({ version: 2 }).learner, { notes: [], hidden: [] });
  const kept = normalize({ version: 2, learner: { notes: [{ id: 'x', text: 'y' }], hidden: ['mistake:units'] } });
  assert.equal(kept.learner.notes[0].text, 'y');
  assert.deepEqual(kept.learner.hidden, ['mistake:units']);
  assert.deepEqual(normalize({ learner: { notes: 'bad' } }).learner, { notes: [], hidden: [] });
});

test('learnerUpdate writes through the store and returns the new state', async () => {
  await withDoc(seed(), async () => {
    const after = learnerUpdate({ action: 'addNote', text: 'Check units first' }, TODAY);
    assert.ok(after.notes.some((n) => n.text === 'Check units first'));
    assert.match(after.block, /Check units first/);
    const hidden = learnerUpdate({ action: 'hide', id: 'mistake:units' }, TODAY);
    assert.doesNotMatch(hidden.block, /Units and conversion/);
    const cleared = learnerUpdate({ action: 'clear' }, TODAY);
    assert.deepEqual(cleared.notes, []);
    assert.equal(cleared.block, '');
    assert.equal(learnerState(TODAY).lines.every((l) => l.hidden), true, 'clear hides every line');
  });
});

// over HTTP, through the real router: GET returns the block, POST edits, and a bad edit is refused
test('GET and POST /api/learner over HTTP', async () => {
  const { startServer } = await import('./helpers.js');
  const srv = await startServer(undefined, { CRUX_STRICT: '0' }); // this file sets strict for the store; the local server is not Vercel
  try {
    const first = await srv.call('GET', 'learner');
    assert.equal(first.status, 200);
    assert.deepEqual(Object.keys(first.body).sort(), ['block', 'lines', 'notes']);
    assert.ok(first.body.block.length <= LEARNER.blockChars);
    const added = await srv.call('POST', 'learner', { action: 'addNote', text: 'Check units first' });
    assert.equal(added.status, 200);
    assert.equal(added.body.notes[0].text, 'Check units first');
    assert.match(added.body.block, /Check units first/);
    const refused = await srv.call('POST', 'learner', { action: 'addNote', text: '' });
    assert.equal(refused.status, 400);
    const cleared = await srv.call('POST', 'learner', { action: 'clear' });
    assert.deepEqual(cleared.body.notes, []);
    assert.equal(cleared.body.block, '');
  } finally { srv.stop(); }
});
