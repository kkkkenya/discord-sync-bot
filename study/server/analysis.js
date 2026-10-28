// Personal weakspot analysis. Pure functions over plain data (no store import), so they're tested directly.
// Phase 4: sub-topic validation, and mapping teach-back gaps onto sub-topics. Phase 6: the weakspot matrix.
import { AUDIT, ERROR_TYPES, SUBTOPIC_KINDS, WEAKNESS } from './defs.js';

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'its', 'are', 'was', 'not', 'how', 'why', 'when', 'what', 'which', 'you', 'your', 'their', 'there', 'them', 'they', 'missing', 'wrong', 'should', 'would', 'does', 'did', 'has', 'have', 'had', 'but', 'also', 'only', 'about', 'between', 'explain', 'explanation', 'state', 'stated', 'mention', 'mentioned', 'use', 'used', 'using']);
// Crude plural folding, enough to match 'stresses' with 'stress' and 'conventions' with 'convention'.
const stem = (w) => w.replace(/sses$/, 'ss').replace(/ies$/, 'y').replace(/(?<=[a-z]{3}[^su])s$/, '');
export const words = (s) => (String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);

// Best sub-topic for each teach-back gap: the one whose name words appear most in the gap. It needs at least half
// of its words and at least two of them (or its only word), so 'units of stress' doesn't flag 'principal
// stresses'; a missed flag is cheaper than a false weakspot. { matched: [{ gap, id }], unmatched: [gap] }.
export function matchGaps(gaps, subtopics) {
  const subs = subtopics.map((s) => ({ id: s.id, w: [...new Set(words(s.name))] })).filter((s) => s.w.length);
  const matched = [];
  const unmatched = [];
  for (const gap of gaps || []) {
    const g = new Set(words(gap));
    let best = null;
    for (const s of subs) {
      const hits = s.w.filter((w) => g.has(w)).length;
      const share = hits / s.w.length;
      if (share >= 0.5 && hits >= Math.min(2, s.w.length) && (!best || share > best.share)) best = { id: s.id, share };
    }
    if (best) matched.push({ gap, id: best.id });
    else unmatched.push(gap);
  }
  return { matched, unmatched };
}

// A teach-back gap makes a solid or untested sub-topic shaky (never softens a stuck one). Mutates the sub-topics
// it touches and returns their ids.
export function applyTeachGaps(subtopics, gaps, at = new Date().toISOString()) {
  const { matched, unmatched } = matchGaps(gaps, subtopics);
  const flagged = [];
  for (const { id } of matched) {
    const s = subtopics.find((x) => x.id === id);
    if (!s || flagged.includes(id)) continue;
    if (s.audit !== 'stuck') Object.assign(s, { audit: 'shaky', auditAt: at, auditFrom: 'teach' });
    s.lastTested = at;
    flagged.push(id);
  }
  return { flagged, unmatched };
}

// Clean a sub-topic from the dashboard. Throws a 400-style error on bad values; fills defaults on create.
export function checkSubtopic(body, { create = false } = {}) {
  const out = { ...body };
  const bad = (m) => { throw Object.assign(new Error(m), { status: 400 }); };
  if (create || 'name' in out) { out.name = String(out.name || '').trim(); if (!out.name) bad('a sub-topic needs a name'); }
  if ('audit' in out && !AUDIT.includes(out.audit)) bad(`audit must be one of ${AUDIT.join(', ')}`);
  if ('kind' in out && !SUBTOPIC_KINDS.includes(out.kind)) bad(`kind must be one of ${SUBTOPIC_KINDS.join(', ')}`);
  if (create) { out.audit ||= 'untested'; out.kind ||= 'concept'; out.mistakeCount ||= 0; }
  return out;
}

// ---- Phase 6: weakness, the weakspot matrix, recurring errors ----

const DAY = 86400000;
const ago = (at, now) => (now - new Date(at).getTime()) / DAY;

// Checkpoint attempts on one sub-topic within `days`: { failures, solves, errors: { type: n } }. An attempt is a
// failure when the student marked where it broke (verdict 'wrong'), a clean solve when it was right.
export function attemptsOn(subId, attempts, now, days = WEAKNESS.windowDays) {
  const mine = attempts.filter((a) => a.subtopicId === subId && ago(a.at, now) <= days);
  const errors = {};
  for (const a of mine) if (a.verdict === 'wrong' && a.errorType) errors[a.errorType] = (errors[a.errorType] || 0) + 1;
  return { failures: mine.filter((a) => a.verdict === 'wrong').length, solves: mine.filter((a) => a.verdict === 'right').length, errors };
}

// 0-1: the self-audit's base, +0.1 per checkpoint failure and -0.1 per clean solve in the last 14 days.
export function weakness(sub, attempts = [], now = Date.now()) {
  const { failures, solves } = attemptsOn(sub.id, attempts, now);
  const base = WEAKNESS[sub.audit] ?? WEAKNESS.untested;
  return Math.round(Math.max(0, Math.min(1, base + failures * WEAKNESS.perFailure + solves * WEAKNESS.perSolve)) * 100) / 100;
}

const NEXT_FOR_ERROR = {
  'concept-gap': 'Teach it back, then work one example from first principles',
  'wrong-equation': 'Write when each equation applies (and when it doesn\'t), then redo one question',
  'sign-convention': 'Write the sign convention down first, then redo one question',
  units: 'Redo one question tracking every unit (mm→m, kN→N, MPa→Pa)',
  'algebra-calculus': 'Redo the working slowly, checking each line before the next',
  'boundary-condition': 'List the boundary conditions before you solve, then redo one question',
  'misread-question': 'Underline what is given and what is asked, then redo it',
};
const label = (id) => ERROR_TYPES.find((e) => e.id === id)?.label.toLowerCase() || id;

// The weakspot matrix for one unit. `ranked` is predictions() for the unit (exam weight per topic).
// critical: up to 10 sub-topics by priority = exam weight × weakness, each with why and one next step. weaknessOf
// (sub → 0..1) replaces the audit-based weakness; the app passes 1 - the sub-topic's understanding floor (understanding.js).
// errors: error-type counts over the last 30 days with a one-line takeaway.
export function weakspotReport({ topics, subtopics, attempts = [], ranked = [], now = Date.now(), limit = 10, weaknessOf = null }) {
  const weightOf = new Map(ranked.map((r) => [r.topicId, r]));
  const rows = [];
  for (const sub of subtopics) {
    const topic = topics.find((t) => t.id === sub.topicId);
    if (!topic) continue;
    const pred = weightOf.get(topic.id);
    const w = weaknessOf ? Math.round(weaknessOf(sub) * 100) / 100 : weakness(sub, attempts, now);
    const on = attemptsOn(sub.id, attempts, now);
    if (sub.audit === 'solid' && !on.failures) continue;
    if (pred?.muted && pred.weight === 0) continue;
    const examWeight = pred?.weight ?? 1;
    const topError = Object.entries(on.errors).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const reason = [
      sub.audit === 'untested' ? 'not rated yet' : sub.audit,
      on.failures ? `${on.failures} broken checkpoint${on.failures === 1 ? '' : 's'} in 14 days${topError ? ` (mostly ${label(topError)})` : ''}` : null,
      pred?.pinned ? 'pinned by the lecturer' : null,
      pred?.questions ? pred.evidence : null,
    ].filter(Boolean).join(' · ');
    const next = topError ? NEXT_FOR_ERROR[topError]
      : sub.audit === 'stuck' ? 'Work one example step by step, then teach it back'
        : sub.audit === 'shaky' ? 'Solve 2 timed exam questions on it'
          : 'Rate it in the self-audit, or try one exam question on it';
    const action = topError === 'concept-gap' || sub.audit === 'stuck' ? 'teach' : sub.audit === 'untested' && !topError ? 'audit' : 'practice';
    rows.push({ subtopicId: sub.id, name: sub.name, topicId: topic.id, topic: topic.name, unit: sub.unit, audit: sub.audit, weakness: w, weight: examWeight, priority: Math.round(examWeight * w * 10) / 10, failures: on.failures, topError, reason, next, action, pinned: Boolean(pred?.pinned) });
  }
  rows.sort((a, b) => b.priority - a.priority || b.weakness - a.weakness || a.name.localeCompare(b.name));

  const subIds = new Set(subtopics.map((s) => s.id));
  const recent = attempts.filter((a) => a.verdict === 'wrong' && a.errorType && (subIds.has(a.subtopicId) || !a.subtopicId) && ago(a.at, now) <= 30);
  const counts = ERROR_TYPES.map((e) => ({ id: e.id, label: e.label, n: recent.filter((a) => a.errorType === e.id).length })).filter((e) => e.n).sort((a, b) => b.n - a.n);
  let takeaway = '';
  if (recent.length >= 3 && counts.length) {
    const [a, b] = counts;
    const both = b && a.n + b.n > recent.length / 2 && b.n > 1;
    takeaway = both
      ? `${a.n + b.n} of your last ${recent.length} errors were ${label(a.id)} and ${label(b.id)}, not formula recall.`
      : `${a.n} of your last ${recent.length} errors were ${label(a.id)}.`;
  }
  return { critical: rows.slice(0, limit), errors: { total: recent.length, counts, takeaway } };
}
