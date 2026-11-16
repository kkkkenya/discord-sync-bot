// Marking schemes (2026-11-16): a unit's marking schemes from the hub, each beside the paper it marks, and the
// papers that have none yet. Students who found a paper usually want only its marking scheme, not a lesson.
// Crux web (UnitSchemes.jsx) and Crux Harness (components/crux-schemes.tsx) show the same list.
import { isScheme, paperInfo } from './predict.js';
import { samePaper } from './weakspots.js';

const stem = (name) => String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').trim();

// files: the unit's hub files [{ id, name, paper }]. → { schemes: [{ id, name, paper }], missing: [{ id, name }] }
// paper is the name of the paper the scheme marks, or null when Crux can't tell. Newest first.
export function schemeList(files) {
  const all = (files || []).filter((f) => f && f.name);
  const schemes = all.filter((f) => isScheme(f.name));
  const papers = all.filter((f) => f.paper && !isScheme(f.name));
  const year = (n) => paperInfo(n).year || 0;
  const byNewest = (a, b) => year(b.name) - year(a.name) || stem(a.name).localeCompare(stem(b.name));
  const marked = new Set();
  const listed = schemes.map((s) => {
    const p = papers.find((x) => samePaper(x.name, s.name) && paperInfo(s.name).type);
    if (p) marked.add(p.id);
    return { id: String(s.id), name: s.name, paper: p ? p.name : null };
  }).sort(byNewest);
  const missing = papers.filter((p) => !marked.has(p.id)).sort(byNewest).map((p) => ({ id: String(p.id), name: p.name }));
  return { schemes: listed, missing };
}

// A file opened without using a daily download: named a marking scheme (not just "memo") and not book-sized.
export const FREE_SCHEME_BYTES = 15 * 1024 * 1024;
export const freeScheme = (file) => /mark(?:ing)?[\s_-]*schemes?/i.test(String(file?.name || ''))
  && !(Number(file?.size) > FREE_SCHEME_BYTES);

// Discord markdown and mentions taken out of names that go into the owner's DM.
const plain = (s, n) => String(s || '').replace(/[*_~`|>@#<]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// The owner's DM when a student asks for a scheme. Plain, one line.
export const askText = (unit, paper, who) => `Marking scheme asked for: **${plain(unit, 20)}** · ${plain(stem(paper), 160)} (by ${plain(who, 60) || 'a student'}).`;

// Asked once per student, paper and day on this server instance (the daily cap is LIMITS.ask, in the database).
const asked = new Map();
export function firstAsk(userId, unit, paperId, day) {
  const key = `${userId}|${unit}|${paperId}|${day}`;
  if (asked.has(key)) return false;
  if (asked.size > 5000) asked.clear();
  asked.set(key, true);
  return true;
}
