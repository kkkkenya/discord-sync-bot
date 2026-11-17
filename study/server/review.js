// Reviews in Today (fixplan-e E2). Pure: which green topics are about to fade, and which one question keeps each.
// The fading comes from server/understanding.js (lastsDays); nothing here scores or schedules anything.
//
// Rules (docs/ARCHITECTURE.md section 5):
//  - due: green, and lastsDays within REVIEW.withinDays
//  - units whose paper has passed are skipped; in the last REVIEW.quietDays before a paper, only the soonest such unit
//  - order: soonest paper first, then lowest lastsDays
//  - at most REVIEW.perDay a day, less the reviews already done today
//  - one question per topic: not attempted first, then least recently attempted, then a printed or agreed key first
import { REVIEW } from './defs.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The question a review asks: not attempted, else the least recently attempted; a key or agreed solution breaks a tie.
// questions: [{ id, ... }]; attempts: [{ questionId, at }]; levelOf(question) -> 'key' | 'agreed' | 'single'.
export function pickQuestion({ questions = [], attempts = [], levelOf = () => 'single' }) {
  const last = new Map();
  for (const a of attempts) {
    if (!a.questionId) continue;
    const t = Date.parse(a.at) || 0;
    if (t > (last.get(a.questionId) ?? -Infinity)) last.set(a.questionId, t);
  }
  const rank = { key: 0, agreed: 1, single: 2 };
  const sorted = [...questions].sort((a, b) => (last.get(a.id) ?? -Infinity) - (last.get(b.id) ?? -Infinity)
    || (rank[levelOf(a)] ?? 2) - (rank[levelOf(b)] ?? 2));
  return sorted[0] || null;
}

// The reviews to offer today, at most the ones still allowed. A review: { unit, topicId, topic, lastsDays, reason,
// questionId }. Pure: give it the lists.
//  topics:          [{ id, unit, name }]
//  understandingOf: topicId -> { status, lastsDays } (understanding.js, through mastery.js)
//  units:           [{ code, days }]  days: days to the paper (negative: passed; null: no date)
//  questions:       [{ id, unit, topicId, ... }]  attempts: [{ questionId, at }]  levelOf(question) -> 'key' | 'agreed' | 'single'
//  doneToday:       reviews already done today (Nairobi)
export function dueReviews({ topics = [], understandingOf = () => ({}), units = [], doneToday = 0, questions = [], attempts = [], levelOf = () => 'single' }) {
  const slots = REVIEW.perDay - doneToday;
  if (slots <= 0) return [];
  const soon = (u) => (u.days == null ? Infinity : u.days);
  const open = units.filter((u) => u.days == null || u.days >= 0).sort((a, b) => soon(a) - soon(b));
  const inQuiet = open.find((u) => u.days != null && u.days <= REVIEW.quietDays);
  const allowed = inQuiet ? [inQuiet] : open;
  const allowedCodes = new Map(allowed.map((u) => [u.code, soon(u)]));

  const due = [];
  for (const t of topics) {
    if (!allowedCodes.has(t.unit)) continue;
    const { status, lastsDays } = understandingOf(t.id) || {};
    if (status !== 'green' || lastsDays == null || lastsDays > REVIEW.withinDays) continue;
    const mine = questions.filter((q) => q.unit === t.unit && q.topicId === t.id);
    const ids = new Set(mine.map((q) => q.id));
    const question = pickQuestion({ questions: mine, attempts: attempts.filter((a) => ids.has(a.questionId)), levelOf });
    if (!question) continue; // nothing to ask: no review
    due.push({ unit: t.unit, topicId: t.id, topic: t.name, lastsDays, questionId: question.id, reason: `Fades in about ${plural(lastsDays, 'day')}. One question keeps it.`, days: allowedCodes.get(t.unit) });
  }
  due.sort((a, b) => (a.days === b.days ? 0 : a.days < b.days ? -1 : 1) || (a.lastsDays - b.lastsDays));
  return due.slice(0, slots).map(({ days, ...r }) => r);
}
