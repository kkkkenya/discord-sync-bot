// The Hub files desk for Crux Harness (fixplan-g, owner 2026-11-18): staff see the #to-sort queue, recent posts and
// students' uploads, and sort files; anyone signed in can ask whether a file (by its sha256) is already on the Hub.
// Served before the student's document loads (api/router.js, server/index.js), like rooms. Discord and Supabase only.
import { db, enc } from '../../lib/db.js';
import { GUILD_ID } from '../../lib/config.js';
import { deskQueue, deskSort, isStaff } from '../../lib/hub-desk.js';
import { allUnitPosts, SHELVES } from '../../lib/sorting.js';
import { remote } from './ingest.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const HUB_PATHS = /^\/api\/hub\/(desk|sort|has)$/;
const link = (r) => (r.channel_id && r.message_id ? `https://discord.com/channels/${GUILD_ID}/${r.channel_id}/${r.message_id}` : null);

let deps = { db, deskQueue, deskSort, isStaff, remote };
export const useHubDeskForTests = (d) => { deps = d ? { ...deps, ...d } : { db, deskQueue, deskSort, isStaff, remote }; };

async function staffOnly(user) {
  if (!(await deps.isStaff(user?.id))) throw fail('The Hub files desk is for server staff.', 403);
}

export async function hubRoute(method, path, query, body, user) {
  const route = `${method} ${path}`;
  if (route === 'GET /api/hub/has') {
    const hash = String(query?.get?.('hash') || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) throw fail('A file checksum is 64 hex characters.');
    if (!deps.remote()) return { exists: false };
    const [row] = await deps.db.select('files', `hash=eq.${hash}&select=name,unit_code,dest_name,channel_id,message_id&limit=1`);
    return row ? { exists: true, name: row.name, unit: row.unit_code, where: row.dest_name, link: link(row) } : { exists: false };
  }
  if (route === 'GET /api/hub/desk') {
    await staffOnly(user);
    const live = deps.remote();
    const [queue, recent, students] = await Promise.all([
      deps.deskQueue().catch((e) => ({ error: e.message })),
      live ? deps.db.select('files', 'order=created_at.desc&limit=40&select=name,kind,unit_code,dest_name,channel_id,message_id,created_at,size') : [],
      live ? deps.db.select('crux_uploads', 'order=id.desc&limit=40&select=id,user_name,unit_code,name,size,status,note,created_at,updated_at') : [],
    ]);
    return {
      queue: Array.isArray(queue) ? queue : [], queueError: Array.isArray(queue) ? null : queue.error,
      recent: recent.map((r) => ({ name: r.name, kind: r.kind, unit: r.unit_code, where: r.dest_name, at: r.created_at, size: r.size, link: link(r) })),
      students: students.map((r) => ({ id: r.id, by: r.user_name, unit: r.unit_code, name: r.name, size: r.size, status: r.status, note: r.note, at: r.updated_at || r.created_at })),
      units: allUnitPosts().map((u) => ({ code: u.code, label: u.label })),
      shelves: SHELVES.map((s) => ({ id: s.id, name: s.name })),
    };
  }
  if (route === 'POST /api/hub/sort') {
    await staffOnly(user);
    return deps.deskSort(body || {}, user, { via: 'Crux Harness' });
  }
  throw fail('not found', 404);
}
