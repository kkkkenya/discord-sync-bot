// Staged announcement DMs, shared by announce/send.js and the local dashboard (ops/dashboard).
// One message (announce/<name>.md) goes to every member as a personal DM, a third of the remaining members a day
// (owner, 2026-11-12: "in stages across 3 days"). Bots and members who turned check-ins off (/nudges off) are
// skipped; members with DMs closed are noted and not retried. Progress is kept in pc/data/announce-<name>.json.
import fs from 'node:fs';
import { api } from '../../lib/discord.js';
import { GUILD_ID } from '../../lib/config.js';
import { db } from '../../lib/db.js';

export const STAGES = 3;
const GAP_MS = 3000; // one DM every 3 s, well inside Discord's limits
const DIR = new URL('./', import.meta.url);
const DATA = new URL('../data/', import.meta.url);

export const validName = (name) => typeof name === 'string' && /^[\w-]{1,60}$/.test(name);
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const textFile = (name) => new URL(`${name}.md`, DIR);
const stateFile = (name) => new URL(`announce-${name}.json`, DATA);

export function listAnnouncements() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).filter(validName);
}
export function readText(name) {
  if (!validName(name)) throw bad('That isn\'t an announcement name.');
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

/** Pure: who gets today's stage. The remaining members, split evenly over the stages left. */
export function todaysStage(members, optedOut, state, stages = STAGES) {
  const everyone = members.filter((m) => !m.user.bot).sort((a, b) => a.user.id.localeCompare(b.user.id));
  const left = everyone.filter((m) => !optedOut.has(m.user.id) && !state.sent[m.user.id] && !state.closed[m.user.id]);
  const stagesLeft = Math.max(1, stages - state.stages.length);
  return { everyone, left, today: left.slice(0, Math.ceil(left.length / stagesLeft)) };
}

async function allMembers() {
  const members = [];
  for (let after = '0'; ;) {
    const page = await api('GET', `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
    members.push(...page);
    if (page.length < 1000) return members;
    after = page.at(-1).user.id;
  }
}

/** What today's stage would do, without sending anything. */
export async function plan(name) {
  const text = readText(name);
  const state = readState(name);
  const members = await allMembers();
  const optedOut = new Set((await db.select('prefs', 'nudges=eq.false&select=user_id').catch(() => [])).map((p) => p.user_id));
  const { everyone, left, today } = todaysStage(members, optedOut, state);
  const sample = today[0] ?? everyone[0];
  return {
    name, text, state, today,
    summary: {
      members: everyone.length, optedOut: optedOut.size,
      sent: Object.keys(state.sent).length, closed: Object.keys(state.closed).length, left: left.length,
      stage: Math.min(state.stages.length + 1, STAGES), stages: STAGES, stagesDone: state.stages.length, todayCount: today.length,
      firstFew: today.slice(0, 5).map(displayName),
      preview: sample ? text.replaceAll('{name}', displayName(sample)) : text,
      history: state.stages,
    },
  };
}

/** Sends today's stage. onProgress({ done, total, sent, closed }) after each member. */
export async function sendStage(name, { onProgress = () => {}, gapMs = GAP_MS } = {}) {
  const { text, state, today } = await plan(name);
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
