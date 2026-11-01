// Daily limits (AI actions, downloads) and the DeepSeek monthly spend. In production the counters are Supabase
// rows bumped atomically (crux_bump, crux_add_spend in supabase/crux.sql); locally they're in memory.
import { db } from '../../lib/db.js';
import { DEEPSEEK, LIMITS } from './defs.js';
import { remote } from './ingest.js';

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const month = () => nairobiDay().slice(0, 7);
const memory = new Map(); // local dev: `${user}|${day}|${kind}` → count

export const limitFor = (kind, tier) => LIMITS[kind]?.[tier] ?? 0;

// One more use of `kind` today, if the tier allows it. { ok, used, limit }. Unlimited tiers aren't counted.
export async function bump(user, kind) {
  const limit = limitFor(kind, user?.tier);
  if (limit === Infinity) return { ok: true, used: 0, limit };
  if (!limit) return { ok: false, used: 0, limit };
  const day = nairobiDay();
  if (remote()) {
    const n = await db.rpc('crux_bump', { p_user: user.id, p_day: day, p_kind: kind, p_limit: limit });
    return n === null ? { ok: false, used: limit, limit } : { ok: true, used: n, limit };
  }
  const k = `${user.id}|${day}|${kind}`;
  const n = memory.get(k) || 0;
  if (n >= limit) return { ok: false, used: n, limit };
  memory.set(k, n + 1);
  return { ok: true, used: n + 1, limit };
}

// How much of today's `kind` is used, for Settings ("AI today: 6 of 15").
export async function usedToday(user, kind) {
  const limit = limitFor(kind, user?.tier);
  if (!user || limit === Infinity) return { used: 0, limit };
  const day = nairobiDay();
  if (!remote()) return { used: memory.get(`${user.id}|${day}|${kind}`) || 0, limit };
  const [row] = await db.select('crux_usage', `user_id=eq.${encodeURIComponent(user.id)}&day=eq.${day}&kind=eq.${kind}&select=count`);
  return { used: row?.count || 0, limit };
}

// DeepSeek spend this month. Over the cap, DeepSeek is off until next month (logged once per instance).
let spent = { month: '', usd: 0 };
let warned = '';
export const deepseekOpen = () => spent.month !== month() || spent.usd < DEEPSEEK.monthlyCapUsd;
export async function addDeepseekSpend(usd) {
  const m = month();
  if (remote()) spent = { month: m, usd: Number(await db.rpc('crux_add_spend', { p_month: m, p_provider: 'deepseek', p_usd: usd })) };
  else spent = { month: m, usd: (spent.month === m ? spent.usd : 0) + usd };
  if (!deepseekOpen() && warned !== m) { warned = m; console.error(`DeepSeek spend reached USD ${spent.usd.toFixed(2)} for ${m}: using Gemini until next month.`); }
}
export const resetUsageForTests = () => { memory.clear(); spent = { month: '', usd: 0 }; warned = ''; };
