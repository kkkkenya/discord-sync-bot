// A book's numbered section headings ("3.4 Shear Stress") and the PDF page each starts on, read from every page when
// the file is read, so "read this topic" opens where the section is, not where the contents list mentions it.
// Pure. A section is [page, number, title].
import { words } from './analysis.js';

const HEAD = /(?<![\w.])([1-9]\d?(?:\.\d{1,2}){1,3})\.?\s+([A-Z(][^\s]*(?:\s+[^\s]+){0,11})/g;
const NOT_HEAD = /\b(?:fig(?:ure)?s?|tables?|examples?|eqs?|equations?|problems?|exercises?|sections?|chapters?|see|and|in|of|from|to|=|×)\.?\s*$/i;
const SMALL = new Set(['of', 'or', 'and', 'the', 'in', 'on', 'to', 'a', 'an', 'for', 'with', 'by', 'at', 'from', 'due', 'under', 'between', 'vs']);

// The heading's own words: capitalised words (and small joining words) until the sentence starts.
function titleOf(rest) {
  const out = [];
  let paren = 0;
  const caps = (w) => /^[^a-z]*[A-Z]{2}[^a-z]*$/.test(w);
  const shouting = caps(rest.split(/\s+/)[0] || ''); // "1.2 NORMAL STRESS AND STRAIN Consider…": the heading is the capitals
  for (const w of rest.split(/\s+/)) {
    const bare = w.replace(/^[("']+|[)"',:;.]+$/g, '');
    if (!bare) break;
    if (shouting && !caps(bare) && !/^[A-Z]$/.test(bare)) break;
    const ok = paren > 0 || /^[A-Z]/.test(bare) || SMALL.has(bare.toLowerCase()) || /^[A-Z]?[a-z]*-[A-Z]/.test(bare);
    if (!ok || /^\d/.test(bare)) break;
    out.push(w);
    paren += (w.match(/\(/g) || []).length - (w.match(/\)/g) || []).length;
    if (/[.:;]$/.test(w) && paren <= 0) break;
  }
  while (out.length && (SMALL.has(out.at(-1).toLowerCase()) || /^[A-Z]$/.test(out.at(-1)))) out.pop(); // "… Stress A shear stress"
  return out.join(' ').replace(/[.:;,]$/, '');
}

// A contents or index page: headings followed by page numbers, or mostly numbers.
export function isListing(text) {
  const t = String(text || '');
  const listed = (t.match(/(?<![\w.])\d{1,2}(?:\.\d{1,2}){1,3}\s+[A-Z][^\d]{2,90}?\s\d{1,4}(?=\s|$)/g) || []).length;
  if (listed >= 4) return true;
  if (/\b(?:CONTENTS|Contents|INDEX|Index)\b/.test(t.slice(0, 120)) && listed >= 2) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  return tokens.length > 60 && tokens.filter((x) => /^\d{1,4}[,–-]?$/.test(x)).length / tokens.length > 0.22; // an index
}

// The headings on one page (page: 1-based PDF page).
export function headingsOf(text, page) {
  if (isListing(text)) return [];
  const out = [];
  for (const m of String(text || '').matchAll(HEAD)) {
    if (NOT_HEAD.test(text.slice(Math.max(0, m.index - 14), m.index))) continue;
    const title = titleOf(m[2]);
    if (title.split(/\s+/).length < 2 || title.length < 6 || !/[a-z]{3}|[A-Z]{4}/.test(title)) continue;
    out.push([page, m[1], title.slice(0, 90)]);
  }
  return out;
}

// Each section once, at the first page it's a real heading on, in book order.
export function sectionsOf(pages) {
  const seen = new Set();
  const out = [];
  pages.forEach((text, i) => {
    for (const h of headingsOf(text, i + 1)) {
      const k = `${h[1]}|${h[2].toLowerCase()}`;
      if (!seen.has(k)) { seen.add(k); out.push(h); }
    }
  });
  return out;
}

// words that match, allowing endings: "shear" and "shearing", "beam" and "beams"
const near = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
const sharedWords = (list, want) => list.filter((w) => [...want].some((x) => near(w, x)));

// The page to open for a place a guide names ("Ch. 3, §3.4-3.6, pp. 112-121") or a topic's name: the section whose
// number the place names, else the one whose title shares the most words. null when nothing fits.
export function pageFor(sections, place, name = '') {
  if (!sections?.length) return null;
  const nums = [...String(place || '').matchAll(/(?<![\d.])(\d{1,2}(?:\.\d{1,2}){1,3})(?![\d])/g)].map((m) => m[1]);
  const want = new Set(words(`${name} ${String(place || '').replace(/\b(?:ch|chap|chapter|pp?|pages?|sec|section)\b\.?/gi, ' ')}`));
  let best = null;
  for (const [page, n, title] of sections) {
    const shared = sharedWords(words(title), want).length;
    const score = (nums.includes(n) ? 10 : 0) + shared * 2 - (n.split('.').length - 2) * 0.1; // a section before its sub-sections
    if ((nums.includes(n) || shared >= Math.min(2, want.size)) && (!best || score > best.score)) best = { page, score };
  }
  return best?.page ?? null;
}

// The sections a topic covers, from their titles: [{ from, to, title }], best first. `to` is the page before the
// next section starts.
export function sectionsAbout(sections, topicWords, ownWords) {
  const out = [];
  sections.forEach(([page, n, title], i) => {
    const found = new Set(sharedWords(words(title), topicWords));
    const own = sharedWords([...found], ownWords).length;
    if (!found.size || (!own && found.size < 2)) return;
    const next = sections.slice(i + 1).find((s) => s[0] > page || s[1].split('.').length <= n.split('.').length);
    out.push({ from: page, to: Math.max(page, (next?.[0] ?? page + 1) - (next?.[0] > page ? 1 : 0)), title: `${n} ${title}`, score: found.size * 2 + own });
  });
  return out.sort((a, b) => b.score - a.score || a.from - b.from);
}
