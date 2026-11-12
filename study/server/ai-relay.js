// Hosted models for the Crux desktop app (owner, 2026-11-12): students need no API key of their own.
// The desktop asks for a relay key with its Crux session (GET /api/ai/token), then talks to an OpenAI-compatible
// endpoint here: GET /api/ai/v1/models, POST /api/ai/v1/chat/completions, GET /api/ai/usage.
// Each request is checked against the student's plan and daily allowance, then forwarded with the Hub's own key.
//
// Plans (lib/plan-names.js): Imai (trial) and Gacrux use Gemini on low effort; when Gemini fails twice in a row
// (out of quota or busy), DeepSeek is offered instead for 30 minutes. Mimosa gets Gemini, DeepSeek and GLM up to
// medium effort. Acrux (and the owner) get every model on any effort.
import { db } from '../../lib/db.js';
import { sign, verify } from '../../lib/session.js';
import { nairobiDay } from './plan.js';

const UPSTREAM = {
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: 'GEMINI_API_KEY' },
  deepseek: { url: 'https://api.deepseek.com/chat/completions', key: 'DEEPSEEK_API_KEY' },
  glm: { url: 'https://api.z.ai/api/paas/v4/chat/completions', key: 'GLM_API_KEY' },
};
// What students see in the model picker. context/maxTokens are what the desktop budgets with.
export const MODELS = {
  'gemini-3.8-flash': { provider: 'gemini', name: 'Gemini 3.8 Flash', context: 1048576, maxTokens: 65536, image: true, reasoning: true },
  'deepseek-flash': { provider: 'deepseek', name: 'DeepSeek Flash', context: 131072, maxTokens: 32768, image: false, reasoning: true },
  'deepseek-v4-pro': { provider: 'deepseek', name: 'DeepSeek V4 Pro', context: 131072, maxTokens: 32768, image: false, reasoning: true },
  'glm-5.3-flash': { provider: 'glm', name: 'GLM 5.3 Flash', context: 200000, maxTokens: 32768, image: false, reasoning: true },
  'glm-5.3': { provider: 'glm', name: 'GLM 5.3', context: 200000, maxTokens: 32768, image: false, reasoning: true },
};
const ENTRY = ['gemini-3.8-flash', 'deepseek-flash'];
export const PLANS = {
  trial: { models: ENTRY, fallback: 'deepseek-flash', effort: 'low', perDay: 15 },
  basic: { models: ENTRY, fallback: 'deepseek-flash', effort: 'low', perDay: 15 },
  premium: { models: ['gemini-3.8-flash', 'deepseek-flash', 'glm-5.3-flash'], effort: 'medium', perDay: 40 },
  vvip: { models: Object.keys(MODELS), effort: null, perDay: 80 },
  owner: { models: Object.keys(MODELS), effort: null, perDay: 100000 },
};
const GEMINI_LIGHT = 'gemini-3.5-flash-lite'; // tried when the main Gemini model is busy
const TOKEN_HOURS = 12;
const FALLBACK_MINUTES = 30;
export const BUSY_MARK = '[crux:gemini-busy]';
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'max'];

const fail = (message, status, code) => Response.json({ error: { message, type: code || 'crux_relay', code: code || null } }, { status, headers: { 'Cache-Control': 'no-store' } });

/** A relay key for a signed-in student: their id and plan, for 12 hours. */
export const aiToken = (user, now = Date.now()) => ({ token: sign({ kind: 'ai', id: user.id, tier: user.tier, exp: now + TOKEN_HOURS * 3600e3 }), exp: now + TOKEN_HOURS * 3600e3, tier: user.tier });

/** Pure: the effort a plan allows, given the one asked for. null = leave as asked. */
export function effortFor(plan, asked) {
  if (!plan.effort) return asked ?? null;
  if (!asked) return plan.effort;
  return EFFORT_ORDER.indexOf(asked) > EFFORT_ORDER.indexOf(plan.effort) ? plan.effort : asked;
}

/** Pure: the models list a plan sees, OpenAI style plus the details the desktop budgets with. */
export function modelsFor(tier) {
  const plan = PLANS[tier];
  if (!plan) return [];
  return plan.models.map((id) => ({ id, object: 'model', owned_by: 'crux', name: plan.fallback === id ? `${MODELS[id].name} (when Gemini is busy)` : MODELS[id].name, context_length: MODELS[id].context, max_tokens: MODELS[id].maxTokens, image: MODELS[id].image, reasoning: MODELS[id].reasoning }));
}

const usageRow = async (store, userId, day) => (await store.select('crux_ai_usage', `user_id=eq.${encodeURIComponent(userId)}&day=eq.${day}&select=answers,gemini_failed_at`))[0] || { answers: 0, gemini_failed_at: null };
const saveUsage = (store, userId, day, patch) => store.upsert('crux_ai_usage', [{ user_id: userId, day, ...patch }], 'user_id,day');

function caller(request) {
  const auth = request.headers.get('authorization') || '';
  const data = verify(auth.replace(/^Bearer\s+/i, ''));
  return data?.kind === 'ai' && PLANS[data.tier] ? data : null;
}

/** /api/ai/v1/* and /api/ai/usage. deps: { store, fetch, now } for tests. */
export async function relay(request, path, { store = db, fetchImpl = fetch, now = () => Date.now(), env = process.env } = {}) {
  const who = caller(request);
  if (!who) return fail('Sign in to Crux again in the desktop app.', 401, 'signed_out');
  const plan = PLANS[who.tier];
  const day = nairobiDay(new Date(now()));

  if (path === '/api/ai/v1/models') return Response.json({ object: 'list', data: modelsFor(who.tier) }, { headers: { 'Cache-Control': 'no-store' } });
  let usage;
  try { usage = await usageRow(store, who.id, day); } catch { return fail('Hosted models are not set up yet. Ask the Hub admin.', 503, 'not_ready'); }
  if (path === '/api/ai/usage') return Response.json({ tier: who.tier, answers: usage.answers, perDay: plan.perDay, left: Math.max(0, plan.perDay - usage.answers), day });
  if (path !== '/api/ai/v1/chat/completions' || request.method !== 'POST') return fail('No such endpoint.', 404, 'not_found');

  let body;
  try { body = await request.json(); } catch { return fail('That request was not valid JSON.', 400, 'bad_request'); }
  const model = String(body?.model || '');
  if (!plan.models.includes(model)) return fail(`${model || 'That model'} isn't part of your plan. Pick another model in the list.`, 403, 'model_not_in_plan');
  if (model === plan.fallback) {
    const failedAt = usage.gemini_failed_at ? Date.parse(usage.gemini_failed_at) : 0;
    if (now() - failedAt > FALLBACK_MINUTES * 60e3) return fail('DeepSeek is offered on your plan when Gemini is busy. Use Gemini 3.8 Flash.', 403, 'fallback_not_open');
  }
  if (usage.answers >= plan.perDay) return fail(`Today's ${plan.perDay} answers on your plan are used. They reset at midnight, Nairobi time.`, 429, 'daily_limit');

  const spec = MODELS[model];
  const up = UPSTREAM[spec.provider];
  const key = env[up.key];
  if (!key) return fail('This model is not set up on Crux yet.', 503, 'not_ready');
  const effort = effortFor(plan, body.reasoning_effort);
  const out = { ...body, model, max_tokens: Math.min(Number(body.max_tokens) || spec.maxTokens, spec.maxTokens) };
  delete out.max_completion_tokens;
  if (effort && spec.provider !== 'deepseek') out.reasoning_effort = effort === 'max' ? 'high' : effort === 'minimal' ? 'low' : effort; else delete out.reasoning_effort;
  if (!spec.image) out.messages = (out.messages || []).map((m) => (Array.isArray(m.content) ? { ...m, content: m.content.filter((p) => p.type !== 'image_url') } : m));

  // Gemini: the asked model, then the lighter one (its own quota). On the entry plans DeepSeek is offered after that.
  const tries = spec.provider === 'gemini' ? [model, GEMINI_LIGHT] : [model];
  let r;
  for (const id of tries) {
    try {
      r = await fetchImpl(up.url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...out, model: id }) });
    } catch { r = null; }
    if (r && r.ok) break;
    if (r && ![429, 500, 502, 503, 504].includes(r.status)) break; // a real refusal: no point retrying
  }
  if (!r || !r.ok) {
    if (spec.provider === 'gemini' && plan.fallback && (!r || [429, 500, 502, 503, 504].includes(r.status))) {
      await saveUsage(store, who.id, day, { answers: usage.answers, gemini_failed_at: new Date(now()).toISOString() }).catch(() => {});
      return fail(`Gemini is busy right now. ${BUSY_MARK} Switch to DeepSeek Flash (when Gemini is busy) in the model list to keep going.`, 503, 'gemini_busy');
    }
    const said = r ? (await r.text().catch(() => '')).slice(0, 200) : '';
    return fail(`The model didn't answer (${r ? r.status : 'no connection'}). Try again in a moment.${said && r.status < 500 ? ` ${said}` : ''}`, 502, 'upstream');
  }
  await saveUsage(store, who.id, day, { answers: usage.answers + 1, gemini_failed_at: usage.gemini_failed_at }).catch((e) => console.error('crux_ai_usage:', e.message));
  return new Response(r.body, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Crux-Answers-Left': String(Math.max(0, plan.perDay - usage.answers - 1)) } });
}
