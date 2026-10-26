// Recall scheduling and the daily plan. Shared by the dashboard and the DM bot so both say the same thing.
import { data } from './store.js';
import { nextAssessment } from './library.js';

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

// A unit's CAT date: the one you set, else the start of the next CAT week.
export function catDay(unit, today = nairobiDay()) {
  return unit.catDate || nextAssessment(today)?.start || null;
}

export const dueCards = (unit, today = nairobiDay()) =>
  data.cards.filter((c) => (!unit || c.unit === unit) && c.due <= today).sort((a, b) => a.due.localeCompare(b.due));

// grade: 1 forgot, 2 hard, 3 good, 4 easy. SM-2 style, but the next review never lands after the unit's CAT:
// a card you'd normally see in 3 weeks comes back the day before the CAT instead.
export function grade(card, g, today = nairobiDay()) {
  card.ease ??= 2.5; card.interval ??= 0; card.reps ??= 0; card.lapses ??= 0;
  if (g === 1) { card.reps = 0; card.lapses += 1; card.interval = 0; card.ease = Math.max(1.3, card.ease - 0.2); }
  else {
    card.reps += 1;
    card.ease = Math.max(1.3, card.ease + [0, 0, -0.15, 0, 0.15][g]);
    card.interval = card.reps === 1 ? (g === 4 ? 3 : 1) : Math.round(Math.max(1, card.interval) * card.ease * (g === 2 ? 0.6 : g === 4 ? 1.3 : 1));
  }
  const unit = data.units.find((u) => u.code === card.unit);
  const cat = unit && catDay(unit, today);
  const gap = cat && cat > today ? daysBetween(today, cat) - 1 : null;
  let interval = card.interval;
  if (gap !== null && interval > gap) interval = Math.max(g === 1 ? 0 : 1, gap);
  card.due = addDays(today, g === 1 ? 0 : Math.max(1, interval));
  data.reviews.push({ card: card.id, unit: card.unit, grade: g, at: new Date().toISOString() });
  return card;
}

// Up to 3 units for today, weakest and soonest first, each with one concrete task.
export function todayPlan(today = nairobiDay()) {
  const scored = data.units.map((u) => {
    const cat = catDay(u, today);
    const days = cat ? Math.max(0, daysBetween(today, cat)) : 60;
    const topics = data.topics.filter((t) => t.unit === u.code);
    const red = topics.filter((t) => t.status === 'red');
    const amber = topics.filter((t) => t.status === 'amber');
    const due = dueCards(u.code, today).length;
    const papers = data.papers.filter((p) => p.unit === u.code).length;
    const weakness = red.length * 2 + amber.length + due / 5 + (5 - (u.confidence || 3)) + (papers ? 0 : 1.5);
    const urgency = 14 / (days + 2);
    const untaught = [...red, ...amber].find((t) => !t.taughtAt) || red[0] || amber[0];
    let task;
    if (due) task = { kind: 'recall', text: `Recall ${due} card${due === 1 ? '' : 's'}` };
    else if (untaught) task = { kind: 'teach', text: `Teach back: ${untaught.name}`, topic: untaught.name };
    else if (!papers) task = { kind: 'paper', text: 'Do one past paper or CAT, timed' };
    else if (!topics.length) task = { kind: 'topics', text: 'List the CAT topics and rate each one' };
    else task = { kind: 'recall', text: 'Write 5 new recall cards from your notes' };
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
  const reviewed = data.reviews.filter((r) => nairobiDay(new Date(r.at)) === today).length;
  const minutesToday = data.sessions.filter((s) => nairobiDay(new Date(s.at)) === today).reduce((n, s) => n + s.minutes, 0);
  // streak: days in a row (ending today or yesterday) with any study, review or teach-back
  const active = new Set([...data.sessions, ...data.reviews, ...data.teach].map((x) => nairobiDay(new Date(x.at))));
  let streak = 0;
  for (let d = active.has(today) ? today : addDays(today, -1); active.has(d); d = addDays(d, -1)) streak++;
  return { minutesWeek: byUnit, minutesToday, reviewedToday: reviewed, streak };
}
