// Reading a unit's hub files: text files, a scanned PDF through OCR, and a broken download. Network is faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore();
process.env.DISCORD_TOKEN = 'test';
process.env.GEMINI_API_KEY = 'test';
process.env.AI_PROVIDER = 'gemini';
const { library, prepareUnit } = await import('../server/ingest.js');

// one blank page: what a scanned paper looks like to pdf.js (no text layer)
const BLANK_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const calls = { gemini: 0, discord: 0 };
const FILES = {
  1: { filename: 'EMM_302_notes.txt', body: () => new Response('Torsion of circular shafts. Shear stress tau = T r / J.') },
  2: { filename: 'EMM_302_CAT_1.pdf', body: () => new Response(BLANK_PDF) },
  3: { filename: 'broken.txt', body: () => new Response('gone', { status: 500 }) },
};
globalThis.fetch = async (url) => {
  const u = String(url);
  const msg = u.match(/channels\/c\/messages\/(\d+)/);
  if (msg) { calls.discord++; const f = FILES[msg[1]]; return Response.json({ attachments: [{ filename: f.filename, url: `https://cdn.test/${msg[1]}` }] }); }
  const cdn = u.match(/cdn\.test\/(\d+)/);
  if (cdn) return FILES[cdn[1]].body();
  if (u.includes('generativelanguage')) {
    calls.gemini++;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text: 'QUESTION ONE (20 marks) a) Define the polar moment of inertia.' }) }] } }] });
  }
  throw new Error(`unexpected fetch ${u}`);
};

const files = [1, 2, 3].map((id) => ({ id: String(id), name: FILES[id].filename.replace(/_/g, ' '), channel_id: 'c', message_id: String(id), paper: id === 2 }));

test('a unit is read: text files as they are, scans through OCR, a broken file recorded and the rest finish', async () => {
  const r = await prepareUnit(files, 'EMM 302');
  assert.equal(r.total, 3);
  assert.equal(r.pending, 0);
  assert.match(library.files[1].text, /Torsion/);
  assert.match(library.files[2].text, /polar moment/);
  assert.equal(library.files[3].status, 'error');
  assert.equal(r.results.find((x) => x.id === '3').error, 'download 500');
  assert.equal(calls.gemini, 1);
});

test('preparing again downloads nothing and makes no AI calls', async () => {
  const before = { ...calls };
  const r = await prepareUnit(files, 'EMM 302');
  assert.deepEqual(calls, before);
  assert.equal(r.done, 3);
});

test('a call stops when its time is up, and says what is left', async () => {
  for (const id of ['1', '2', '3']) delete library.files[id];
  const r = await prepareUnit(files, 'EMM 302', -1); // already out of time
  assert.equal(r.results.length, 0);
  assert.equal(r.pending, 3);
});

test('a scan read before OCR existed (no text, no status) is read again, once', async () => {
  library.files['2'] = { unit: 'EMM 302', name: 'EMM 302 CAT 1.pdf', paper: true, pages: 1, chars: 0, text: '' };
  const before = calls.gemini;
  await prepareUnit(files.slice(1, 2), 'EMM 302');
  assert.equal(calls.gemini, before + 1);
  await prepareUnit(files.slice(1, 2), 'EMM 302');
  assert.equal(calls.gemini, before + 1);
});
