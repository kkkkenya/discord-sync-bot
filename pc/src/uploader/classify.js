// Decides what a file is and where it goes. Works backwards from the file:
//   1. a unit code in the file name, 2. in each folder above it, nearest first (so Mechanical/Year 2/Sem 1/Notes/
//   EMM 200/x.pdf finds EMM 200 in its own folder), 3. a file or folder named by the unit's title ("Fluid
//   Mechanics 2" in a "2.2" folder), 4. a code in the document title or first page, 5. the document title.
// The folder path also gives hints (course, year, semester, kind) used to pick between posts and forums.
import { basename, dirname, extname, relative, sep } from 'node:path';
import SHELVES from '../../../lib/shelves.json' with { type: 'json' };
import { extract } from './extract.js';
import { fromPosts, unitFromTitle } from './titles.js';

const BOOK_BYTES = Number(process.env.BOOK_MB || 15) * 1024 * 1024;
const BOOK_PAGES = Number(process.env.BOOK_PAGES || 150);

// Course hints from folder names. A unit prefix only counts on its own ("EEE" folder), not inside a unit code
// ("EBE 209"): the code itself already says where the unit lives, and shared units belong to several courses.
const alone = (p) => `\\b${p}\\b(?![\\s_.-]*\\d)`;
const DEPTS = [
  ['mech', new RegExp(`mechanical|\\bmech\\b|aero(space|nautical)?|${alone('emm')}|${alone('ear')}`, 'i')],
  ['abe', new RegExp(`agric|biosystems|${alone('abe')}|${alone('ebe')}`, 'i')],
  ['civil', new RegExp(`\\bcivil\\b|${alone('ecv')}|structural`, 'i')],
  ['eee', new RegExp(`electrical|electronic|${alone('eee')}|${alone('ebm')}|biomedical`, 'i')],
  ['egp', new RegExp(`${alone('egp')}|${alone('epl')}|petroleum|energy|geospatial`, 'i')],
];
const YEAR = /(?:^|[^\d])([1-5])(?:st|nd|rd|th)?[\s_-]*(?:year|yr)|(?:year|yr|\by)[\s_-]*([1-5])(?!\d)/i;
const SEM = /([12])(?:st|nd)?[\s_-]*sem|sem(?:ester)?[\s_-]*([12])(?!\d)|\bs([12])\b/i; // "1st sem", "Semester 2", "Y3 S2"
const YEAR_SEM = /^\s*([1-5])\.([12])\s*$/; // a folder named "2.2" or "3.1"

const KINDS = [
  ['paper', /past[\s_-]*papers?|\bexams?\b|examination|\bcats?\b|\bcat[\s_-]*\d|\bsupp|special[\s_-]*exam|marking[\s_-]*scheme|question[\s_-]*paper/i],
  ['slides', /slides?|presentation|\.pptx?$/i],
  ['notes', /notes?|lecture|handout|chapter|module|tutorial|summary|revision/i],
  ['book', /text[\s_-]*books?|\bbooks?\b|edition|\bisbn\b|handbook/i],
  ['paper', /\b(19|20)\d\d\b/], // a bare year ("EMM 305 2023.pdf") is usually a past paper; checked last
];

// Words that point a book at one of the topic shelves (lib/shelves.json).
const SHELF_WORDS = {
  'Fluid Mechanics & Hydraulics': ['fluid', 'hydraulic', 'hydrology', 'pump', 'turbine', 'pipe flow', 'open channel'],
  'Aerospace: Aerodynamics, Flight & Propulsion': ['aerodynamic', 'aircraft', 'flight', 'propulsion', 'aerospace', 'airfoil', 'gas turbine', 'rocket', 'avionic'],
  'Thermodynamics & Heat Transfer': ['thermodynamic', 'heat transfer', 'thermal', 'refrigeration', 'combustion', 'entropy', 'steam'],
  'Drawing, CAD & Engineering Design': ['drawing', 'cad', 'autocad', 'solidworks', 'design of machine', 'graphics', 'drafting'],
  'Strength of Materials & Structures': ['strength of materials', 'mechanics of materials', 'structural', 'structures', 'stress', 'beam', 'concrete', 'steel design'],
  'Materials Science': ['materials science', 'metallurgy', 'material', 'polymer', 'composite', 'corrosion'],
  'Mechanics, Machines & Vibrations': ['dynamics', 'statics', 'vibration', 'mechanics of machines', 'theory of machines', 'kinematics', 'engineering mechanics'],
  'Manufacturing & Workshop': ['manufacturing', 'workshop', 'machining', 'welding', 'casting', 'production', 'cnc'],
  'Electrical Circuits, Machines & Power': ['circuit', 'electrical machine', 'power system', 'transformer', 'motor', 'electric'],
  'Electronics, Control & Instrumentation': ['electronic', 'control system', 'instrumentation', 'measurement', 'microcontroller', 'signal', 'digital'],
  'Programming & Computing': ['programming', 'python', 'matlab', 'computing', 'algorithm', 'c++', 'java', 'numerical'],
  'Engineering Mathematics': ['mathematics', 'calculus', 'algebra', 'differential equation', 'statistics', 'probability', 'linear', 'vector'],
  'Physics & Chemistry for Engineers': ['physics', 'chemistry', 'chemical'],
  'Civil: Soils, Surveying & Transport': ['soil', 'geotechnical', 'surveying', 'transport', 'highway', 'foundation'],
  'Management, Research & Professional Practice': ['management', 'research', 'ethics', 'professional', 'entrepreneur', 'economics', 'project management', 'law'],
};

// The kind of a file from its name (and any other text), for files already on the server.
export function kindOf(text, name = '') {
  if (/\.pptx?$/i.test(name)) return 'slides';
  return KINDS.find(([, re]) => re.test(text))?.[0] || 'other';
}

function bestShelf(text) {
  const t = text.toLowerCase();
  let best = null;
  for (const shelf of SHELVES) {
    const score = (SHELF_WORDS[shelf.name] || []).filter((w) => t.includes(w)).length;
    if (score && (!best || score > best.score)) best = { ...shelf, score };
  }
  return best;
}

export async function classify(path, root, size, index) {
  const name = basename(path);
  const rel = relative(dirname(root), path); // includes the watched folder's name
  // the watched folder's own name counts too ("ECU 203; LAPLACE TRANSFORMS"), so measure from its parent
  const folders = relative(dirname(root), dirname(path)).split(sep).filter((f) => f && f !== '.' && f !== '..').reverse(); // nearest first
  const pathText = [name, ...folders].join(' / ');

  const hints = {};
  for (const part of [name, ...folders]) { // nearest wins
    if (!hints.dept) hints.dept = DEPTS.find(([, re]) => re.test(part))?.[0];
    const ys = part.match(YEAR_SEM); // "2.2" = year 2, semester 2
    if (ys) { hints.year ||= Number(ys[1]); hints.sem ||= Number(ys[2]); }
    if (!hints.year) { const m = part.match(YEAR); if (m) hints.year = Number(m[1] || m[2]); }
    if (!hints.sem) { const m = part.match(SEM); if (m) hints.sem = Number(m[1] || m[2] || m[3]); }
    if (!hints.kind) hints.kind = KINDS.find(([, re]) => re.test(part))?.[0];
  }
  const parts = [name.replace(extname(name), ''), ...folders]; // the file name, then each folder working outwards

  // 1-2: a unit code in the file name, then in each folder
  let code = null; let from = '';
  for (const [n, part] of parts.entries()) {
    const found = index.codesIn(part);
    if (found.length) { code = found[0]; from = n === 0 ? 'name' : `folder "${part}"`; break; }
  }
  // 3: a file or folder named by the unit's title ("Fluid Mechanics 2" in a "2.2" folder = EMM 205)
  const byTitle = (text) => unitFromTitle(text, { year: hints.year }, (index.titleUnits ||= fromPosts(index.byCode)));
  if (!code) {
    for (const [n, part] of parts.entries()) {
      const hit = byTitle(part);
      if (hit) { code = hit.code; from = `${n === 0 ? 'name' : 'folder'} "${part}" = ${hit.title}`; break; }
    }
  }

  // 4-5: open the file only when the name and folders weren't enough, or to tell a book from notes
  const isBigFile = size >= BOOK_BYTES;
  let doc = { title: '', pages: 0, text: '' };
  if (!code || isBigFile || !hints.kind) doc = await extract(path);
  if (!code) {
    const found = index.codesIn(`${doc.title} ${doc.text.slice(0, 1500)}`);
    if (found.length) { code = found[0]; from = doc.title && index.codesIn(doc.title).length ? 'title' : 'page 1'; }
  }
  if (!code && doc.title) {
    const hit = byTitle(doc.title);
    if (hit) { code = hit.code; from = `title "${doc.title.slice(0, 60)}" = ${hit.title}`; }
  }

  const ext = extname(name).toLowerCase();
  let kind = hints.kind;
  if (!kind && ['.ppt', '.pptx'].includes(ext)) kind = 'slides';
  if (!kind) kind = KINDS.find(([, re]) => re.test(`${doc.title} ${doc.text.slice(0, 600)}`))?.[0];
  // books are the big ones: a big file or a long PDF with no exam markers is a book
  if (kind !== 'paper' && (isBigFile || doc.pages >= BOOK_PAGES)) kind = 'book';
  kind ||= 'other';

  const shelf = !code && kind === 'book' ? bestShelf(`${doc.title} ${name} ${folders.join(' ')} ${doc.text.slice(0, 1500)}`) : null;
  return {
    name, rel, code, from, kind, hints, shelf,
    title: doc.title, pages: doc.pages,
    snippet: doc.text.slice(0, 200),
    pathText,
  };
}
