// Today's next actions: up to 3, each { kind, unit, label, reason, minutes, href, focus }. kind is practise, audit,
// prepare or date. The order comes from todayPlan (weakest and soonest unit first); this turns each unit's task into
// a short action, and puts the groundwork first: files to read, then topics to list.
import { data } from './store.js';
import { todayPlan } from './plan.js';

const slug = (code) => code.replace(/\s+/g, '-');
const MINUTES = { teach: 15, practice: 30, mock: 30, paper: 90, kit: 20, prompt: 20, topics: 10 };
const SECTION = { teach: 'teach', practice: 'practice', mock: 'mock', paper: 'papers', kit: 'kit', prompt: 'learn', topics: 'analysis' };
const HREF = { teach: 'practise', practice: 'practise', mock: 'practise', paper: 'unit/{u}/papers', kit: 'unit/{u}/sheet', prompt: 'unit/{u}/topics', topics: 'unit/{u}/topics' };

// "CAT in 3 days", "CAT today", "Date to be set"
export function whenText(days) {
  if (days == null) return 'Date to be set';
  if (days < 0) return 'Date passed';
  if (days === 0) return 'CAT today';
  return `CAT in ${days} day${days === 1 ? '' : 's'}`;
}

function labelFor(task, p) {
  const t = task.topic;
  switch (task.kind) {
    case 'topics': return `List ${p.code} topics`;
    case 'teach': return t ? `Explain ${t}` : `Explain a ${p.code} topic`;
    case 'practice': return task.questionId && !t ? 'Do a past paper' : `Solve questions on ${t}`;
    case 'mock': return t ? `Timed questions on ${t}` : `Timed ${p.code} questions`;
    case 'paper': return `Do a ${p.code} past paper`;
    case 'kit': return `Make the ${p.code} sheet`;
    case 'prompt': return t ? `Walk through ${t}` : `Walk through ${p.code}`;
    default: return task.text;
  }
}

// prepared: unit codes whose hub files have been read (they have text in the library).
export function nextActions(today, { prepared = new Set() } = {}) {
  if (!data.units.length) return [];
  const plan = todayPlan(today);
  return plan.map((p) => {
    const when = whenText(p.days);
    const base = { unit: p.code, reason: `${when} · ${p.stage.name.toLowerCase()}` };
    if (!prepared.has(p.code)) {
      return { ...base, kind: 'prepare', label: `Prepare ${p.code}`, reason: `${when}. Crux reads the unit's files and past papers first.`, minutes: 2, href: `#/unit/${slug(p.code)}/notes`, focus: { section: 'notes', unit: p.code } };
    }
    const rated = data.subtopics.some((x) => x.unit === p.code && x.audit && x.audit !== 'untested');
    if (!rated && data.topics.some((t) => t.unit === p.code)) {
      return { ...base, kind: 'audit', label: `Rate ${p.code} topics`, reason: `${when}. A minute per topic: solid, shaky or stuck.`, minutes: 5, href: `#/unit/${slug(p.code)}/topics`, focus: { section: 'analysis', unit: p.code } };
    }
    const task = p.task;
    const kind = task.kind === 'topics' ? 'audit' : 'practise';
    const why = p.weak ? `${when} · weakest: ${p.weak.name}` : base.reason;
    return {
      ...base, kind, label: labelFor(task, p), reason: why, minutes: MINUTES[task.kind] || 20,
      href: `#/${HREF[task.kind].replace('{u}', slug(p.code))}`,
      focus: { section: SECTION[task.kind], unit: p.code, topic: task.topic, questionId: task.questionId, kit: task.kit, kind: task.promptKind },
    };
  });
}
