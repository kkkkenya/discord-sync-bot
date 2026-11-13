// Messages to members as personal DMs, shared by announce/send.js and the local dashboard (ops/dashboard).
// One message (announce/<name>.md) goes to an audience: everyone, members with chosen roles, or members with no plan
// role. Big groups go in daily batches (owner, 2026-11-12: "in stages across 3 days"); small ones all at once.
// Bots and members who turned check-ins off (/nudges off) are skipped; members with DMs closed are noted and not
// retried. Progress, the audience and the batch count are kept in pc/data/announce-<name>.json, so later batches
// go to the same audience and nobody gets the message twice.
import fs from 'node:fs';
import { api } from '../../lib/discord.js';
import { GUILD_ID, ROLES } from '../../lib/config.js';
import { db } from '../../lib/db.js';

export const STAGES = 3;
const GAP_MS = 3000; // one DM every 3 s, well inside Discord's limits
const DIR = new URL('./', import.meta.url);
const DATA = new URL('../data/', import.meta.url);
const PLAN_ROLE_IDS = [ROLES.trial, ROLES.paid, ROLES.premium, ROLES.vvip];

export const validName = (name) => typeof name === 'string' && /^[\w-]{1,60}$/.test(name);
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const textFile = (name) => new URL(`${name}.md`, DIR);
const stateFile = (name) => new URL(`announce-${name}.json`, DATA);

export function listAnnouncements() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).filter(validName);
}
export function readText(name) {
  if (!validName(name)) throw bad('That isn\'t a message name.');
  return fs.readFileSync(textFile(name), 'utf8').trim();
}
export function writeText(name, text) {
  if (!validName(name)) throw bad('Names use letters, numbers and dashes only.');
  if (typeof text !== 'string' || !text.trim()) throw bad('Write the message first.');
  if (text.length > 1900) throw bad(`Discord allows 2000 characters; this is ${text.length}. Keep it under 1900.`);
  fs.writeFileSync(textFile(name), `${text.trim()}\n`);
}
export function readState(name) {
  const f = stateFile(name);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { sent: {}, closed: {}, stages: [] };
}
const saveState = (name, state) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(stateFile(name), JSON.stringify(state, null, 1)); };

export const displayName = (m) => m.nick || m.user.global_name || m.user.username;

/** { everyone } | { roles: [ids], noPlan }: a clean copy, or an error for an empty choice. */
export function cleanAudience(a) {
  if (a?.everyone) return { everyone: true };
  const roles = [...new Set((Array.isArray(a?.roles) ? a.roles : []).map(String).filter((r) => /^\d{5,25}$/.test(r)))];
  const noPlan = a?.noPlan === true;
  if (!roles.length && !noPlan) throw bad('Choose who gets it: everyone, one or more roles, or members with no plan.');
  return { roles, noPlan };
}
/** Pure: whether a member is in the audience. No audience saved yet means everyone (the first announcement). */
export function inAudience(member, audience) {
  if (!audience || audience.everyone) return true;
  const roles = member.roles || [];
  return (audience.roles || []).some((r) => roles.includes(r)) || (audience.noPlan === true && !PLAN_ROLE_IDS.some((r) => roles.includes(r)));
}

/** Pure: who gets today's batch. The remaining members of the audience, split evenly over the batches left. */
export function todaysStage(members, optedOut, state, stages = STAGES, audience = null) {
  const everyone = members.filter((m) => !m.user.bot && inAudience(m, audience)).sort((a, b) => a.user.id.localeCompare(b.user.id));
  const left = everyone.filter((m) => !optedOut.has(m.user.id) && !state.sent[m.user.id] && !state.closed[m.user.id]);
  const stagesLeft = Math.max(1, stages - state.stages.length);
  return { everyone, left, today: left.slice(0, Math.ceil(left.length / stagesLeft)) };
}

let cache = null; // members for a minute: the dashboard asks often while you choose
export async function allMembers({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 60e3) return cache.members;
  const members = [];
  for (let after = '0'; ;) {
    const page = await api('GET', `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
    members.push(...page);
    if (page.length < 1000) break;
    after = page.at(-1).user.id;
  }
  cache = { at: Date.now(), members };
  return members;
}
export const optedOutIds = async () => new Set((await db.select('prefs', 'nudges=eq.false&select=user_id').catch(() => [])).map((p) => p.user_id));

/** How many members an audience reaches, before anything is sent. */
export async function audienceSize(audience) {
  const aud = cleanAudience(audience);
  const [members, optedOut] = await Promise.all([allMembers(), optedOutIds()]);
  const people = members.filter((m) => !m.user.bot && inAudience(m, aud));
  const reach = people.filter((m) => !optedOut.has(m.user.id));
  return { count: reach.length, optedOut: people.length - reach.length, sample: reach.slice(0, 5).map(displayName) };
}

/** What today's batch would do, without sending. A saved audience and batch count win over the ones passed in. */
export async function plan(name, { audience = null, batches = null } = {}) {
  const text = readText(name);
  const state = readState(name);
  const aud = state.audience ?? (audience ? cleanAudience(audience) : null);
  const stages = state.batches ?? (batches === 1 ? 1 : STAGES);
  const [members, optedOut] = await Promise.all([allMembers(), optedOutIds()]);
  const { everyone, left, today } = todaysStage(members, optedOut, state, stages, aud);
  const sample = today[0] ?? everyone[0];
  return {
    name, text, state, today, audience: aud, stages,
    summary: {
      members: everyone.length, optedOut: everyone.filter((m) => optedOut.has(m.user.id)).length,
      sent: Object.keys(state.sent).length, closed: Object.keys(state.closed).length, left: left.length,
      stage: Math.min(state.stages.length + 1, stages), stages, stagesDone: state.stages.length, todayCount: today.length,
      firstFew: today.slice(0, 5).map(displayName),
      preview: sample ? text.replaceAll('{name}', displayName(sample)) : text,
      history: state.stages, audience: aud, audienceLocked: Boolean(state.audience),
    },
  };
}

/** Sends today's batch. The audience and batch count are fixed by the first send. */
export async function sendStage(name, { audience = null, batches = null, onProgress = () => {}, gapMs = GAP_MS } = {}) {
  const p = await plan(name, { audience, batches });
  const { text, state, today } = p;
  if (!state.audience) state.audience = p.audience ?? { everyone: true };
  if (!state.batches) state.batches = p.stages;
  let sent = 0, closed = 0, done = 0;
  const failed = [];
  for (const m of today) {
    try {
      const channel = await api('POST', '/users/@me/channels', { recipient_id: m.user.id });
      await api('POST', `/channels/${channel.id}/messages`, { content: text.replaceAll('{name}', displayName(m)), allowed_mentions: { parse: [] } });
      state.sent[m.user.id] = new Date().toISOString();
      sent++;
    } catch (e) {
      // 50007: the member doesn't accept DMs from server members
      if (/50007|-> 403/.test(String(e.message))) { state.closed[m.user.id] = new Date().toISOString(); closed++; }
      else failed.push(`${displayName(m)}: ${String(e.message).slice(0, 120)}`);
    }
    done++;
    saveState(name, state);
    onProgress({ done, total: today.length, sent, closed });
    if (done < today.length) await new Promise((r) => setTimeout(r, gapMs));
  }
  state.stages.push({ at: new Date().toISOString(), sent, closed, failed: failed.length });
  saveState(name, state);
  return { sent, closed, failed };
}
