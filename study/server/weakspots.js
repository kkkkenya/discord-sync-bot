// Store-aware glue for the weakspot analysis: the dashboard and the DM bot both go through here, the maths
// stays pure in analysis.js.
import { applyTeachGaps } from './analysis.js';
import { library } from './ingest.js';
import { bookQuestions, isScheme, mapQuestion, paperInfo, parseQuestions, readHint, sheetNo } from './predict.js';
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

// Bumped when parseQuestions changes, so saved papers are read again (GET /api/predict). 2: looser numbering, no
// 3000-character cut. 3: worked examples and exercises from the unit's books, word for word. 4: the page each
// question is on (for "Open at page").
export const PARSER_VERSION = 4;
// The PDF page (1-based) a character offset falls on, when the file's page starts are known.
const pageAt = (e, offset) => (e.pageStarts?.length && offset != null ? Math.max(1, e.pageStarts.findLastIndex((s) => s <= offset) + 1) : null);
export const isBook = (q) => q.type === 'Book';
// "Strength of Materials (R. K. Rajput) (Z-Library).pdf" → "Strength of Materials (R. K. Rajput)"
const bookName = (name) => String(name).replace(/\.[a-z0-9]+$/i, '').replace(/\(?z-?library\)?/gi, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(.{44}\S*)\s.+$/, '$1…');

// Re-read a unit's synced past papers into paperq, and its books' worked examples and exercises (type 'Book', word for
// word, with the book's own solution as bookSolution). Keeps what you (or the AI) mapped by hand, keyed by
// file + question number; pasted papers are left alone. { questions, papers, scanned }.
// two names for the same sitting: year, CAT or exam, and the tutorial sheet's number
export function samePaper(a, b) {
  const x = paperInfo(a), y = paperInfo(b);
  return x.type === y.type && x.year === y.year && sheetNo(a) === sheetNo(b);
}

export function parsePapers(unit) {
  const topics = data.topics.filter((t) => t.unit === unit);
  const subs = data.subtopics.filter((s) => s.unit === unit);
  const all = Object.entries(library.files).filter(([, e]) => e.unit === unit && e.text);
  // a marking scheme for a paper the hub has is not a second copy of its questions: it is read when solving them
  const papers = all.filter(([, e]) => e.paper && !isScheme(e.name)).map(([, e]) => e.name);
  const files = all.filter(([, e]) => !(e.paper && isScheme(e.name) && papers.some((n) => samePaper(n, e.name))));
  const ids = new Set(all.map(([id]) => id));
  const read = (e) => (e.paper ? parseQuestions(e.text) : bookQuestions(e.text).map((b, i) => ({ number: i + 1, label: b.label, marks: null, text: b.text, offset: b.offset, ...(b.solution && { bookSolution: b.solution }) })))
    .map(({ offset, ...q }) => ({ ...q, page: pageAt(e, offset) }));
  const old = new Map(data.paperq.filter((q) => ids.has(q.fileId)).map((q) => [`${q.fileId}#${q.number}`, q]));
  data.paperq = data.paperq.filter((q) => !ids.has(q.fileId));
  let n = 0;
  for (const [fileId, e] of files) {
    const info = e.paper ? paperInfo(e.name) : { year: null, type: 'Book' };
    for (const q of read(e)) {
      const found = old.get(`${fileId}#${q.number}`);
      // a question that was split differently before keeps its topic, but not an answer or solution made for other text
      const prev = found && (found.text === q.text ? found : { ...found, key: found.text.slice(0, 80) === q.text.slice(0, 80) && found.text.length < q.text.length * 1.5 ? found.key : undefined, explain: undefined });
      const kept = prev && prev.topicFrom !== 'auto' ? { topicId: prev.topicId, subtopicIds: prev.subtopicIds || [], topicFrom: prev.topicFrom } : { ...mapQuestion(q.text, topics, subs), topicFrom: 'auto' };
      data.paperq.push({ id: prev?.id || `${fileId}-${q.number}`, unit, fileId, source: e.paper ? e.name : bookName(e.name), ...info, ...q, ...kept, ...((prev?.key || q.given) && { key: prev?.key || sheetKey(q.given) }), ...(prev?.explain && { explain: prev.explain }), at: prev?.at || new Date().toISOString() });
      n++;
    }
  }
  save();
  return { questions: n, papers: files.filter(([, e]) => e.paper).length, scanned: scannedOf(unit) };
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
