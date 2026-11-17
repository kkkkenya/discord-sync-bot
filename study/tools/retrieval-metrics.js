// Retrieval metrics for the page search (fixplan-e E7). Pure: a ranking in, a number out. No model is called.
//
// Ported from DeepTutor, deeptutor/services/rag/eval/metrics.py (https://github.com/HKUDS/DeepTutor), licensed
// Apache-2.0. Kept: recall@k, MRR, nDCG (binary), with the same rank rules. Dropped: precision, hit and MAP (not
// needed for the first report), and the dataclass.
//
// hits[i] is the set of gold-page indices the item at rank i + 1 covers (an empty set when it covers none).
// gold is the number of gold pages for the case.

const cutoff = (k) => {
  const n = Math.trunc(Number(k));
  if (!(n >= 1)) throw new Error('k must be >= 1');
  return n;
};

// Share of the case's gold pages retrieved within the top k. Each gold page counts once, even when two items cover it.
export function recallAt(hits, gold, k) {
  const n = cutoff(k);
  if (gold <= 0) return 0;
  const found = new Set();
  for (const matched of hits.slice(0, n)) for (const g of matched) found.add(g);
  return Math.min(1, found.size / gold);
}

// Reciprocal rank of the first item that covered a gold page (MRR at k; k omitted keeps every rank).
export function reciprocalRank(hits, k = null) {
  const window = k == null ? hits : hits.slice(0, cutoff(k));
  for (let i = 0; i < window.length; i++) if (window[i] && window[i].size > 0) return 1 / (i + 1);
  return 0;
}

const dcg = (gains) => gains.reduce((sum, gain, i) => sum + gain / Math.log2(i + 2), 0);

// Binary nDCG at k: a rank gains only when it brings a gold page no earlier rank covered. The ideal ranking holds
// the gold pages (capped at k) first.
export function ndcgAt(hits, gold, k) {
  const n = cutoff(k);
  if (gold <= 0) return 0;
  const seen = new Set();
  const gains = [];
  for (const matched of hits.slice(0, n)) {
    const fresh = [...matched].some((g) => !seen.has(g));
    gains.push(fresh ? 1 : 0);
    for (const g of matched) seen.add(g);
  }
  const ideal = dcg(Array(Math.min(gold, n)).fill(1));
  if (ideal === 0) return 0;
  return Math.min(1, dcg(gains) / ideal);
}

// Macro-average of per-case values (zeros for an empty list, so a report always has a number).
export function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
