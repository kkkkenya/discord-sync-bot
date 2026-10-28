// The daily plan and study stats. Shared by the dashboard and the DM bot so both say the same thing.
import { TBA } from './defs.js';
import { data } from './store.js';
import { nextAssessment } from './library.js';
import { topicStatus } from './mastery.js';
import { stageFor } from './stages.js';
import { predictions } from './predict.js';
import { weakspotReport } from './analysis.js';

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

// The unit's topics ranked by exam weight (Phase 5), its stage deciding whether exclude hints mute.
export function predictFor(unit, today = nairobiDay()) {
  const u = data.units.find((x) => x.code === unit);
  const late = u ? unitStage(u, today).stage.id !== 'adequate' : false;
  return predictions({ topics: data.topics.filter((t) => t.unit === unit), questions: data.paperq.filter((q) => q.unit === unit), hints: data.hints.filter((h) => h.unit === unit), late });
}

// The unit's weakspot matrix (Phase 6): critical sub-topics by exam weight × weakness, and recurring errors.
export function weakspotsFor(unit, today = nairobiDay()) {
  const subs = data.subtopics.filter((s) => s.unit === unit);
  const ids = new Set(subs.map((s) => s.id));
  return weakspotReport({
    topics: data.topics.filter((t) => t.unit === unit), subtopics: subs, ranked: predictFor(unit, today),
    attempts: data.attempts.filter((a) => a.unit === unit || ids.has(a.subtopicId)), now: Date.now(),
  });
}

// One concrete task for a unit, shaped by its stage. kind picks the dashboard section (teach, papers, units,
// mock, practice, prompt); `prompt` tasks also name the Prompt Builder template, `practice` tasks the past-paper
// question to open in Check answer.
// `weak` is the unit's top critical weakspot (a sub-topic), when there is one: it sharpens the task.
function taskFor(stage, { topics, red, amber, papers, weak, pastQs = [] }) {
  const untaught = [...red, ...amber].find((t) => !t.taughtAt);
  const weakTopic = weak && topics.find((t) => t.id === weak.topicId);
  const shaky = weakTopic || red[0] || amber[0];
  const newest = (qs) => [...qs].sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.at).localeCompare(String(b.at)) || a.number - b.number)[0];
  const teach = (t, how) => ({ kind: 'teach', text: `Teach back ${t.name}${how}`, topic: t.name });
  // real past-paper questions on the topic come first, checked step by step; AI-written mock questions otherwise
  const mock = (n, t) => {
    const q = t && newest(pastQs.filter((x) => x.topicId === t.id));
    if (q) return { kind: 'practice', text: `Solve ${n} past-paper questions on ${t.name}, timed, then check each`, topic: t.name, questionId: q.id };
    return { kind: 'mock', text: t ? `Solve ${n} exam questions on ${t.name}, timed` : `Timed ${n}-question mock, closed book`, topic: t?.name };
  };
  const paper = (text) => {
    const first = newest(pastQs);
    if (!first) return { kind: 'paper', text };
    const q = pastQs.filter((x) => x.fileId === first.fileId).sort((a, b) => a.number - b.number)[0];
    return { kind: 'practice', text: `Do ${first.source} timed, then check your answers`, questionId: q.id };
  };
  const prompt = (promptKind, text, t) => ({ kind: 'prompt', promptKind, text, topic: t?.name });
  if (stage === 'exam-eve') {
    if (weak) return prompt('teach', `Walk through ${weak.name} (${weak.topic}): one worked example, then its formulas`, weakTopic);
    return shaky ? prompt('teach', `Walk through ${shaky.name}: one worked example, then its formulas`, shaky) : { kind: 'kit', kit: 'sheet', text: 'Make and read your 1-page survival sheet: formulas, units, your traps' };
  }
  if (stage === 'last-minute') {
    if (!topics.length || !shaky) return { kind: 'kit', kit: 'sheet', text: 'Make your formula and trap sheet: symbols, units, when each formula does NOT apply' };
    if (weak) return { ...mock(2, shaky), text: `Solve 2 exam questions on ${weak.topic}, watching ${weak.name}` };
    return mock(2, shaky);
  }
  if (stage === 'one-week') {
    if (!topics.length) return { kind: 'topics', text: 'List the CAT topics: Suggest topics reads your outline and past papers' };
    if (weak) return { ...mock(3, shaky), text: `Solve 3 timed exam questions on ${weak.topic} (weakspot: ${weak.name})` };
    if (!papers) return paper('Do the most recent past paper or CAT, timed');
    if (shaky) return mock(3, shaky);
    return untaught ? teach(untaught, ': the standard method, step by step') : mock(3);
  }
  // adequate: fundamentals first
  if (!topics.length) return { kind: 'topics', text: 'List the topics: Suggest topics reads your outline and past papers' };
  if (weak?.audit === 'stuck' || weak?.action === 'teach') return { kind: 'teach', text: `Teach back ${weak.name} (${weak.topic}): derivation, assumptions, when it fails`, topic: weak.topic };
  if (untaught) return teach(untaught, ': derivation, assumptions, when it fails');
  if (!papers) return paper('Do one past paper or CAT, timed');
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
    const weak = weakspotsFor(u.code, today).critical[0] || null;
    const weakness = red.length * 2 + amber.length + (5 - (u.confidence || 3)) + (papers ? 0 : 1.5) + Math.min(4, (weak?.priority || 0) / 5);
    let near = days == null || days < 0 ? 60 : days;
    if (stage.source === 'unit' || stage.source === 'all') near = Math.min(near, OVERRIDE_DAYS[stage.id]);
    const urgency = 14 / (near + 2);
    return { code: u.code, title: u.title, cat, days, stage, score: weakness * urgency, weak, task: taskFor(stage.id, { topics, red, amber, papers, weak, pastQs: data.paperq.filter((q) => q.unit === u.code) }) };
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
  // streak: days in a row (ending today or yesterday) with any study session, teach-back, mock, paper, checked
  // answer or sub-topic audit
  const audits = data.subtopics.filter((x) => x.auditAt).map((x) => ({ at: x.auditAt }));
  const active = new Set([...data.sessions, ...data.teach, ...data.mocks, ...data.papers, ...data.attempts, ...audits].map((x) => nairobiDay(new Date(x.at))));
  let streak = 0;
  for (let d = active.has(today) ? today : addDays(today, -1); active.has(d); d = addDays(d, -1)) streak++;
  return { minutesWeek: byUnit, minutesToday, activeToday: active.has(today), streak };
}
