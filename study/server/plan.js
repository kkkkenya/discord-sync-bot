// The daily plan and study stats. Shared by the dashboard and the DM bot so both say the same thing.
import { data } from './store.js';
import { nextAssessment } from './library.js';
import { topicStatus } from './mastery.js';

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

// A unit's CAT date: the one you set, else the start of the next CAT week.
export function catDay(unit, today = nairobiDay()) {
  return unit.catDate || nextAssessment(today)?.start || null;
}

// Up to 3 units for today, weakest and soonest first, each with one concrete task.
export function todayPlan(today = nairobiDay()) {
  const scored = data.units.map((u) => {
    const cat = catDay(u, today);
    const days = cat ? Math.max(0, daysBetween(today, cat)) : 60;
    const topics = data.topics.filter((t) => t.unit === u.code);
    const red = topics.filter((t) => topicStatus(t, today) === 'red');
    const amber = topics.filter((t) => topicStatus(t, today) === 'amber');
    const papers = data.papers.filter((p) => p.unit === u.code).length;
    const weakness = red.length * 2 + amber.length + (5 - (u.confidence || 3)) + (papers ? 0 : 1.5);
    const urgency = 14 / (days + 2);
    const untaught = [...red, ...amber].find((t) => !t.taughtAt) || red[0] || amber[0];
    const shaky = red[0] || amber[0];
    let task;
    if (untaught) task = { kind: 'teach', text: `Teach back: ${untaught.name}`, topic: untaught.name };
    else if (!papers) task = { kind: 'paper', text: 'Do one past paper or CAT, timed' };
    else if (!topics.length) task = { kind: 'topics', text: 'List the CAT topics and rate each one' };
    else if (shaky) task = { kind: 'mock', text: `Solve 3 exam questions on ${shaky.name}, timed`, topic: shaky.name };
    else task = { kind: 'mock', text: 'Timed 3-question mock, closed book' };
    return { code: u.code, title: u.title, cat, days, score: weakness * urgency, task };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function stats(today = nairobiDay()) {
  const weekAgo = addDays(today, -6);
  const byUnit = {};
  for (const s of data.sessions) {
    if (nairobiDay(new Date(s.at)) < weekAgo) continue;
    byUnit[s.unit] = (byUnit[s.unit] || 0) + s.minutes;
  }
  const minutesToday = data.sessions.filter((s) => nairobiDay(new Date(s.at)) === today).reduce((n, s) => n + s.minutes, 0);
  // streak: days in a row (ending today or yesterday) with any study session, teach-back, mock or paper
  const active = new Set([...data.sessions, ...data.teach, ...data.mocks, ...data.papers].map((x) => nairobiDay(new Date(x.at))));
  let streak = 0;
  for (let d = active.has(today) ? today : addDays(today, -1); active.has(d); d = addDays(d, -1)) streak++;
  return { minutesWeek: byUnit, minutesToday, activeToday: active.has(today), streak };
}
