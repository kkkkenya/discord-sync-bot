// What the Study Hub bot already knows: unit titles (lib/units.json) and forum threads (lib/threads.json), the KU
// calendar (lib/config.js) and the file library in Supabase (past papers, CATs and notes the uploader posted to
// each unit's forum post).
import { readFileSync } from 'node:fs';
import { CALENDAR, GUILD_ID } from '../../lib/config.js';
import { db, enc } from '../../lib/db.js';
import { catalogue } from './cohort.js';

const lib = (file) => JSON.parse(readFileSync(new URL(`../../lib/${file}`, import.meta.url), 'utf8'));
export const ALL_UNITS = catalogue(lib('units.json'), lib('threads.json'));

export const calendar = CALENDAR;

// The next CAT week (or exams) that hasn't finished yet, as of Nairobi `today` (YYYY-MM-DD).
export function nextAssessment(today) {
  const all = [...CALENDAR.cats, CALENDAR.exams].sort((a, b) => a.start.localeCompare(b.start));
  return all.find((x) => x.end >= today) || null;
}

const link = (f) => `https://discord.com/channels/${GUILD_ID}/${f.channel_id}/${f.message_id}`;

const cache = new Map(); // unit code -> { at, files }
export async function filesFor(code) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return { files: [], note: 'Supabase keys missing in pc/.env' };
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return { files: hit.files };
  const codes = ALL_UNITS.find((u) => u.codes.includes(code))?.codes || [code];
  const rows = await db.select('files', `select=id,name,kind,channel_id,message_id,created_at&unit_code=in.(${codes.map((c) => `"${enc(c)}"`).join(',')})&order=name`);
  // paper: a past paper, CAT or test (by the uploader's kind, or by name for files posted by hand)
  const files = rows.map((f) => ({ id: f.id, name: f.name, kind: f.kind, channel_id: f.channel_id, message_id: f.message_id, url: link(f), paper: f.kind === 'paper' || /(?<![a-z])(cats?|exams?|papers?|tests?|quiz)(?![a-z])/i.test(f.name) }));
  cache.set(code, { at: Date.now(), files });
  return { files };
}
