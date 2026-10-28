// Course + year → the units a student is likely taking, from the Study Hub catalogue (lib/units.json). Pure: the
// catalogue is passed in. A unit's year is the first digit of its code (EMM 302 → year 3), which matches the
// server's year forums. The catalogue has no semester, so a cohort lists the whole year and the student unticks
// what they aren't sitting this semester.

export const COURSES = {
  EMM: 'Mechanical', EAR: 'Aerospace', EBE: 'Agricultural & Biosystems', ECV: 'Civil',
  EEE: 'Electrical & Electronic', EBM: 'Biomedical', EPL: 'Energy / Petroleum',
};
// Maths and common units every course takes in its year.
const SHARED = ['ECU', 'SMA', 'UCU'];
// Units under another course's code that a cohort takes anyway (they sit in that cohort's forum on the server).
const EXTRA = { 'EMM 3': ['EAR 307'] };

const prefix = (code) => code.split(' ')[0];
const yearOf = (code) => Number(code.match(/\d/)?.[0]);

// The catalogue: lib/units.json (codes + titles) plus any unit that only has a forum thread (lib/threads.json),
// such as the Electrical, Biomedical and Energy units, which have no title in the Hub yet.
export function catalogue(units, threads) {
  const all = units.map((u) => ({ code: u.codes[0], codes: u.codes, title: u.title }));
  const known = new Set(all.flatMap((u) => u.codes));
  for (const code of Object.keys(threads)) if (!known.has(code)) all.push({ code, codes: [code], title: '' });
  return all;
}

// The code a student of `course` knows a cross-listed unit by: EMM 308 for Mechanical, EAR 302 for Aerospace.
export const codeFor = (unit, course) => unit.codes.find((c) => prefix(c) === course) || unit.codes[0];

export const courses = (all) =>
  Object.entries(COURSES).filter(([c]) => all.some((u) => u.codes.some((x) => prefix(x) === c))).map(([code, name]) => ({ code, name }));

// { core, shared }: each [{ code, codes, title }], sorted by code. `core` is the course's own year units.
export function cohortUnits(all, { course, year }) {
  const extra = EXTRA[`${course} ${year}`] || [];
  const pick = (u) => ({ code: codeFor(u, course), codes: u.codes, title: u.title });
  const byCode = (a, b) => a.code.localeCompare(b.code);
  const core = all.filter((u) => u.codes.some((c) => (prefix(c) === course && yearOf(c) === year) || extra.includes(c))).map(pick).sort(byCode);
  const taken = new Set(core.map((u) => u.code));
  const shared = all
    .filter((u) => u.codes.some((c) => SHARED.includes(prefix(c)) && yearOf(c) === year))
    .map((u) => ({ code: u.codes.find((c) => SHARED.includes(prefix(c)) && yearOf(c) === year), codes: u.codes, title: u.title }))
    .filter((u) => !taken.has(u.code))
    .sort(byCode);
  return { core, shared };
}

export function validCohort(c) {
  return Boolean(c && COURSES[c.course] && Number.isInteger(c.year) && c.year >= 1 && c.year <= 5 && [1, 2].includes(c.sem));
}
