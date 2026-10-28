// Store-aware glue for the weakspot analysis: the dashboard and the DM bot both go through here, the maths
// stays pure in analysis.js.
import { applyTeachGaps } from './analysis.js';
import { data, save } from './store.js';

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
