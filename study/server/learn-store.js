// "Learn a topic" with the app's data: the unit's synced and added files, its questions, the topic's understanding.
// Shared by the dashboard (GET /api/learn) and the bot (`learn EMM 302 torsion`).
import { guideFor } from './guide.js';
import { library } from './ingest.js';
import { filesFor } from './library.js';
import { learnPath } from './learn.js';
import { words } from './analysis.js';
import { pageFor, sectionsAbout } from './sections.js';
import { topicMastery } from './mastery.js';
import { ownNotes } from './notes-store.js';
import { data } from './store.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export async function learnFor(unit, topicId) {
  if (!data.units.some((u) => u.code === unit)) throw bad('Pick one of your units first.');
  const topic = data.topics.find((t) => t.unit === unit && t.id === topicId);
  if (!topic) throw bad("Pick one of the unit's topics (add them in Units first).");
  const urls = {};
  try { for (const f of (await filesFor(unit)).files) urls[f.id] = f.url; } catch { /* no links: the file names still say where to look */ }
  const notes = ownNotes(unit).map((n) => ({ id: `note-${n.id}`, name: n.title, text: n.text, own: true, url: null }));
  const files = [...notes, ...Object.entries(library.files).filter(([, e]) => e.unit === unit && e.text).map(([id, e]) => ({ id, ...e, url: urls[id] || null }))];
  return { ...learnPath({ topic, subtopics: data.subtopics, files, questions: data.paperq.filter((q) => q.unit === unit), mastery: topicMastery(topic) }), guide: placed(await guideFor(unit, topic), files),
    // the unit's files by name, so the guide's reading places can open them
    books: files.filter((f) => !f.paper && !f.own).map((f) => ({ id: f.id, name: f.name })) };
}

// The guide's reading places at the page their section starts on, from each book's headings (the AI only sees the
// contents, whose page numbers are the printed ones). A place it can't find keeps the AI's page.
function placed(guide, files) {
  if (!guide) return guide;
  const byName = new Map(files.map((f) => [f.name, f]));
  return { ...guide, outline: guide.outline.map((o) => ({ ...o, read: o.read.map((r) => ({ ...r, page: pageFor(byName.get(r.book)?.sections, r.where, `${o.name} ${r.focus}`) || r.page })) })) };
}

// The topic's sections in the unit's books, from their headings: [{ book, title, page }], best first, at most 8.
export function topicPlaces(unit, topic) {
  const own = new Set(words(topic.name));
  const all = new Set([...own, ...data.subtopics.filter((s) => s.topicId === topic.id).flatMap((s) => words(s.name))]);
  return Object.values(library.files).filter((e) => e.unit === unit && !e.paper && e.sections?.length)
    .flatMap((e) => sectionsAbout(e.sections, all, own).slice(0, 3).map((x) => ({ book: e.name, title: x.title, page: x.from, score: x.score })))
    .sort((a, b) => b.score - a.score).slice(0, 8).map(({ book, title, page }) => ({ book, title, page }));
}

// A topic named in a message ("torsion", "thin walled") → the unit's best matching topic, or null.
export function topicNamed(unit, text) {
  const want = String(text || '').trim().toLowerCase();
  if (!want) return null;
  const mine = data.topics.filter((t) => t.unit === unit);
  return mine.find((t) => t.name.toLowerCase() === want) || mine.find((t) => t.name.toLowerCase().includes(want))
    || mine.find((t) => want.split(/\s+/).filter((w) => w.length > 3).some((w) => t.name.toLowerCase().includes(w))) || null;
}
