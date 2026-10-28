// Store-aware glue for the weakspot analysis: the dashboard and the DM bot both go through here, the maths
// stays pure in analysis.js.
import { applyTeachGaps } from './analysis.js';
import { library } from './ingest.js';
import { mapQuestion, paperInfo, parseQuestions, readHint } from './predict.js';
import { data, save } from './store.js';

// A tutorial sheet's printed answer as the question's key: "(Ans: 175 kNm; 4.3°)" → any part can be checked, no AI needed.
const sheetKey = (given) => ({ answer: given[0], parts: given, source: 'sheet', checkpoints: [] });

const topicOf = (unit, name) => data.topics.find((t) => t.unit === unit && t.name.trim().toLowerCase() === String(name || '').trim().toLowerCase());

// After a marked teach-back: flag the topic's sub-topics its gaps name as shaky. { flagged: [names], unmatched }.
export function teachFlags(unit, topic, feedback) {
  const tp = topicOf(unit, topic);
  if (!tp || !feedback?.gaps?.length) return { flagged: [], unmatched: feedback?.gaps || [] };
  const subs = data.subtopics.filter((s) => s.topicId === tp.id);
  const { flagged, unmatched } = applyTeachGaps(subs, feedback.gaps);
  if (flagged.length) save();
  return { flagged: flagged.map((id) => subs.find((s) => s.id === id).name), unmatched, topicId: tp.id };
}

// ---- Phase 5: past-paper questions, lecturer hints, predictions ----

const scannedOf = (unit) => Object.entries(library.files).filter(([, e]) => e.unit === unit && e.paper && !e.text).map(([fileId, e]) => ({ fileId, name: e.name }));

// Re-read a unit's synced past papers into paperq. Keeps what you (or the AI) mapped by hand, keyed by
// file + question number; pasted papers are left alone. { questions, papers, scanned }.
export function parsePapers(unit) {
  const topics = data.topics.filter((t) => t.unit === unit);
  const subs = data.subtopics.filter((s) => s.unit === unit);
  const files = Object.entries(library.files).filter(([, e]) => e.unit === unit && e.paper && e.text);
  const ids = new Set(files.map(([id]) => id));
  const old = new Map(data.paperq.filter((q) => ids.has(q.fileId)).map((q) => [`${q.fileId}#${q.number}`, q]));
  data.paperq = data.paperq.filter((q) => !ids.has(q.fileId));
  let n = 0;
  for (const [fileId, e] of files) {
    const info = paperInfo(e.name);
    for (const q of parseQuestions(e.text)) {
      const prev = old.get(`${fileId}#${q.number}`);
      const kept = prev && prev.topicFrom !== 'auto' ? { topicId: prev.topicId, subtopicIds: prev.subtopicIds || [], topicFrom: prev.topicFrom } : { ...mapQuestion(q.text, topics, subs), topicFrom: 'auto' };
      data.paperq.push({ id: prev?.id || `${fileId}-${q.number}`, unit, fileId, source: e.name, ...info, ...q, ...kept, ...((prev?.key || q.given) && { key: prev?.key || sheetKey(q.given) }), at: prev?.at || new Date().toISOString() });
      n++;
    }
  }
  save();
  return { questions: n, papers: files.length, scanned: scannedOf(unit) };
}

// Questions pasted by hand (a scanned paper, or one that isn't on the server). Returns the rows added.
export function pastePaper(unit, label, text) {
  const topics = data.topics.filter((t) => t.unit === unit);
  const subs = data.subtopics.filter((s) => s.unit === unit);
  const fileId = `paste-${Date.now().toString(36)}`;
  const qs = parseQuestions(text);
  // no QUESTION headers at all: keep the whole paste as one question
  const rows = (qs.length ? qs : [{ number: 1, marks: null, text: String(text).trim().slice(0, 3000) }]).map((q) => ({
    id: `${fileId}-${q.number}`, unit, fileId, source: label, ...paperInfo(label), ...q, ...mapQuestion(q.text, topics, subs), topicFrom: 'auto', ...(q.given && { key: sheetKey(q.given) }), at: new Date().toISOString(),
  }));
  data.paperq.push(...rows);
  save();
  return rows;
}

// A new hint: its kind and topics read from the wording unless given.
export function hintFields(unit, text, given = {}) {
  const read = readHint(text, data.topics.filter((t) => t.unit === unit));
  return { unit, text: String(text).trim(), kind: given.kind || read.kind, topicIds: given.topicIds || read.topicIds };
}

export const scannedPapers = scannedOf;

// Predictions and the weakspot matrix live in plan.js (Today needs them, and plan.js can't import this file).
export { predictFor, weakspotsFor } from './plan.js';
