// Reviews in Today with the app's data (fixplan-e E2). Store-aware glue around review.js (pure).
import { dueReviews } from './review.js';
import { nairobiDay, unitStage } from './plan.js';
import { masteryMap } from './mastery.js';
import { data } from './store.js';

// A review attempt is an attempt made from a review (its `review` flag). Counted by distinct question per Nairobi day:
// a double submit, or the same review open in two tabs, uses one of the day's slots. (Attempt ids are fresh on every
// add, so they cannot tell a repeat apart.)
export function reviewsDoneOn(today = nairobiDay()) {
  const seen = new Set();
  for (const a of data.attempts) {
    if (!a.review || !a.questionId) continue;
    if (nairobiDay(new Date(a.at)) === today) seen.add(a.questionId);
  }
  return seen.size;
}

// A learner's level on a question's shared solution: a printed key or a scheme is 'key', two solvers agreeing is
// 'agreed', anything else 'single'.
const levelOfRow = (q) => {
  const src = q.key?.source;
  if (src === 'sheet' || src === 'scheme') return 'key';
  if (src === 'agreed') return 'agreed';
  return 'single';
};

export function reviewsToday(today = nairobiDay()) {
  const mastery = masteryMap(today);
  const rows = new Map(data.paperq.map((q) => [q.id, q]));
  return dueReviews({
    topics: data.topics.map((t) => ({ id: t.id, unit: t.unit, name: t.name })),
    understandingOf: (id) => mastery[id] || {},
    units: data.units.map((u) => ({ code: u.code, days: unitStage(u, today).days })),
    doneToday: reviewsDoneOn(today),
    questions: data.paperq.map((q) => ({ id: q.id, unit: q.unit, topicId: q.topicId })),
    attempts: data.attempts.map((a) => ({ questionId: a.questionId, at: a.at })),
    levelOf: (q) => levelOfRow(rows.get(q.id) || {}),
  });
}
