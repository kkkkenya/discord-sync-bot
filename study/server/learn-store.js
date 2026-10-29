// "Learn a topic" with the app's data: the unit's synced and added files, its questions, the topic's understanding.
// Shared by the dashboard (GET /api/learn) and the bot (`learn EMM 302 torsion`).
import { library } from './ingest.js';
import { filesFor } from './library.js';
import { learnPath } from './learn.js';
import { topicMastery } from './mastery.js';
import { data } from './store.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export async function learnFor(unit, topicId) {
  if (!data.units.some((u) => u.code === unit)) throw bad('Pick one of your units first.');
  const topic = data.topics.find((t) => t.unit === unit && t.id === topicId);
  if (!topic) throw bad("Pick one of the unit's topics (add them in Units first).");
  const urls = {};
  try { for (const f of (await filesFor(unit)).files) urls[f.id] = f.url; } catch { /* no links: the file names still say where to look */ }
  const files = Object.entries(library.files).filter(([, e]) => e.unit === unit && e.text).map(([id, e]) => ({ id, ...e, url: urls[id] || null }));
  return learnPath({ topic, subtopics: data.subtopics, files, questions: data.paperq.filter((q) => q.unit === unit), mastery: topicMastery(topic) });
}

// A topic named in a message ("torsion", "thin walled") → the unit's best matching topic, or null.
export function topicNamed(unit, text) {
  const want = String(text || '').trim().toLowerCase();
  if (!want) return null;
  const mine = data.topics.filter((t) => t.unit === unit);
  return mine.find((t) => t.name.toLowerCase() === want) || mine.find((t) => t.name.toLowerCase().includes(want))
    || mine.find((t) => want.split(/\s+/).filter((w) => w.length > 3).some((w) => t.name.toLowerCase().includes(w))) || null;
}
