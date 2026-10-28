// Checkpoint feedback (Phase 8): check a final answer against a key, show numbered checkpoints, and record where
// the student's working broke. Store-aware glue; the number and unit maths is pure, in answer.js.
//
// An attempt's verdict: 'right' (matched the key: a clean solve), 'mismatch' (didn't match, nothing blamed yet),
// 'wrong' (the student marked the checkpoint where their paper diverged: the only thing that counts as a weakspot
// failure) or 'disputed' (the student says the checkpoints are wrong: nothing is held against them).
import { compareAnswers } from './answer.js';
import { aiReady } from './ai.js';
import { solveWithCheckpoints } from './brain.js';
import { ERROR_TYPES } from './defs.js';
import { library } from './ingest.js';
import { paperInfo } from './predict.js';
import { add, data, patch, save } from './store.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const SCHEME_WORDS = /mark(?:ing)?[\s_-]*scheme|solutions?|memo|answers?/i;
const ERROR_IDS = ERROR_TYPES.map((e) => e.id);
export const KEY_LABEL = { you: 'your answer key', scheme: 'from the marking scheme', ai: 'AI-solved: verify' };

// Marking-scheme text for a past-paper question: the paper's own file when it says it is a solution, else a library
// file of the unit whose name says scheme/solution and that matches the paper's year and type. { name, text } | null.
export function schemeFor(row, files = library.files) {
  if (!row?.fileId) return null;
  const entries = Object.entries(files).filter(([, e]) => e.unit === row.unit && e.text);
  const own = files[row.fileId];
  if (own?.text && SCHEME_WORDS.test(own.text.slice(0, 400))) return { name: own.name, text: own.text.slice(0, 12000) };
  const hit = entries.find(([id, e]) => id !== row.fileId && SCHEME_WORDS.test(e.name)
    && (!row.year || paperInfo(e.name).year === row.year) && paperInfo(e.name).type === row.type);
  return hit ? { name: hit[1].name, text: hit[1].text.slice(0, 12000) } : null;
}

// The AI's checkpoints, cleaned: at most 6, sub-topic names turned into ids, unknown error types dropped.
function tidy(checkpoints, subs, fallbackSub) {
  return (checkpoints || []).slice(0, 6).map((c, i) => {
    const sub = subs.find((s) => s.name.trim().toLowerCase() === String(c.subtopic || '').trim().toLowerCase());
    return {
      n: i + 1, step: String(c.step || '').trim(), equation: String(c.equation || '').trim(), value: String(c.value || '').trim(),
      subtopicId: sub?.id || fallbackSub || null, errorType: ERROR_IDS.includes(c.errorType) ? c.errorType : null,
    };
  }).filter((c) => c.step || c.equation);
}

// body: { unit, questionId? | question?, topicId?, answer, operations?, key? }.
// Where the key comes from, in order: a key you typed, a saved one, the marking scheme (read by the AI), an AI solve.
// Returns { needKey, message } when there is no key and the AI can't make one.
export async function checkAnswer(body, { solve = solveWithCheckpoints, ready = aiReady } = {}) {
  const unit = data.units.find((u) => u.code === body.unit);
  if (!unit) throw bad('Pick one of your units first.');
  const row = body.questionId ? data.paperq.find((x) => x.id === body.questionId && x.unit === unit.code) : null;
  const question = String(row?.text || body.question || '').trim();
  if (question.length < 10) throw bad('Pick a past-paper question, or paste the question text.');
  const answer = String(body.answer || '').trim();
  if (!answer) throw bad('Enter your final answer first, for example 142.5 MPa.');
  const topic = data.topics.find((t) => t.unit === unit.code && t.id === (body.topicId || row?.topicId)) || null;
  const subs = data.subtopics.filter((s) => s.unit === unit.code && (!topic || s.topicId === topic.id));
  const fallbackSub = row?.subtopicIds?.[0] || null;
  const ask = (extra) => solve({ unit: unit.code, topic: topic?.name || '', question, subtopics: subs.map((s) => s.name), ...extra });

  // 1. the key
  let key = row?.key || null;
  const typed = String(body.key || '').trim();
  if (typed && typed !== key?.answer) key = { answer: typed, source: 'you', checkpoints: [] };
  let solved = null;
  if (!key) {
    if (!ready()) return { needKey: true, message: 'There is no answer key for this question and no AI key. Type the answer from your marking scheme or textbook, or take the question to the Prompt Builder.' };
    const scheme = schemeFor(row);
    try { solved = await ask({ scheme: scheme?.text || '' }); } catch (e) {
      return { needKey: true, message: `The AI couldn't solve this one (${e.message}). Type the answer from your marking scheme or textbook, or take the question to the Prompt Builder.` };
    }
    key = { answer: String(solved.answer || '').trim(), source: scheme ? 'scheme' : 'ai', schemeFile: scheme?.name || null, checkpoints: tidy(solved.checkpoints, subs, fallbackSub) };
  }

  // 2. compare
  const cmp = compareAnswers(answer, key.answer);
  if (cmp.verdict === 'unreadable') return { verdict: 'unreadable', note: cmp.note, key: { answer: key.answer, source: key.source, label: KEY_LABEL[key.source] } };

  // 3. the checkpoints: written now when the answer is wrong (a right one gets them on request, see ensureCheckpoints)
  let checkpointNote = '';
  if (!key.checkpoints?.length && cmp.verdict === 'wrong' && ready()) {
    try {
      const out = await ask({ expected: key.answer });
      key.checkpoints = tidy(out.checkpoints, subs, fallbackSub);
    } catch (e) { checkpointNote = `Couldn't write the checkpoints (${e.message}). Take it to the Prompt Builder for a full solution.`; }
  }
  if (row) { row.key = key; save(); }

  const right = cmp.verdict === 'right';
  const attempt = add('attempts', {
    unit: unit.code, questionId: row?.id || null, topicId: topic?.id || null, subtopicId: right ? fallbackSub : null,
    answer, operations: String(body.operations || '').trim().slice(0, 500), verdict: right ? 'right' : 'mismatch',
    keySource: key.source, keyAnswer: key.answer, checkpoints: key.checkpoints || [], brokeAt: null, errorType: null,
    ...(!row && { question: question.slice(0, 1500) }),
  });
  return {
    attempt, verdict: cmp.verdict, reason: cmp.reason, note: cmp.note || '', assumedUnit: Boolean(cmp.assumed),
    key: { answer: key.answer, source: key.source, label: KEY_LABEL[key.source], schemeFile: key.schemeFile || null },
    checkpoints: key.checkpoints || [], checkpointNote,
    // the best guess to pre-fill "Broke here": the number checks say units/sign, else the checkpoint's own tag
    guess: { errorType: cmp.errorType || null, subtopicId: fallbackSub },
    subtopics: subs.map((s) => ({ id: s.id, name: s.name })),
  };
}

// "Show checkpoints" on an attempt that has none (a right answer): writes them for the key, once. { checkpoints, note }.
export async function ensureCheckpoints({ id }, { solve = solveWithCheckpoints, ready = aiReady } = {}) {
  const a = data.attempts.find((x) => x.id === id);
  if (!a) throw bad('That attempt was not found.', 404);
  if (a.checkpoints?.length) return { checkpoints: a.checkpoints, note: '' };
  const row = data.paperq.find((q) => q.id === a.questionId);
  const question = row?.text || a.question;
  if (!ready() || !question) return { checkpoints: [], note: 'The checkpoints need the built-in AI. Take the question to the Prompt Builder for a full step-by-step solution.' };
  const topic = data.topics.find((t) => t.id === a.topicId);
  const subs = data.subtopics.filter((s) => s.unit === a.unit && (!topic || s.topicId === topic.id));
  try {
    const out = await solve({ unit: a.unit, topic: topic?.name || '', question, subtopics: subs.map((s) => s.name), expected: a.keyAnswer });
    const checkpoints = tidy(out.checkpoints, subs, row?.subtopicIds?.[0]);
    if (row?.key) row.key.checkpoints = checkpoints;
    patch('attempts', id, { checkpoints });
    return { checkpoints, note: '' };
  } catch (e) { return { checkpoints: [], note: `Couldn't write the checkpoints (${e.message}). Take it to the Prompt Builder for a full solution.` }; }
}

// "Broke here": the student found the checkpoint where their paper diverged. This is the only thing that counts as a
// failure against a sub-topic. Re-marking replaces the earlier mark.
export function markBroke({ id, step, subtopicId = null, errorType }) {
  const a = data.attempts.find((x) => x.id === id);
  if (!a) throw bad('That attempt was not found.', 404);
  if (a.verdict === 'right') throw bad('That answer matched the key, so there is no broken step.');
  if (!Number.isInteger(step) || step < 1 || step > (a.checkpoints?.length || 0)) throw bad('Pick one of the numbered checkpoints.');
  if (!ERROR_IDS.includes(errorType)) throw bad('Pick what kind of mistake it was.');
  const sub = subtopicId ? data.subtopics.find((s) => s.id === subtopicId && s.unit === a.unit) : null;
  if (subtopicId && !sub) throw bad('That sub-topic is not one of this unit\'s.');
  const prev = a.verdict === 'wrong' && a.subtopicId ? data.subtopics.find((s) => s.id === a.subtopicId) : null;
  if (prev) prev.mistakeCount = Math.max(0, (prev.mistakeCount || 0) - 1);
  if (sub) { sub.mistakeCount = (sub.mistakeCount || 0) + 1; sub.lastTested = new Date().toISOString(); }
  delete a.flag;
  return patch('attempts', id, { verdict: 'wrong', brokeAt: step, errorType, subtopicId: sub?.id || null, markedAt: new Date().toISOString() });
}

// "This checkpoint looks wrong": saves the flag and holds nothing against the student. The key or the AI may be the
// one that is wrong. Only an attempt that hasn't been marked broken can be flagged.
export function flagCheckpoint({ id, step = null, note = '' }) {
  const a = data.attempts.find((x) => x.id === id);
  if (!a) throw bad('That attempt was not found.', 404);
  if (a.verdict === 'right') throw bad('That answer matched the key, so there is nothing to dispute.');
  if (a.verdict === 'wrong') throw bad('You already marked a broken step. Change that mark instead.');
  // an AI or scheme key may be the wrong thing: forget it so the next try solves again (a key you typed stays)
  const row = data.paperq.find((q) => q.id === a.questionId);
  if (row?.key && row.key.source !== 'you') { delete row.key; save(); }
  return patch('attempts', id, { verdict: 'disputed', flag: { step, note: String(note).trim().slice(0, 300), at: new Date().toISOString() } });
}
