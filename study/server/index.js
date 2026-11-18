// Crux on this computer: the API on http://localhost:5190 (one local student: you, data in study/data/study.json),
// serving the built app from dist/. `npm run dev` runs Vite on 5173 in front of it.
// Keys come from pc/.env (Supabase) and community/.env (Gemini); study/.env adds OWNER_ID and PORT.
// CRUX_LIVE_DATA=1 (Crux (local).bat) uses your real saved data instead: the Supabase document the website uses,
// as OWNER_ID, with the hub's files and your notes from Supabase too. CRUX_AI=claude-code sends the AI work to Claude
// Code on this computer (server/ai.js).
import { config } from 'dotenv';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
config({ path: fileURLToPath(new URL('../../pc/.env', import.meta.url)), quiet: true });
config({ path: fileURLToPath(new URL('../../community/.env', import.meta.url)), quiet: true }); // GEMINI_API_KEY lives here

const live = process.env.CRUX_LIVE_DATA === '1';
if (live) {
  const missing = ['OWNER_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter((k) => !process.env[k]);
  if (missing.length) { console.error(`Live data needs ${missing.join(', ')} in study/.env. Run setup-web.bat first.`); process.exit(1); }
  process.env.CRUX_REMOTE_LIBRARY = '1'; // files, notes, focus and the shared library from Supabase, like the website
  process.env.CRUX_STRICT = '1'; // study data only inside a request, never a stray local file
}

const { dispatch } = await import('./routes.js');
const { ROOM_PATHS, roomsRoute } = await import('./rooms-routes.js');
const { HUB_PATHS, hubRoute } = await import('./hub-desk-routes.js');
const { fileBytes } = await import('./file-bytes.js');
const { docStore, withSavedDoc } = await import('./doc-store.js');
const docs = live ? docStore((await import('../../lib/db.js')).db) : null;
const { nairobiDay } = await import('./plan.js');

const PORT = Number(process.env.PORT) || 5190;
const DIST = new URL('../dist/', import.meta.url);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const user = { id: process.env.OWNER_ID || 'local', name: 'You', tier: 'owner' };

// Local testing of study rooms with two people: a `crux-as=<name>` cookie makes the rooms API treat this browser as
// another student. This file only runs on this computer; the website (api/router.js) never reads it.
const localAs = (req) => {
  const name = /(?:^|;\s*)crux-as=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  return name ? { id: `local-${decodeURIComponent(name)}`, name: decodeURIComponent(name).slice(0, 30), tier: 'owner' } : null;
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try {
      if (url.pathname === '/api/files/bytes') { // the PDF viewer's byte ranges, sent as they are
        const r = await fileBytes(url.searchParams);
        res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? Buffer.concat(await req.toArray()) : null;
      if (raw && raw.length > 14 * 1024 * 1024) throw Object.assign(new Error('That upload is too big.'), { status: 413 });
      const body = raw ? JSON.parse(raw.toString() || '{}') : null;
      if (HUB_PATHS.test(url.pathname)) { // the Hub files desk
        const out = await hubRoute(req.method, url.pathname, url.searchParams, body, user);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
        return;
      }
      if (ROOM_PATHS.test(url.pathname)) { // study rooms: their own tables, no document
        const out = await roomsRoute(req.method, url.pathname, url.searchParams, body, localAs(req) || user); // before writeHead: it may throw
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
        return;
      }
      const ask = (extra) => dispatch(req.method, url.pathname, url.searchParams, body, { user, today: nairobiDay(), ...extra });
      const out = live ? await withSavedDoc(docs, user.id, ask) : await ask();
      if (out instanceof Response) { // a file download (Anki export)
        res.writeHead(out.status, Object.fromEntries(out.headers)).end(Buffer.from(await out.arrayBuffer()));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
    } catch (e) {
      if (!e.status) console.error(e);
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message, ...(e.resetsAt && { resetsAt: e.resetsAt }) }));
    }
    return;
  }
  let file = new URL(`.${decodeURIComponent(url.pathname)}`, DIST);
  if (!file.href.startsWith(DIST.href) || !existsSync(file) || statSync(file).isDirectory()) file = new URL('index.html', DIST);
  if (!existsSync(file)) return res.writeHead(500).end('Crux is not built. Run: npm run build');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file.pathname)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Study dashboard: http://localhost:${PORT}`); // tests wait for this line
  if (live) console.log('Using your real Crux data (the same as crux.engineeringhub.site).');
  if (process.env.CRUX_AI === 'claude-code') console.log('AI: Claude Code on this computer.');
});
