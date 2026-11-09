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

// Your activity, one square a day like a commit graph: for each Nairobi day of the last `weeks` weeks (whole weeks,
// Monday first, ending today), the questions checked, study sessions, teach-backs, mocks finished and files the hub
// posted for you (posted: their days, read from crux_uploads by the caller). { days: [{ day, n, ... }], streak, total }
export function activity(today = nairobiDay(), posted = [], weeks = 20) {
  const end = Date.parse(`${today}T12:00:00+03:00`);
  const monday = (new Date(end).getUTCDay() + 6) % 7; // 0 on a Monday
  const start = end - ((weeks - 1) * 7 + monday) * DAY;
  const days = Array.from({ length: (weeks - 1) * 7 + monday + 1 }, (_, i) => ({ day: nairobiDay(new Date(start + i * DAY)), questions: 0, sessions: 0, teach: 0, mocks: 0, files: 0 }));
  const at = new Map(days.map((d) => [d.day, d]));
  const add = (iso, key) => { const d = iso && at.get(dayOf(iso)); if (d) d[key] += 1; };
  for (const a of data.attempts) add(a.at, 'questions');
  for (const s of data.sessions) add(s.at, 'sessions');
  for (const t of data.teach || []) add(t.at, 'teach');
  for (const m of data.mocks) add(m.finishedAt, 'mocks');
  for (const f of posted) add(f, 'files');
  for (const d of days) d.n = d.questions + d.sessions + d.teach + d.mocks + d.files;
  // the streak runs back from today, or from yesterday when today has nothing yet
  let streak = 0;
  for (let i = days.length - 1 - (days.at(-1).n ? 0 : 1); i >= 0 && days[i].n; i--) streak++;
  return { days, streak, total: days.reduce((n, d) => n + d.n, 0) };
}
