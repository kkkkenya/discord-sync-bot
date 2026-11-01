// Insights across all of a student's units. Pure apart from reading `data`.
import { ERROR_TYPES } from './defs.js';
import { nairobiDay, weakspotsFor } from './plan.js';
import { data } from './store.js';

const DAY = 864e5;
const dayOf = (iso) => nairobiDay(new Date(iso));

export function insights(today = nairobiDay(), { days = 14, limit = 12 } = {}) {
  const since = Date.parse(`${today}T00:00:00+03:00`) - (days - 1) * DAY;
  const recent = data.attempts.filter((a) => Date.parse(a.at) >= since);
  const weakspots = data.units.flatMap((u) => weakspotsFor(u.code, today).critical)
    .sort((a, b) => b.priority - a.priority || b.weakness - a.weakness)
    .slice(0, limit)
    .map((r) => {
      const on = data.attempts.filter((a) => a.subtopicId === r.subtopicId);
      const types = [...new Set(on.filter((a) => a.errorType).map((a) => a.errorType))];
      return { ...r, errorTypes: types.map((id) => ERROR_TYPES.find((e) => e.id === id)?.label || id), lastTried: on.length ? dayOf(on.map((a) => a.at).sort().at(-1)) : null };
    });
  const errors = ERROR_TYPES.map((e) => ({ id: e.id, label: e.label, n: recent.filter((a) => a.verdict === 'wrong' && a.errorType === e.id).length }));
  const trend = Array.from({ length: days }, (_, i) => {
    const day = nairobiDay(new Date(since + i * DAY + 12 * 3600e3));
    const mine = recent.filter((a) => dayOf(a.at) === day);
    return { day, tried: mine.length, right: mine.filter((a) => a.verdict === 'right').length };
  });
  return { weakspots, errors, trend };
}
