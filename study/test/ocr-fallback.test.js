// Reading scanned PDFs when Gemini is busy (server/ai.js ocrPdf): Gemini's models first, then Claude Code on the
// owner's laptop (pages drawn by server/pdf-pages.js), else a retryable error so the file is queued, not failed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ocrPdf } from '../server/ai.js';

const busy = () => { throw Object.assign(new Error('Gemini 503: overloaded'), { retryable: true }); };
const withEnv = async (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { await fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};

test('Gemini answers: its text is used, tidied, and Claude is not asked', async () => {
  await withEnv({ GEMINI_API_KEY: 'g', VERCEL: undefined, CLAUDE_BIN: 'claude' }, async () => {
    let asked = 0;
    const out = await ocrPdf(Buffer.from('%PDF'), { gemini: async (schema, sys, content, max, media, chain) => { assert.equal(chain.length, 3, 'three Gemini models'); return { text: ' Q1  (a)\n Define ' }; }, claude: async () => { asked++; return { text: 'x' }; } });
    assert.deepEqual(out, { text: 'Q1 (a) Define' });
    assert.equal(asked, 0);
  });
});

test('Gemini busy on this laptop: Claude Code reads it', async () => {
  await withEnv({ GEMINI_API_KEY: 'g', VERCEL: undefined, CLAUDE_BIN: 'claude' }, async () => {
    const out = await ocrPdf(Buffer.from('%PDF'), { gemini: busy, claude: async () => ({ text: 'KENYATTA UNIVERSITY  CAT 1' }) });
    assert.deepEqual(out, { text: 'KENYATTA UNIVERSITY CAT 1' });
  });
});

test('Gemini busy on Vercel (no Claude there): a retryable error, so the file waits for the next pass', async () => {
  await withEnv({ GEMINI_API_KEY: 'g', VERCEL: '1', CLAUDE_BIN: 'claude' }, async () => {
    let asked = 0;
    await assert.rejects(ocrPdf(Buffer.from('%PDF'), { gemini: busy, claude: async () => { asked++; return { text: 'x' }; } }), (e) => e.retryable === true && /couldn't read the scan now/.test(e.message));
    assert.equal(asked, 0);
  });
});

test('both busy: retryable; no Gemini key and no Claude: retryable with a plain reason', async () => {
  await withEnv({ GEMINI_API_KEY: 'g', VERCEL: undefined, CLAUDE_BIN: 'claude' }, async () => {
    await assert.rejects(ocrPdf(Buffer.from('%PDF'), { gemini: busy, claude: busy }), (e) => e.retryable === true);
  });
  await withEnv({ GEMINI_API_KEY: undefined, VERCEL: '1', CLAUDE_BIN: undefined }, async () => {
    await assert.rejects(ocrPdf(Buffer.from('%PDF'), { gemini: busy, claude: busy }), /no AI that can read scans/);
  });
});
