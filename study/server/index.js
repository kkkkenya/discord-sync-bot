// Crux on this computer: the API on http://localhost:5190 (one local student: you, data in study/data/study.json),
// serving the built app from dist/. `npm run dev` runs Vite on 5173 in front of it.
// Keys come from pc/.env (Supabase) and community/.env (Gemini); study/.env adds OWNER_ID and PORT.
import { config } from 'dotenv';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
config({ path: fileURLToPath(new URL('../../pc/.env', import.meta.url)), quiet: true });
config({ path: fileURLToPath(new URL('../../community/.env', import.meta.url)), quiet: true }); // GEMINI_API_KEY lives here

const { dispatch } = await import('./routes.js');
const { nairobiDay } = await import('./plan.js');

const PORT = Number(process.env.PORT) || 5190;
const DIST = new URL('../dist/', import.meta.url);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const user = { id: process.env.OWNER_ID || 'local', name: 'You', tier: 'owner' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try {
      const raw = ['POST', 'PUT', 'PATCH'].includes(req.method) ? Buffer.concat(await req.toArray()) : null;
      if (raw && raw.length > 14 * 1024 * 1024) throw Object.assign(new Error('That upload is too big.'), { status: 413 });
      const body = raw ? JSON.parse(raw.toString() || '{}') : null;
      const out = await dispatch(req.method, url.pathname, url.searchParams, body, { user, today: nairobiDay() });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
    } catch (e) {
      if (!e.status) console.error(e);
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  let file = new URL(`.${decodeURIComponent(url.pathname)}`, DIST);
  if (!file.href.startsWith(DIST.href) || !existsSync(file) || statSync(file).isDirectory()) file = new URL('index.html', DIST);
  if (!existsSync(file)) return res.writeHead(500).end('Crux is not built. Run: npm run build');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file.pathname)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`Study dashboard: http://localhost:${PORT}`)); // tests wait for this line
