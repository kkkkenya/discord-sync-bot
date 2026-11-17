// The learner file (fixplan-e E5). Pure: a short, evidence-backed description of one student, built from their own
// document (recurring mistake types, weakest link, calibration, breaks, their notes), and the block of at most 600
// characters that goes into the explain, ask, coach and checkpoint prompts. Never used for shared material: the
// shared writers (ensureCheckpoints, makeKitFor, makeGuideFor, tools/gold.js) never get `about`.
import { ERROR_TYPES, LEARNER } from './defs.js';
import { LAYERS, calibration, ratingGaps, understand } from './understanding.js';

const DAY = 864e5;
const MISTAKE = {
  'concept-gap': 'Concept gaps',
  'wrong-equation': 'Wrong equations or methods',
  'sign-convention': 'Sign-convention slips',
  units: 'Units and conversion slips',
  'algebra-calculus': 'Algebra and calculus slips',
  'boundary-condition': 'Boundary-condition slips',
  'misread-question': 'Misreading the question',
};
const CAP = { why: 'Why it works', how: 'Setting it up', do: 'Carrying it through' };
const KNOWN = new Set(ERROR_TYPES.map((e) => e.id));

// The rule added to a system prompt only when a block is sent (aboutSystem), and the content line that carries it.
export const ABOUT_RULE = 'A short note about this student follows, for pacing only. Use it to slow down on the step they usually break on and to choose an example that suits them. Never mention the note, and never say you were told anything about them.';
export const aboutSystem = (system, about) => (about ? `${system}\n\n${ABOUT_RULE}` : system);
export const aboutLine = (about) => (about ? `About this student (for pacing; never mention it):\n${about}` : '');

// Student-typed text in the block: no @ mentions and no Discord-style ids (15+ digits).
const clean = (s) => String(s || '').replace(/@/g, '').replace(/\b\d{15,}\b/g, '').replace(/\s+/g, ' ').trim();
const inWindow = (row, now) => (now - Date.parse(row.at)) / DAY <= LEARNER.days;

// { lines, block }. Each line: { id, kind, text, evidence, hidden }. block: the shown lines, in order, at most blockChars.
// `today` is the Nairobi day (YYYY-MM-DD); evidence is read as of noon that day, so one day gives one answer.
export function learnerFile(doc, { today }) {
  const now = Date.parse(`${today}T12:00:00+03:00`);
  const lists = {
    topics: doc.topics || [], subtopics: doc.subtopics || [], teach: doc.teach || [],
    attempts: doc.attempts || [], mocks: doc.mocks || [], paperq: doc.paperq || [],
  };
  const hidden = new Set(doc.learner?.hidden || []);
  const lines = [];
  const add = (line) => lines.push({ ...line, hidden: hidden.has(line.id) });

  // recurring mistake types: 3 or more of one type, checked answers that broke at that step, in the window
  const byType = {};
  for (const a of lists.attempts) if (a.verdict === 'wrong' && KNOWN.has(a.errorType) && inWindow(a, now)) byType[a.errorType] = (byType[a.errorType] || 0) + 1;
  Object.entries(byType).filter(([, n]) => n >= LEARNER.minMistakes).sort((a, b) => b[1] - a[1]).forEach(([type, n]) => add({
    id: `mistake:${type}`, kind: 'mistake', text: `${MISTAKE[type]}: ${n} in the last ${LEARNER.days} days.`, evidence: `${n} checked answers broke on this step.`,
  }));

  // the weakest link: the layer that is the bottleneck in 3 or more topics you have tried and not yet understood
  const bottleneck = {};
  for (const t of lists.topics) {
    const u = understand(t, lists, now);
    if (u.tried && u.status !== 'green') bottleneck[u.bottleneck] = (bottleneck[u.bottleneck] || 0) + 1;
  }
  for (const layer of LAYERS) {
    const n = bottleneck[layer] || 0;
    if (n >= LEARNER.minBottleneck) add({ id: `link:${layer}`, kind: 'link', text: `${CAP[layer]} is the weakest step in ${n} topics.`, evidence: `The bottleneck in ${n} topics you have tried and not yet understood.` });
  }

  // calibration per unit, only when clearly off: your ratings run higher or lower than your results, or they match
  for (const unit of doc.units || []) {
    const topics = lists.topics.filter((t) => t.unit === unit.code);
    const gaps = ratingGaps(topics, lists, now);
    if (!gaps.length) continue;
    const k = calibration(topics, lists, now);
    const bias = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const evidence = `Compared on ${gaps.length} rated sub-topic${gaps.length === 1 ? '' : 's'}.`;
    if (k < LEARNER.kappaLow) add({ id: `calibration:${unit.code}`, kind: 'calibration', text: `Your own ratings run ${bias > 0 ? 'higher' : 'lower'} than your results in ${unit.code}.`, evidence });
    else if (k > LEARNER.kappaHigh) add({ id: `calibration:${unit.code}`, kind: 'calibration', text: `Your own ratings match your results in ${unit.code}.`, evidence });
  }

  // topics that keep breaking: 2 or more breaks at the same sub-topic
  const breaks = {};
  for (const a of lists.attempts) if (a.verdict === 'wrong' && a.subtopicId && inWindow(a, now)) breaks[a.subtopicId] = (breaks[a.subtopicId] || 0) + 1;
  for (const [id, n] of Object.entries(breaks).sort((a, b) => b[1] - a[1])) {
    const sub = lists.subtopics.find((s) => s.id === id);
    if (n < LEARNER.minBreaks || !sub) continue;
    const topic = lists.topics.find((t) => t.id === sub.topicId);
    add({ id: `break:${id}`, kind: 'break', text: `Keeps breaking on ${sub.name}${topic ? ` (${topic.name})` : ''}: ${n} times in the last ${LEARNER.days} days.`, evidence: `${n} checked answers where your working broke at this sub-topic.` });
  }

  // the student's own notes, as they wrote them
  for (const note of (doc.learner?.notes || []).slice(0, LEARNER.notes)) {
    const text = clean(note.text).slice(0, LEARNER.noteChars);
    if (text) add({ id: `note:${note.id}`, kind: 'note', text, evidence: 'Written by you.' });
  }

  let block = '';
  for (const line of lines.filter((l) => !l.hidden)) {
    const next = `${block ? `${block}\n` : ''}- ${line.text}`;
    if (next.length > LEARNER.blockChars) break;
    block = next;
  }
  return { lines: lines.map(({ id, kind, text, evidence, hidden: h }) => ({ id, kind, text, evidence, hidden: h })), block };
}

// The student's edits to their learner file (POST /api/learner), applied to { notes, hidden } and returned as a new
// object. body.action: addNote { text } | deleteNote { id } | hide { id } | show { id } | clear. lineIds: the ids of
// the lines the student can see now (hide and clear work on them). newId() and at make a note's id and time.
// "clear" deletes every note and hides every line shown now: nothing Crux learned is used in prompts afterwards.
// Your practice record is not touched; it is what the lines are made from.
export function editLearner(learner, body = {}, { newId = () => '', at = '', lineIds = [] } = {}) {
  const next = { notes: [...(learner?.notes || [])], hidden: [...(learner?.hidden || [])] };
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const id = String(body.id || '');
  const hide = (x) => { if (!next.hidden.includes(x)) next.hidden.push(x); };
  switch (body.action) {
    case 'addNote': {
      const text = String(body.text || '').trim();
      if (!text) fail('Write the note first.');
      if (text.length > LEARNER.noteChars) fail(`A note can be ${LEARNER.noteChars} characters at most.`);
      if (next.notes.length >= LEARNER.notes) fail(`${LEARNER.notes} notes at most. Delete one first.`);
      next.notes.push({ id: newId(), text, at });
      break;
    }
    case 'deleteNote': {
      if (!next.notes.some((n) => n.id === id)) fail('That note was not found.', 404);
      next.notes = next.notes.filter((n) => n.id !== id);
      next.hidden = next.hidden.filter((h) => h !== `note:${id}`);
      break;
    }
    case 'hide':
      if (!lineIds.includes(id)) fail('That line is not in your file.', 404);
      hide(id);
      break;
    case 'show':
      next.hidden = next.hidden.filter((h) => h !== id);
      break;
    case 'clear':
      next.notes = [];
      for (const x of lineIds) hide(x);
      break;
    default:
      fail('Pick what to change.');
  }
  return next;
}
