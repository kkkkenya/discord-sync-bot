// A study guide for one topic: what the course outline expects, how the papers examine it, and where in the unit's
// books to read and what to skip, so a 500-page book becomes a short reading list. Made once by the AI, kept on the
// topic and shared with the class (crux_kit_kb), like a ladder: a classmate's guide costs nothing.
import { aiReady } from './ai.js';
import { makeGuide } from './brain.js';
import { library } from './ingest.js';
import { words } from './analysis.js';
import { learnPath } from './learn.js';
import { kitKey, shareKit, sharedKit } from './shared.js';
import { data, patch } from './store.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const OUTLINE = /outline|syllabus|course[\s_-]*(content|description)/i;
export const guideKey = (unit, topic) => kitKey(unit, 'guide', 'all', topic);

// What the AI reads: the outline, the papers' questions on the topic, the pages that cover it, each book's opening
// (usually its contents, with chapter and page numbers).
export function guideSources(unit, topic, files = library.files) {
  const mine = Object.entries(files).filter(([, e]) => e.unit === unit && e.text).map(([id, e]) => ({ id, ...e }));
  const outline = mine.filter((e) => OUTLINE.test(e.name)).map((e) => `--- ${e.name} ---\n${e.text.slice(0, 6000)}`).join('\n\n');
  const books = mine.filter((e) => !e.paper && !OUTLINE.test(e.name));
  const path = learnPath({ topic, subtopics: data.subtopics, files: books, questions: [] });
  const pages = [...path.read, ...path.examples].map((r) => `- ${r.name}${r.pages ? `, page${r.pages[0] === r.pages[1] ? ` ${r.pages[0]}` : `s ${r.pages[0]}-${r.pages[1]}`}` : ''}: "${r.snippet}"`).join('\n');
  // a book's contents list, not its cover and preface: from the word "Contents" when the book has one
  const contentsOf = (t) => { const i = Math.max(t.search(/\b(?:CONTENTS|Contents|C O N T E N T S)\b/), 0); return t.slice(i, i + 3500); };
  const contents = books.map((e) => `--- ${e.name}${e.pages ? ` (${e.pages} pages)` : ''} ---\n${contentsOf(e.text)}`).join('\n\n');
  // the papers' questions on it: tagged with the topic, or naming it
  const own = new Set(words(topic.name));
  const onTopic = (q) => q.topicId === topic.id || (own.size > 0 && words(q.text).filter((w) => own.has(w)).length >= Math.min(2, own.size));
  const questions = data.paperq.filter((q) => q.unit === unit && q.type !== 'Book' && onTopic(q))
    .slice(0, 12).map((q) => `- ${q.source}${q.marks ? ` (${q.marks} marks)` : ''}: ${q.text.slice(0, 600)}`).join('\n');
  return { outline, pages, contents: contents.slice(0, 20000), questions, books: books.map((e) => e.name) };
}

// The saved guide: this student's, else a classmate's (free). { guide | null }
export async function guideFor(unit, topic) {
  return topic.guide || (await sharedKit(guideKey(unit, topic.name))) || null;
}

// "Make a study guide": { unit, topicId, fresh? } → the guide. One AI action, unless a classmate already made one.
export async function makeGuideFor({ unit, topicId, fresh = false }, { make = makeGuide, ready = aiReady, shared = { get: sharedKit, put: shareKit } } = {}) {
  const topic = data.topics.find((t) => t.unit === unit && t.id === topicId);
  if (!topic) throw bad("Pick one of the unit's topics first.");
  if (!fresh) {
    const known = topic.guide || (await shared.get(guideKey(unit, topic.name)));
    if (known) return patch('topics', topic.id, { guide: known }).guide;
  }
  if (!ready()) return { needAi: true, message: 'A study guide needs the built-in AI. The Prompt Builder can make one in any AI.' };
  const subs = data.subtopics.filter((s) => s.unit === unit && s.topicId === topic.id).map((s) => s.name);
  const title = data.units.find((u) => u.code === unit)?.title || '';
  const guide = { ...(await make({ unit, title, topic: topic.name, subtopics: subs, ...guideSources(unit, topic) })), at: new Date().toISOString() };
  await shared.put(guideKey(unit, topic.name), unit, guide);
  return patch('topics', topic.id, { guide }).guide;
}
