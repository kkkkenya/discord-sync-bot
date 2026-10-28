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
config({ path: fileURLToPath(new URL('../../community/.env', import.meta.url)), quiet: true }); // GEMINI_API_KEY lives here

const { startBot, todayText } = await import('./bot.js');
const { coach, coachReady } = await import('./coach.js');
const { aiReady, clamp, provider } = await import('./ai.js');
const { makeQuestions, makeStudyMaterial, markAnswers } = await import('./brain.js');
const { contextFor, ingestFile, library, libraryMeta } = await import('./ingest.js');
const { ALL_UNITS, calendar, filesFor, nextAssessment } = await import('./library.js');
const { COURSES, cohortUnits, courses, validCohort } = await import('./cohort.js');
const { TBA } = await import('./defs.js');
const { masteryMap } = await import('./mastery.js');
const { isDay, nairobiDay, stats, todayPlan } = await import('./plan.js');
const { buildPrompt } = await import('./prompt.js');
const { LISTS, add, data, patch, remove, save } = await import('./store.js');

const PORT = Number(process.env.PORT) || 5190;
const DIST = new URL('../dist/', import.meta.url);
const bot = startBot();

// The retired flashcards (cards, reviews) stay in study.json but never go to the dashboard; only their count does,
// for the one-time "flashcards retired" note.
const state = () => {
  const today = nairobiDay();
  const { cards, reviews, ...shown } = data;
  return {
    today, data: shown, calendar, next: nextAssessment(today), plan: todayPlan(today), stats: stats(today),
    retiredCards: cards?.length || 0, coach: coachReady(), ai: aiReady(), provider: provider(), settings: data.settings,
    mastery: masteryMap(today), library: libraryMeta(), discord: Boolean(bot),
  };
};

const routes = {
  'GET /api/state': () => state(),
  // Units for a course + year (default: the saved cohort, else EMM year 3), plus the whole catalogue to search.
  'GET /api/catalog': (q) => {
    const saved = data.settings.cohort || { course: 'EMM', year: 3, sem: 1 };
    const course = COURSES[q.get('course')] ? q.get('course') : saved.course;
    const year = Number(q.get('year')) || saved.year;
    return { courses: courses(ALL_UNITS), course, year, ...cohortUnits(ALL_UNITS, { course, year }), all: ALL_UNITS };
  },
  // A unit's server files merged with the ingested context-library cache (sync status + extracted text).
  'GET /api/library': async (q) => {
    const unit = q.get('unit');
    if (!unit) return { files: [] };
    const { files, note } = await filesFor(unit);
    const merged = files.map((f) => {
      const e = library.files[f.id];
      return { id: f.id, name: f.name, paper: f.paper, url: f.url, synced: Boolean(e), chars: e?.text?.length || 0, pages: e?.pages || 0, text: e?.text || '' };
    });
    return { note, files: merged };
  },
  // Download + extract every file for a unit into the context library. Skips files already synced.
  'POST /api/library/ingest': async (q, { unit }) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    const { files, note } = await filesFor(unit);
    if (note) return { note, files: [] };
    const results = [];
    for (const f of files) results.push(await ingestFile(f, unit));
    return { files: results };
  },
  // body: [{ code, title }] — the units you're taking. Keeps the dates and confidence you already set; a unit you
  // untick is remembered in settings.unitArchive (its topics and logs are never touched), so ticking it again
  // brings its date back.
  'PUT /api/units': (q, body) => {
    if (!Array.isArray(body)) throw Object.assign(new Error('expected a list of units'), { status: 400 });
    const archive = data.settings.unitArchive ||= {};
    const keep = new Set(body.map((u) => u.code));
    for (const u of data.units) if (!keep.has(u.code)) { const { code, title, ...rest } = u; archive[code] = rest; }
    data.units = body.map((u) => ({ ...archive[u.code], ...data.units.find((x) => x.code === u.code), code: u.code, title: u.title || '' }));
    for (const code of keep) delete archive[code];
    save();
    return state();
  },
  // catDate: 'YYYY-MM-DD', 'TBA' or null (use the KU calendar)
  'PATCH /api/units': (q, body) => {
    const u = data.units.find((x) => x.code === q.get('code'));
    if (!u) throw Object.assign(new Error('not one of your units'), { status: 404 });
    if ('catDate' in body && !(body.catDate === null || body.catDate === TBA || isDay(body.catDate))) throw Object.assign(new Error('a date (YYYY-MM-DD), TBA, or nothing'), { status: 400 });
    Object.assign(u, body, { code: u.code });
    save();
    return state();
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
  // AI provider toggle + other dashboard settings.
  'POST /api/settings': (q, body) => {
    for (const [k, v] of Object.entries(body || {})) {
      if (k === 'aiProvider' && !['gemini', 'deepseek', 'anthropic'].includes(v)) throw Object.assign(new Error('unknown AI provider'), { status: 400 });
      if (k === 'cohort' && !validCohort(v)) throw Object.assign(new Error('pick a course, a year (1-5) and a semester (1 or 2)'), { status: 400 });
      data.settings[k] = v;
    }
    save();
    return state();
  },
  // Notes → CAT questions for the mock bank (requires the AI key).
  'POST /api/notes': async (q, { unit, topic, text }) => {
    if (!aiReady()) throw Object.assign(new Error('No AI key for the selected provider. Pick another provider in the top bar, or add the key.'), { status: 400 });
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (!topic?.trim() || !text?.trim()) throw Object.assign(new Error('A topic and some notes are needed.'), { status: 400 });
    const { questions } = await makeStudyMaterial({ unit, topic: topic.trim(), text: text.trim(), context: contextFor(unit, topic) });
    for (const qq of questions) add('questions', { unit, topic: topic.trim(), q: qq.q, a: qq.a, marks: clamp(qq.marks, 5, 25), from: 'notes' });
    return { questions: questions.length };
  },
  // Start a mock: bank questions for the unit first, generate more from its topics if needed (and an AI key is set).
  'POST /api/mocks': async (q, body) => {
    const unit = body.unit;
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    const count = body.count ? clamp(body.count, 1, 10) : 5;
    const bank = data.questions.filter((x) => x.unit === unit).sort(() => Math.random() - 0.5);
    let questions = bank.slice(0, count).map((x) => ({ q: x.q, a: x.a, marks: x.marks, topic: x.topic || '' }));
    if (questions.length < count && aiReady()) {
      const extra = await makeQuestions({ unit, topics: data.topics.filter((t) => t.unit === unit), count: count - questions.length, context: contextFor(unit) });
      questions = questions.concat(extra.questions.map((x) => ({ q: x.q, a: x.a, marks: clamp(x.marks, 5, 25), topic: x.topic || '' })));
    }
    if (!questions.length) throw Object.assign(new Error(aiReady() ? 'Nothing to build a mock from. Add topics in Units, or turn notes into questions (Notes).' : 'No banked questions for this unit and no AI key to write some. Use the Prompt builder (Mock exam questions) in another AI, or add a key.'), { status: 400 });
    const mock = add('mocks', { unit, name: body.name?.trim() || `${unit} mock`, questions });
    return { id: mock.id, unit: mock.unit, name: mock.name, at: mock.at, questions: mock.questions.map(({ q, marks }) => ({ q, marks })) };
  },
  // Build a self-contained prompt to paste into any other AI chat, grounded in the synced library.
  'POST /api/prompt': (q, body) => buildPrompt(body || {}),
  'POST /api/dm-today': async () => {
    if (!bot) throw Object.assign(new Error('Discord DMs are off. Run setup.bat to add your Discord user ID.'), { status: 400 });
    await bot.dm(todayText());
    return { ok: true };
  },
};

const mockResult = (mock) => ({
  id: mock.id, unit: mock.unit, name: mock.name, score: mock.score ?? null, outOf: mock.outOf ?? null, overall: mock.overall || '',
  items: mock.questions.map((qq, i) => ({ q: qq.q, a: qq.a, marks: qq.marks, user: mock.answers?.[i]?.user || '', earned: mock.answers?.[i]?.earned ?? null, note: mock.answers?.[i]?.note || '' })),
});

// Submit a finished mock. With the Anthropic key it's marked in one call; without, the model answers are
// returned and the dashboard lets you self-mark (then PATCH /api/mocks/<id> saves the score).
async function submitMock(id, { answers = [] }) {
  const mock = data.mocks.find((m) => m.id === id);
  if (!mock) throw Object.assign(new Error('mock not found'), { status: 404 });
  const items = mock.questions.map((qq, i) => ({ q: qq.q, a: qq.a, marks: qq.marks, user: String(answers[i] ?? '').trim() }));
  mock.answers = items.map((it) => ({ user: it.user }));
  mock.finishedAt = new Date().toISOString();
  save();
  if (!aiReady()) {
    return { selfMark: true, ...mockResult(mock) };
  }
  const out = await markAnswers(items);
  const results = out.results || [];
  let earned = 0;
  mock.answers = items.map((it, i) => {
    const e = clamp(results[i]?.earned, 0, it.marks);
    earned += e;
    return { user: it.user, earned: e, note: results[i]?.note || '' };
  });
  mock.score = earned;
  mock.outOf = items.reduce((n, it) => n + it.marks, 0);
  mock.overall = out.overall || '';
  save();
  return mockResult(mock);
}

async function api(req, url) {
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.parse(Buffer.concat(await req.toArray()).toString() || '{}') : null;
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) return route(url.searchParams, body);
  const submit = url.pathname.match(/^\/api\/mocks\/([\w-]+)\/submit$/);
  if (req.method === 'POST' && submit) return submitMock(submit[1], body);
  // generic lists: POST /api/topics, PATCH /api/topics/<id>, DELETE /api/topics/<id>
  const [, list, id] = url.pathname.match(/^\/api\/(\w+)(?:\/([\w-]+))?$/) || [];
  if (LISTS.includes(list)) {
    if (req.method === 'POST' && !id) return add(list, body);
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
