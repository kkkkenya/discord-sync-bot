// Hosted models for the Crux desktop app (owner, 2026-11-12): students need no API key of their own.
// The desktop asks for a relay key with its Crux session (GET /api/ai/token), then talks to an OpenAI-compatible
// endpoint here: GET /api/ai/v1/models, POST /api/ai/v1/chat/completions, GET /api/ai/usage.
// Each request is checked against the student's plan and daily allowance, then forwarded with the Hub's own key.
//
// Plans (lib/plan-names.js): DeepSeek Flash is the first model on every plan (owner, 2026-11-20, Track H1), Gemini
// the second. Imai (trial) and Gacrux use them on low effort, Mimosa up to medium (GLM too when it is back), Acrux
// (and the owner) get every model on any effort. A paused model a saved session still names goes to the fallback.
import { db } from '../../lib/db.js';
import { sign, verify } from '../../lib/session.js';
import { nairobiDay } from './plan.js';
import { becauseOf, classify, logAiError } from './ai-errors.js';

const UPSTREAM = {
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: 'GEMINI_API_KEY' },
  deepseek: { url: 'https://api.deepseek.com/chat/completions', key: 'DEEPSEEK_API_KEY' },
  glm: { url: 'https://api.z.ai/api/paas/v4/chat/completions', key: 'GLM_API_KEY' },
};
// What students see in the model picker. context/maxTokens are what the desktop budgets with.
export const MODELS = {
  'deepseek-flash': { provider: 'deepseek', name: 'DeepSeek Flash', context: 131072, maxTokens: 32768, image: false, reasoning: true },
  'gemini-3.8-flash': { provider: 'gemini', name: 'Gemini 3.8 Flash', context: 1048576, maxTokens: 65536, image: true, reasoning: true },
  'deepseek-v4-pro': { provider: 'deepseek', name: 'DeepSeek V4 Pro', context: 131072, maxTokens: 32768, image: false, reasoning: true },
  // GLM is paused (owner, 2026-11-18: the z.ai account has no credit; DeepSeek carries on). Remove `off` to bring it back.
  'glm-5.3-flash': { provider: 'glm', name: 'GLM 5.3 Flash', context: 200000, maxTokens: 32768, image: false, reasoning: true, off: true },
  'glm-5.3': { provider: 'glm', name: 'GLM 5.3', context: 200000, maxTokens: 32768, image: false, reasoning: true, off: true },
};
const FIRST = 'deepseek-flash';
const ENTRY = [FIRST, 'gemini-3.8-flash'];
export const PLANS = {
  trial: { models: ENTRY, fallback: FIRST, effort: 'low', perDay: 15 },
  basic: { models: ENTRY, fallback: FIRST, effort: 'low', perDay: 15 },
  premium: { models: [...ENTRY, 'glm-5.3-flash'], fallback: FIRST, effort: 'medium', perDay: 40 },
  vvip: { models: Object.keys(MODELS), fallback: FIRST, effort: null, perDay: 80 },
  owner: { models: Object.keys(MODELS), fallback: FIRST, effort: null, perDay: 100000 },
};
/** Pure: the model a plan runs in place of a paused one: its fallback, else its first live model. */
export const liveFirst = (plan) => (plan.fallback && !MODELS[plan.fallback]?.off ? plan.fallback : plan.models.find((id) => !MODELS[id].off));
const GEMINI_LIGHT = 'gemini-3.5-flash-lite'; // tried when the main Gemini model is busy
const TOKEN_HOURS = 12;
export const BUSY_MARK = '[crux:gemini-busy]'; // Harness 0.7.0 and older look for it; since H3 the relay switches models itself
const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'max'];

const fail = (message, status, code, extra = {}, headers = {}) => Response.json({ error: { message, type: code || 'crux_relay', code: code || null, ...extra } }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/** A relay key for a signed-in student: their id and plan, for 12 hours. */
export const aiToken = (user, now = Date.now()) => ({ token: sign({ kind: 'ai', id: user.id, tier: user.tier, exp: now + TOKEN_HOURS * 3600e3 }), exp: now + TOKEN_HOURS * 3600e3, tier: user.tier });

/** Pure: the effort word each provider accepts. DeepSeek takes none; Gemini low, medium or high; GLM low, high or max
 * (it refuses medium: "use low, high, or max", 2026-11-18). A plan's effort is a ceiling, so medium becomes low on GLM. */
export function providerEffort(provider, effort) {
  if (!effort || provider === 'deepseek') return null;
  if (provider === 'glm') return effort === 'max' ? 'max' : effort === 'high' ? 'high' : 'low';
  return effort === 'max' ? 'high' : effort === 'minimal' ? 'low' : effort;
}

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
  return plan.models.filter((id) => !MODELS[id].off).map((id) => ({ id, object: 'model', owned_by: 'crux', name: MODELS[id].name, context_length: MODELS[id].context, max_tokens: MODELS[id].maxTokens, image: MODELS[id].image, reasoning: MODELS[id].reasoning }));
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
  let model = String(body?.model || '');
  // a paused model (GLM) that a saved session still names goes to the plan's first live model, not to an error
  if (MODELS[model]?.off) model = liveFirst(plan) || model;
  if (!plan.models.includes(model)) return fail(`${model || 'That model'} isn't part of your plan. Pick another model in the list.`, 403, 'model_not_in_plan');
  if (usage.answers >= plan.perDay) { const c = classify({ kind: 'daily_limit', perDay: plan.perDay }); return fail(c.say, c.status, c.code, { action: c.action }); }

  // Track H3: the asked model, then (when it fails for a reason that isn't the student's) the plan's next live
  // models, in plan order, that have a key here. Gemini also tries its lighter model (its own quota) first.
  const order = [model, ...plan.models.filter((id) => id !== model && !MODELS[id].off)].filter((id) => env[UPSTREAM[MODELS[id].provider].key]);
  if (!order.length || order[0] !== model) return fail('This model is not set up on Crux yet. Pick another model in the list.', 503, 'not_ready', { action: 'switch' });
  const effort = effortFor(plan, body.reasoning_effort);
  let first = null; // what went wrong with the asked model, for the note
  let last = null;
  for (const id of order) {
    const spec = MODELS[id];
    const up = UPSTREAM[spec.provider];
    const out = { ...body, model: id, max_tokens: Math.min(Number(body.max_tokens) || spec.maxTokens, spec.maxTokens) };
    delete out.max_completion_tokens;
    const sent = providerEffort(spec.provider, effort);
    if (sent) out.reasoning_effort = sent; else delete out.reasoning_effort;
    if (!spec.image) out.messages = (out.messages || []).map((m) => (Array.isArray(m.content) ? { ...m, content: m.content.filter((p) => p.type !== 'image_url') } : m));
    for (const upstreamId of spec.provider === 'gemini' ? [id, GEMINI_LIGHT] : [id]) {
      const got = await call(fetchImpl, up.url, env[up.key], { ...out, model: upstreamId });
      if (got.ok) {
        await saveUsage(store, who.id, day, { answers: usage.answers + 1, gemini_failed_at: usage.gemini_failed_at }).catch((e) => console.error('crux_ai_usage:', e.message));
        const headers = { 'Content-Type': got.r.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Crux-Answers-Left': String(Math.max(0, plan.perDay - usage.answers - 1)), 'X-Crux-Model': id };
        if (first) headers['X-Crux-Note'] = `${MODELS[model].name} ${becauseOf(first.code)}, so ${spec.name} answered.`;
        return new Response(guard(got.r, body.stream), { status: 200, headers });
      }
      last = classify(got.err, { model: spec.name });
      logAiError(`ai relay ${upstreamId}`, `${got.err.status || got.err.kind} ${got.err.text || ''}`, env);
      if (!first) first = last;
      if (!['busy', 'timeout', 'down'].includes(last.code)) break; // the lighter Gemini only helps when Gemini is busy
    }
    if (!last.switch) break; // the student's doing (too long, refused): another model won't help
  }
  return fail(last.say, last.status, last.code, { action: last.action, ...(last.waitSeconds != null && { wait_seconds: last.waitSeconds }) }, last.waitSeconds != null ? { 'Retry-After': String(last.waitSeconds) } : {});
}

/** One upstream call: { ok, r } or { ok: false, err } in the shape classify() reads. Waits up to a minute for the
 * reply to start (the answer itself may stream for longer). */
async function call(fetchImpl, url, key, payload, waitMs = 60e3) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), waitMs);
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
    if (r.ok) return { ok: true, r };
    return { ok: false, err: { status: r.status, text: (await r.text().catch(() => '')).slice(0, 2000), retryAfter: r.headers.get('retry-after') } };
  } catch (e) {
    return { ok: false, err: { kind: ctrl.signal.aborted ? 'timeout' : 'network', text: e?.message || '' } };
  } finally { clearTimeout(timer); }
}

/** A streamed answer that breaks off mid-reply ends with an OpenAI-style error chunk (the desktop's client throws it
 * as an error with the plain sentence), instead of stopping silently. */
function guard(r, streamed) {
  if (!streamed || !r.body || !/event-stream/.test(r.headers.get('content-type') || '')) return r.body;
  const reader = r.body.getReader();
  const cut = classify({ kind: 'cut' });
  return new ReadableStream({
    async pull(c) {
      try {
        const { done, value } = await reader.read();
        if (done) c.close(); else c.enqueue(value);
      } catch (e) {
        logAiError('ai relay stream', e);
        c.enqueue(new TextEncoder().encode(`\n\ndata: ${JSON.stringify({ error: { message: cut.say, code: cut.code, type: 'crux_relay' } })}\n\n`));
        c.close();
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}
