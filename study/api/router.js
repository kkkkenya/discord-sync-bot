// The whole Crux API as one Vercel function: /api/* and /auth/* are rewritten here (study/vercel.json).
// Each request loads the signed-in student's document, runs the route with it as `data`, and saves it once.
import { db } from '../../lib/db.js';
import { readCookie, verify } from '../../lib/session.js';
import { docStore } from '../server/doc-store.js';
import { nairobiDay } from '../server/plan.js';
import { dispatch } from '../server/routes.js';
import { VERSION, withDoc } from '../server/store.js';

const MAX_BODY = 14 * 1024 * 1024; // photos of working and voice teach-backs come in as base64
const json = (body, status = 200) => Response.json(body ?? null, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status) => Object.assign(new Error(message), { status });

export function makeRouter(docs) {
  return async function handle(request) {
    const url = new URL(request.url);
    const path = `/api/${url.searchParams.get('path') || ''}`;
    if (path === '/api/health') return json({ ok: true, version: VERSION });
    try {
      const session = verify(readCookie(request, 'crux_session'));
      if (!session) throw fail('Sign in first.', 401);
      const user = { id: session.id, name: session.name, tier: session.tier };
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
      return json(result);
    } catch (e) {
      if (!e.status) console.error(e);
      return json({ error: e.message }, e.status || 500);
    }
  };
}

const handle = makeRouter(docStore(db));
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
