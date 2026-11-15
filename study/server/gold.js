// Gold solutions (fixplan-e E1, ARCHITECTURE.md 4.3). Pure: the check level of a shared worked solution
// ('key' > 'agreed' > 'single'), the rule for when a new solution may replace a stored one, and the run report.
// No store, no AI, no I/O. Answers are compared in code (answer.js), part by part.
import { compareAnswers, parseAnswer } from './answer.js';
import { GOLD } from './defs.js';

export const LEVELS = GOLD.levels;
export const rank = (level) => Math.max(0, LEVELS.indexOf(level));
export const strong = (model) => GOLD.strongModels.includes(model);

// May `incoming` replace `stored`? Never with nothing to show, never with a lower level. At the same level: a strong
// model over a cheap one, or anything once enough students flagged the stored one.
export function shouldReplace(stored, incoming) {
  if (!incoming?.checkpoints?.length && !incoming?.solution) return false;
  if (!stored) return true;
  const a = rank(stored.level || 'single');
  const b = rank(incoming.level || 'single');
  if (b !== a) return b > a;
  if (strong(incoming.model) && !strong(stored.model)) return true;
  return (stored.flagged || 0) >= GOLD.flagsToReplace;
}

// "(a) 12 N (b) 4 m", "175 kNm; 4.3°", ["175 kNm", "4.3°"] → the parts that hold a number.
export function answerParts(answer) {
  const list = Array.isArray(answer) ? answer : String(answer ?? '').split(/;|\n|\s(?=\(?(?:[a-h]|i{1,3}|iv|v)\)\s)/i);
  return list.map((p) => String(p).replace(/^\s*\(?(?:[a-h]|i{1,3}|iv|v)\)\s*/i, '').trim()).filter((p) => parseAnswer(p).value != null);
}

// Do two answers agree? The one with fewer parts is checked: each of its parts must match some part of the other
// (value and unit, 1%). null when either side has no number (a derivation, a definition): nothing to compare.
export function sameAnswer(x, y) {
  const a = answerParts(x);
  const b = answerParts(y);
  if (!a.length || !b.length) return null;
  const [few, many] = a.length <= b.length ? [a, b] : [b, a];
  const hit = (p) => many.some((q) => compareAnswers(p, q).verdict === 'right' || compareAnswers(q, p).verdict === 'right');
  const readable = few.filter((p) => many.some((q) => compareAnswers(p, q).verdict !== 'unreadable'));
  if (!readable.length) return null;
  return readable.every(hit);
}

// The level of one question, from the final answers as text. key: the printed answer (parts or text) or null.
// first: the first solver, blind. told: the first solver again, told the printed answer (only after a miss).
// second: the other model family, blind. When the two disagree there is no referee: the owner looks at it.
// → { level, winner: 'first'|'told', reason, review } (review: the owner should look at it).
export function settle({ key = null, first, told = null, second = null }) {
  const printed = key == null ? [] : answerParts(key);
  if (printed.length) {
    const blind = sameAnswer(first, printed);
    if (blind) return { level: 'key', winner: 'first', reason: 'matches the printed answer', review: false };
    if (told != null && sameAnswer(told, printed)) return { level: 'key', winner: 'told', reason: 'reached the printed answer once told it', review: true };
    if (blind === false) return { level: 'single', winner: 'first', reason: 'does not match the printed answer', review: true };
  }
  if (second == null) return { level: 'single', winner: 'first', reason: 'one solver', review: false };
  const agree = sameAnswer(first, second);
  if (agree == null) return { level: 'single', winner: 'first', reason: 'nothing to compare', review: false };
  if (agree) return { level: 'agreed', winner: 'first', reason: 'two solvers agree', review: false };
  return { level: 'single', winner: 'first', reason: 'the solvers disagree', review: true };
}

// The run's report. results: [{ label, level, reason, review, keyed, firstRight?, secondRight?, error? }].
// Accuracy counts only questions with a printed answer (firstRight / secondRight true or false, blind).
export function report(results) {
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  const acc = { first: { right: 0, of: 0 }, second: { right: 0, of: 0 } };
  const review = [];
  let failed = 0;
  for (const r of results) {
    if (r.error) { failed++; review.push({ label: r.label, reason: r.error }); continue; }
    byLevel[r.level] = (byLevel[r.level] || 0) + 1;
    if (r.review) review.push({ label: r.label, reason: r.reason });
    for (const side of ['first', 'second']) {
      const v = r[`${side}Right`];
      if (v === true || v === false) { acc[side].of++; if (v) acc[side].right++; }
    }
  }
  return { total: results.length, failed, byLevel, accuracy: acc, review };
}
