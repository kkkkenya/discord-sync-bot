// Personal study dashboard on http://localhost:5190, plus your private DMs from the Study Hub bot.
// Keys come from pc/.env (Discord token, Supabase, Anthropic); study/.env only adds OWNER_ID and PORT.
//   npm start   build the dashboard and run it
import { config } from 'dotenv';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
config({ path: fileURLToPath(new URL('../../pc/.env', import.meta.url)), quiet: true });

const { startBot, todayText } = await import('./bot.js');
const { coach, coachReady } = await import('./coach.js');
const { ALL_UNITS, YEAR3_MECH, calendar, filesFor, nextAssessment } = await import('./library.js');
const { dueCards, grade, nairobiDay, stats, todayPlan } = await import('./plan.js');
const { LISTS, add, data, patch, remove, save } = await import('./store.js');

const PORT = Number(process.env.PORT) || 5190;
const DIST = new URL('../dist/', import.meta.url);
const bot = startBot();

const state = () => {
  const today = nairobiDay();
  return {
    today, data, calendar, next: nextAssessment(today), plan: todayPlan(today), stats: stats(today),
    due: dueCards(null, today).length, coach: coachReady(), discord: Boolean(bot),
  };
};

const routes = {
  'GET /api/state': () => state(),
  'GET /api/catalog': () => ({ year3: YEAR3_MECH, all: ALL_UNITS }),
  'GET /api/library': (q) => filesFor(q.get('unit')),
  'GET /api/due': (q) => dueCards(q.get('unit') || null),
  // body: [{ code, title }] — the units you're taking; keeps CAT dates and confidence you already set
  'PUT /api/units': (q, body) => {
    data.units = body.map((u) => ({ ...data.units.find((x) => x.code === u.code), code: u.code, title: u.title }));
    save();
    return state();
  },
  'PATCH /api/units': (q, body) => {
    const u = data.units.find((x) => x.code === q.get('code'));
    if (!u) throw Object.assign(new Error('not one of your units'), { status: 404 });
    Object.assign(u, body, { code: u.code });
    save();
    return state();
  },
  'POST /api/review': (q, { id, grade: g }) => {
    const card = data.cards.find((c) => c.id === id);
    if (!card || ![1, 2, 3, 4].includes(g)) throw Object.assign(new Error('bad review'), { status: 400 });
    grade(card, g);
    save();
    return card;
  },
  'POST /api/teach': async (q, { unit, topic, text }) => {
    if (!unit || !topic || !text?.trim()) throw Object.assign(new Error('unit, topic and text are needed'), { status: 400 });
    let feedback = null;
    let error = null;
    if (coachReady()) { try { feedback = await coach({ unit, topic, text }); } catch (e) { error = e.message; } }
    const item = add('teach', { unit, topic, text, feedback });
    const tp = data.topics.find((x) => x.unit === unit && x.name.toLowerCase() === topic.toLowerCase());
    if (tp) { tp.taughtAt = item.at; save(); }
    return { item, error };
  },
  'POST /api/dm-today': async () => {
    if (!bot) throw Object.assign(new Error('Discord DMs are off. Run setup.bat to add your Discord user ID.'), { status: 400 });
    await bot.dm(todayText());
    return { ok: true };
  },
};

const NEW_CARD = () => ({ due: nairobiDay(), interval: 0, ease: 2.5, reps: 0, lapses: 0 });

async function api(req, url) {
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.parse(Buffer.concat(await req.toArray()).toString() || '{}') : null;
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) return route(url.searchParams, body);
  // generic lists: POST /api/cards, PATCH /api/cards/<id>, DELETE /api/cards/<id>
  const [, list, id] = url.pathname.match(/^\/api\/(\w+)(?:\/([\w-]+))?$/) || [];
  if (LISTS.includes(list)) {
    if (req.method === 'POST' && !id) return add(list, list === 'cards' ? { ...NEW_CARD(), ...body } : body);
    if (req.method === 'PATCH' && id) return patch(list, id, body) ?? Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
    if (req.method === 'DELETE' && id) return { removed: remove(list, id) };
  }
  throw Object.assign(new Error('no such endpoint'), { status: 404 });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try {
      const out = await api(req, url);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
    } catch (e) {
      if (!e.status) console.error(e);
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  let file = new URL(`.${decodeURIComponent(url.pathname)}`, DIST);
  if (!file.href.startsWith(DIST.href) || !existsSync(file) || statSync(file).isDirectory()) file = new URL('index.html', DIST);
  if (!existsSync(file)) return res.writeHead(500).end('Dashboard not built. Run: npm start');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file.pathname)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`Study dashboard: http://localhost:${PORT}`));
