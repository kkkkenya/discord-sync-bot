// Focus sessions (the Focus page): who is studying until when, so the page can say how many others are focusing
// right now, in total and in your unit's study room. Only counts ever leave the server, never who. A session is one
// row with its end time (and the unit room, if any), so nobody has to keep pinging: the row simply stops counting
// when the time passes.
import { db, enc } from '../../lib/db.js';
import { remote } from './ingest.js';

const memory = new Map(); // user id -> { until (ms), unit }, for local runs and tests
const MAX = 3 * 60 * 60e3; // a session can't claim more than 3 hours ahead

// { others, room }: others focusing now, and those in the given unit's room (null when no room was asked for)
export async function focusCounts(userId, unit = null, now = Date.now()) {
  if (!remote()) {
    const live = [...memory].filter(([id, f]) => id !== userId && f.until > now);
    return { others: live.length, room: unit ? live.filter(([, f]) => f.unit === unit).length : null };
  }
  const rows = await db.select('crux_focus', `until=gt.${enc(new Date(now).toISOString())}&user_id=neq.${enc(userId)}&select=unit_code&limit=500`);
  return { others: rows.length, room: unit ? rows.filter((r) => r.unit_code === unit).length : null };
}
export const focusCount = async (userId, now = Date.now()) => (await focusCounts(userId, null, now)).others;

// until: when this person's focus block ends (ISO), or null when they pause or stop; unit: the room they're in
export async function setFocus(userId, until, now = Date.now(), unit = null) {
  const end = until ? Math.min(Date.parse(until), now + MAX) : 0;
  if (until && !Number.isFinite(end)) throw Object.assign(new Error('until must be a date.'), { status: 400 });
  if (!remote()) {
    if (end > now) memory.set(userId, { until: end, unit }); else memory.delete(userId);
  } else if (end > now) {
    await db.upsert('crux_focus', [{ user_id: userId, until: new Date(end).toISOString(), unit_code: unit }], 'user_id');
  } else {
    await db.remove('crux_focus', `user_id=eq.${enc(userId)}`);
  }
  return focusCounts(userId, unit, now);
}

export const resetFocusForTests = () => memory.clear();
