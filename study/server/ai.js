// One AI helper for the study desk, with a provider switch. Every AI call goes through structured().
// Providers: gemini (default; native REST, schema-enforced), deepseek (OpenAI-compatible JSON, validated + retried),
// anthropic (legacy SDK). Keys: GEMINI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY. Model names override via AI_MODEL.
import Anthropic from '@anthropic-ai/sdk';
import { data } from './store.js';

let anthropic;

export const PROVIDERS = ['gemini', 'deepseek', 'anthropic'];
export const provider = () => data?.settings?.aiProvider || process.env.AI_PROVIDER || 'gemini';

const MODELS = { gemini: 'gemini-3.8-flash', deepseek: 'deepseek-flash', anthropic: 'claude-opus-5-5' };
const KEYS = { gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

export const aiReady = () => Boolean(process.env[KEYS[provider()]]);
const model = () => process.env.AI_MODEL || MODELS[provider()];

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));

// Never let a hung provider request freeze the dashboard: abort after 30s. A timeout is retryable, not fatal.
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

// ---- Anthropic (structured output enforced server-side) ----
async function anthropicCall(schema, system, content, maxTokens) {
  anthropic ||= new Anthropic();
  const response = await anthropic.beta.messages.create({
    model: model(),
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this one.');
  if (response.stop_reason === 'max_tokens') throw new Error('The output was cut off — try a shorter input.');
  return JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

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

async function geminiCall(schema, system, content, maxTokens) {
  const key = process.env.GEMINI_API_KEY;
  const body = (m) => JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: content }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema), temperature: 0.2, maxOutputTokens: maxTokens },
  });
  const run = async (m) => {
    const r = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: body(m),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}: ${d.error?.message || 'request failed'}`), { retryable: [429, 500, 502, 503, 504].includes(r.status) });
    const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) throw new Error(`Gemini gave no answer (${d.candidates?.[0]?.finishReason || d.promptFeedback?.blockReason || 'empty'})`);
    return JSON.parse(text);
  };
  // Busy/hung servers are common and short-lived: retry the primary, then fall back to the lighter model.
  let last;
  for (const [n, m] of [model(), model(), GEMINI_FALLBACK].entries()) {
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
      });
      text = await r.text();
    } catch (e) {
      if (!e.retryable || attempt === 2) throw e;
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${text.slice(0, 200)}`);
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

export async function structured(schema, system, content, maxTokens = 4000) {
  const p = provider();
  if (!aiReady()) throw new Error(`No ${KEYS[p]} for provider "${p}". Pick another provider in the top bar, or add the key.`);
  if (p === 'anthropic') return anthropicCall(schema, system, content, maxTokens);
  if (p === 'gemini') return geminiCall(schema, system, content, maxTokens);
  return deepseekCall(schema, system, content, maxTokens);
}
