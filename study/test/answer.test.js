import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAnswers, parseAnswer, parseUnit } from '../server/answer.js';

const v = (a, b, o) => compareAnswers(a, b, o);

test('numbers and units are read from how students type them', () => {
  assert.deepEqual([parseAnswer('142.5 MPa').value, parseAnswer('142.5 MPa').unitText], [142.5, 'MPa']);
  assert.equal(parseAnswer('1.2e3 N').value, 1200);
  assert.equal(parseAnswer('1.2 x 10^3 N').value, 1200);
  assert.equal(parseAnswer('-3.5kN.m').value, -3.5);
  assert.equal(parseAnswer('1,250 N').value, 1250);
  assert.equal(parseAnswer('142,5 MPa').value, 142.5);
  assert.equal(parseAnswer('= 12 mm').value, 12);
  assert.equal(parseAnswer('no number').value, null);
  assert.equal(parseUnit('N/mm^2').factor, 1e6);
  assert.equal(parseUnit('mm2').factor, 1e-6);
  assert.equal(parseUnit('furlongs'), null);
});

test('the same quantity in different units is accepted', () => {
  assert.equal(v('142.5 MPa', '0.1425 GPa').verdict, 'right');
  assert.equal(v('142.5 N/mm2', '142.5 MPa').verdict, 'right');
  assert.equal(v('25 mm', '0.025 m').verdict, 'right');
  assert.equal(v('4500 N', '4.5 kN').verdict, 'right');
  assert.equal(v('3 kN.m', '3000 N.m').verdict, 'right');
  assert.equal(v('60 rpm', '6.2832 rad/s').verdict, 'right');
});

test('±1% by default, and the tolerance can be changed', () => {
  assert.equal(v('141.2 MPa', '142.5 MPa').verdict, 'right');
  assert.equal(v('140 MPa', '142.5 MPa').verdict, 'wrong');
  assert.equal(v('140 MPa', '142.5 MPa', { tol: 0.02 }).verdict, 'right');
});

test('a sign error is told apart from a wrong value', () => {
  const r = v('-142.5 MPa', '142.5 MPa');
  assert.deepEqual([r.verdict, r.reason, r.errorType], ['wrong', 'sign', 'sign-convention']);
  assert.equal(v('99 MPa', '142.5 MPa').reason, 'value');
});

test('a power-of-ten slip is a units slip, a different kind of unit is a dimension error', () => {
  const r = v('25', '0.025 m');
  assert.deepEqual([r.verdict, r.reason, r.errorType, r.assumed], ['wrong', 'units', 'units', true]);
  assert.equal(v('142500 MPa', '142.5 MPa').reason, 'units');
  const d = v('25 N', '25 m');
  assert.deepEqual([d.verdict, d.reason, d.errorType], ['wrong', 'dimension', 'units']);
});

test('a missing unit is compared as a plain number, and unreadable input is not marked wrong', () => {
  const r = v('142.5', '142.5 MPa');
  assert.deepEqual([r.verdict, r.assumed], ['right', true]);
  assert.equal(v('about right', '142.5 MPa').verdict, 'unreadable');
  assert.equal(v('12 furlongs', '12 stadia').verdict, 'unreadable');
  assert.equal(v('0', '0 N').verdict, 'right');
});

test('a final answer written with its symbol, "therefore" or "Ans" is read the same', () => {
  for (const s of ['d = 3.23 mm', '∴ d = 3.23 mm', 'Ans: 3.23 mm', 'd=3.23mm', 'Answer = 3.23 mm']) {
    const a = parseAnswer(s);
    assert.equal(a.value, 3.23, s);
    assert.equal(a.unitText, 'mm', s);
  }
  assert.equal(v('d = 32.3 mm', '0.0323 m').verdict, 'right');
  assert.equal(parseAnswer('-12 kN').value, -12, 'a leading minus is still a sign');
});

test('superscript exponents are read: 7.8×10⁻³ rad', () => {
  assert.ok(Math.abs(parseAnswer('7.8×10⁻³ rad').value - 0.0078) < 1e-12);
  assert.equal(parseAnswer('ΔC = 4.5 x 10-5 m').value, 0.000045);
});
