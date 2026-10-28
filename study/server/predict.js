// Past-paper predictions. Pure: parse questions out of paper text, map them to topics, read lecturer hints, rank
// topics by exam weight (defs.js HINT). The store-aware routes live in index.js.
import { HINT } from './defs.js';
import { words } from './analysis.js';

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const HEADER = /\b(?:question|qn|q)\s*\.?\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/gi;
const SUB_MARKS = /[([]\s*(\d{1,2}(?:\.\d)?)\s*(?:marks?|mks?)\s*[)\]]/gi;

// Questions in one paper's text (extracted text is whitespace-squashed, so no line starts to lean on).
// Headers must run 1, 2, 3…; a repeated header replaces the earlier one, so "Answer question ONE and any other
// TWO" in the instructions doesn't become question 1. When a paper has no "Question N" headers, bare "1." "2."
// numbering is tried, then one question per "(5 marks)". Marks: the header's "(20 marks)", else the sum of its
// parts' marks, else null. [{ number, marks, text }]
const BARE = /(?<=(?:^|[.?!:;)\]\d])\s*)(\d{1,2})\s*[.)]\s+(?=[A-Z])/g;

function numbered(src, re, number, replace = true) {
  const starts = [];
  for (const m of src.matchAll(re)) {
    const n = number(m);
    const last = starts.at(-1)?.n || 0;
    if (n === last + 1) starts.push({ n, at: m.index, body: m.index + m[0].length });
    else if (replace && n === last && n) starts[starts.length - 1] = { n, at: m.index, body: m.index + m[0].length };
  }
  return starts.map((s, i) => {
    const body = src.slice(s.body, starts[i + 1]?.at ?? src.length).trim();
    const head = body.match(/^[\s:.\-–(]*(\d{1,3})\s*(?:marks?|mks?)\s*\)?/i);
    const parts = [...body.matchAll(SUB_MARKS)].reduce((n, m) => n + Number(m[1]), 0);
    const rest = head ? body.slice(head[0].length) : body;
    return { number: s.n, marks: head ? Number(head[1]) : parts || null, text: rest.replace(/^[\s:.\-–]+/, '').slice(0, 3000) };
  });
}

// Unnumbered papers: each question ends in its own "(5 marks)". A sheet printed twice in one file (two copies per
// page) repeats every question; the repeat is dropped.
function byMarks(src) {
  const out = [];
  const seen = new Set();
  let from = 0;
  for (const m of src.matchAll(SUB_MARKS)) {
    const text = src.slice(from, m.index).trim().slice(0, 3000);
    from = m.index + m[0].length;
    const key = text.replace(/\s+/g, '').toLowerCase(); // extracted text spaces words unevenly ("D etermine")
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ number: out.length + 1, marks: Number(m[1]), text });
  }
  return out;
}

export function parseQuestions(text) {
  const src = String(text || '');
  let qs = numbered(src, HEADER, (m) => NUM[m[1].toLowerCase()] || Number(m[1]));
  if (!qs.length) {
    qs = numbered(src, BARE, (m) => Number(m[1]), false);
    const marked = qs.length < 2 ? byMarks(src) : [];
    if (marked.length > 1) qs = marked;
  }
  return qs.filter((q) => q.text.length >= 20);
}

// From a file name or label: { year, type: 'CAT1'|'CAT2'|'CAT'|'Exam' }.
export function paperInfo(name) {
  const s = String(name || '');
  // underscores and digits count as separators: 'emm302_cat-ii_2021'
  const year = Number(s.match(/(?<!\d)(19|20)\d{2}(?!\d)/)?.[0]) || null;
  const type = /(?<![a-z])cat\s*[-_ ]?\s*(1|i|one)(?![a-z0-9])/i.test(s) ? 'CAT1' : /(?<![a-z])cat\s*[-_ ]?\s*(2|ii|two)(?![a-z0-9])/i.test(s) ? 'CAT2' : /(?<![a-z])cats?(?![a-z])/i.test(s) ? 'CAT' : 'Exam';
  return { year, type };
}

// The words that tell a unit's topics apart: 'Beta functions' and 'Gamma functions' are 'beta' and 'gamma', not
// 'function'. A topic whose words are all shared keeps them all. Map topicId -> [words].
function distinctWords(topics) {
  const all = topics.map((t) => [...new Set(words(t.name))]);
  const seen = {};
  for (const w of all.flat()) seen[w] = (seen[w] || 0) + 1;
  return new Map(topics.map((t, i) => { const own = all[i].filter((w) => seen[w] === 1); return [t.id, own.length ? own : all[i]]; }));
}

// Best topic for a question by the distinctive words of the topic name (and its sub-topics) found in the
// question: { topicId, subtopicIds }. A topic needs half those words (at least one); sub-topics need two (or
// their only one).
export function mapQuestion(text, topics, subtopics = []) {
  const q = new Set(words(text));
  const distinct = distinctWords(topics);
  let best = null;
  for (const t of topics) {
    const w = distinct.get(t.id);
    const hits = w.filter((x) => q.has(x)).length;
    const subs = subtopics.filter((s) => s.topicId === t.id && hitsAll(words(s.name), q));
    const score = (w.length ? hits / w.length : 0) + subs.length * 0.25;
    if ((hits && hits / w.length >= 0.5) || subs.length) if (!best || score > best.score) best = { topicId: t.id, subtopicIds: subs.map((s) => s.id), score };
  }
  return best ? { topicId: best.topicId, subtopicIds: best.subtopicIds } : { topicId: null, subtopicIds: [] };
}
function hitsAll(w, q) {
  const u = [...new Set(w)];
  const hits = u.filter((x) => q.has(x)).length;
  return u.length > 0 && hits / u.length >= 0.5 && hits >= Math.min(2, u.length);
}

// A lecturer hint's kind from its wording, and the topics it names. { kind: 'focus'|'exclude'|'note', topicIds }.
export function readHint(text, topics) {
  const s = String(text || '').toLowerCase();
  const kind = /\b(skip|exclude|excluded|not (be )?(examined|tested|coming|in the exam)|won'?t (come|be tested|be examined)|leave out|drop(ped)?)\b/.test(s) ? 'exclude'
    : /\b(focus|mainly|mostly|emphasi[sz]e|will (come|be tested|be examined)|sure to come|important|definitely|expect|concentrate)\b/.test(s) ? 'focus'
      : 'note';
  const q = new Set(words(text));
  const distinct = distinctWords(topics);
  const topicIds = topics.filter((t) => { const w = distinct.get(t.id); return w.length && w.filter((x) => q.has(x)).length / w.length >= 0.5; }).map((t) => t.id);
  return { kind, topicIds };
}

// A topic with no mapped past-paper questions still gets a small weight, so lecturer hints and weakness can
// rank it. Questions with no marks count as 10.
const FLOOR = 1;
const DEFAULT_MARKS = 10;

// Every topic of one unit, ranked: pinned by the lecturer first, then by exam weight, muted last.
// `late`: the unit is past adequate prep, so an exclude hint mutes the topic completely.
// [{ topicId, name, weight, base, mult, pinned, muted, appeared, papers, avgMarks, questions, evidence, hint }]
export function predictions({ topics, questions, hints = [], late = false }) {
  const papers = new Set(questions.map((q) => q.fileId || q.source)).size;
  const out = topics.map((t) => {
    const qs = questions.filter((q) => q.topicId === t.id);
    const appeared = new Set(qs.map((q) => q.fileId || q.source)).size;
    const known = qs.filter((q) => q.marks);
    const avgMarks = known.length ? Math.round(known.reduce((n, q) => n + q.marks, 0) / known.length) : qs.length ? DEFAULT_MARKS : 0;
    const base = qs.length ? (appeared / Math.max(1, papers)) * avgMarks : FLOOR;
    // the newest hint about this topic decides
    const hint = hints.filter((h) => h.kind !== 'note' && (h.topicIds || []).includes(t.id)).sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0] || null;
    const mult = hint?.kind === 'focus' ? HINT.focus : hint?.kind === 'exclude' ? (late ? HINT.excludeLate : HINT.excludeAdequate) : 1;
    const evidence = qs.length
      ? `appeared in ${appeared} of ${papers} paper${papers === 1 ? '' : 's'}, ${qs.length} question${qs.length === 1 ? '' : 's'}, avg ${avgMarks} marks${known.length < qs.length ? ' (some marks unknown)' : ''}`
      : 'no past-paper questions mapped yet';
    return { topicId: t.id, name: t.name, weight: Math.round(base * mult * 10) / 10, base: Math.round(base * 10) / 10, mult, pinned: hint?.kind === 'focus', muted: hint?.kind === 'exclude', appeared, papers, avgMarks, questions: qs.length, evidence, hint: hint?.text || null };
  });
  const rank = (x) => (x.pinned ? 0 : x.muted ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || b.weight - a.weight || a.name.localeCompare(b.name));
}

// A predicted mock: the top topics (not muted) until they carry ~65% of the predicted weight, one question each
// (the most recent), at most `max`. [{ q, marks, topic, year, source }]
export function predictedMock(ranked, questions, { share = 0.65, max = 6 } = {}) {
  const live = ranked.filter((r) => !r.muted && r.questions);
  const total = live.reduce((n, r) => n + r.weight, 0);
  const picked = [];
  let covered = 0;
  for (const r of live) {
    if (picked.length >= max || (total && covered >= total * share)) break;
    const q = questions.filter((x) => x.topicId === r.topicId).sort((a, b) => (b.year || 0) - (a.year || 0))[0];
    picked.push({ q: q.text, marks: q.marks || DEFAULT_MARKS, topic: r.name, year: q.year, source: q.source, key: q.key ? { answer: q.key.answer, source: q.key.source } : null });
    covered += r.weight;
  }
  return picked;
}
