// Runs both PC bots hidden, restarts them, and keeps their logs. Started by Task Scheduler (install-task.ps1).
// Node built-ins only, so it runs before `npm install` and never breaks on a package update.
//   node ops/supervise.js                         the bots in ops/bots.json
//   node ops/supervise.js --config <file.json>    another list (ops/test/crashy.json tests the crash alert)
// Logs: <bot dir>/data/logs/YYYY-MM-DD.log (everything, repeats collapsed) and restarts.log (one line per event).
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DELAYS = [10, 30, 120, 300]; // seconds between tries while a bot keeps dying fast
const STEADY_MS = 10 * 60e3;       // up this long → the backoff starts over
const REPEAT_MS = 60e3;            // identical lines within this window collapse
const KEEP_DAYS = 14;
const TICK_MS = 15e3;
const SLEPT_MS = 90e3;             // a timer gap this long means the laptop slept
const LOOP = { count: 5, windowMs: 15 * 60e3, quietMs: 60 * 60e3 }; // crash-loop alert, at most hourly per bot

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const nairobiHour = (d = new Date()) => Number(d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false }).slice(0, 2));
const stamp = (t = Date.now()) => new Date(t).toISOString();
const mins = (ms) => Math.round(ms / 60e3);

// The wait before the next start: escalates while a bot dies within a minute, resets once it stayed up.
export function nextDelay(attempt, uptimeMs, delays = DELAYS) {
  if (uptimeMs >= STEADY_MS) attempt = 0;
  const wait = uptimeMs < 60e3 ? delays[Math.min(attempt, delays.length - 1)] : delays[0];
  return { wait, attempt: uptimeMs < 60e3 ? attempt + 1 : 0 };
}

// Anything that looks like a key never leaves the PC in an alert.
export const redact = (s) => s
  .replace(/[\w-]{20,}\.[\w-]{6,}\.[\w-]{20,}/g, '[redacted]') // Discord tokens, JWTs
  .replace(/\b(AIza|sk-|github_pat_|gh[pousr]_)[\w-]{10,}/g, '[redacted]')
  .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');

// Collapses runs of the same line: the first is written, the rest become "… repeated N times".
export class Collapser {
  constructor(write) { this.write = write; this.last = null; this.since = 0; this.count = 0; }
  line(text, t = Date.now()) {
    if (text === this.last && t - this.since < REPEAT_MS) { this.count++; return; }
    this.flush();
    this.write(text, t);
    this.last = text; this.since = t;
  }
  flush(t) {
    if (this.count && (t === undefined || t - this.since >= REPEAT_MS)) {
      this.write(`… repeated ${this.count} times`, Date.now());
      this.count = 0; this.last = null;
    }
  }
}

// --- Discord (#bot-log), with the PC bot's token ------------------------------------------------------------
const pcEnv = (() => { try { return parseEnv(readFileSync(join(ROOT, 'pc/.env'), 'utf8')); } catch { return {}; } })();
let botLogId;
async function toBotLog(content) {
  const token = pcEnv.DISCORD_TOKEN;
  if (!token) return;
  const call = (path, init = {}) => fetch(`https://discord.com/api/v10${path}`, { ...init, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' } });
  try {
    if (!botLogId) {
      const { GUILD_ID } = await import('../lib/config.js');
      botLogId = (await (await call(`/guilds/${GUILD_ID}/channels`)).json()).find((c) => c.name === 'bot-log')?.id;
    }
    if (botLogId) await call(`/channels/${botLogId}/messages`, { method: 'POST', body: JSON.stringify({ content: content.slice(0, 1990), allowed_mentions: { parse: [] } }) });
  } catch { /* offline: the logs on disk still have it */ }
}

// --- One bot ------------------------------------------------------------------------------------------------
class Bot {
  constructor({ name, dir, args, delays }) {
    Object.assign(this, { name, args, delays: delays || DELAYS, cwd: join(ROOT, dir), attempt: 0, child: null, startedAt: 0 });
    this.logs = join(this.cwd, 'data', 'logs');
    mkdirSync(this.logs, { recursive: true });
    this.collapse = new Collapser((text, t) => this.append(`${nairobiDay(new Date(t))}.log`, `${stamp(t)} ${text}`));
    this.recent = [];   // last lines, for alerts
    this.restarts = []; // times of exits
    this.errors = new Map(); // error line → count, since the last health report
    this.lastAlert = 0;
    this.onlineMs = 0; this.awakeMs = 0;
  }
  append(file, line) { try { appendFileSync(join(this.logs, file), line + '\n'); } catch { /* disk busy: drop one line */ } }
  event(text) { this.append('restarts.log', `${stamp()} ${text}`); this.collapse.line(`[supervisor] ${text}`); }
  line(text, isError) {
    this.collapse.line(isError ? `ERROR ${text}` : text);
    this.recent.push(text); if (this.recent.length > 15) this.recent.shift();
    if (isError || /\b(error|failed|crashed)\b/i.test(text)) {
      const key = text.replace(/\d+/g, '#').slice(0, 120);
      this.errors.set(key, (this.errors.get(key) || 0) + 1);
    }
  }
  start() {
    this.startedAt = Date.now();
    this.child = spawn(process.execPath, this.args, { cwd: this.cwd, windowsHide: true, env: { ...process.env, SUPERVISED: '1' } });
    this.event(`start pid ${this.child.pid}`);
    createInterface({ input: this.child.stdout }).on('line', (l) => this.line(l, false));
    createInterface({ input: this.child.stderr }).on('line', (l) => this.line(l, true));
    this.child.on('error', (e) => this.line(`spawn failed: ${e.message}`, true));
    this.child.on('exit', (code, signal) => this.exited(code, signal));
  }
  exited(code, signal) {
    const up = Date.now() - this.startedAt;
    this.child = null;
    const lastError = [...this.recent].reverse().find((l) => /error|fail|missing|crash/i.test(l)) || '';
    this.event(`exit ${signal || `code ${code}`} after ${Math.round(up / 1000)}s${lastError ? ` | last error: ${lastError.slice(0, 200)}` : ''}`);
    if (stopping) return;
    const now = Date.now();
    this.restarts = [...this.restarts.filter((t) => now - t < 24 * 3600e3), now];
    const { wait, attempt } = nextDelay(this.attempt, up, this.delays);
    this.attempt = attempt;
    if (this.restarts.filter((t) => now - t < LOOP.windowMs).length >= LOOP.count && now - this.lastAlert > LOOP.quietMs) {
      this.lastAlert = now;
      toBotLog(redact(`⚠️ **${this.name}** keeps crashing: ${this.restarts.filter((t) => now - t < LOOP.windowMs).length} restarts in 15 min. Last lines:\n\`\`\`\n${this.recent.join('\n').slice(-1700)}\n\`\`\``));
    }
    setTimeout(() => { if (!stopping) this.start(); }, wait * 1000);
  }
  health() {
    const day = Date.now() - 24 * 3600e3;
    const top = [...this.errors].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l, n]) => `  ${n}× ${l}`);
    const online = this.awakeMs ? `${Math.round((100 * this.onlineMs) / this.awakeMs)}% of ${Math.round(this.awakeMs / 3600e3)} h awake` : 'no awake time logged';
    const text = `**${this.name}**: ${this.restarts.filter((t) => t > day).length} restarts in 24 h, online ${online}${top.length ? `\n${top.join('\n')}` : ', no errors'}`;
    this.errors.clear(); this.onlineMs = 0; this.awakeMs = 0;
    return redact(text);
  }
  prune() {
    const cutoff = Date.now() - KEEP_DAYS * 864e5;
    for (const f of readdirSync(this.logs)) {
      if (/^\d{4}-\d{2}-\d{2}\.log$/.test(f) && statSync(join(this.logs, f)).mtimeMs < cutoff) unlinkSync(join(this.logs, f));
    }
  }
}

// --- Main ---------------------------------------------------------------------------------------------------
let stopping = false;
if (import.meta.main) {
  const at = process.argv.indexOf('--config');
  const configFile = at > 0 ? process.argv[at + 1] : join(ROOT, 'ops/bots.json');
  const DATA = join(ROOT, 'ops/data');
  mkdirSync(DATA, { recursive: true });

  // One supervisor at a time (Task Scheduler re-runs it every 15 minutes as a watchdog).
  const LOCK = join(DATA, at > 0 ? 'supervise-test.lock' : 'supervise.lock');
  const other = (() => { try { return Number(readFileSync(LOCK, 'utf8')); } catch { return 0; } })();
  if (other && other !== process.pid) {
    let running = true;
    try { process.kill(other, 0); } catch (e) { running = e.code === 'EPERM'; }
    if (running) process.exit(0);
  }
  writeFileSync(LOCK, String(process.pid));

  const STATE = join(DATA, 'state.json');
  const state = (() => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } })();
  const bots = JSON.parse(readFileSync(configFile, 'utf8')).map((b) => new Bot(b));
  for (const b of bots) { b.prune(); b.start(); }

  let last = Date.now();
  setInterval(() => {
    const now = Date.now(), gap = now - last;
    last = now;
    for (const b of bots) b.collapse.flush(now);
    if (gap > SLEPT_MS) { for (const b of bots) b.event(`woke after ${mins(gap)} min`); return; }
    for (const b of bots) { b.awakeMs += gap; if (b.child) b.onlineMs += gap; }
    const today = nairobiDay();
    if (at < 0 && nairobiHour() >= 8 && state.healthDay !== today) {
      state.healthDay = today;
      writeFileSync(STATE, JSON.stringify(state));
      toBotLog(`🩺 Daily health\n${bots.map((b) => b.health()).join('\n')}`);
      for (const b of bots) b.prune();
    }
  }, TICK_MS);

  const stop = () => {
    stopping = true;
    for (const b of bots) { b.collapse.flush(); b.event('supervisor stopping'); b.child?.kill(); }
    try { if (readFileSync(LOCK, 'utf8') === String(process.pid)) unlinkSync(LOCK); } catch { /* gone */ }
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGBREAK', stop);
}
