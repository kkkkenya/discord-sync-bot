// The whole Crux API as one Vercel function: /api/* and /auth/* are rewritten here (study/vercel.json).
// Each request loads the signed-in student's document, runs the route with it as `data`, and saves it once.
import { db } from '../../lib/db.js';
import { authRoute, memberOf, readSession, RECHECK_MS, rememberUser, sessionCookie, tierFor } from '../server/auth.js';
import { runBackup, supabaseStorage } from '../server/backup.js';
import { docStore } from '../server/doc-store.js';
import { nairobiDay } from '../server/plan.js';
import { dispatch } from '../server/routes.js';
import { VERSION, withDoc } from '../server/store.js';

const MAX_BODY = 14 * 1024 * 1024; // photos of working and voice teach-backs come in as base64
const json = (body, status = 200) => Response.json(body ?? null, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status) => Object.assign(new Error(message), { status });

// The tier rides in the cookie; once a day it's read again from the member's roles (joined, paid, or left).
async function recheck(session, { db, member }) {
  if (Date.now() - (session.checked || 0) < RECHECK_MS) return { user: session };
  let m;
  try { m = await member(session.id); } catch (e) { console.error('role check:', e.message); return { user: session }; } // Discord down: keep the tier, try again next request
  const user = { id: session.id, name: m?.nick || session.name, tier: tierFor(m, session.id) };
  await rememberUser(db, user).catch((e) => console.error('crux_users:', e.message));
  return { user, cookie: sessionCookie(user) };
}

export function makeRouter(docs, deps = { db, member: memberOf }) {
  return async function handle(request) {
    const url = new URL(request.url);
    const auth = url.searchParams.get('auth');
    if (auth) return authRoute(auth, request, deps);
    const path = `/api/${url.searchParams.get('path') || ''}`;
    if (path === '/api/health') return json({ ok: true, version: VERSION });
    if (path === '/api/cron/backup') { // Vercel's daily cron (vercel.json) sends the CRON_SECRET
      if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return json({ error: 'Not allowed.' }, 401);
      return json(await runBackup({ db: deps.db, storage: deps.storage || supabaseStorage }));
    }
    try {
      const session = readSession(request);
      if (!session) throw fail('Sign in first.', 401);
      const { user: u, cookie } = await recheck(session, deps);
      const user = { id: u.id, name: u.name, tier: u.tier };
      const reply = (body, status) => { const r = json(body, status); if (cookie) r.headers.append('Set-Cookie', cookie); return r; };
      if (user.tier === 'none') return reply({ error: 'no-access' }, 403);
      if (path === '/api/me') return reply(user);
      let body = null;
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const text = await request.text();
        if (text.length > MAX_BODY) throw fail('That upload is too big.', 413);
        try { body = text ? JSON.parse(text) : {}; } catch { throw fail('That request was not valid JSON.', 400); }
      }
      const query = new URLSearchParams(url.searchParams);
      query.delete('path');
      const { rev, doc } = await docs.load(user.id);
      const { result, dirty } = await withDoc(doc, () => dispatch(request.method, path, query, body, { user, today: nairobiDay() }));
      if (dirty) await docs.save(user.id, rev, doc);
      return reply(result);
    } catch (e) {
      if (!e.status) console.error(e);
      return json({ error: e.message, ...(e.resetsAt && { resetsAt: e.resetsAt }) }, e.status || 500);
    }
  };
}

const handle = makeRouter(docStore(db));
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
