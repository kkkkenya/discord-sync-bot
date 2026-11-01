// Downloading a hub file: a fresh Discord link each time (Discord's links expire). Premium and the owner have no
// limit; trial and Basic get LIMITS.download a day. Opening the file in Discord is never counted.
import { db, enc } from '../../lib/db.js';
import { attachmentOf, messageFor } from './ingest.js';
import { bump, nairobiDay } from './usage.js';

// The next Nairobi midnight, when the count starts again.
export function resetsAt(now = new Date()) {
  const tomorrow = new Date(`${nairobiDay(now)}T00:00:00+03:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString();
}

export async function downloadLink(user, fileId, { lookup = (id) => db.select('files', `id=eq.${enc(id)}&select=id,name,channel_id,message_id`), link = freshLink } = {}) {
  const [file] = await lookup(fileId);
  if (!file) throw Object.assign(new Error('That file is no longer on the hub.'), { status: 404 });
  const used = await bump(user, 'download');
  if (!used.ok) throw Object.assign(new Error('download-limit'), { status: 429, resetsAt: resetsAt() });
  return { url: await link(file), name: file.name, left: Number.isFinite(used.limit) ? used.limit - used.used : null };
}

async function freshLink(file) {
  const att = attachmentOf(await messageFor(file.channel_id, file.message_id), file.name);
  if (!att) throw Object.assign(new Error("Couldn't find the file in Discord. Open it there instead."), { status: 502 });
  return att.url;
}
