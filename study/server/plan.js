// The daily plan and study stats. Shared by the dashboard and the DM bot so both say the same thing.
import { TBA } from './defs.js';
import { data } from './store.js';
import { nextAssessment } from './library.js';
import { topicStatus } from './mastery.js';
import { stageFor } from './stages.js';

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

// A unit's CAT/exam date: the one you set, else the start of the next CAT week on the KU calendar. TBA (the
// strike) means there is no date at all, not even the calendar's.
export function catDay(unit, today = nairobiDay()) {
  if (unit.catDate === TBA) return null;
  return unit.catDate || nextAssessment(today)?.start || null;
}
export const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// A unit's date, days left (null when TBA / no date) and study stage, as of Nairobi `today`.
export function unitStage(u, today = nairobiDay()) {
  const cat = catDay(u, today);
  const days = cat ? daysBetween(today, cat) : null;
  return { cat, days, stage: stageFor(u, days, data.settings.stage) };
}

// One concrete task for a unit, shaped by its stage. kind picks the dashboard section (teach, papers, units,
// mock, prompt); `prompt` tasks also name the Prompt builder template.
function taskFor(stage, { topics, red, amber, papers }) {
  const untaught = [...red, ...amber].find((t) => !t.taughtAt);
  const shaky = red[0] || amber[0];
  const teach = (t, how) => ({ kind: 'teach', text: `Teach back ${t.name}${how}`, topic: t.name });
  const mock = (n, t) => ({ kind: 'mock', text: t ? `Solve ${n} exam questions on ${t.name}, timed` : `Timed ${n}-question mock, closed book`, topic: t?.name });
  const prompt = (promptKind, text, t) => ({ kind: 'prompt', promptKind, text, topic: t?.name });
  if (stage === 'exam-eve') {
    return shaky ? prompt('teach', `Walk through ${shaky.name}: one worked example, then its formulas`, shaky) : prompt('formula', '1-page survival sheet: formulas, units, traps');
  }
  if (stage === 'last-minute') {
    if (!topics.length || !shaky) return prompt('formula', 'Formula & trap sheet: symbols, units, when each formula does NOT apply');
    return mock(2, shaky);
  }
  if (stage === 'one-week') {
    if (!topics.length) return { kind: 'topics', text: 'List the CAT topics, then mark what past papers keep asking' };
    if (!papers) return { kind: 'paper', text: 'Do the most recent past paper or CAT, timed' };
    if (shaky) return mock(3, shaky);
    return untaught ? teach(untaught, ': the standard method, step by step') : mock(3);
  }
  // adequate: fundamentals first
  if (!topics.length) return { kind: 'topics', text: 'List the topics from the course outline and rate each one' };
  if (untaught) return teach(untaught, ': derivation, assumptions, when it fails');
  if (!papers) return { kind: 'paper', text: 'Do one past paper or CAT, timed' };
  return shaky ? mock(3, shaky) : mock(3);
}

// An override can make a far-off (or TBA) unit urgent: it counts as at least this close.
const OVERRIDE_DAYS = { 'exam-eve': 1, 'last-minute': 3, 'one-week': 7, adequate: 60 };

// Up to 3 units for today, weakest and soonest first, each with one task for its stage.
export function todayPlan(today = nairobiDay()) {
  const scored = data.units.map((u) => {
    const { cat, days, stage } = unitStage(u, today);
    const topics = data.topics.filter((t) => t.unit === u.code);
    const red = topics.filter((t) => topicStatus(t, today) === 'red');
    const amber = topics.filter((t) => topicStatus(t, today) === 'amber');
    const papers = data.papers.filter((p) => p.unit === u.code).length;
    const weakness = red.length * 2 + amber.length + (5 - (u.confidence || 3)) + (papers ? 0 : 1.5);
    let near = days == null || days < 0 ? 60 : days;
    if (stage.source === 'unit' || stage.source === 'all') near = Math.min(near, OVERRIDE_DAYS[stage.id]);
    const urgency = 14 / (near + 2);
    return { code: u.code, title: u.title, cat, days, stage, score: weakness * urgency, task: taskFor(stage.id, { topics, red, amber, papers }) };
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
