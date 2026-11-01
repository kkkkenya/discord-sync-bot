// The bell's "new material": hub files the uploader posted to your units since you last looked. One indexed query
// on the bot's files table, and the app asks at most every 15 minutes (and when you come back to it), so the bell
// costs nothing while you study.
import { db, enc } from '../../lib/db.js';
import { remote } from './ingest.js';

const WINDOW = 30 * 864e5; // never look back more than 30 days

export async function newMaterial(codes, since, now = Date.now()) {
  const t = Date.parse(since);
  if (!Number.isFinite(t) || !remote()) return { files: [], announcements: [] };
  const from = new Date(Math.max(t, now - WINDOW)).toISOString();
  const [rows, announcements] = await Promise.all([
    codes.length ? db.select('files', `select=unit_code,name,created_at&unit_code=in.(${codes.map((c) => `"${enc(c)}"`).join(',')})&created_at=gt.${enc(from)}&order=created_at.desc&limit=50`) : [],
    // Hub announcements from /announce; a missing table (SQL not run yet) just means none
    db.select('crux_announcements', `select=id,body,created_at&created_at=gt.${enc(from)}&order=created_at.desc&limit=5`).catch(() => []),
  ]);
  return { files: group(rows), announcements };
}

// rows (newest first) -> one entry per unit: { unit, count, latest, names (up to 3) }
export function group(rows) {
  const byUnit = new Map();
  for (const r of rows) {
    const u = byUnit.get(r.unit_code) || { unit: r.unit_code, count: 0, latest: r.created_at, names: [] };
    u.count += 1;
    if (u.names.length < 3) u.names.push(r.name);
    byUnit.set(r.unit_code, u);
  }
  return [...byUnit.values()];
}
