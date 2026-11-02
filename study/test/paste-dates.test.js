// Dates out of a pasted message: codes or unit names, many date styles, headings, one date per unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDates } from '../web/src/paste-dates.js';

const UNITS = [{ code: 'EMM 302', title: 'Strength of Materials' }, { code: 'EMM 305', title: 'Metrology' }, { code: 'EMM 308', title: 'Computer Programming II' }, { code: 'ECU 300', title: 'Engineering Maths IX' }];
const TODAY = '2026-11-02'; // a Monday
const pick = (text) => readDates(text, UNITS, TODAY).map((x) => [x.code, x.date, x.kind]);

test('one line: code, kind and a date in words', () => {
  assert.deepEqual(pick('cat 1 emm 302 november 16th'), [['EMM 302', '2026-11-16', 'CAT 1']]);
  assert.deepEqual(pick('EMM305 CAT 2 on 18th Nov 2026'), [['EMM 305', '2026-11-18', 'CAT 2']]);
});

test('a WhatsApp list: day-first numbers, ISO, unit names, today and weekdays', () => {
  const msg = 'Good evening class 🙏\nCAT dates:\nEMM 302 - 16/11\nMetrology: 2026-11-18\nComputer Programming II cat tomorrow\nECU 300 exam on Friday';
  assert.deepEqual(pick(msg), [
    ['EMM 308', '2026-11-03', 'CAT'],
    ['ECU 300', '2026-11-06', 'Exam'],
    ['EMM 302', '2026-11-16', 'CAT'],
    ['EMM 305', '2026-11-18', 'CAT'],
  ].sort((a, b) => a[1].localeCompare(b[1])));
});

test('a date line is a heading for the units under it', () => {
  assert.deepEqual(pick('Monday 16th November (CAT 1)\nEMM 302\nEMM 305\n\nWed 18/11\nEMM 308'), [
    ['EMM 302', '2026-11-16', 'CAT 1'], ['EMM 305', '2026-11-16', 'CAT 1'], ['EMM 308', '2026-11-18', ''],
  ]);
});

test('units that are not yours come back marked; a month long gone means next year', () => {
  const r = readDates('EEE 305 CAT 20/11\nEMM 302 exam 10th January', UNITS, TODAY);
  assert.deepEqual(r.map((x) => [x.code, x.date, x.mine]), [['EMM 302', '2027-01-10', true], ['EEE 305', '2026-11-20', false]]);
});

test('two dates for one unit: the next one to come', () => {
  assert.deepEqual(pick('EMM 302 CAT 1 1/10\nEMM 302 CAT 2 20/11'), [['EMM 302', '2026-11-20', 'CAT 2']]);
});
