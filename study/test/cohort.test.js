import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogue, codeFor, cohortUnits, courses, validCohort } from '../server/cohort.js';

// The real Study Hub catalogue, read-only.
const read = (f) => JSON.parse(readFileSync(new URL(`../../lib/${f}`, import.meta.url), 'utf8'));
const ALL = catalogue(read('units.json'), read('threads.json'));
const codes = (list) => list.map((u) => u.code);

test('EMM · Year 3 loads its timetabled units (plus EAR 307, where its files sit) and the other shared units', () => {
  const { core, shared } = cohortUnits(ALL, { course: 'EMM', year: 3 });
  assert.deepEqual(codes(core), ['EAR 307', 'ECU 300', 'EMM 301', 'EMM 302', 'EMM 305', 'EMM 308', 'EMM 312', 'EMM 314', 'EMM 318']);
  assert.equal(core.find((u) => u.code === 'EMM 302').title, 'Solid and Structural Mechanics I');
  assert.deepEqual(codes(shared).filter((c) => c.startsWith('ECU')), ['ECU 301', 'ECU 302']);
  assert.ok(codes(shared).includes('SMA 330'));
});

test('without a timetable a cohort is guessed from the codes: the year digit and the course', () => {
  const { core } = cohortUnits(ALL, { course: 'EMM', year: 3 }, null);
  assert.ok(codes(core).every((c) => /^EMM 3\d\d$/.test(c) || c === 'EAR 307'), codes(core).join());
  assert.ok(!codes(core).includes('EMM 400'), 'a 4th-year unit cross-listed with a 3rd-year EAR code is not EMM year 3');
});

test('Biomedical year 3 takes Electrical units too, by their EEE codes and official titles', () => {
  const { core } = cohortUnits(ALL, { course: 'EBM', year: 3 });
  assert.ok(codes(core).includes('EEE 305'));
  assert.equal(core.find((u) => u.code === 'EBM 301').title, 'Properties of Biomaterials');
});

test('cross-listed units use the code the course knows them by', () => {
  const u = ALL.find((x) => x.codes.includes('EMM 308') && x.codes.includes('EAR 302'));
  assert.equal(codeFor(u, 'EMM'), 'EMM 308');
  assert.equal(codeFor(u, 'EAR'), 'EAR 302');
  assert.ok(codes(cohortUnits(ALL, { course: 'EAR', year: 3 }).core).includes('EAR 302'));
});

test('every course with units in the catalogue is offered', () => {
  assert.deepEqual(courses(ALL).map((c) => c.code).sort(), ['EAR', 'EBE', 'EBM', 'ECV', 'EEE', 'EMM', 'EPL']);
  assert.ok(cohortUnits(ALL, { course: 'EEE', year: 3 }).core.length > 0);
  assert.ok(cohortUnits(ALL, { course: 'ECV', year: 3 }).core.length > 0);
  // units with only a forum thread come through without a title
  assert.ok(cohortUnits(ALL, { course: 'EBM', year: 3 }, null).core.some((u) => u.code === 'EBM 304' && u.title === ''));
});

test('year 1 shares the university common units; an empty cohort is just empty', () => {
  assert.ok(codes(cohortUnits(ALL, { course: 'EMM', year: 1 }).shared).some((c) => c.startsWith('UCU')));
  assert.deepEqual(cohortUnits(ALL, { course: 'EPL', year: 4 }).core, []);
});

test('cohort validation', () => {
  assert.equal(validCohort({ course: 'EMM', year: 3, sem: 1 }), true);
  assert.equal(validCohort({ course: 'XYZ', year: 3, sem: 1 }), false);
  assert.equal(validCohort({ course: 'EMM', year: 6, sem: 1 }), false);
  assert.equal(validCohort({ course: 'EMM', year: 3, sem: 3 }), false);
});
