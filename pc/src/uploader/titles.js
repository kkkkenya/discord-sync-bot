// Recognises a unit from a folder or file named by its title ("Fluid Mechanics 2", "Eng. Mech. 2", "SSM 3")
// using the unit catalogue (lib/units.json, built by make-units.js) plus the titled posts on the server.
// Strict on purpose: the words must mostly match both ways, numbers must agree, the unit's year must match the
// folder's year when there is one, and there must be a clear winner. Anything unclear goes to #to-sort.
import UNITS from '../../../lib/units.json' with { type: 'json' };

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const STOP = new Set(['and', 'of', 'the', 'to', 'for', 'in', 'with', 'on', 'a', 'an', 'engineering', 'principles', 'intro', 'introduction',
  // what kind of file it is, not which unit: "Thermo 2 CAT and solutions", "Fluids notes"
  'notes', 'note', 'cat', 'cats', 'solution', 'solutions', 'assignment', 'assignments', 'past', 'paper', 'papers', 'exam', 'exams',
  'handout', 'handouts', 'slide', 'slides', 'lecture', 'lectures', 'tutorial', 'tutorials', 'revision', 'question', 'questions',
  'answer', 'answers', 'marking', 'scheme', 'sem', 'semester', 'year', 'copy', 'final', 'new', 'pdf', 'docx', 'pptx']);
// Short forms students use for folder names (applied to both sides, so they meet in the middle).
const SHORT = [
  [/\beng\b\.?/g, 'engineering'], [/\bmech\b\.?/g, 'mechanics'], [/\bmathematics\b|\bmath\b/g, 'maths'],
  [/\bthermo\b/g, 'thermodynamics'], [/\bfluids\b/g, 'fluid mechanics'], [/\bssm\b/g, 'solid structural mechanics'],
  [/\bdes\b|\bdifferential equations?\b|\bordinary differential equations?\b/g, 'ode'], [/\btransform methods?\b|\blaplace transforms?\b/g, 'transforms'],
  [/\bcontrols\b/g, 'control'], [/\belec\b\.?/g, 'electrical'], [/\bprog\b\.?/g, 'programming'], [/\bstats\b/g, 'statistics'],
  [/\bstrength of materials\b/g, 'strength materials'], [/\bworkshop practice\b/g, 'workshop'],
  [/\bac\b/g, 'air conditioning'], [/\bcomm\b\.?/g, 'communication'], [/\bcad\b/g, 'computer aided drawing'],
];

function words(text) {
  let t = ` ${String(text).toLowerCase().replace(/&/g, ' and ')} `;
  for (const [re, to] of SHORT) t = t.replace(re, ` ${to} `);
  const out = { content: new Set(), numbers: [] };
  for (const w of t.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (ROMAN[w] !== undefined) out.numbers.push(ROMAN[w]);
    else if (/^\d{1,2}$/.test(w)) out.numbers.push(Number(w));
    else if (/^\d/.test(w) || STOP.has(w) || w.length < 3) continue;
    else out.content.add(w.length > 4 ? w.replace(/(ing|al|s)$/, '') : w); // mechanics, mechanical -> mechanic
  }
  return out;
}

const catalogue = UNITS.map((u) => ({ ...u, w: words(u.title) }));

function score(f, t) {
  const shared = [...f.content].filter((w) => t.content.has(w)).length;
  if (!shared || !f.content.size || !t.content.size) return 0;
  // part numbers only: "Maths VIII" is the eighth maths unit in a series, not part 8 of something
  const fn = f.numbers.find((n) => n <= 4) ?? null;
  const tn = t.numbers.find((n) => n <= 4) ?? null;
  if (fn !== null && tn !== null && fn !== tn) return 0;          // "Fluid Mechanics 2" is not Fluid Mechanics III
  if (fn !== null && tn === null && fn !== 1) return 0;          // "Thermodynamics 2" is not plain Thermodynamics
  if (fn === null && tn !== null && tn !== 1) return 0;          // plain "Thermodynamics" means part I
  return (shared / f.content.size + shared / t.content.size) / 2;
}

// Returns { code, title } or null. `year` (1-5) limits it to that year's units.
export function unitFromTitle(text, { year } = {}, extra = []) {
  const f = words(text);
  if (!f.content.size) return null;
  const pool = [...catalogue, ...extra];
  const ranked = pool
    .filter((u) => !year || u.codes.some((c) => Number(c[4]) === year))
    .map((u) => ({ u, s: score(f, u.w) }))
    .filter((r) => r.s >= 0.75)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;
  const [best, next] = ranked;
  if (next && next.u.codes[0] !== best.u.codes[0] && best.s - next.s < 0.15) return null; // no clear winner
  const code = (year && best.u.codes.find((c) => Number(c[4]) === year)) || best.u.codes[0];
  return { code, title: best.u.title };
}

// Titled posts found live on the server, in the catalogue's shape (so new posts help too).
export const fromPosts = (byCode) => [...byCode.values()].flat()
  .filter((p) => p.name.includes(' — '))
  .map((p) => { const [codes, title] = p.name.split(' — '); return { codes: codes.match(/[A-Z]{3} \d{3}/g) || [], title, w: words(title) }; })
  .filter((u) => u.codes.length);
