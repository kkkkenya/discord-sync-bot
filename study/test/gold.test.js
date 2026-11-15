// Gold solutions (server/gold.js): the check level of a shared solution, the write rule and the run report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerParts, rank, report, sameAnswer, settle, shouldReplace } from '../server/gold.js';

const cp = [{ step: 'x' }];

test('levels rank single < agreed < key', () => {
  assert.ok(rank('single') < rank('agreed') && rank('agreed') < rank('key'));
  assert.equal(rank(undefined), 0);
});

test('the write rule: higher wins, lower never, strong over cheap at the same level, flagged ones can be redone', () => {
  assert.equal(shouldReplace(null, { level: 'single', checkpoints: cp }), true);
  assert.equal(shouldReplace(null, { level: 'key', checkpoints: [] }), false); // nothing to show
  assert.equal(shouldReplace({ level: 'single' }, { level: 'agreed', checkpoints: cp }), true);
  assert.equal(shouldReplace({ level: 'key' }, { level: 'single', model: 'opus', checkpoints: cp }), false);
  assert.equal(shouldReplace({ level: 'agreed', model: 'opus' }, { level: 'single', model: 'gemini-3.8-flash', checkpoints: cp }), false);
  assert.equal(shouldReplace({ level: 'key', model: 'opus', flagged: 9 }, { level: 'single', model: 'gemini-3.8-flash', checkpoints: cp }), false); // flags never let a lower level in
  assert.equal(shouldReplace({ level: 'single', model: 'gemini-3.8-flash' }, { level: 'single', model: 'opus', checkpoints: cp }), true);
  assert.equal(shouldReplace({ level: 'single', model: 'opus' }, { level: 'single', model: 'gemini-3.8-flash', checkpoints: cp }), false);
  assert.equal(shouldReplace({ level: 'single', model: 'gemini-3.8-flash' }, { level: 'single', model: 'deepseek-flash', checkpoints: cp }), false);
  assert.equal(shouldReplace({ level: 'agreed', model: 'opus', flagged: 3 }, { level: 'agreed', model: 'opus', checkpoints: cp }), true);
  assert.equal(shouldReplace({ level: 'agreed', model: 'opus', flagged: 2 }, { level: 'agreed', model: 'opus', checkpoints: cp }), false);
});

test('answers split into parts', () => {
  assert.deepEqual(answerParts('175 kNm; 4.3°'), ['175 kNm', '4.3°']);
  assert.deepEqual(answerParts('(a) 12 N (b) 4 m'), ['12 N', '4 m']);
  assert.deepEqual(answerParts(['175 kNm', '4.3°']), ['175 kNm', '4.3°']);
  assert.deepEqual(answerParts('The stress is proportional to strain'), []);
});

test('two answers agree by value and unit, part by part', () => {
  assert.equal(sameAnswer('4.3°', '0.075 rad'), true);
  assert.equal(sameAnswer('142.5 MPa', '142.5 N/mm^2'), true);
  assert.equal(sameAnswer('175 kNm', '175 kNm; 4.3°'), true); // one part given, it matches
  assert.equal(sameAnswer('175 kNm; 5.1°', '175 kNm; 4.3°'), false);
  assert.equal(sameAnswer('(a) 12 N (b) 4 m', '12 N; 4 m'), true);
  assert.equal(sameAnswer('Hooke\'s law: stress is proportional to strain', '42 MPa'), null);
  assert.equal(sameAnswer('', ''), null);
});

test('settle: a printed answer matched blind is key', () => {
  assert.deepEqual(settle({ key: ['175 kNm', '4.3°'], first: '175 kNm' }), { level: 'key', winner: 'first', reason: 'matches the printed answer', review: false });
});

test('settle: a miss, then reached once told, is key but listed for the owner', () => {
  const s = settle({ key: '90 MPa', first: '100 MPa', told: '90 MPa' });
  assert.equal(s.level, 'key'); assert.equal(s.winner, 'told'); assert.equal(s.review, true);
});

test('settle: a miss that never reaches the printed answer is single and listed', () => {
  const s = settle({ key: '90 MPa', first: '100 MPa', told: '100 MPa' });
  assert.equal(s.level, 'single'); assert.equal(s.review, true);
});

test('settle: no printed answer, two families agree', () => {
  assert.equal(settle({ first: '12.5 kN', second: '12500 N' }).level, 'agreed');
});

test('settle: a printed answer with no number falls back to the two solvers', () => {
  assert.equal(settle({ key: 'see notes', first: '12.5 kN', second: '12.5 kN' }).level, 'agreed');
});

test('settle: disagreement, with and without a referee', () => {
  const no = settle({ first: '12.5 kN', second: '20 kN' });
  assert.equal(no.level, 'single'); assert.equal(no.review, true);
  assert.deepEqual(settle({ first: '12.5 kN', second: '20 kN', referee: '12.5 kN' }).winner, 'first');
  const second = settle({ first: '12.5 kN', second: '20 kN', referee: '20 kN' });
  assert.equal(second.level, 'agreed'); assert.equal(second.winner, 'second');
  assert.equal(settle({ first: '12.5 kN', second: '20 kN', referee: '7 kN' }).reason, 'three different answers');
});

test('settle: a derivation has nothing to compare and stays single, not listed', () => {
  assert.deepEqual(settle({ first: 'Show that sigma = My/I', second: 'derived above' }), { level: 'single', winner: 'first', reason: 'nothing to compare', review: false });
  assert.equal(settle({ first: '12 kN' }).reason, 'one solver');
});

test('report counts levels, accuracy on printed answers, and the owner\'s list', () => {
  const r = report([
    { label: 'Q1', level: 'key', review: false, keyed: true, firstRight: true, secondRight: false },
    { label: 'Q2', level: 'key', reason: 'reached the printed answer once told it', review: true, keyed: true, firstRight: false, secondRight: true },
    { label: 'Q3', level: 'agreed', review: false },
    { label: 'Q4', error: 'Claude Code took too long' },
  ]);
  assert.deepEqual(r.byLevel, { single: 0, agreed: 1, key: 2 });
  assert.deepEqual(r.accuracy, { first: { right: 1, of: 2 }, second: { right: 1, of: 2 } });
  assert.equal(r.failed, 1);
  assert.deepEqual(r.review.map((x) => x.label), ['Q2', 'Q4']);
});
