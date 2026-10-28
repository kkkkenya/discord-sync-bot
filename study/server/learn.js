// "Learn a topic": study first, test later, from your own material and no AI. Read: the files and pages that cover
// the topic (only real matches, never a guess). Examples: pages that work an example on it. Attempt (for later): its
// questions, ones with a printed answer first. Then: AI-made material only where your own files fall short.
// Pure: give it the lists.
import { words } from './analysis.js';

const WINDOW = 1500; // a file without page numbers (Word, text) is read in pieces this long
const OUTLINE = /outline|syllabus|course[\s_-]*(content|description)/i;
const EXAMPLE = /\b(?:worked\s+)?examples?\s*\d|\bexample\s*[:.-]|\bworked\s+examples?\b|\bsolution\s*[:.]|\billustrative\s+(?:example|problem)/i;

// a file's pages: [{ n (1-based) | null, text }]
function piecesOf(f) {
  if (f.pageStarts?.length) return f.pageStarts.map((s, i) => ({ n: i + 1, text: f.text.slice(s, f.pageStarts[i + 1] ?? f.text.length) }));
  const out = [];
  for (let s = 0; s < f.text.length; s += WINDOW) out.push({ n: null, at: s, text: f.text.slice(s, s + WINDOW + 200) });
  return out;
}

// the sentence around the first place the topic shows up
function snippetOf(text, terms, phrase) {
  const low = text.toLowerCase();
  let i = phrase ? low.indexOf(phrase) : -1;
  if (i < 0) for (const w of text.split(/\s+/)) { if (terms.has(words(w)[0])) { i = low.indexOf(w.toLowerCase()); break; } }
  if (i < 0) i = 0;
  const from = Math.max(0, text.lastIndexOf('.', i - 1) + 1, i - 160);
  return text.slice(from, from + 260).trim().replace(/\s+\S*$/, '') + (from + 260 < text.length ? '…' : '');
}

export function learnPath({ topic, subtopics = [], files = [], questions = [], mastery = null }) {
  const topicTerms = new Set(words(topic.name));
  const subs = subtopics.filter((s) => s.topicId === topic.id);
  const terms = new Set([...topicTerms, ...subs.flatMap((s) => words(s.name))]);
  const phrase = topic.name.trim().toLowerCase();
  const need = Math.min(2, terms.size);

  // score every page of every notes file: distinct topic words found, the topic's own words, the exact name
  const hits = [];
  for (const f of files.filter((x) => x.text && !x.paper && !OUTLINE.test(x.name))) {
    for (const p of piecesOf(f)) {
      const found = new Set(words(p.text).filter((w) => terms.has(w)));
      const own = [...found].filter((w) => topicTerms.has(w)).length;
      if (!own || found.size < need) continue; // only real matches
      const exact = p.text.toLowerCase().split(phrase).length - 1;
      hits.push({ f, ...p, score: found.size * 2 + own + exact * 3 });
    }
  }

  // neighbouring pages of one file become one range ("pages 3-4"), best ranges first
  const ranges = [];
  for (const f of new Set(hits.map((h) => h.f))) {
    const mine = hits.filter((h) => h.f === f).sort((a, b) => (a.n ?? a.at) - (b.n ?? b.at));
    for (const h of mine) {
      const last = ranges.at(-1);
      if (last?.f === f && h.n && last.to === h.n - 1) { last.to = h.n; last.score += h.score; last.text += ` ${h.text}`; }
      else ranges.push({ f, from: h.n, to: h.n, score: h.score, text: h.text });
    }
  }
  ranges.sort((a, b) => b.score - a.score);
  const ref = (r) => ({
    fileId: r.f.id, name: r.f.name, url: r.f.url || null, local: Boolean(r.f.local),
    pages: r.from ? [r.from, r.to] : null,
    find: r.from ? null : snippetOf(r.text, terms, phrase).slice(0, 60).replace(/\s+\S*$/, ''),
    snippet: snippetOf(r.text, terms, phrase),
    excerpt: r.text.slice(0, 2500),
  });
  // a range that works an example goes under Examples; the rest is reading. At most 2 of each per file.
  const pick = (list, n) => { const per = {}; return list.filter((r) => (per[r.f.id] = (per[r.f.id] || 0) + 1) <= 2).slice(0, n).map(ref); };
  const examples = pick(ranges.filter((r) => EXAMPLE.test(r.text)), 4);
  const read = pick(ranges.filter((r) => !EXAMPLE.test(r.text)), 4);

  // for later: questions on the topic, a printed or saved answer first (checked for free), tutorials, newest papers
  const attempt = questions.filter((q) => q.topicId === topic.id)
    .sort((a, b) => Number(Boolean(b.key)) - Number(Boolean(a.key)) || Number(b.type === 'Tutorial') - Number(a.type === 'Tutorial')
      || (b.year || 0) - (a.year || 0) || a.number - b.number)
    .slice(0, 8)
    .map((q) => ({ id: q.id, source: q.source, number: q.number, marks: q.marks || null, hasKey: Boolean(q.key), text: q.text.slice(0, 200) }));

  // then: explain it; AI-made material only where your own files fall short
  const then = [];
  if (read.length || examples.length || attempt.length) then.push({ kind: 'teach', text: 'Explain it in Teach it back, typed or out loud' });
  if (!examples.length) {
    then.push({ kind: 'kit', text: read.length || attempt.length
      ? 'No worked example on it in your files: make a Study kit ladder (a worked example, then your turn)'
      : 'Your files don’t cover it yet: make a Study kit ladder (a worked example, then your turn)' });
  }
  if (!(read.length || examples.length) || !attempt.length) then.push({ kind: 'prompt', text: 'Or take it to Claude or ChatGPT with a context pack (Prompt Builder)' });
  if (mastery?.next && mastery.status !== 'green') then.unshift({ kind: 'next', text: mastery.next });
  return { topic: { id: topic.id, name: topic.name }, read, examples, attempt, then };
}
