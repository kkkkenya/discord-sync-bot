// One AI helper for Crux, with a provider switch. Every AI call goes through structured().
// Providers: gemini (default; native REST, schema-enforced), deepseek (OpenAI-compatible JSON, validated + retried).
// Keys: GEMINI_API_KEY, DEEPSEEK_API_KEY. Model names override via AI_MODEL.
// On the owner's own computer (never on Vercel), CRUX_AI=claude-code sends every call to Claude Code instead: the
// owner's Claude plan, no API key (claudeCodeCall).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPdfPages } from './pdf-pages.js';
import { tmpdir } from 'node:os';
import { deepseekCost } from './defs.js';
import { data, requestScope } from './store.js';
import { addDeepseekSpend, deepseekOpen } from './usage.js';

export const PROVIDERS = ['gemini', 'deepseek'];
// DeepSeek is Premium's (and the owner's), and only while the month's budget lasts; everyone else uses Gemini.
// Locally (no request) the setting is used as it is.
const deepseekFor = () => { const u = requestScope()?.user; return (!u || ['premium', 'owner'].includes(u.tier)) && deepseekOpen(); };
export const localClaude = () => !process.env.VERCEL && process.env.CRUX_AI === 'claude-code';
export const provider = () => {
  if (localClaude()) return 'claude-code';
  const p = data?.settings?.aiProvider || process.env.AI_PROVIDER || 'gemini';
  return p === 'deepseek' && !deepseekFor() ? 'gemini' : p;
};

const MODELS = { gemini: 'gemini-3.8-flash', deepseek: 'deepseek-flash' };
const KEYS = { gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };

export const aiReady = () => provider() === 'claude-code' || Boolean(process.env[KEYS[provider()]]);
// What each provider can read besides text: photos of working, and voice teach-backs.
export const CAN = { gemini: { image: true, audio: true }, deepseek: { image: false, audio: false }, 'claude-code': { image: false, audio: false } };
export const canRead = (kind) => aiReady() && Boolean(CAN[provider()]?.[kind]);
const model = () => process.env.AI_MODEL || MODELS[provider()];

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));

// Never let a hung provider request freeze the dashboard: abort after 30s, or longer for a long answer (about 12ms per
// token asked for, so an 8000-token study kit gets ~96s). A timeout is retryable, not fatal.
// Reading a photo or a recording takes longer whatever the answer's size: at least 90s then.
const waitFor = (maxTokens, media = []) => Math.max(media.length ? 90000 : 30000, (maxTokens || 0) * 12);
const fetchWithTimeout = (url, options, ms = 30000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal })
    .catch((e) => {
      if (e.name === 'AbortError') throw Object.assign(new Error('AI request timed out'), { retryable: true });
      throw e;
    })
    .finally(() => clearTimeout(t));
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---- Gemini (native REST, schema enforced via responseSchema) ----
const GEMINI_FALLBACK = 'gemini-3.5-flash-lite';

// Gemini's responseSchema is a subset of OpenAPI: it rejects additionalProperties, so strip it.
function toGeminiSchema(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (s && typeof s === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(s)) if (k !== 'additionalProperties') out[k] = toGeminiSchema(v);
    return out;
  }
  return s;
}

// Scanned PDFs try a third Gemini model too: each model has its own quota, so one busy model rarely means all are.
const GEMINI_OCR_CHAIN = ['gemini-3.8-flash', GEMINI_FALLBACK, 'gemini-2.5-flash'];

async function geminiCall(schema, system, content, maxTokens, media = [], chain = null) {
  const key = process.env.GEMINI_API_KEY;
  const body = (m) => JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [...media.map((m) => ({ inlineData: { mimeType: m.mime, data: m.data } })), { text: content }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema), temperature: 0.2, maxOutputTokens: maxTokens },
  });
  const run = async (m) => {
    const r = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: body(m),
    }, waitFor(maxTokens, media));
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}: ${d.error?.message || 'request failed'}`), { retryable: [429, 500, 502, 503, 504].includes(r.status) });
    const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) throw new Error(`Gemini gave no answer (${d.candidates?.[0]?.finishReason || d.promptFeedback?.blockReason || 'empty'})`);
    return JSON.parse(text);
  };
  // Busy/hung servers are common and short-lived: one go on the primary, then straight to the lighter model, so a
  // failure shows in about a minute rather than two.
  let last;
  for (const [n, m] of (chain || [provider() === 'gemini' ? model() : MODELS.gemini, GEMINI_FALLBACK]).entries()) { // OCR uses Gemini whatever the provider
    if (n) await sleep(4000 * n);
    try { return await run(m); } catch (e) { last = e; if (!e.retryable) throw e; }
  }
  throw last;
}

// ---- DeepSeek (OpenAI-compatible; json_object mode, no schema enforcement → validate + retry once) ----
function validate(obj, schema) {
  const fail = (s) => s;
  if (!schema) return null;
  if (schema.type === 'object') {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return fail('not an object');
    for (const k of schema.required || []) if (!(k in obj)) return fail(`missing "${k}"`);
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (!(k in obj)) continue;
      const err = validate(obj[k], sub);
      if (err) return fail(`${k}: ${err}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(obj)) return fail('not an array');
    for (let i = 0; i < obj.length; i++) {
      const err = validate(obj[i], schema.items || {});
      if (err) return fail(`[${i}] ${err}`);
    }
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(obj)) return fail('not an integer');
  } else if (schema.type === 'number') {
    if (typeof obj !== 'number') return fail('not a number');
  } else if (schema.type === 'string') {
    if (typeof obj !== 'string') return fail('not a string');
  } else if (schema.type === 'boolean') {
    if (typeof obj !== 'boolean') return fail('not a boolean');
  }
  return null;
}

// One headless Claude Code run per call: the question on stdin, the answer checked against the schema by Claude Code
// itself (--json-schema). No tools, no settings, no MCP servers and no saved session: it can only answer.
const WIN_CLAUDE = `${process.env.APPDATA}\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`;
const claudeBin = () => process.env.CLAUDE_BIN || (process.platform === 'win32' && existsSync(WIN_CLAUDE) ? WIN_CLAUDE : 'claude');
export function claudeCodeCall(schema, system, content, maxTokens, run = spawn) {
  const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--system-prompt', system, '--tools', '',
    '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--model', process.env.CRUX_CLAUDE_MODEL || 'sonnet'];
  return new Promise((resolve, reject) => {
    const child = run(claudeBin(), args, { cwd: tmpdir(), windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(Object.assign(new Error('Claude Code took too long to answer'), { retryable: true })); }, Math.max(120000, waitFor(maxTokens)));
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Couldn't start Claude Code (${e.message}). Check it's installed and signed in: run claude once in a terminal.`)); });
    child.on('close', () => {
      clearTimeout(timer);
      let d;
      try { d = JSON.parse(out); } catch { return reject(new Error(`Claude Code gave no answer: ${(err || out).trim().slice(0, 200) || 'empty'}`)); }
      if (d.is_error || !d.structured_output) return reject(new Error(`Claude Code: ${String(d.result || d.subtype || 'no answer').slice(0, 200)}`));
      return resolve(d.structured_output);
    });
    child.stdin.end(content);
  });
}

async function deepseekCall(schema, system, content, maxTokens) {
  const schemaText = JSON.stringify(schema);
  const messages = [
    { role: 'system', content: `${system}\n\nReturn ONLY a JSON object matching this JSON Schema exactly (no markdown fences, no extra text):\n${schemaText}` },
    { role: 'user', content },
  ];
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    let text;
    try {
      r = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model: model(), messages, response_format: { type: 'json_object' }, max_tokens: maxTokens, temperature: 0.1 }),
      }, waitFor(maxTokens));
      text = await r.text();
    } catch (e) {
      if (!e.retryable || attempt === 2) throw e;
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${text.slice(0, 200)}`);
    try { addDeepseekSpend(deepseekCost(JSON.parse(text).usage)).catch((e) => console.error('DeepSeek spend:', e.message)); } catch { /* no usage block */ }
    let raw = '';
    let obj;
    try { raw = JSON.parse(text).choices?.[0]?.message?.content ?? ''; obj = JSON.parse(raw); }
    catch (e) { last = e.message; messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `That wasn't valid JSON. ${e.message}. Return ONLY the corrected JSON.` }); continue; }
    const err = validate(obj, schema);
    if (err) { last = err; messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `The JSON didn't match the schema (${err}). Return the corrected JSON only.` }); continue; }
    return obj;
  }
  throw new Error(`DeepSeek returned invalid JSON after retries: ${last}`);
}

// A scanned PDF read whichever provider the student picked: the shared library is read once for everyone.
// Gemini first (three models, each with its own quota). If none can, and Crux runs on the owner's laptop, Claude Code
// reads the file itself. If nothing can now, the error is retryable: ingest.js queues the file for the next pass.
const OCR_SYSTEM = 'You transcribe scanned university exam papers, tutorials and notes. Copy every word, number and equation exactly as printed, in reading order. Write maths in plain text (x^2, sqrt(), integral from a to b). Keep question numbers, part letters and marks like (5 marks). Do not solve, summarise or add anything.';
const OCR_SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };
const tidy = (out) => ({ text: String(out?.text || '').replace(/\s+/g, ' ').trim() });

export async function ocrPdf(buf, { gemini = geminiCall, claude = claudeReadPdf } = {}) {
  let last = null;
  if (process.env.GEMINI_API_KEY) {
    try { return tidy(await gemini(OCR_SCHEMA, OCR_SYSTEM, 'Transcribe this document.', 16000, [{ mime: 'application/pdf', data: buf.toString('base64') }], GEMINI_OCR_CHAIN)); }
    catch (e) { last = e; }
  }
  if (claudeHere()) {
    try { return tidy(await claude(buf)); } catch (e) { last = e; }
  }
  throw Object.assign(new Error(last ? `couldn't read the scan now (${last.message})` : 'no AI that can read scans is set up'), { retryable: true });
}

// Claude Code on this computer (never on Vercel). Crux draws the pages as pictures itself (pdf-pages.js), so nothing
// else needs installing; Claude reads them with its Read tool, nothing else allowed, and says whether it could.
const CLAUDE_OCR_SCHEMA = { type: 'object', properties: { readable: { type: 'boolean' }, text: { type: 'string' } }, required: ['readable', 'text'] };
export const claudeHere = () => !process.env.VERCEL && (Boolean(process.env.CLAUDE_BIN) || (process.platform === 'win32' && existsSync(WIN_CLAUDE)));
export async function claudeReadPdf(buf, run = spawn, render = renderPdfPages) {
  const dir = mkdtempSync(join(tmpdir(), 'crux-ocr-'));
  const { pages, total } = await render(buf);
  const names = pages.map(({ page, png }) => { const name = `page-${String(page).padStart(3, '0')}.png`; writeFileSync(join(dir, name), png); return name; });
  const system = `${OCR_SYSTEM} The pages are pictures; some are photos turned sideways or upside down: read them the right way round. Set readable to false, with empty text, if you could not see the pages.`;
  const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(CLAUDE_OCR_SCHEMA), '--system-prompt', system, '--tools', 'Read', '--allowedTools', 'Read',
    '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--model', process.env.CRUX_CLAUDE_MODEL || 'sonnet'];
  try {
    return await new Promise((resolve, reject) => {
      const child = run(claudeBin(), args, { cwd: dir, windowsHide: true });
      let out = '', err = '';
      const timer = setTimeout(() => { child.kill(); reject(Object.assign(new Error('Claude Code took too long to read the scan'), { retryable: true })); }, 10 * 60e3);
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Couldn't start Claude Code (${e.message})`)); });
      child.on('close', () => {
        clearTimeout(timer);
        let d;
        try { d = JSON.parse(out); } catch { return reject(new Error(`Claude Code gave no answer: ${(err || out).trim().slice(0, 200) || 'empty'}`)); }
        if (d.is_error || !d.structured_output) return reject(new Error(`Claude Code: ${String(d.result || d.subtype || 'no answer').slice(0, 200)}`));
        if (!d.structured_output.readable || !String(d.structured_output.text || '').trim()) return reject(Object.assign(new Error('Claude Code could not read the pages'), { retryable: true }));
        return resolve(d.structured_output);
      });
      child.stdin.end(`Transcribe this document. Its ${names.length} page pictures, in order, are in ${dir}: ${names.join(', ')}.${total > names.length ? ` (The first ${names.length} of ${total} pages.)` : ''}`);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// media: [{ mime, data (base64) }], images or audio, for the providers that can read them (CAN).
export async function structured(schema, system, content, maxTokens = 4000, media = []) {
  const p = provider();
  if (!aiReady()) throw new Error(`No ${KEYS[p]} for provider "${p}". Pick another provider in Settings, or add the key.`);
  for (const m of media) {
    const kind = m.mime.startsWith('audio/') ? 'audio' : 'image';
    if (!CAN[p]?.[kind]) throw Object.assign(new Error(`${p} can't read ${kind === 'audio' ? 'recordings' : 'photos'}. Switch to Gemini in Settings, or type it.`), { status: 400 });
  }
  // a request redone after a save conflict (api/router.js) gets the answers it already paid for
  const memo = requestScope()?.memo;
  const key = memo && JSON.stringify([p, schema, system, content, media.map((m) => m.data.length)]);
  if (key && memo.has(key)) return structuredClone(memo.get(key));
  const out = p === 'claude-code' ? await claudeCodeCall(schema, system, content, maxTokens)
    : p === 'gemini' ? await geminiCall(schema, system, content, maxTokens, media) : await deepseekCall(schema, system, content, maxTokens);
  if (key) memo.set(key, structuredClone(out));
  return out;
}
