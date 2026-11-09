// Every API route of Crux, shared by the local dev server (index.js) and the Vercel function (api/router.js).
// Handlers read and write `data`, which is the signed-in student's document for this request (store.js).
import { coach, coachReady } from './coach.js';
import { aiReady, canRead, clamp, provider } from './ai.js';
import { makeQuestions, makeStudyMaterial, mapQuestions, markAnswers, suggestSubtopics, suggestTopics, transcribe } from './brain.js';
import { checkMedia, saveUpload } from './uploads.js';
import { LOCAL_TYPES, addLocalFile, bookExamples, contextFor, ensureLibrary, library, libraryMeta, localFiles, outlineContext, prepareUnit, remote, removeLocalFile } from './ingest.js';
import { ALL_UNITS, calendar, filesFor, nextAssessment } from './library.js';
import { COURSES, cohortUnits, courses, validCohort } from './cohort.js';
import { ERROR_TYPES, STAGES, TBA } from './defs.js';
import { stageMix, validStage } from './stages.js';
import { masteryMap } from './mastery.js';
import { checkSubtopic } from './analysis.js';
import { PARSER_VERSION, hintFields, isBook, parsePapers, pastePaper, predictFor, scannedPapers, teachFlags, weakspotsFor } from './weakspots.js';
import { predictedMock } from './predict.js';
import { GOALS, STYLES, buildPack } from './context-pack.js';
import { isDay, nairobiDay, stats, todayPlan, unitStage } from './plan.js';
import { todayBoard } from './board.js';
import { buildPrompt } from './prompt.js';
import { nextActions } from './next.js';
import { activity, insights } from './insights.js';
import { deleteNote, importNotes, listNotes, loadNotes, ownNotes } from './notes-store.js';
import { bump, usedToday } from './usage.js';
import { downloadLink } from './downloads.js';
import { requestScope } from './store.js';
import { KITS, KIT_FOR, makeKitFor } from './kit.js';
import { focusCounts, setFocus } from './focus.js';
import { classHints, classList, confirmHint, listOf, offerList, shareHint } from './shared.js';
import { newMaterial } from './inbox.js';
import { makeGuideFor } from './guide.js';
import { contributors, finishUpload, myUploads, postedDays, startUpload, unitPapers } from './hub-uploads.js';
import { rewardInfo } from './rewards.js';
import { learnFor, topicPlaces } from './learn-store.js';
import { KEY_LABEL, askAbout, breakOf, checkAnswer, checkPhoto, ensureCheckpoints, explainBatch, explainQuestion, flagCheckpoint, markBroke, savedExplain } from './practice.js';
import { LISTS, add, data, patch, remove, save } from './store.js';

// The retired flashcards (cards, reviews) stay in study.json but never go to the dashboard; only their count does,
// for the one-time "flashcards retired" note.
const state = () => {
  const today = nairobiDay();
  const { cards, reviews, ...shown } = data;
  const units = Object.fromEntries(data.units.map((u) => [u.code, unitStage(u, today)]));
  return {
    units, stageMix: stageMix(Object.values(units).map((x) => x.stage)), stages: STAGES.map(({ maxDays, ...s }) => s),
    errorTypes: ERROR_TYPES, kits: { names: KITS, forStage: KIT_FOR },
    goals: Object.entries(GOALS).map(([id, g]) => ({ id, name: g.name })),
    styles: Object.entries(STYLES).map(([id, x]) => ({ id, name: x.name })),
    today, data: shown, calendar, next: nextAssessment(today), plan: todayPlan(today), stats: stats(today),
    retiredCards: cards?.length || 0, coach: coachReady(), ai: aiReady(), media: { image: canRead('image'), audio: canRead('audio') }, provider: provider(), settings: data.settings,
    mastery: masteryMap(today), library: libraryMeta(), board: todayBoard(today),
    next: nextActions(today, { prepared: new Set(Object.values(library.files).filter((e) => e.text).map((e) => e.unit)) }),
  };
};

const routes = {
  'GET /api/state': () => state(),
  'GET /api/me': (q, body, ctx) => ctx.user,
  // Everything Crux keeps about you, as one JSON file (Settings → Export my data).
  'GET /api/export': async (q, body, ctx) => ({ exportedAt: new Date().toISOString(), user: ctx?.user, doc: JSON.parse(JSON.stringify(data)), notes: await listNotes(ctx?.user?.id) }),
  // "Bring data back": a file from Export my data, merged in. Nothing you have now is replaced: units, topics,
  // attempts, notes, highlights and the rest come back only where they're missing. { added: { list: n }, notes }.
  'POST /api/import': async (q, body, ctx) => importData(body || {}, ctx?.user?.id),
  // Imported notes (Obsidian, Notion): parsed in the browser, saved per unit and title.
  'GET /api/notes': (q, body, ctx) => listNotes(ctx.user.id, q.get('unit')),
  // Today's AI actions against the member's limit, for Settings.
  // the bell and the Focus page: small, cheap reads the app makes at most every few minutes
  // the shared unit library: the class's topic list for a unit. Opening a unit with your own list of 3+ topics
  // shares it if the class has none yet; using the class list copies it into your document.
  'GET /api/class': async (q, body, ctx) => {
    const unit = q.get('unit');
    const mine = listOf(data, unit);
    const list = (await offerList(unit, mine, ctx?.user?.id || 'local').catch(() => null)) || await classList(unit).catch(() => null);
    return { list, yours: mine.length };
  },
  'POST /api/class/use': async (q, { unit } = {}) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    const list = await classList(unit);
    if (!list) throw Object.assign(new Error('No class list for this unit yet.'), { status: 404 });
    let order = Math.max(0, ...data.topics.filter((t) => t.unit === unit).map((t) => t.order || 0));
    for (const t of list.topics) {
      let tp = data.topics.find((x) => x.unit === unit && x.name.toLowerCase() === t.name.toLowerCase());
      if (!tp) tp = add('topics', { unit, name: t.name, status: 'red', order: ++order });
      let n = Math.max(0, ...data.subtopics.filter((x) => x.topicId === tp.id).map((x) => x.order || 0));
      const have = new Set(data.subtopics.filter((x) => x.topicId === tp.id).map((x) => x.name.toLowerCase()));
      for (const name of t.subtopics || []) if (!have.has(name.toLowerCase())) add('subtopics', { ...checkSubtopic({ name, kind: 'concept' }, { create: true }), unit, topicId: tp.id, order: ++n });
    }
    parsePapers(unit); // the new topics tag the unit's past-paper questions straight away
    return state();
  },
  // the owner can replace a unit's class list with theirs (a better or corrected outline)
  'POST /api/class/share': async (q, { unit } = {}, ctx) => {
    if (ctx?.user && ctx.user.tier !== 'owner') throw Object.assign(new Error('Only the owner can replace a class list.'), { status: 403 });
    return { list: await offerList(unit, listOf(data, unit), ctx?.user?.id || 'local', { force: true }) };
  },
  // class hints: a lecturer hint marked "the whole class heard this", with a count of who heard it too
  'GET /api/class/hints': (q, body, ctx) => classHints(q.get('unit'), ctx?.user?.id || 'local'),
  'POST /api/class/hints': (q, { unit, kind, text, topicIds = [] } = {}, ctx) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (!['focus', 'exclude', 'note'].includes(kind) || !String(text || '').trim()) throw Object.assign(new Error('A hint needs its words and a kind.'), { status: 400 });
    const topics = data.topics.filter((t) => topicIds.includes(t.id)).map((t) => t.name);
    return shareHint(unit, { kind, text, topics }, ctx?.user?.id || 'local');
  },
  // "I heard it too": counts you once and copies the hint into your own hints, so it moves your predictions
  'POST /api/class/hints/confirm': async (q, { id } = {}, ctx) => {
    const me = ctx?.user?.id || 'local';
    const h = await confirmHint(id, me);
    if (!h) throw Object.assign(new Error('That hint is gone.'), { status: 404 });
    if (data.units.some((u) => u.code === h.unit_code) && !data.hints.some((x) => x.unit === h.unit_code && x.text === h.text)) {
      const names = (h.topics || []).map((n) => n.toLowerCase());
      const topicIds = data.topics.filter((t) => t.unit === h.unit_code && names.includes(t.name.toLowerCase())).map((t) => t.id);
      add('hints', hintFields(h.unit_code, h.text, { kind: h.kind, topicIds: topicIds.length ? topicIds : undefined }));
    }
    return classHints(h.unit_code, me);
  },
  'POST /api/sync': (q, body = {}) => {
    const at = Date.now();
    data.settings.sync = { ...data.settings.sync };
    for (const k of ['look', 'unit', 'bellSeen', 'inboxSeen', 'focus']) if (k in body) data.settings.sync[k] = { v: body[k], at };
    save();
    return { at };
  },
  'GET /api/inbox': (q) => newMaterial(data.units.map((u) => u.code), q.get('since')),
  'GET /api/focus': (q, body, ctx) => focusCounts(ctx?.user?.id || 'local', q.get('unit') || null).catch(() => ({ others: null, room: null })),
  'POST /api/focus': (q, { until = null, unit = null } = {}, ctx) => setFocus(ctx?.user?.id || 'local', until, Date.now(), unit === 'hub' ? 'hub' : null) /* the study room is one for the whole hub */.catch((e) => { if (e.status) throw e; return { others: null, room: null }; }),
  'GET /api/usage': async (q, body, ctx) => ({ ai: await usedToday(ctx?.user, 'ai'), download: await usedToday(ctx?.user, 'download') }),
  'POST /api/notes/import': (q, { notes } = {}, ctx) => importNotes(ctx.user.id, notes, data.units.map((u) => u.code)),
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
    const { files: hub, note } = await filesFor(unit);
    const files = [...hub, ...localFiles(unit)];
    const merged = files.map((f) => {
      const e = library.files[f.id];
      return { id: f.id, name: f.name, paper: f.paper, url: f.url, synced: Boolean(e), chars: e?.text?.length || 0, pages: e?.pages || 0, text: e?.text || '', local: Boolean(e?.local) };
    });
    return { note, files: merged };
  },
  // Reads a unit's files into the shared library (scans through OCR), about 45 seconds at a time: the app calls again
  // while `pending` > 0. Then reads the unit's past papers into questions (no AI), so Predict is ready.
  'POST /api/library/prepare': async (q, { unit }) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    const { files, note } = await filesFor(unit);
    if (note) return { note, files: [], done: 0, total: 0, pending: 0 };
    const { results, ...progress } = await prepareUnit(files, unit);
    return { files: results, ...progress, parsed: parsePapers(unit) };
  },
  // A file from this computer: { unit, name, file: { data (base64) } }. Kept in the library, then the unit's papers are
  // read again, so a tutorial's questions (and its printed answers, as keys) show up straight away.
  'POST /api/library/upload': async (q, { unit, name, file }) => {
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (remote()) throw Object.assign(new Error("Adding files from your device isn't ready on the web yet. Drop them in the Hub Dumper folder instead."), { status: 400 });
    if (!LOCAL_TYPES.test(String(name || '')) || !file?.data) throw Object.assign(new Error('Add a PDF, Word (.docx), PowerPoint (.pptx) or text file.'), { status: 400 });
    const added = await addLocalFile(unit, String(name), Buffer.from(file.data, 'base64'));
    if (!added.chars) return { ...added, note: 'No text could be read from it (a scan or picture). Paste its questions in Predict instead.' };
    return { ...added, parsed: parsePapers(unit) };
  },
  'POST /api/library/remove': (q, { id }) => {
    const unit = library.files[id]?.unit;
    const removed = removeLocalFile(id);
    if (removed) { data.paperq = data.paperq.filter((x) => x.fileId !== id); save(); }
    return { removed, ...(removed && unit && { parsed: parsePapers(unit) }) };
  },
  // AI topic suggestions for a unit from its synced course outline and past papers; nothing is saved until the
  // student adds them.
  'POST /api/topics/suggest': async (q, { unit }) => {
    const u = data.units.find((x) => x.code === unit);
    if (!u) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (!aiReady()) throw Object.assign(new Error('No AI key for the selected provider. Copy the topics from the course outline by hand, or use the Prompt Builder.'), { status: 400 });
    if (!data.paperq.some((x) => x.unit === unit)) parsePapers(unit);
    const have = data.topics.filter((t) => t.unit === unit).map((t) => t.name);
    const { text, sources, outline } = outlineContext(unit, data.paperq.filter((x) => x.unit === unit && !isBook(x)).map((x) => x.text));
    const { topics } = await suggestTopics({ unit, title: u.title, have, context: text, outline });
    return { suggestions: topics.filter((t) => !have.some((h) => h.toLowerCase() === t.name.toLowerCase())), sources, outline };
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
  'POST /api/teach': async (q, { unit, topic, text }) => teachBack({ unit, topic, text }),
  // A spoken teach-back (Phase 9): { unit, topic, audio: { mime, data } } → transcribed, then marked like a typed one.
  'POST /api/teach/audio': async (q, { unit, topic, audio }) => {
    if (!unit || !topic) throw Object.assign(new Error('Pick the unit and the topic first.'), { status: 400 });
    const clip = checkMedia(audio, 'audio');
    if (!canRead('audio')) throw Object.assign(new Error(`${provider()} can't listen to recordings. Switch to Gemini in Settings, or type your explanation.`), { status: 400 });
    const { transcript, clear } = await transcribe({ topic, audio: clip });
    if (!clear || String(transcript || '').trim().length < 20) return { unclear: true, transcript: transcript || '', message: 'That recording was too quiet, too short or off the topic. Record again somewhere quieter, or type it.' };
    return { ...(await teachBack({ unit, topic, text: transcript.trim(), audio: saveUpload(clip, 'voice') })), transcript: transcript.trim() };
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
  // The files a pack can carry, for the Prompt Builder's file list: { files: [{ id, name, paper, size (bytes) | null,
  // tokens, scanned }] }. Sizes come from the hub's file index; tokens from the text Crux has read.
  'GET /api/pack/files': async (q) => {
    const unit = q.get('unit');
    const hub = new Map((await filesFor(unit).catch(() => ({ files: [] }))).files.map((f) => [String(f.id), f]));
    const files = Object.entries(library.files).filter(([, e]) => e.unit === unit)
      .map(([id, e]) => ({ id, name: e.name, paper: Boolean(e.paper), size: hub.get(id)?.size || null, tokens: Math.ceil((e.text || '').length / 4), scanned: !e.text }))
      .sort((a, b) => Number(b.paper) - Number(a.paper) || a.name.localeCompare(b.name));
    return { files };
  },
  // Deep Context Pack: { unit, topicId? | topic? (name), questionIds? | questionId?, fileIds?, goal? } → { prompt, md,
  // filename, checklist, tokens, cut }. fileIds limits the course material to those files. Works without an AI key.
  'POST /api/pack': (q, body) => {
    const unit = data.units.find((u) => u.code === body.unit);
    if (!unit) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    if (body.goal && !GOALS[body.goal]) throw Object.assign(new Error('unknown goal'), { status: 400 });
    const wanted = Array.isArray(body.questionIds) ? body.questionIds : body.questionId ? [body.questionId] : [];
    const targets = wanted.map((id) => data.paperq.find((x) => x.id === id && x.unit === unit.code)).filter(Boolean).slice(0, 12);
    const question = targets[0] || null;
    const only = Array.isArray(body.fileIds) ? new Set(body.fileIds.map(String)) : null;
    const topic = data.topics.find((t) => t.unit === unit.code && (t.id === (body.topicId || question?.topicId) || (body.topic && t.name.toLowerCase() === String(body.topic).toLowerCase()))) || null;
    const subs = data.subtopics.filter((s) => s.unit === unit.code && (!topic || s.topicId === topic.id));
    const ids = new Set(subs.map((s) => s.id));
    const { critical, errors } = weakspotsFor(unit.code, nairobiDay());
    const since = Date.now() - 30 * 86400000;
    const cohort = data.settings.cohort ? { ...data.settings.cohort, name: COURSES[data.settings.cohort.course] } : null;
    return buildPack({
      unit, cohort, stage: body.stage && validStage(body.stage) ? body.stage : unitStage(unit).stage.id, topic, subtopics: subs, goal: body.goal, style: body.style, focus: body.focus,
      weak: critical.filter((c) => !topic || c.topicId === topic.id), errors: errors.counts,
      hints: data.hints.filter((h) => h.unit === unit.code && (!topic || !h.topicIds?.length || h.topicIds.includes(topic.id))),
      questions: data.paperq.filter((x) => x.unit === unit.code && (topic ? x.topicId === topic.id : true)).slice(0, 40),
      targets,
      failures: data.attempts.filter((a) => a.verdict === 'wrong' && Date.parse(a.at) >= since && (ids.has(a.subtopicId) || (topic && a.topicId === topic.id))).map(breakOf),
      files: Object.entries(library.files).filter(([id, e]) => e.unit === unit.code && (!only || only.has(id))).map(([, e]) => ({ name: e.name, paper: e.paper, text: e.text || '' })),
      today: nairobiDay(),
      guide: topic?.guide || null,
      places: topic ? topicPlaces(unit.code, topic) : [],
      unitTopics: data.topics.filter((t) => t.unit === unit.code).sort((a, b) => (a.order || 0) - (b.order || 0)).map((t) => t.name),
    });
  },
  // Checkpoint feedback: { unit, questionId? | question?, topicId?, answer, operations?, key?, showCheckpoints? } →
  // the verdict, the answer key and its source, and numbered checkpoints. Nothing is held against you until you
  // mark the step where your working broke.
  // Learn a topic: { unit, topicId } → pages to read in your own files, questions to try, then what next. No AI.
  'GET /api/learn': async (q) => learnFor(q.get('unit'), q.get('topicId')),
  // Files a student adds for the hub: a link to upload straight to storage, then "done" queues it for the hub PC.
  'POST /api/uploads/start': async (q, body, ctx) => startUpload(body || {}, ctx.user),
  'POST /api/uploads/done': async (q, body, ctx) => finishUpload(body || {}, ctx.user),
  'GET /api/uploads/papers': (q) => ({ papers: unitPapers(q.get('unit')) }),
  'GET /api/uploads': async (q, body, ctx) => ({ files: await myUploads(q.get('unit'), ctx.user), credits: await rewardInfo(ctx.user, ctx.today || nairobiDay()) }),
  // A topic's study guide: { unit, topicId, fresh? } → what to learn and where in your books. Shared with the class.
  'POST /api/learn/guide': async (q, body) => makeGuideFor(body || {}),
  // Study kit (Phase 10): { unit, kind?, topicId? } → the saved material, or { needKey, goal } with no AI key.
  'POST /api/materials/make': async (q, body) => makeKitFor(body || {}),
  'POST /api/attempts/check': async (q, body) => checkAnswer(body || {}),
  // A photo of your working (Phase 9): { unit, questionId? | question?, image: { mime, data } } → read, checked, and
  // the broken checkpoint suggested.
  'POST /api/attempts/photo': async (q, body) => checkPhoto(body || {}),
  'POST /api/attempts/checkpoints': async (q, body) => ensureCheckpoints(body || {}),
  // The full worked solution and free body diagram for a question: { unit, questionId, fresh? }.
  'GET /api/attempts/explain': (q) => savedExplain(data.paperq.find((x) => x.id === q.get('questionId') && x.unit === q.get('unit'))) || { none: true },
  'POST /api/attempts/explain': async (q, body) => explainQuestion(body || {}),
  // Solve several: { unit, questionIds } → the next 2-4 solved in one AI call; { done, left }.
  'POST /api/attempts/explain-batch': async (q, body) => explainBatch(body || {}),
  // "Ask about this": { unit, questionId, messages } → { reply }, a follow-up on the question and its solution
  'POST /api/attempts/ask': async (q, body) => askAbout(body || {}),
  'POST /api/attempts/broke': (q, body) => markBroke(body || {}),
  'POST /api/attempts/flag': (q, body) => flagCheckpoint(body || {}),
  // The weakspot matrix for one unit: critical sub-topics (exam weight × weakness) and recurring errors.
  // Insights across every unit: weakspots by priority (with the mistakes behind each and when it was last tried),
  // mistakes by type over 14 days, and questions tried per day for 14 days.
  'GET /api/insights': (q, body, ctx) => insights(ctx?.today || nairobiDay()),
  'GET /api/activity': async (q, body, ctx) => {
    const today = ctx?.today || nairobiDay();
    const since = new Date(Date.parse(`${today}T00:00:00+03:00`) - 150 * 864e5).toISOString();
    return activity(today, ctx?.user ? await postedDays(ctx.user, since).catch(() => []) : []);
  },
  'GET /api/contributors': async (q, body, ctx) => contributors(ctx?.user || {}),
  'GET /api/weakspots': (q) => {
    const unit = q.get('unit');
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    return weakspotsFor(unit, nairobiDay());
  },
  // Predictions for one unit: ranked topics, its parsed past-paper questions, hints and scanned papers.
  'GET /api/predict': (q) => {
    const unit = q.get('unit');
    if (!data.units.some((u) => u.code === unit)) throw Object.assign(new Error('Pick one of your units first.'), { status: 400 });
    // papers read by an older question splitter are read again once (no AI), so fixes reach saved questions
    const read = data.settings.papersRead ||= {};
    if (read[unit] !== PARSER_VERSION) { parsePapers(unit); read[unit] = PARSER_VERSION; save(); }
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
    const todo = data.paperq.filter((x) => x.unit === unit && x.topicFrom !== 'you' && !isBook(x));
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
      if (k === 'aiProvider' && !['gemini', 'deepseek'].includes(v)) throw Object.assign(new Error('unknown AI provider'), { status: 400 });
      if (k === 'cohort' && !validCohort(v)) throw Object.assign(new Error('pick a course, a year (1-5) and a semester (1 or 2)'), { status: 400 });
      if (k === 'stage' && !validStage(v)) throw Object.assign(new Error('unknown study stage'), { status: 400 });
      data.settings[k] = v;
    }
    save();
    return state();
  },
  // Notes → CAT questions for the timed-paper bank: pasted text, or one of your imported notes (noteId).
  'POST /api/notes': async (q, { unit, topic, text: pasted, noteId }) => {
    const text = pasted || ownNotes(unit).find((n) => n.id === noteId)?.text;
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
      const questions = predictedMock(predictFor(unit, nairobiDay()), data.paperq.filter((x) => x.unit === unit && !isBook(x)))
        // the answer key saved by "Check my answer" when there is one; without, the mock is self-marked (see submitMock)
        .map((x) => (x.key
          ? { q: x.q, a: `Final answer (${KEY_LABEL[x.key.source]}): ${x.key.answer}`, marks: x.marks, topic: x.topic, fileId: x.fileId, page: x.page }
          : { q: x.q, a: `No answer key yet: mark it against the ${x.source || 'paper'} marking scheme, or check it in Check answer first.`, marks: x.marks, topic: x.topic, fileId: x.fileId, page: x.page, noKey: true }));
      if (!questions.length) throw Object.assign(new Error('No past-paper questions mapped to topics yet. In Predictions, read the past papers and check their topics.'), { status: 400 });
      const mock = add('mocks', { unit, name: body.name?.trim() || `${unit} predicted mock`, questions, predicted: true });
      return { id: mock.id, unit: mock.unit, name: mock.name, at: mock.at, questions: mock.questions.map(({ q, marks, fileId, page, book }) => ({ q, marks, fileId, page, book })) };
    }
    const count = body.count ? clamp(body.count, 1, 10) : 5;
    const bank = data.questions.filter((x) => x.unit === unit).sort(() => Math.random() - 0.5);
    let questions = bank.slice(0, count).map((x) => ({ q: x.q, a: x.a, marks: x.marks, topic: x.topic || '' }));
    const topicName = (id) => data.topics.find((t) => t.id === id)?.name || '';
    const books = data.paperq.filter((x) => x.unit === unit && isBook(x)).sort((a, b) => Number(Boolean(b.bookSolution)) - Number(Boolean(a.bookSolution)) || Math.random() - 0.5);
    questions = questions.concat(books.slice(0, count - questions.length).map((x) => ({
      q: x.text, marks: 10, topic: topicName(x.topicId), source: `${x.source}, ${x.label}`, fileId: x.fileId, page: x.page || null, book: true,
      a: x.bookSolution ? `The book's solution (${x.label}):\n${x.bookSolution}` : `The book gives no worked solution for ${x.label}. Open it in Practise for a full worked solution.`,
    })));
    if (questions.length < count && aiReady()) {
      const extra = await makeQuestions({ unit, topics: data.topics.filter((t) => t.unit === unit), count: count - questions.length, context: contextFor(unit, '', 6000), examples: bookExamples(unit) });
      questions = questions.concat(extra.questions.map((x) => ({ q: x.q, a: x.a, marks: clamp(x.marks, 5, 25), topic: x.topic || '', ...(x.from && { source: x.from }) })));
    }
    if (!questions.length) throw Object.assign(new Error(aiReady() ? 'Nothing to build a mock from. Add topics in Units, or add questions from your notes (below).' : 'No banked questions for this unit and no AI key to write some. Use the Prompt Builder (Mock exam questions) in another AI, or add a key.'), { status: 400 });
    const mock = add('mocks', { unit, name: body.name?.trim() || `${unit} mock`, questions });
    return { id: mock.id, unit: mock.unit, name: mock.name, at: mock.at, questions: mock.questions.map(({ q, marks, fileId, page, book }) => ({ q, marks, fileId, page, book })) };
  },
  // Build a self-contained prompt to paste into any other AI chat, grounded in the synced library.
  'POST /api/prompt': (q, body) => buildPrompt(body || {}),
};

// A teach-back, typed or spoken: marked by the coach when there's an AI key, saved either way, and its gaps flag
// the matching sub-topics shaky.
async function teachBack({ unit, topic, text, audio }) {
  if (!unit || !topic || !text?.trim()) throw Object.assign(new Error('unit, topic and text are needed'), { status: 400 });
  let feedback = null;
  let error = null;
  if (coachReady()) { try { feedback = await coach({ unit, topic, text }); } catch (e) { error = e.message; } }
  const item = add('teach', { unit, topic, text, feedback, ...(audio && { audio, spoken: true }) });
  const tp = data.topics.find((x) => x.unit === unit && x.name.toLowerCase() === topic.toLowerCase());
  if (tp) { tp.taughtAt = item.at; save(); }
  return { item, error, flags: teachFlags(unit, topic, feedback) };
}

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
  // highlights in the PDF viewer: { file (hub file id), page, rects [[x, y, w, h] as fractions of the page], text }
  marks: (b, opts) => {
    const out = {};
    if (opts?.create) {
      out.file = String(b.file || '').slice(0, 40);
      out.page = Math.max(1, Math.round(Number(b.page) || 1));
      out.rects = (Array.isArray(b.rects) ? b.rects : []).slice(0, 60).map((r) => (Array.isArray(r) ? r.slice(0, 4).map((v) => Math.min(1, Math.max(0, Number(v) || 0))) : null)).filter((r) => r?.length === 4);
      if (!out.file || !out.rects.length) throw Object.assign(new Error('Select some text on the page first.'), { status: 400 });
    }
    if ('text' in b || opts?.create) out.text = String(b.text || '').trim().slice(0, 1000);
    return out;
  },
  // the notes bar: { text (up to 2000 characters), unit (a unit code, or null for all units), from, order }
  stickies: (b, opts) => {
    const out = {};
    if ('text' in b || opts?.create) {
      out.text = String(b.text ?? '').trim().slice(0, 2000);
      if (!out.text) throw Object.assign(new Error('Write something first.'), { status: 400 });
    }
    if ('unit' in b || opts?.create) out.unit = data.units.some((u) => u.code === b.unit) ? b.unit : null;
    if ('from' in b) out.from = String(b.from || '').trim().slice(0, 120);
    if ('order' in b) out.order = Number(b.order) || 0;
    return out;
  },
  // a topic you pick for a past-paper question is yours: re-reading the papers won't change it
  paperq: (b) => ('topicId' in b ? { ...b, topicFrom: 'you' } : b),
  subtopics: (b, opts) => {
    const out = checkSubtopic(b, opts);
    if ('audit' in b && !opts?.create) Object.assign(out, { auditAt: new Date().toISOString(), auditFrom: 'you' });
    return out;
  },
};

// "Bring data back" (POST /api/import): an exported file merged into your document, adding only what's missing.
async function importData(file, userId) {
  const doc = file.doc;
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.units)) throw Object.assign(new Error("That isn't a Crux export (the file from Export my data)."), { status: 400 });
  const added = {};
  const units = new Set(data.units.map((u) => u.code));
  for (const u of doc.units) if (u?.code && !units.has(u.code)) { data.units.push(u); units.add(u.code); added.units = (added.units || 0) + 1; }
  for (const list of [...LISTS, 'attempts']) {
    if (!Array.isArray(doc[list]) || !Array.isArray(data[list])) continue;
    const have = new Set(data[list].map((x) => x?.id));
    for (const x of doc[list]) if (x?.id && !have.has(x.id)) { data[list].push(x); have.add(x.id); added[list] = (added[list] || 0) + 1; }
  }
  const notes = Array.isArray(file.notes) && file.notes.length && userId ? await importNotes(userId, file.notes, data.units.map((u) => u.code)) : null;
  save();
  return { added, notes };
}

// One request: method + path → a handler (query, body, ctx). ctx = { user: { id, name, tier }, today }.
// Errors carry .status; the dev server and the Vercel router turn them into { error }.
// Routes that ground their work in the student's own notes: those notes are loaded into the request first.
const READS_NOTES = /^\/api\/(learn|teach|notes$|mocks|subtopics\/suggest|topics\/suggest|materials\/make|pack|attempts\/(check|photo|checkpoints|explain|explain-batch|ask))/;

// Routes that use the AI: each request is one "AI action" against the member's daily limit.
const USES_AI = /^\/api\/(teach(\/audio)?|notes|mocks(\/[\w-]+\/submit)?|subtopics\/suggest|topics\/suggest|materials\/make|attempts\/(check|photo|checkpoints|explain|explain-batch|ask)|learn\/guide|predict\/map)$/;
export const AI_LIMIT_MESSAGE = "Today's AI limit is used. Take this pack to any AI.";

export async function dispatch(method, pathname, query, body, ctx) {
  const scope = requestScope();
  if (scope && ctx?.user) scope.user = ctx.user; // the provider choice depends on the tier (ai.js)
  if (scope && ctx?.memo) scope.memo = ctx.memo; // AI answers kept for a redo after a save conflict
  if (method === 'POST' && USES_AI.test(pathname) && ctx?.user && aiReady() && !ctx.redo) {
    const used = await bump(ctx.user, 'ai');
    if (!used.ok) throw Object.assign(new Error(AI_LIMIT_MESSAGE), { status: 429, limit: 'ai' });
  }
  await ensureLibrary([...data.units.map((u) => u.code), query?.get?.('unit'), body?.unit]); // shared file text, cached
  const unitHere = query?.get?.('unit') || body?.unit || data.topics.find((t) => t.id === (query?.get?.('topicId') || body?.topicId))?.unit;
  if (READS_NOTES.test(pathname) && ctx?.user) await loadNotes(ctx.user.id, unitHere);
  const file = method === 'GET' && pathname.match(/^\/api\/files\/(\d+)\/download$/);
  if (file) return downloadLink(ctx.user, file[1]);
  const note = method === 'DELETE' && pathname.match(/^\/api\/notes\/([\w-]+)$/);
  if (note) return { removed: await deleteNote(ctx.user.id, note[1]) };
  const route = routes[`${method} ${pathname}`];
  if (route) return route(query, body, ctx);
  const submit = pathname.match(/^\/api\/mocks\/([\w-]+)\/submit$/);
  if (method === 'POST' && submit) return submitMock(submit[1], body);
  // generic lists: POST /api/topics, PATCH /api/topics/<id>, DELETE /api/topics/<id>
  const [, list, id] = pathname.match(/^\/api\/(\w+)(?:\/([\w-]+))?$/) || [];
  if (LISTS.includes(list)) {
    const check = CHECKS[list] || ((b) => b);
    if (method === 'POST' && !id) return add(list, check(body, { create: true }));
    if (method === 'PATCH' && id) return patch(list, id, check(body)) ?? Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
    if (method === 'DELETE' && id) return { removed: remove(list, id) };
  }
  throw Object.assign(new Error('no such endpoint'), { status: 404 });
}
