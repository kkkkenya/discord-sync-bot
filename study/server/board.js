// Today's board: what's urgent (a paper within 3 days), the CAT and exam dates ahead, the weakest sub-topics across
// your units, and topics you haven't touched in a while. Read from the document; no AI.
import { weakspotsFor, unitStage } from './plan.js';
import { data } from './store.js';

const URGENT_DAYS = 3;
const STALE_DAYS = 10;
const day = 864e5;

export function todayBoard(today, now = Date.now()) {
  const units = data.units.map((u) => ({ code: u.code, title: u.title || '', ...unitStage(u, today) }));
  const dated = units.filter((u) => u.days != null && u.days >= 0).sort((a, b) => a.days - b.days);
  const dates = dated.map((u) => ({ unit: u.code, title: u.title, date: u.cat, days: u.days, stage: u.stage.id }));
  const urgent = dated.filter((u) => u.days <= URGENT_DAYS).map((u) => u.code);

  // the weakest sub-topics, the units sitting soonest first: at most 2 a unit, 6 in all
  const soon = new Map(units.map((u) => [u.code, u.days ?? 999]));
  const weak = units.flatMap((u) => weakspotsFor(u.code, today).critical.slice(0, 2))
    .sort((a, b) => (soon.get(a.unit) - soon.get(b.unit)) || b.priority - a.priority).slice(0, 6)
    .map((w) => ({ unit: w.unit, topicId: w.topicId, topic: w.topic, subtopicId: w.subtopicId, name: w.name, reason: w.reason }));

  // the last time each topic was worked on: an answer checked, a sub-topic rated or tested, a teach-back
  const last = new Map();
  const seen = (id, at) => { const t = Date.parse(at || 0); if (id && t && t > (last.get(id) || 0)) last.set(id, t); };
  for (const a of data.attempts) seen(a.topicId, a.at);
  for (const s of data.subtopics) { seen(s.topicId, s.lastTested); seen(s.topicId, s.auditAt); }
  for (const t of data.teach || []) seen(data.topics.find((x) => x.unit === t.unit && x.name === t.topic)?.id, t.at);
  const stale = data.topics.filter((t) => soon.has(t.unit) && (soon.get(t.unit) ?? 999) >= 0)
    .map((t) => ({ unit: t.unit, topicId: t.id, name: t.name, ago: last.has(t.id) ? Math.floor((now - last.get(t.id)) / day) : null }))
    .filter((t) => t.ago == null ? soon.get(t.unit) <= 21 : t.ago >= STALE_DAYS)
    .sort((a, b) => (soon.get(a.unit) - soon.get(b.unit)) || (b.ago ?? 1e4) - (a.ago ?? 1e4)).slice(0, 6);

  return { urgent, dates, weak, stale };
}
