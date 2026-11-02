// CAT and exam dates out of a pasted message (WhatsApp, an email, a class rep's text), with no AI:
//   "CAT 1 EMM 302 November 16th", "EMM 305 - 18/11", "Monday 16th Nov:\nEMM 302\nEMM 305", "Metrology CAT tomorrow".
// A line's units take that line's date; a line with only a date is a heading for the lines under it. Units are
// found by code (EMM 302, emm302) or by the title of one of your units. Day-first dates (16/11), month names,
// ISO dates, today, tomorrow and weekday names all work; a date without a year is the next one from `today`
// (one more than a month gone is next year's). → [{ code, date, kind, line }], one per unit, earliest upcoming first.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';
const DATE_RES = [
  [new RegExp(`\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`, 'i'), (m) => [+m[1], +m[2], +m[3]]],
  [new RegExp(`\\b${ORD}\\s*(?:of\\s+)?${MONTH}\\.?(?:,?\\s*(\\d{4}))?`, 'i'), (m) => [m[3] && +m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]]],
  [new RegExp(`\\b${MONTH}\\.?\\s*${ORD}(?:,?\\s*(\\d{4}))?`, 'i'), (m) => [m[3] && +m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]]],
  [/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/, (m) => [m[3] && (m[3].length === 2 ? 2000 + +m[3] : +m[3]), +m[2], +m[1]]],
];
const KIND = /\b(cat\s*(?:1|i|one)\b|cat\s*(?:2|ii|two)\b|cat|main\s+exams?|exams?|test|quiz|assignment)/i;
const CODE = /\b([A-Za-z]{3})\s*-?\s*(\d{3})\b/g;

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (day, n) => { const t = new Date(`${day}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

function dateIn(line, today) {
  const low = line.toLowerCase();
  if (/\btoday\b/.test(low)) return today;
  if (/\btomorrow\b/.test(low)) return addDays(today, 1);
  for (const [re, parts] of DATE_RES) {
    const m = line.match(re);
    if (!m) continue;
    const [y, mo, d] = parts(m);
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
    if (y) return iso(y, mo, d);
    const thisYear = iso(+today.slice(0, 4), mo, d);
    return thisYear < addDays(today, -31) ? iso(+today.slice(0, 4) + 1, mo, d) : thisYear;
  }
  const wd = low.match(/\b(?:next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*day\b/);
  if (wd) {
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    let ahead = (DAYS.indexOf(wd[1]) - now + 7) % 7;
    if (/\bnext\s/.test(wd[0]) && ahead < 7) ahead += ahead === 0 ? 7 : 0;
    return addDays(today, ahead);
  }
  return null;
}

const kindOf = (line) => {
  const k = line.match(KIND)?.[1]?.toLowerCase().replace(/\s+/g, ' ');
  if (!k) return '';
  if (/^cat (1|i|one)$/.test(k)) return 'CAT 1';
  if (/^cat (2|ii|two)$/.test(k)) return 'CAT 2';
  if (k === 'cat') return 'CAT';
  return /exam/.test(k) ? 'Exam' : k[0].toUpperCase() + k.slice(1);
};

// units: [{ code, title }] (yours). Codes for units that aren't yours come back too, with mine: false.
export function readDates(text, units, today) {
  const mine = new Map(units.map((u) => [u.code, u]));
  const byTitle = units.filter((u) => (u.title || '').length >= 5).map((u) => [u.title.toLowerCase(), u.code]);
  const found = new Map();
  let heading = null;
  for (const raw of String(text || '').split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const codes = [...line.matchAll(CODE)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
    const low = line.toLowerCase();
    for (const [t, code] of byTitle) if (low.includes(t) && !codes.includes(code)) codes.push(code);
    const date = dateIn(line, today);
    // a line with no unit is a heading: its date and kind ("CAT dates:", "Monday 16th Nov") apply to the lines under it
    if (!codes.length) { if (date) heading = { date, kind: kindOf(line) }; else if (kindOf(line)) heading = { ...heading, kind: kindOf(line) }; continue; }
    const when = date || heading?.date;
    if (!when) continue;
    const kind = kindOf(line) || heading?.kind || '';
    for (const code of codes) {
      const prev = found.get(code);
      const upcoming = (d) => d >= today;
      // one date per unit: the earliest one still to come, else the latest
      if (!prev || (upcoming(when) && (!upcoming(prev.date) || when < prev.date)) || (!upcoming(when) && !upcoming(prev.date) && when > prev.date)) {
        found.set(code, { code, date: when, kind, line, mine: mine.has(code) });
      }
    }
  }
  return [...found.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || a.date.localeCompare(b.date));
}
