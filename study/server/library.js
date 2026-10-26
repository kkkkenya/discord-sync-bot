// What the Study Hub bot already knows: unit titles (lib/units.json), the KU calendar (lib/config.js) and the
// file library in Supabase (past papers, CATs and notes the uploader posted to each unit's forum post).
import { readFileSync } from 'node:fs';
import { CALENDAR, GUILD_ID } from '../../lib/config.js';
import { db, enc } from '../../lib/db.js';

export const ALL_UNITS = JSON.parse(readFileSync(new URL('../../lib/units.json', import.meta.url), 'utf8'))
  .map((u) => ({ code: u.codes[0], codes: u.codes, title: u.title }));

// Mechanical, 3rd year: the EMM/ECU 3xx units, plus EAR 307 (it sits in mech-year-3 on the server).
export const YEAR3_MECH = ALL_UNITS.filter((u) => u.codes.some((c) => /^(EMM|ECU) 3\d\d$/.test(c) || c === 'EAR 307'));

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
  const files = rows.map((f) => ({ id: f.id, name: f.name, kind: f.kind, url: link(f) }));
  cache.set(code, { at: Date.now(), files });
  return { files };
}
