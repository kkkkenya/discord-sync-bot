// Personal weakspot analysis. Pure functions over plain data (no store import), so they're tested directly.
// Phase 4: sub-topic validation, and mapping teach-back gaps onto sub-topics.
import { AUDIT, SUBTOPIC_KINDS } from './defs.js';

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
