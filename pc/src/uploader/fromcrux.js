// Files students add in Crux (study/server/hub-uploads.js) come into Drop and are sorted like any other:
//   Drop\From Crux\<unit> <first file of the batch> (from <student>)\<file>
// The unit code in the folder name places it; photos sent together become one PDF (dropconvert.js); the post says who
// shared it (index.js reads "(from …)"). The stored copy is deleted once it's on this PC. Every 2 minutes.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { db, enc } from '../../../lib/db.js';
import { dm } from '../../../lib/discord.js';
import { REWARD, creditsQuery, earned } from '../../../lib/rewards.js';
import { save, state } from '../state.js';

const BUCKET = 'crux-uploads';
const clean = (s, n) => String(s || '').replace(/[\\/:*?"<>|()]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const stem = (name) => clean(String(name).slice(0, String(name).length - extname(String(name)).length), 50);

// the batch's folder: the same for every file in it, whichever poll it arrives in
export const batchFolder = (row, first) => `${row.unit_code} ${stem(first || row.name)} (from ${clean(row.user_name, 40) || 'a student'})`;

function storage(method, path) {
  return fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(enc).join('/')}`, {
    method, headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  });
}

let quietUntil = 0; // the table isn't there yet (supabase/crux.sql not run): ask again in half an hour
export async function collectFromCrux(dumper, log = console.log) {
  if (Date.now() < quietUntil || !process.env.SUPABASE_URL || !existsSync(dumper.drop)) return 0;
  let rows;
  try { rows = await db.select('crux_uploads', 'status=eq.new&order=id.asc&limit=25&select=*'); } catch (e) {
    quietUntil = Date.now() + 30 * 60e3;
    console.error(`files from Crux: ${e.message} (is crux_uploads made? supabase/crux.sql)`);
    return 0;
  }
  const firsts = new Map();
  for (const r of rows) {
    try {
      if (!firsts.has(r.batch)) firsts.set(r.batch, (await db.select('crux_uploads', `batch=eq.${enc(r.batch)}&order=id.asc&limit=1&select=name`))[0]?.name);
      const dir = join(dumper.drop, 'From Crux', batchFolder(r, firsts.get(r.batch)));
      const res = await storage('GET', r.path);
      if (!res.ok) throw new Error(`storage answered ${res.status}`);
      mkdirSync(dir, { recursive: true });
      let file = join(dir, clean(r.name, 120) || `file${extname(r.name)}`);
      for (let n = 2; existsSync(file); n++) file = file.replace(/(\.[^.]+)?$/, ` (${n})$1`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      const batch = ((state.fromCrux ||= {})[dir] ||= { user_id: r.user_id, user_name: r.user_name, files: {} });
      batch.files[basename(file)] = r.id; // so the post can be credited to this upload (markPosted)
      save();
      await db.update('crux_uploads', `id=eq.${r.id}`, { status: 'received', updated_at: new Date().toISOString() });
      await storage('DELETE', r.path).catch(() => {}); // it's on this PC now; Drop keeps it until it's posted
      console.log(`↓ from Crux: ${r.name} (${r.unit_code}, ${r.user_name})`);
    } catch (e) {
      await db.update('crux_uploads', `id=eq.${r.id}`, { status: 'failed', note: e.message.slice(0, 200), updated_at: new Date().toISOString() }).catch(() => {});
      log(`⚠️ A file from Crux couldn't be collected (${r.name}, ${r.unit_code}): ${e.message}`);
    }
  }
  return rows.length;
}

// After the uploader is done with a file from Crux: its upload(s) marked posted (one credit), merged (photos that
// became one PDF with another) or duplicate (the hub had it: no credit). Reaching the goal sends the congratulations.
export async function markPosted(path, outcome, log = console.log, { update = db.update, select = db.select, tell = dm } = {}) {
  const batch = state.fromCrux?.[dirname(path)];
  if (!batch || !outcome) return;
  const name = basename(path);
  const stemOf = (n) => n.slice(0, n.length - extname(n).length);
  const ids = batch.files[name] ? [batch.files[name]]
    : name === `${basename(dirname(path))}.pdf` ? Object.entries(batch.files).filter(([n]) => /\.(jpe?g|png)$/i.test(n)).map(([, id]) => id) // the folder's photos as one PDF
      : Object.entries(batch.files).filter(([n]) => stemOf(n) === stemOf(name)).map(([, id]) => id); // a PowerPoint or Word file as a PDF
  if (!ids.length) return;
  const now = new Date().toISOString();
  if (outcome === 'posted') {
    await update('crux_uploads', `id=eq.${ids[0]}`, { status: 'posted', updated_at: now });
    if (ids.length > 1) await update('crux_uploads', `id=in.(${ids.slice(1).join(',')})`, { status: 'merged', updated_at: now });
  } else await update('crux_uploads', `id=in.(${ids.join(',')})`, { status: 'duplicate', updated_at: now });
  for (const [n, id] of Object.entries(batch.files)) if (ids.includes(id)) delete batch.files[n];
  if (!Object.keys(batch.files).length) delete state.fromCrux[dirname(path)];
  save();
  if (outcome !== 'posted') return;
  const count = (await select('crux_uploads', creditsQuery(batch.user_id))).length;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  if (count === REWARD.goal && earned(count, today)) {
    const until = new Date(`${REWARD.end}T12:00:00+03:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Africa/Nairobi' });
    await tell(batch.user_id, `🎉 **${REWARD.goal} files added to the hub!** Thank you, ${batch.user_name || 'you'}. You now have **Mimosa in Crux until ${until}** and a contributor medal: 40 AI actions a day and unlimited downloads. It's already on: open Crux.`);
    log(`🏆 **${batch.user_name}** has added ${REWARD.goal} files from Crux this semester and earned Mimosa in Crux until ${until}.`);
  }
}
