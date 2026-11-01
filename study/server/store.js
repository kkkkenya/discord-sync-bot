// Each student's study data is one JSON document. In production (Vercel) every request gets its own document:
// withDoc() puts it in an AsyncLocalStorage scope, `data` reads and writes that one, and the router saves it once at
// the end of the request (supabase-store.js). Locally (dev server, tests) there is one document,
// study/data/study.json, rewritten on every change; STUDY_DATA_DIR points it somewhere else.
import { AsyncLocalStorage } from 'node:async_hooks';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DIR = process.env.STUDY_DATA_DIR ? pathToFileURL(`${process.env.STUDY_DATA_DIR.replace(/[\\/]$/, '')}/`) : new URL('../data/', import.meta.url);
const FILE = new URL('study.json', DIR);
export const DATA_DIR = DIR; // uploads (photos of working, voice teach-backs) live in DATA_DIR/uploads/

// units: [{ code, title, catDate: 'YYYY-MM-DD'|'TBA'|null (null = KU calendar), confidence }]   (this semester's)
// topics: [{ id, unit, name, status: red|amber|green, taughtAt }]
// sessions: [{ id, unit, minutes, focus, kind, energy, endedEarly, at }]
// papers: [{ id, unit, label, score, outOf, fileId, at }]   teach: [{ id, unit, topic, text, feedback, at }]
// questions: [{ id, unit, topic, q, a, marks, from, at }]   (CAT-style practice bank for mocks)
// mocks: [{ id, unit, name, questions: [{q,a,marks,topic}], answers: [{user,earned,note}], score, outOf, overall, finishedAt, at }]
// subtopics: [{ id, unit, topicId, name, kind, audit, auditAt, auditFrom: 'you'|'teach', mistakeCount, lastTested, order, at }]
// paperq: [{ id, unit, fileId, source, year, type: 'CAT1'|'CAT2'|'CAT'|'Exam', number, marks, text, topicId,
//   subtopicIds, topicFrom: 'auto'|'ai'|'you' }]   (past-paper questions; fileId 'paste-…' for pasted papers)
// hints: [{ id, unit, text, kind: 'focus'|'exclude'|'note', topicIds, at }]   (what the lecturer said)
// attempts: checkpoint attempts (practice.js).
// materials: [{ id, unit, topicId|null, kind: 'ladder'|'recipes'|'sheet', stage, content, edited, at }]   (study kit)
// cards, reviews: retired flashcards. Left exactly as they are in old files, never read or sent to the dashboard.
// settings: { aiProvider: 'gemini'|'deepseek', tour: { step, done, skipped }, cardsNotice: true once
//   the "flashcards retired" note was dismissed, cohort: { course, year, sem } | null,
//   unitArchive: { code: { catDate, confidence, ... } } (units you un-ticked, restored if you tick them again) }
const EMPTY = {
  units: [], topics: [], sessions: [], papers: [], teach: [], questions: [], mocks: [], subtopics: [], attempts: [], hints: [], paperq: [], materials: [],
  settings: { aiProvider: 'gemini', tour: {}, cohort: null, unitArchive: {} },
};

// Bump when a build changes what's stored. Older documents are backed up before their first save (normalize).
export const VERSION = 2;

// Old documents load with every list present and every setting defaulted; nothing in them is dropped.
export function normalize(saved) {
  const doc = { ...structuredClone(EMPTY), ...saved, settings: { ...structuredClone(EMPTY.settings), ...saved?.settings } };
  if (!['gemini', 'deepseek'].includes(doc.settings.aiProvider)) doc.settings.aiProvider = 'gemini'; // anthropic and hub are retired
  doc.version = VERSION;
  return doc;
}
export const emptyDoc = () => normalize({});

// --- the document for this request -------------------------------------------------------------------------
const als = new AsyncLocalStorage();

// Runs fn with doc as `data`. Returns { result, dirty }: dirty when anything called save().
export async function withDoc(doc, fn) {
  const scope = { doc, dirty: false };
  const result = await als.run(scope, fn);
  return { result, dirty: scope.dirty };
}

// Locally there is one document, loaded on first use. On Vercel (or with CRUX_STRICT=1) there is none, so `data`
// used outside a request throws instead of quietly mixing up two students.
const strict = () => Boolean(process.env.VERCEL) || process.env.CRUX_STRICT === '1';
let local = null;
function localDoc() {
  if (local) return local;
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(FILE)) return (local = emptyDoc());
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  if ((saved.version || 0) < VERSION) {
    const dir = new URL('backups/', DIR);
    mkdirSync(dir, { recursive: true });
    copyFileSync(FILE, new URL(`pre-v${VERSION}-${new Date().toISOString().slice(0, 10)}.json`, dir));
  }
  return (local = normalize(saved));
}
const current = () => {
  const scope = als.getStore();
  if (scope) return scope.doc;
  if (strict()) throw new Error('study data used outside a request (wrap the call in withDoc)');
  return localDoc();
};

// `data` behaves like the document itself: data.units, data[list] = …, { ...data }, JSON.stringify(data).
export const data = new Proxy({}, {
  get: (_, k) => current()[k],
  set: (_, k, v) => { current()[k] = v; return true; },
  has: (_, k) => k in current(),
  deleteProperty: (_, k) => delete current()[k],
  ownKeys: () => Reflect.ownKeys(current()),
  getOwnPropertyDescriptor: (_, k) => {
    const d = Reflect.getOwnPropertyDescriptor(current(), k);
    return d && { ...d, configurable: true };
  },
});

// In a request: marks the document to be saved when the request ends. Locally: writes study.json now.
export function save() {
  const scope = als.getStore();
  if (scope) { scope.dirty = true; return; }
  const doc = current();
  const tmp = new URL('study.json.tmp', DIR);
  writeFileSync(tmp, JSON.stringify(doc, null, 1));
  renameSync(tmp, FILE);
}

export const LISTS = ['topics', 'sessions', 'papers', 'teach', 'questions', 'mocks', 'subtopics', 'hints', 'paperq', 'materials'];

export function add(list, row) {
  const item = { id: randomUUID().slice(0, 8), at: new Date().toISOString(), ...row };
  data[list].push(item);
  save();
  return item;
}

export function patch(list, id, changes) {
  const item = data[list].find((x) => x.id === id);
  if (!item) return null;
  Object.assign(item, changes, { id });
  save();
  return item;
}

export function remove(list, id) {
  const before = data[list].length;
  data[list] = data[list].filter((x) => x.id !== id);
  if (data[list].length !== before) save();
  return data[list].length !== before;
}
