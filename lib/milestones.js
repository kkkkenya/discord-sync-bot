// Study Hub Milestones: a 12-month cycle where members log what they did each day (/log) and tick off
// milestones (/milestone). Shared by lib/commands.js, lib/daily.js (Sunday recap) and api/board.js (public board).
import { isoDay } from './discord.js';

export const CYCLE = { start: '2026-10-19', days: 365, checkpoint: '2027-04-19' };

export const TRACKS = [
  { id: 'ai', name: 'AI coding' },
  { id: 'sw', name: 'Software' },
  { id: 'eng', name: 'MATLAB & CAD' },
  { id: 'iot', name: 'IoT' },
  { id: 'biz', name: 'Clients & business' },
  { id: 'cn', name: 'Chinese 中文' },
  { id: 'other', name: 'My field' },
];
export const TRACK = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

// [id, title, target month]
export const MILESTONES = {
  ai: [['ai1', 'Claude Code 101 certificate', 'Nov'], ['ai2', 'Claude Code in Action certificate', 'Nov'], ['ai3', 'CLAUDE.md and tests in one real repo', 'Dec'], ['ai4', 'Agent skills and subagents certificates', 'Jan'], ['ai5', 'Building with the Claude API certificate', 'Feb'], ['ai6', 'Ship an AI tool someone actually uses', 'Apr']],
  sw: [['sw1', 'Learn Git Branching finished', 'Oct'], ['sw2', 'CS50x weeks 0 to 5', 'Dec'], ['sw3', 'CS50x certificate', 'Mar'], ['sw4', 'Full Stack Open parts 0 to 5', 'May'], ['sw5', 'freeCodeCamp JavaScript certification', 'Jul'], ['sw6', 'Portfolio site live', 'Aug']],
  eng: [['e1', 'MATLAB Onramp certificate', 'Nov'], ['e2', 'Simulink Onramp certificate', 'Dec'], ['e3', 'Machine Learning Onramp certificate', 'Jan'], ['e4', 'First CAD part and assembly', 'Feb'], ['e5', 'CSWA exam passed', 'Jun'], ['e6', 'A PCB designed in KiCad', 'Sep']],
  iot: [['i1', 'Cisco Introduction to IoT badge', 'Nov'], ['i2', 'ESP32 sensor running in Wokwi', 'Nov'], ['i3', 'Real board sending data over MQTT', 'Jan'], ['i4', 'Dashboard with alerts', 'Mar'], ['i5', 'Prototype tested in the field', 'Jun'], ['i6', 'Enclosure or PCB version', 'Sep']],
  biz: [['b1', 'HubSpot Inbound Sales certificate', 'Dec'], ['b2', '3 case studies written', 'Jan'], ['b3', '50 warm outreach messages sent', 'Mar'], ['b4', 'First paid client', 'Apr'], ['b5', 'First monthly retainer', 'Jul'], ['b6', '5 written testimonials', 'Oct']],
  cn: [['c1', 'Pinyin and the 4 tones', 'Nov'], ['c2', 'HSK 1 word list (150 words)', 'Jan'], ['c3', 'Introduce yourself for 2 minutes', 'Feb'], ['c4', 'HSK 2 word list (300 words)', 'Apr'], ['c5', '10-minute conversation with a speaker', 'Jul'], ['c6', 'HSK 3 word list (600 words)', 'Sep'], ['c7', 'Sit an HSK exam', 'Oct']],
};
export const MS = {};
for (const [track, list] of Object.entries(MILESTONES)) for (const [id, title, by] of list) MS[id] = { id, title, by, track };

// ── Nairobi dates as YYYY-MM-DD strings ──
const DAY = 24 * 3600 * 1000;
export const today = () => isoDay(new Date());
export const addDays = (s, n) => isoDay(new Date(Date.parse(`${s}T12:00:00+03:00`) + n * DAY));
export const diffDays = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
export const dayNum = (s) => diffDays(CYCLE.start, s) + 1;
export const dayLabel = (s) => { const n = dayNum(s); return n < 1 ? 'Warm-up' : n > CYCLE.days ? 'After the cycle' : `Day ${n}`; };

// days: Set of YYYY-MM-DD the member logged. A streak survives until the end of the day after the last log.
export function streakOf(days, now = today()) {
  let d = days.has(now) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
export const daysWithin = (days, span, now = today()) => [...days].filter((d) => { const g = diffDays(d, now); return g >= 0 && g < span; }).length;
export const hours = (mins) => { const h = mins / 60; return h >= 100 ? Math.round(h) : Math.round(h * 10) / 10; };

// logs: [{user_id, day, minutes}] → Map user_id → {days:Set, mins, minsByDay:Map}
export function summarise(logs) {
  const by = new Map();
  for (const l of logs) {
    const s = by.get(l.user_id) || { days: new Set(), mins: 0, minsByDay: new Map() };
    s.days.add(l.day);
    s.mins += l.minutes || 0;
    s.minsByDay.set(l.day, (s.minsByDay.get(l.day) || 0) + (l.minutes || 0));
    by.set(l.user_id, s);
  }
  return by;
}
