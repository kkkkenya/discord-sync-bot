// Everything you log lives in study/data/study.json (git-ignored). One file, rewritten on every change.
// STUDY_DATA_DIR points it somewhere else (tests, or trying a copy of your data).
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DIR = process.env.STUDY_DATA_DIR ? pathToFileURL(`${process.env.STUDY_DATA_DIR.replace(/[\\/]$/, '')}/`) : new URL('../data/', import.meta.url);
const FILE = new URL('study.json', DIR);
mkdirSync(DIR, { recursive: true });

// units: [{ code, title, catDate: 'YYYY-MM-DD'|'TBA'|null (null = KU calendar), confidence }]   (this semester's)
// topics: [{ id, unit, name, status: red|amber|green, taughtAt }]
// sessions: [{ id, unit, minutes, focus, kind, energy, endedEarly, at }]
// papers: [{ id, unit, label, score, outOf, fileId, at }]   teach: [{ id, unit, topic, text, feedback, at }]
// questions: [{ id, unit, topic, q, a, marks, from, at }]   (CAT-style practice bank for mocks)
// mocks: [{ id, unit, name, questions: [{q,a,marks,topic}], answers: [{user,earned,note}], score, outOf, overall, finishedAt, at }]
// subtopics, attempts, hints: filled from Phase 4 on (see PHASES.md).
// cards, reviews: retired flashcards. Left exactly as they are in old files, never read or sent to the dashboard.
// settings: { aiProvider: 'gemini'|'deepseek'|'anthropic', tour: { step, done, skipped }, cardsNotice: true once
//   the "flashcards retired" note was dismissed, cohort: { course, year, sem } | null,
//   unitArchive: { code: { catDate, confidence, ... } } (units you un-ticked, restored if you tick them again) }
const EMPTY = {
  units: [], topics: [], sessions: [], papers: [], teach: [], questions: [], mocks: [], subtopics: [], attempts: [], hints: [],
  settings: { aiProvider: 'gemini', tour: {}, cohort: null, unitArchive: {} },
};

// Old files load with every list present and every setting defaulted; nothing in them is dropped.
const load = () => {
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  return { ...structuredClone(EMPTY), ...saved, settings: { ...structuredClone(EMPTY.settings), ...saved.settings } };
};
export const data = existsSync(FILE) ? load() : structuredClone(EMPTY);

// Bump when a build changes what's stored. The first start of a newer build copies study.json to
// data/backups/pre-v<N>-<day>.json before anything rewrites it.
export const VERSION = 1;
if (existsSync(FILE) && (data.version || 0) < VERSION) {
  const dir = new URL('backups/', DIR);
  mkdirSync(dir, { recursive: true });
  copyFileSync(FILE, new URL(`pre-v${VERSION}-${new Date().toISOString().slice(0, 10)}.json`, dir));
}
data.version = VERSION;

export function save() {
  const tmp = new URL('study.json.tmp', DIR);
  writeFileSync(tmp, JSON.stringify(data, null, 1));
  renameSync(tmp, FILE);
}

export const LISTS = ['topics', 'sessions', 'papers', 'teach', 'questions', 'mocks'];

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
