// Retrieval metrics (fixplan-e E7): recall@k, MRR and nDCG, ported from DeepTutor's metrics.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import { average, ndcgAt, recallAt, reciprocalRank } from '../tools/retrieval-metrics.js';

const S = (...xs) => new Set(xs);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('recall@k counts each gold page once, within the cutoff only', () => {
  const hits = [S(0), S(), S(1), S(0)]; // gold 0 found twice, gold 1 at rank 3
  close(recallAt(hits, 2, 1), 0.5);
  close(recallAt(hits, 2, 3), 1);
  close(recallAt(hits, 2, 10), 1);
  assert.equal(recallAt([], 3, 5), 0);
  assert.equal(recallAt(hits, 0, 5), 0, 'no gold pages: 0, not NaN');
});

test('MRR is the reciprocal rank of the first hit, and 0 when none', () => {
  close(reciprocalRank([S(), S(3), S(0)]), 0.5);
  close(reciprocalRank([S(0)]), 1);
  assert.equal(reciprocalRank([S(), S()]), 0);
  assert.equal(reciprocalRank([S(), S(0)], 1), 0, 'a hit below the cutoff does not count');
});

test('nDCG rewards gold ranked near the top, and a repeat of the same page gains nothing', () => {
  close(ndcgAt([S(0), S(1)], 2, 5), 1); // both gold at the top
  close(ndcgAt([S(), S(0), S(1)], 2, 5), (1 / Math.log2(3) + 1 / Math.log2(4)) / (1 + 1 / Math.log2(3)));
  close(ndcgAt([S(0), S(0), S(0)], 2, 5), 1 / (1 + 1 / Math.log2(3)));
  assert.equal(ndcgAt([S(), S()], 2, 5), 0);
  assert.equal(ndcgAt([S(0)], 0, 5), 0);
});

test('a cutoff below 1 is refused', () => {
  assert.throws(() => recallAt([], 1, 0), /k must be >= 1/);
  assert.throws(() => ndcgAt([], 1, -2), /k must be >= 1/);
});

test('average of nothing is 0, not NaN', () => {
  assert.equal(average([]), 0);
  close(average([0.5, 1]), 0.75);
});
