// fixplan-e E1: solve a unit's past-paper questions with strong models on this laptop, once for the whole class.
//   node tools/gold.js "EMM 302" --dry                 counts only: questions, printed answers, already settled
//   node tools/gold.js "EMM 302" --limit 10            solve up to 10 questions that are not settled yet
//   node tools/gold.js "EMM 302" --only-keyed --limit 5 --no-save    score the solvers on printed answers (E6 too)
// Other flags: --books (book exercises too),
// --no-full (checkpoints only, no full worked solution: half the Opus calls), --redo (solve settled ones again).
//
// First solver: Opus through Claude Code (the owner's plan, no API key). Second: DeepSeek Flash (DEEPSEEK_API_KEY).
// Levels and the write rule: server/gold.js. Each question is saved as soon as it is done, so the same command
// resumes after a stop. The questions that need the owner's eye go to study/data/gold/<unit>-<date>.md.
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const f of ['../.env', '../../pc/.env', '../../community/.env']) config({ path: fileURLToPath(new URL(f, import.meta.url)), quiet: true });

const argv = process.argv.slice(2);
const unit = argv.find((a) => !a.startsWith('--'));
const flag = (name) => argv.includes(`--${name}`);
const limitAt = argv.indexOf('--limit');
const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : Infinity;
const opt = { dry: flag('dry'), onlyKeyed: flag('only-keyed'), books: flag('books'), full: !flag('no-full'), save: !flag('no-save'), redo: flag('redo'), local: flag('local') };
// --local: this laptop's own questions and study.json (files added from here, like tutorial sheets), not the class's
// shared library. For the owner's own study; nothing is shared. Stop the dev server first: it rewrites study.json.

const stop = (msg) => { console.log(msg); process.exit(1); };
if (!unit) stop('Usage: node tools/gold.js "EMM 302" [--dry] [--limit N] [--only-keyed] [--books] [--no-full] [--no-save] [--redo] [--local]');
if (process.env.VERCEL) stop('This runs on the owner\'s laptop only.');
if (!Number.isFinite(limit) && limitAt >= 0) stop('--limit needs a number, for example --limit 10.');
if (!opt.local && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)) stop('SUPABASE_URL and SUPABASE_SERVICE_KEY are missing from study/.env (run setup-web.bat). The shared library lives there.');
if (!opt.dry && !process.env.DEEPSEEK_API_KEY) stop('DEEPSEEK_API_KEY is missing from study/.env (run setup-web.bat). It is the second solver.');
if (!opt.local) process.env.CRUX_REMOTE_LIBRARY = '1'; // the class's file text and shared solutions, not this laptop's copies

const { withModel } = await import('../server/ai.js');
const { explainSolution, solveWithCheckpoints } = await import('../server/brain.js');
const { GOLD } = await import('../server/defs.js');
const { rank, report, sameAnswer, settle, strong } = await import('../server/gold.js');
const { ensureLibrary } = await import('../server/ingest.js');
const { schemeFor, shapeSolution, tidy } = await import('../server/practice.js');
const { questionKey, shareSolution, sharedSolution, usesOldTable } = await import('../server/shared.js');
const { data, save } = await import('../server/store.js');
const { isBook, parsePapers } = await import('../server/weakspots.js');
const { nairobiDay } = await import('../server/plan.js');
const { db, enc } = await import('../../lib/db.js');

await ensureLibrary([unit]);
const parsed = parsePapers(unit); // the same parser the app uses, so the question keys match the students' ones
console.log(`${unit}: ${parsed.questions} questions from ${parsed.papers} papers (this rewrites the unit's questions in study/data/study.json, keeping your topic choices).`);
if (parsed.scanned.length) console.log(`${parsed.scanned.length} scanned papers have no text yet: node tools/prepare-unit.js "${unit}"`);

const printedOf = (q) => (q.key?.source === 'sheet' ? (q.key.parts?.length ? q.key.parts : [q.key.answer]) : null);
const labelOf = (q) => `${q.source} ${q.label || `Q${q.number}`}`;
const all = data.paperq.filter((q) => q.unit === unit && (opt.books || !isBook(q)) && String(q.text || '').length >= 20);
const settled = (row) => row && !(row.flagged >= GOLD.flagsToReplace) && (rank(row.level) > 0 || strong(row.model)) && (!opt.full || row.solution);

const stored = new Map();
// local: what this laptop already has on the question itself
const localRow = (q) => (q.explain?.gold ? { level: q.explain.level, model: q.explain.model, solution: q.explain, flagged: 0 }
  : q.key?.local ? { level: q.key.level, model: GOLD.solver, solution: null, flagged: 0 } : null); // --no-full runs keep only the key
for (const q of all) stored.set(q.id, opt.local ? localRow(q) : await sharedSolution(unit, q.text));
const OLD = 'The shared table is missing E1 columns. Run the E1 SQL at the end of supabase/crux.sql in Supabase (SQL Editor; safe to run again), then run this again.';
if (usesOldTable() && opt.save && !opt.dry) stop(OLD);
if (usesOldTable()) console.log(`${OLD} Counting and scoring still work.`);

const keyed = all.filter(printedOf);
const done = all.filter((q) => settled(stored.get(q.id)));
const todo = all.filter((q) => (opt.redo || !settled(stored.get(q.id))) && (!opt.onlyKeyed || printedOf(q)));
const levels = Object.fromEntries(GOLD.levels.map((l) => [l, done.filter((q) => stored.get(q.id).level === l).length]));
console.log(`${all.length} questions${opt.books ? '' : ' (books left out: --books)'}, ${keyed.length} with a printed answer. Settled: ${done.length} (key ${levels.key}, agreed ${levels.agreed}, single by a strong model ${levels.single}). To do: ${todo.length}${opt.onlyKeyed ? ' with a printed answer' : ''}.`);

if (opt.dry && opt.local) process.exit(0);
if (opt.dry) {
  const keys = new Set(all.map((q) => questionKey(unit, q.text)));
  const gold = await db.select('crux_question_kb', `unit_code=eq.${enc(unit)}&model=in.(${GOLD.strongModels.join(',')})&select=qkey`).catch(() => []);
  const lost = gold.filter((r) => !keys.has(r.qkey)).length;
  if (lost) console.log(`${lost} strong-model solutions no longer match a question (the paper was read differently since). They stay unused.`);
  console.log(`A run takes about ${opt.full ? 2 : 1} Opus calls per question (3 when a printed answer is missed), and one DeepSeek Flash call (well under a cent).`);
  process.exit(0);
}
if (!opt.save) console.log('--no-save: nothing is written to the shared library.');

// --local: the solution goes on this laptop's own question, as if it came from the class (level shown, no AI later).
const SOURCE_OF_LEVEL = { agreed: 'agreed', single: 'strong' };
function keepLocal(q, { level, model, answer, solution, checkpoints, printed }) {
  const row = data.paperq.find((x) => x.id === q.id);
  if (!row) return false;
  const subs = data.subtopics.filter((x) => x.unit === unit);
  const cps = tidy(checkpoints, subs, row.subtopicIds?.[0]);
  if (solution) row.explain = { ...solution, level, model, gold: true };
  row.key = printed ? { ...row.key, checkpoints: cps, level, local: true } : { answer, source: SOURCE_OF_LEVEL[level] || 'strong', level, local: true, checkpoints: cps };
  save();
  return true;
}

const LIMIT_HIT = /usage limit|rate.?limit|limit (reached|exceeded)|out of (extra )?usage|429|quota|overloaded/i;
const results = [];
let failsInARow = 0;
let stoppedFor = null;
const batch = todo.slice(0, limit);
const POOL = 3; // three questions at a time
async function one(q, i) {
  if (stoppedFor) return;
  const label = labelOf(q);
  const printed = printedOf(q);
  const topic = data.topics.find((t) => t.id === q.topicId);
  const subtopics = data.subtopics.filter((s) => s.unit === unit && (!topic || s.topicId === topic.id)).map((s) => s.name);
  const scheme = schemeFor(q);
  // a question with a printed answer is solved blind: no scheme, which may hold that answer
  const base = { unit, topic: topic?.name || '', question: q.text, subtopics, scheme: printed ? '' : scheme?.text || '' };
  const opus = (extra = {}) => withModel('claude-code', GOLD.solver, () => solveWithCheckpoints({ ...base, ...extra }));
  try {
    const wantSecond = !printed || opt.onlyKeyed;
    const [first, second] = await Promise.all([opus(), wantSecond ? withModel('deepseek', GOLD.second, () => solveWithCheckpoints(base)) : null]);
    const told = printed && !sameAnswer(first.answer, printed) ? await opus({ expected: printed.join('; ') }) : null;
    const s = settle({ key: printed, first: first.answer, told: told?.answer ?? null, second: printed ? null : second?.answer ?? null });
    const winner = { first, told }[s.winner];
    const model = GOLD.solver;
    const answer = s.level === 'key' ? printed.join('; ') : String(winner.answer || '').trim();
    const r = { label, level: s.level, reason: s.reason, review: s.review, keyed: Boolean(printed), answer, firstAnswer: first.answer, secondAnswer: second?.answer };
    if (printed) { r.firstRight = sameAnswer(first.answer, printed) === true; if (second) r.secondRight = sameAnswer(second.answer, printed) === true; }
    // a solve that never reached the printed answer is not shared: the owner looks at it
    const keep = !(printed && s.level !== 'key');
    let saved = false;
    if (keep && opt.save) {
      const solution = opt.full ? shapeSolution(await withModel('claude-code', GOLD.solver, () => explainSolution({ unit, topic: topic?.name || '', question: q.text, expected: answer, scheme: scheme?.text || '' })), scheme?.name) : null;
      if (opt.local) saved = keepLocal(q, { level: s.level, model, answer, solution, checkpoints: winner.checkpoints, printed });
      else saved = await shareSolution(unit, q.text, winner.checkpoints, { level: s.level, model, answer, solution });
    }
    results.push(r);
    failsInARow = 0;
    const tail = printed ? ` | printed ${printed.join('; ')}${second ? ` | DeepSeek ${second.answer}` : ''}` : second ? ` | DeepSeek ${second.answer}` : '';
    console.log(`${i + 1}/${batch.length} ${s.review ? '!' : '✓'} ${s.level.padEnd(6)} ${label}: Opus ${first.answer}${tail}${told ? ` | told: ${told.answer}` : ''} (${s.reason}${opt.save ? (saved ? ', saved' : keep ? ', kept the stored one' : ', not saved') : ''})`);
  } catch (e) {
    if (LIMIT_HIT.test(e.message)) { stoppedFor = e.message; return; }
    results.push({ label, error: e.message.slice(0, 160) });
    console.log(`${i + 1}/${batch.length} ✗ ${label}: ${e.message.slice(0, 160)}`);
    if (++failsInARow >= 3) stoppedFor = `three failures in a row (${e.message.slice(0, 120)})`;
  }
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(POOL, batch.length) }, async () => { while (next < batch.length && !stoppedFor) { const i = next++; await one(batch[i], i); } }));

const rep = report(results);
const pct = (a) => (a.of ? `${a.right} of ${a.of} (${Math.round((100 * a.right) / a.of)}%)` : 'none checked');
console.log(`\nDone ${results.length}: key ${rep.byLevel.key}, agreed ${rep.byLevel.agreed}, single ${rep.byLevel.single}, failed ${rep.failed}.`);
console.log(`On printed answers, blind: Opus ${pct(rep.accuracy.first)}, DeepSeek Flash ${pct(rep.accuracy.second)}.`);
const left = todo.length - results.filter((r) => !r.error).length;
if (stoppedFor) console.log(`Stopped: ${stoppedFor}\n${left} left. Run the same command again later to carry on.`);
else if (left > 0) console.log(`${left} left. Run the same command again to carry on.`);

if (rep.review.length || results.length) {
  const dir = new URL('../data/gold/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`${unit.replace(/\s+/g, '-')}-${nairobiDay()}.md`, dir);
  const lines = [`# ${unit}: gold run ${nairobiDay()}`, '', `Done ${results.length}. Key ${rep.byLevel.key}, agreed ${rep.byLevel.agreed}, single ${rep.byLevel.single}, failed ${rep.failed}.`,
    `Blind on printed answers: Opus ${pct(rep.accuracy.first)}, DeepSeek Flash ${pct(rep.accuracy.second)}.`, '', '## For the owner to look at', '',
    ...(rep.review.length ? rep.review.map((x) => { const r = results.find((y) => y.label === x.label); return `- ${x.label}: ${x.reason}${r?.firstAnswer ? ` (Opus ${r.firstAnswer}${r.secondAnswer ? `, DeepSeek ${r.secondAnswer}` : ''})` : ''}`; }) : ['Nothing.'])];
  writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`Report: ${fileURLToPath(file)}`);
}
process.exit(0);
