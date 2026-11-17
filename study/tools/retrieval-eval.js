// Retrieval eval (fixplan-e E7, metrics only): scores the current path in server/learn.js on the cases in
// test/fixtures/retrieval/*.json and prints recall@5, recall@10, MRR and nDCG@5. It does not change retrieval.
// learnPath runs with mastery: null (no mastery hint), so the eval scores the retrieval alone.
//   node tools/retrieval-eval.js
// A case: { "unit": "EMM 302", "question": "...", "topic": "optional topic name", "pages": [{ "fileId": "12", "page": 4 }] }
// Pages are 1-based, as the printed page numbers in the Hub file. With no cases it prints a line and exits 0.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { words } from '../server/analysis.js';
import { library } from '../server/ingest.js';
import { learnPath } from '../server/learn.js';
import { data } from '../server/store.js';
import { average, ndcgAt, recallAt, reciprocalRank } from './retrieval-metrics.js';

const DIR = fileURLToPath(new URL('../test/fixtures/retrieval/', import.meta.url));

export function loadCases(dir = DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.flatMap((f) => {
    const rows = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!Array.isArray(rows)) throw new Error(`${f}: expected an array of cases`);
    return rows.map((c, i) => {
      if (!c.unit || !c.question || !Array.isArray(c.pages) || !c.pages.length) throw new Error(`${f} case ${i + 1}: needs unit, question and pages`);
      return c;
    });
  });
}

// The unit's topic a case is about: the named one, else the topic sharing the most words with the question.
export function topicFor(c, topics) {
  if (c.topic) {
    const named = topics.find((t) => t.name.toLowerCase() === String(c.topic).toLowerCase());
    if (named) return named;
  }
  const qwords = new Set(words(c.question));
  let best = null;
  let bestScore = 0;
  for (const t of topics) {
    const score = words(t.name).filter((w) => qwords.has(w)).length;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

// Score one case: the items learnPath shows (examples, then reading, in that order) as ranks, each covering the gold
// pages that its page range holds.
export function scoreCase(c, { topics, subtopics, files, questions }) {
  const topic = topicFor(c, topics);
  if (!topic) return { unit: c.unit, question: c.question, skipped: 'no topic in this unit fits the question' };
  const path = learnPath({ topic, subtopics, files, questions, mastery: null });
  const items = [...path.examples, ...path.read];
  const gold = c.pages.map((p) => ({ fileId: String(p.fileId), page: Number(p.page) }));
  const hits = items.map((it) => new Set(gold.flatMap((g, j) => (it.pages && String(it.fileId) === g.fileId && g.page >= it.pages[0] && g.page <= it.pages[1] ? [j] : []))));
  return {
    unit: c.unit, question: c.question, topic: topic.name, shown: items.length, gold: gold.length,
    recall5: recallAt(hits, gold.length, 5), recall10: recallAt(hits, gold.length, 10), mrr: reciprocalRank(hits),
    ndcg5: ndcgAt(hits, gold.length, 5),
  };
}

function main() {
  const cases = loadCases();
  if (!cases.length) {
    console.log('No retrieval fixtures yet: add test/fixtures/retrieval/*.json (fixplan-e OE7). Nothing to score.');
    return;
  }
  const rows = [];
  for (const unit of [...new Set(cases.map((c) => c.unit))]) {
    const topics = data.topics.filter((t) => t.unit === unit);
    const files = Object.entries(library.files).filter(([, e]) => e.unit === unit && e.text).map(([id, e]) => ({ id, ...e, url: null }));
    const questions = data.paperq.filter((q) => q.unit === unit);
    for (const c of cases.filter((x) => x.unit === unit)) rows.push(scoreCase(c, { topics, subtopics: data.subtopics, files, questions }));
  }
  const scored = rows.filter((r) => !r.skipped);
  for (const r of rows) {
    if (r.skipped) console.log(`- skipped "${r.question.slice(0, 60)}": ${r.skipped}`);
    else console.log(`${r.unit} · ${r.topic} · shown ${r.shown} · gold ${r.gold} · recall@5 ${r.recall5.toFixed(2)} · MRR ${r.mrr.toFixed(2)}  "${r.question.slice(0, 60)}"`);
  }
  console.log(`\nCurrent path (server/learn.js), ${scored.length} of ${rows.length} cases:`);
  console.log(`  recall@5   ${average(scored.map((r) => r.recall5)).toFixed(3)}`);
  console.log(`  recall@10  ${average(scored.map((r) => r.recall10)).toFixed(3)}  (learnPath shows at most 8 items, so this equals recall@8)`);
  console.log(`  MRR        ${average(scored.map((r) => r.mrr)).toFixed(3)}`);
  console.log(`  ndcg@5     ${average(scored.map((r) => r.ndcg5)).toFixed(3)}`);
  console.log('  searchPages: not built yet (fixplan-e E7 session 1 step 2), so no comparison column.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
