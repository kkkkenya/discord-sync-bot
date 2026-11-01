// The shared unit library (fixplan D1). Students in the same unit sit the same CAT, so work that comes from the hub
// files is done once per unit and shared: the topic list, and each past-paper question's worked checkpoints. Shared
// rows only ever hold material derived from files and papers, never what a student wrote about themselves. Using a
// shared list copies it into your own document, so your edits stay private.
import { createHash } from 'node:crypto';
import { db, enc } from '../../lib/db.js';
import { remote } from './ingest.js';

const memory = { units: new Map(), questions: new Map() }; // local runs and tests
const MIN_TOPICS = 3; // a list this short isn't worth sharing yet

// ---- topic lists: crux_unit_kb (one row per unit) ----
export async function classList(unit) {
  if (!remote()) return memory.units.get(unit) || null;
  const [row] = await db.select('crux_unit_kb', `unit_code=eq.${enc(unit)}&select=topics,updated_at`);
  return row ? { topics: row.topics, at: row.updated_at } : null;
}

// a student's list for a unit, in outline order: [{ name, subtopics: [names] }]
export function listOf(doc, unit) {
  return doc.topics.filter((t) => t.unit === unit).sort((a, b) => (a.order || 0) - (b.order || 0)).map((t) => ({
    name: t.name,
    subtopics: doc.subtopics.filter((s) => s.topicId === t.id).sort((a, b) => (a.order || 0) - (b.order || 0)).map((s) => s.name),
  }));
}

// The first student with a real list for a unit shares it; after that only the owner can replace it.
export async function offerList(unit, topics, userId, { force = false } = {}) {
  if (topics.length < MIN_TOPICS) return null;
  const have = await classList(unit);
  if (have && !force) return have;
  const at = new Date().toISOString();
  if (!remote()) memory.units.set(unit, { topics, at });
  else await db.upsert('crux_unit_kb', [{ unit_code: unit, topics, updated_by: userId, updated_at: at }], 'unit_code');
  return { topics, at };
}

// ---- worked checkpoints: crux_question_kb (one row per question, keyed by unit and wording) ----
export const questionKey = (unit, text) => createHash('sha1').update(`${unit}|${String(text).toLowerCase().replace(/\s+/g, ' ').trim()}`).digest('hex');

export async function sharedSolution(unit, text) {
  const key = questionKey(unit, text);
  if (!remote()) return memory.questions.get(key) || null;
  const [row] = await db.select('crux_question_kb', `qkey=eq.${key}&select=checkpoints`).catch(() => []);
  return row?.checkpoints?.length ? { checkpoints: row.checkpoints } : null;
}

export async function shareSolution(unit, text, checkpoints) {
  if (!checkpoints?.length) return;
  const key = questionKey(unit, text);
  if (!remote()) { memory.questions.set(key, { checkpoints }); return; }
  await db.upsert('crux_question_kb', [{ qkey: key, unit_code: unit, checkpoints, updated_at: new Date().toISOString() }], 'qkey').catch(() => {});
}

export const resetSharedForTests = () => { memory.units.clear(); memory.questions.clear(); };

// ---- sheets: crux_kit_kb (ladders and recipes per unit, kind, stage and topic) ----
// Trap sheets are never shared: they carry the student's own recurring mistakes.
export const SHARED_KITS = ['ladder', 'recipes'];
const memoryKits = new Map();
export const kitKey = (unit, kind, stage, topic = '') => `${unit}|${kind}|${stage}|${topic.toLowerCase()}`;

export async function sharedKit(key) {
  if (!remote()) return memoryKits.get(key) || null;
  const [row] = await db.select('crux_kit_kb', `kkey=eq.${enc(key)}&select=content`).catch(() => []);
  return row?.content || null;
}

export async function shareKit(key, unit, content) {
  if (!remote()) { memoryKits.set(key, content); return; }
  await db.upsert('crux_kit_kb', [{ kkey: key, unit_code: unit, content, updated_at: new Date().toISOString() }], 'kkey').catch(() => {});
}

// ---- class hints: crux_class_hints (only hints marked "the whole class heard this") ----
// Topics travel as names (topic ids are private to each student). Who confirmed is kept for the count and is never
// sent to the app.
const memoryHints = [];
const shape = (h, userId) => ({ id: h.id, kind: h.kind, text: h.text, topics: h.topics || [], count: (h.by_ids || []).length, mine: (h.by_ids || []).includes(userId), at: h.created_at });

export async function classHints(unit, userId) {
  if (!remote()) return memoryHints.filter((h) => h.unit_code === unit).map((h) => shape(h, userId));
  const rows = await db.select('crux_class_hints', `unit_code=eq.${enc(unit)}&select=id,kind,text,topics,by_ids,created_at&order=created_at.desc&limit=20`).catch(() => []);
  return rows.map((h) => shape(h, userId)).sort((a, b) => b.count - a.count);
}

export async function shareHint(unit, { kind, text, topics = [] }, userId) {
  const row = { unit_code: unit, kind, text: String(text).trim().slice(0, 280), topics: topics.slice(0, 6), by_ids: [userId], created_at: new Date().toISOString() };
  if (!remote()) memoryHints.push({ id: String(memoryHints.length + 1), ...row });
  else await db.insert('crux_class_hints', [row]);
  return classHints(unit, userId);
}

// "I heard it too": adds you to the count once. Returns the hint (so the app can copy it into your own hints).
export async function confirmHint(id, userId) {
  if (!remote()) {
    const h = memoryHints.find((x) => x.id === String(id));
    if (h && !h.by_ids.includes(userId)) h.by_ids.push(userId);
    return h || null;
  }
  const [h] = await db.select('crux_class_hints', `id=eq.${enc(id)}&select=id,unit_code,kind,text,topics,by_ids`);
  if (!h) return null;
  if (!h.by_ids.includes(userId)) await db.update('crux_class_hints', `id=eq.${enc(id)}`, { by_ids: [...h.by_ids, userId] });
  return h;
}

export const resetMoreSharedForTests = () => { memoryKits.clear(); memoryHints.length = 0; };
