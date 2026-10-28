// Personal study dashboard on http://localhost:5190, plus your private DMs from the Study Hub bot.
// Keys come from pc/.env (Discord token, Supabase, AI keys) and community/.env (Gemini); study/.env only adds OWNER_ID and PORT.
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
const { makeQuestions, makeStudyMaterial, mapQuestions, markAnswers, suggestSubtopics, suggestTopics } = await import('./brain.js');
const { contextFor, ingestFile, library, libraryMeta, outlineContext } = await import('./ingest.js');
const { ALL_UNITS, calendar, filesFor, nextAssessment } = await import('./library.js');
const { COURSES, cohortUnits, courses, validCohort } = await import('./cohort.js');
const { ERROR_TYPES, STAGES, TBA } = await import('./defs.js');
const { stageMix, validStage } = await import('./stages.js');
const { masteryMap } = await import('./mastery.js');
const { checkSubtopic } = await import('./analysis.js');
const { hintFields, parsePapers, pastePaper, predictFor, scannedPapers, teachFlags, weakspotsFor } = await import('./weakspots.js');
const { predictedMock } = await import('./predict.js');
const { GOALS, buildPack } = await import('./context-pack.js');
const { isDay, nairobiDay, stats, todayPlan, unitStage } = await import('./plan.js');
const { buildPrompt } = await import('./prompt.js');
const { KEY_LABEL, breakOf, checkAnswer, ensureCheckpoints, flagCheckpoint, markBroke } = await import('./practice.js');
const { LISTS, add, data, patch, remove, save } = await import('./store.js');

const PORT = Number(process.env.PORT) || 5190;
const DIST = new URL('../dist/', import.meta.url);
const bot = startBot();

// The retired flashcards (cards, reviews) stay in study.json but never go to the dashboard; only their count does,
// for the one-time "flashcards retired" note.
const state = () => {
  const today = nairobiDay();
  const { cards, reviews, ...shown } = data;
  const units = Object.fromEntries(data.units.map((u) => [u.code, unitStage(u, today)]));
  return {
    units, stageMix: stageMix(Object.values(units).map((x) => x.stage)), stages: STAGES.map(({ maxDays, ...s }) => s),
    errorTypes: ERROR_TYPES,
    goals: Object.entries(GOALS).map(([id, g]) => ({ id, name: g.name })),
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
  // Download + extract every file for a unit into the context library. Skips files already synced. Then reads the
  // unit's past papers into questions (no AI), so Predict is ready without another click.
  'POST /api/library/ingest': async (q, { unit }) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    const { files, note } = await filesFor(unit);
    if (note) return { note, files: [] };
    const results = [];
    for (const f of files) results.push(await ingestFile(f, unit));
    return { files: results, parsed: parsePapers(unit) };
  },
  // AI topic suggestions for a unit from its synced course outline and past papers; nothing is saved until the
  // student adds them.
  'POST /api/topics/suggest': async (q, { unit }) => {
    const u = data.units.find((x) => x.code === unit);
    if (!u) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (!aiReady()) throw Object.assign(new Error('No AI key for the selected provider. Copy the topics from the course outline by hand, or use the Prompt Builder.'), { status: 400 });
    if (!data.paperq.some((x) => x.unit === unit)) parsePapers(unit);
    const have = data.topics.filter((t) => t.unit === unit).map((t) => t.name);
    const { text, sources } = outlineContext(unit, data.paperq.filter((x) => x.unit === unit).map((x) => x.text));
    const { topics } = await suggestTopics({ unit, title: u.title, have, context: text });
    return { suggestions: topics.filter((t) => !have.some((h) => h.toLowerCase() === t.name.toLowerCase())), sources };
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
    if ('stage' in body && !validStage(body.stage)) throw Object.assign(new Error('unknown study stage'), { status: 400 });
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
    return { item, error, flags: teachFlags(unit, topic, feedback) };
  },
  // body: { topicId, name } or { topicId, names: [...] } — add one or several sub-topics under a topic
  'POST /api/subtopics': (q, body) => {
    if (body.restore) return { added: [add('subtopics', checkSubtopic(body.restore, { create: true }))] }; // undo a delete
    const tp = data.topics.find((t) => t.id === body.topicId);
    if (!tp) throw Object.assign(new Error('pick a topic first'), { status: 400 });
    const names = (body.names || [body.name]).map((n) => String(n || '').trim()).filter(Boolean);
    if (!names.length) throw Object.assign(new Error('a sub-topic needs a name'), { status: 400 });
    let order = Math.max(0, ...data.subtopics.filter((s) => s.topicId === tp.id).map((s) => s.order || 0));
    const have = new Set(data.subtopics.filter((s) => s.topicId === tp.id).map((s) => s.name.toLowerCase()));
    const added = [];
    for (const name of names) {
      if (have.has(name.toLowerCase())) continue;
      have.add(name.toLowerCase());
      added.push(add('subtopics', { ...checkSubtopic({ name, kind: body.kind || 'concept' }, { create: true }), unit: tp.unit, topicId: tp.id, order: ++order }));
    }
    return { added };
  },
  // The 60-second self-audit: { ratings: { <subtopicId>: 'solid'|'shaky'|'stuck'|'untested' } }
  'POST /api/subtopics/audit': (q, { ratings = {} }) => {
    const at = new Date().toISOString();
    for (const [id, audit] of Object.entries(ratings)) {
      const s = data.subtopics.find((x) => x.id === id);
      if (!s) throw Object.assign(new Error('unknown sub-topic'), { status: 404 });
      Object.assign(s, checkSubtopic({ audit }), { auditAt: at, auditFrom: 'you' });
    }
    save();
    return state();
  },
  // Deep Context Pack: { unit, topicId? | topic? (name), questionId?, goal? } → { prompt, md, filename, checklist,
  // tokens, cut }. Works without an AI key.
  'POST /api/pack': (q, body) => {
    const unit = data.units.find((u) => u.code === body.unit);
    if (!unit) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (body.goal && !GOALS[body.goal]) throw Object.assign(new Error('unknown goal'), { status: 400 });
    const question = body.questionId ? data.paperq.find((x) => x.id === body.questionId && x.unit === unit.code) : null;
    const topic = data.topics.find((t) => t.unit === unit.code && (t.id === (body.topicId || question?.topicId) || (body.topic && t.name.toLowerCase() === String(body.topic).toLowerCase()))) || null;
    const subs = data.subtopics.filter((s) => s.unit === unit.code && (!topic || s.topicId === topic.id));
    const ids = new Set(subs.map((s) => s.id));
    const { critical, errors } = weakspotsFor(unit.code, nairobiDay());
    const since = Date.now() - 30 * 86400000;
    const cohort = data.settings.cohort ? { ...data.settings.cohort, name: COURSES[data.settings.cohort.course] } : null;
    return buildPack({
      unit, cohort, stage: unitStage(unit).stage.id, topic, subtopics: subs, goal: body.goal,
      weak: critical.filter((c) => !topic || c.topicId === topic.id), errors: errors.counts,
      hints: data.hints.filter((h) => h.unit === unit.code && (!topic || !h.topicIds?.length || h.topicIds.includes(topic.id))),
      questions: data.paperq.filter((x) => x.unit === unit.code && (topic ? x.topicId === topic.id : true)).slice(0, 40),
      question,
      failures: data.attempts.filter((a) => a.verdict === 'wrong' && Date.parse(a.at) >= since && (ids.has(a.subtopicId) || (topic && a.topicId === topic.id))).map(breakOf),
      files: Object.values(library.files).filter((e) => e.unit === unit.code).map((e) => ({ name: e.name, paper: e.paper, text: e.text || '' })),
      today: nairobiDay(),
    });
  },
  // Checkpoint feedback: { unit, questionId? | question?, topicId?, answer, operations?, key?, showCheckpoints? } →
  // the verdict, the answer key and its source, and numbered checkpoints. Nothing is held against you until you
  // mark the step where your working broke.
  'POST /api/attempts/check': async (q, body) => checkAnswer(body || {}),
  'POST /api/attempts/checkpoints': async (q, body) => ensureCheckpoints(body || {}),
  'POST /api/attempts/broke': (q, body) => markBroke(body || {}),
  'POST /api/attempts/flag': (q, body) => flagCheckpoint(body || {}),
  // The weakspot matrix for one unit: critical sub-topics (exam weight × weakness) and recurring errors.
  'GET /api/weakspots': (q) => {
    const unit = q.get('unit');
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    return weakspotsFor(unit, nairobiDay());
  },
  // Predictions for one unit: ranked topics, its parsed past-paper questions, hints and scanned papers.
  'GET /api/predict': (q) => {
    const unit = q.get('unit');
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    return { ranked: predictFor(unit, nairobiDay()), questions: data.paperq.filter((x) => x.unit === unit), hints: data.hints.filter((h) => h.unit === unit), scanned: scannedPapers(unit) };
  },
  // Re-read the unit's synced past papers (no AI). Your topic corrections are kept.
  'POST /api/predict/parse': (q, { unit }) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    return parsePapers(unit);
  },
  // Paste a paper's questions by hand: { unit, label: '2022 CAT 1', text }
  'POST /api/predict/paste': (q, { unit, label, text }) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (!String(text || '').trim() || !String(label || '').trim()) throw Object.assign(new Error('a label (e.g. 2022 CAT 1) and the question text are needed'), { status: 400 });
    return { added: pastePaper(unit, label.trim(), text) };
  },
  // AI maps the questions it couldn't place (and earlier guesses) to the unit's topics. Yours stay as you set them.
  'POST /api/predict/map': async (q, { unit }) => {
    if (!aiReady()) throw Object.assign(new Error('No AI key for the selected provider. Pick each question\'s topic by hand.'), { status: 400 });
    const topics = data.topics.filter((t) => t.unit === unit);
    if (!topics.length) throw Object.assign(new Error('Add the unit\'s topics in Units first.'), { status: 400 });
    const todo = data.paperq.filter((x) => x.unit === unit && x.topicFrom !== 'you');
    if (!todo.length) return { mapped: 0 };
    let mapped = 0;
    for (let i = 0; i < todo.length; i += 25) {
      const batch = todo.slice(i, i + 25);
      const { results } = await mapQuestions({ unit, topics: topics.map((t) => t.name), questions: batch.map((x) => x.text) });
      for (const r of results || []) {
        const row = batch[r.index];
        const tp = topics.find((t) => t.name.toLowerCase() === String(r.topic || '').toLowerCase());
        if (!row) continue;
        Object.assign(row, { topicId: tp?.id || null, topicFrom: 'ai' });
        if (tp) mapped++;
      }
    }
    save();
    return { mapped, of: todo.length };
  },
  // A lecturer hint: { unit, text, kind?, topicIds? }. Kind and topics are read from the wording unless given.
  'POST /api/hints': (q, body) => {
    if (body.restore) return add('hints', checkHint(body.restore)); // undo a delete
    if (!data.units.some((u) => u.code === body.unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (!String(body.text || '').trim()) throw Object.assign(new Error('What did the lecturer say?'), { status: 400 });
    return add('hints', checkHint(hintFields(body.unit, body.text, body)));
  },
  // AI suggestions from the synced notes for one topic; nothing is saved until the student adds them.
  'POST /api/subtopics/suggest': async (q, { topicId }) => {
    const tp = data.topics.find((t) => t.id === topicId);
    if (!tp) throw Object.assign(new Error('pick a topic first'), { status: 400 });
    if (!aiReady()) throw Object.assign(new Error('No AI key for the selected provider. Add sub-topics by hand, or use the Prompt Builder to list them in another AI.'), { status: 400 });
    const have = data.subtopics.filter((s) => s.topicId === tp.id).map((s) => s.name);
    const { subtopics } = await suggestSubtopics({ unit: tp.unit, topic: tp.name, have, context: contextFor(tp.unit, tp.name) });
    return { suggestions: subtopics.filter((s) => !have.some((h) => h.toLowerCase() === s.name.toLowerCase())) };
  },
  // AI provider toggle + other dashboard settings.
  'POST /api/settings': (q, body) => {
    for (const [k, v] of Object.entries(body || {})) {
      if (k === 'aiProvider' && !['gemini', 'deepseek', 'anthropic'].includes(v)) throw Object.assign(new Error('unknown AI provider'), { status: 400 });
      if (k === 'cohort' && !validCohort(v)) throw Object.assign(new Error('pick a course, a year (1-5) and a semester (1 or 2)'), { status: 400 });
      if (k === 'stage' && !validStage(v)) throw Object.assign(new Error('unknown study stage'), { status: 400 });
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
    if (body.restore) return add('mocks', body.restore); // undo a delete
    const unit = body.unit;
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (body.predicted) {
      const questions = predictedMock(predictFor(unit, nairobiDay()), data.paperq.filter((x) => x.unit === unit))
        // the answer key saved by "Check my answer" when there is one; without, the mock is self-marked (see submitMock)
        .map((x) => (x.key
          ? { q: x.q, a: `Final answer (${KEY_LABEL[x.key.source]}): ${x.key.answer}`, marks: x.marks, topic: x.topic }
          : { q: x.q, a: `No answer key yet: mark it against the ${x.source || 'paper'} marking scheme, or check it in Check answer first.`, marks: x.marks, topic: x.topic, noKey: true }));
      if (!questions.length) throw Object.assign(new Error('No past-paper questions mapped to topics yet. In Predictions, read the past papers and check their topics.'), { status: 400 });
      const mock = add('mocks', { unit, name: body.name?.trim() || `${unit} predicted mock`, questions, predicted: true });
      return { id: mock.id, unit: mock.unit, name: mock.name, at: mock.at, questions: mock.questions.map(({ q, marks }) => ({ q, marks })) };
    }
    const count = body.count ? clamp(body.count, 1, 10) : 5;
    const bank = data.questions.filter((x) => x.unit === unit).sort(() => Math.random() - 0.5);
    let questions = bank.slice(0, count).map((x) => ({ q: x.q, a: x.a, marks: x.marks, topic: x.topic || '' }));
    if (questions.length < count && aiReady()) {
      const extra = await makeQuestions({ unit, topics: data.topics.filter((t) => t.unit === unit), count: count - questions.length, context: contextFor(unit) });
      questions = questions.concat(extra.questions.map((x) => ({ q: x.q, a: x.a, marks: clamp(x.marks, 5, 25), topic: x.topic || '' })));
    }
    if (!questions.length) throw Object.assign(new Error(aiReady() ? 'Nothing to build a mock from. Add topics in Units, or add questions from your notes (below).' : 'No banked questions for this unit and no AI key to write some. Use the Prompt Builder (Mock exam questions) in another AI, or add a key.'), { status: 400 });
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

// Submit a finished mock. With an AI key it's marked in one call; without, the model answers are
// returned and the dashboard lets you self-mark (then PATCH /api/mocks/<id> saves the score).
async function submitMock(id, { answers = [] }) {
  const mock = data.mocks.find((m) => m.id === id);
  if (!mock) throw Object.assign(new Error('mock not found'), { status: 404 });
  const items = mock.questions.map((qq, i) => ({ q: qq.q, a: qq.a, marks: qq.marks, user: String(answers[i] ?? '').trim() }));
  mock.answers = items.map((it) => ({ user: it.user }));
  mock.finishedAt = new Date().toISOString();
  save();
  if (!aiReady() || mock.questions.some((qq) => qq.noKey)) { // an AI can't mark against a key that isn't there
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

function checkHint(b) {
  if ('kind' in b && !['focus', 'exclude', 'note'].includes(b.kind)) throw Object.assign(new Error('a hint is focus, exclude or note'), { status: 400 });
  if ('topicIds' in b && !(Array.isArray(b.topicIds) && b.topicIds.every((id) => data.topics.some((t) => t.id === id)))) throw Object.assign(new Error('unknown topic in the hint'), { status: 400 });
  return b;
}

// Validation for generic list writes (undo re-POSTs a deleted row with its id, so create goes through here too).
const CHECKS = {
  hints: (b) => checkHint(b),
  // a topic you pick for a past-paper question is yours: re-reading the papers won't change it
  paperq: (b) => ('topicId' in b ? { ...b, topicFrom: 'you' } : b),
  subtopics: (b, opts) => {
    const out = checkSubtopic(b, opts);
    if ('audit' in b && !opts?.create) Object.assign(out, { auditAt: new Date().toISOString(), auditFrom: 'you' });
    return out;
  },
};

async function api(req, url) {
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.parse(Buffer.concat(await req.toArray()).toString() || '{}') : null;
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) return route(url.searchParams, body);
  const submit = url.pathname.match(/^\/api\/mocks\/([\w-]+)\/submit$/);
  if (req.method === 'POST' && submit) return submitMock(submit[1], body);
  // generic lists: POST /api/topics, PATCH /api/topics/<id>, DELETE /api/topics/<id>
  const [, list, id] = url.pathname.match(/^\/api\/(\w+)(?:\/([\w-]+))?$/) || [];
  if (LISTS.includes(list)) {
    const check = CHECKS[list] || ((b) => b);
    if (req.method === 'POST' && !id) return add(list, check(body, { create: true }));
    if (req.method === 'PATCH' && id) return patch(list, id, check(body)) ?? Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
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
