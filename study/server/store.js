// Everything you log lives in study/data/study.json (git-ignored). One file, rewritten on every change.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const DIR = new URL('../data/', import.meta.url);
const FILE = new URL('study.json', DIR);
mkdirSync(DIR, { recursive: true });

// units: [{ code, title, catDate, confidence }]   (the ones you're taking this semester)
// topics: [{ id, unit, name, status: red|amber|green, taughtAt }]
// cards: [{ id, unit, q, a, due, interval, ease, reps, lapses }]
// reviews: [{ card, unit, grade, at }]   sessions: [{ id, unit, minutes, at }]
// papers: [{ id, unit, label, score, outOf, fileId, at }]   teach: [{ id, unit, topic, text, feedback, at }]
const EMPTY = { units: [], topics: [], cards: [], reviews: [], sessions: [], papers: [], teach: [] };

export const data = existsSync(FILE) ? { ...EMPTY, ...JSON.parse(readFileSync(FILE, 'utf8')) } : structuredClone(EMPTY);

export function save() {
  const tmp = new URL('study.json.tmp', DIR);
  writeFileSync(tmp, JSON.stringify(data, null, 1));
  renameSync(tmp, FILE);
}

export const LISTS = ['topics', 'cards', 'sessions', 'papers', 'teach'];

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
