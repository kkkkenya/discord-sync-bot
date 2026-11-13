// The Hub's local dashboard: Discord management in one page, on this computer only.
// Start: double-click ops\dashboard\start-dashboard.bat (or: node ops/dashboard/server.js). It opens the browser.
//
// Safety: it listens on 127.0.0.1 only, and each start makes a one-time key the page must send with every request,
// so no website you visit can drive it. The bot token is read from pc/.env here and never sent to the page.
import { spawn, execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
// pc/.env into process.env (DISCORD_TOKEN, SUPABASE_*), without printing anything
for (const line of fs.readFileSync(path.join(ROOT, 'pc', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { api } = await import('../../lib/discord.js');
const { GUILD_ID, ROLES, CHANNELS } = await import('../../lib/config.js');
const { PLAN_NAMES } = await import('../../lib/plan-names.js');
const announce = await import('../../pc/announce/stage.js');
const { pendingPayments, tail, isLocalHost } = await import('./util.js');

const PORT = Number(process.env.DASH_PORT) || 4180;
const KEY = randomBytes(24).toString('base64url');
const PAGE = fs.readFileSync(new URL('./page.html', import.meta.url), 'utf8');
const PLAN_ROLES = { [ROLES.trial]: 'trial', [ROLES.paid]: 'basic', [ROLES.premium]: 'premium', [ROLES.vvip]: 'vvip' };
const bad = (m, status = 400) => Object.assign(new Error(m), { status });

let job = null; // the announcement being sent: { name, done, total, sent, closed, finished, error }

async function overview() {
  const [guild, members, roles] = await Promise.all([
    api('GET', `/guilds/${GUILD_ID}?with_counts=true`),
    announce.allMembers({ fresh: true }),
    api('GET', `/guilds/${GUILD_ID}/roles`),
  ]);
  const people = members.filter((m) => !m.user.bot);
  const plans = Object.entries(PLAN_ROLES).map(([id, plan]) => ({
    id, plan, star: PLAN_NAMES[plan], role: roles.find((r) => r.id === id)?.name ?? '?',
    count: people.filter((m) => m.roles.includes(id)).length,
  }));
  return {
    server: guild.name, boost: guild.premium_tier, members: people.length, online: guild.approximate_presence_count ?? null,
    plans, noPlan: people.filter((m) => !Object.keys(PLAN_ROLES).some((id) => m.roles.includes(id))).length,
    bots: await botStatus(),
  };
}

// The PC bots run under ops/supervise.js. Their processes: node … src/index.js with cwd pc/ or community/.
function nodeProcesses() {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"],
      { windowsHide: true, timeout: 20000 }, (err, stdout) => {
        if (err) return resolve([]);
        try { const v = JSON.parse(stdout || '[]'); resolve(Array.isArray(v) ? v : [v]); } catch { resolve([]); }
      });
  });
}
async function botStatus() {
  const procs = await nodeProcesses();
  const supervisor = procs.find((p) => /ops[\\/]supervise\.js/.test(p.CommandLine || ''));
  const children = supervisor ? procs.filter((p) => p.ParentProcessId === supervisor.ProcessId) : [];
  const logs = ['pc', 'community'].map((dir) => {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const f = path.join(ROOT, dir, 'data', 'logs', `${day}.log`);
    return { bot: dir === 'pc' ? 'Drive dumper' : 'Hub buddy', lastLog: fs.existsSync(f) ? fs.statSync(f).mtime.toISOString() : null };
  });
  return { supervisor: Boolean(supervisor), running: children.length, logs };
}
async function restartBots() {
  const procs = await nodeProcesses();
  const supervisor = procs.find((p) => /ops[\\/]supervise\.js/.test(p.CommandLine || ''));
  if (!supervisor) throw bad('The supervisor is not running. Start it with: powershell -File ops\\install-task.ps1', 409);
  const children = procs.filter((p) => p.ParentProcessId === supervisor.ProcessId);
  for (const c of children) { try { process.kill(c.ProcessId); } catch { /* already gone */ } }
  return { restarted: children.length };
}

function logs(bot) {
  const dir = bot === 'community' ? 'community' : 'pc';
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const base = path.join(ROOT, dir, 'data', 'logs');
  return { today: tail(path.join(base, `${day}.log`), 80), restarts: tail(path.join(base, 'restarts.log'), 15) };
}

function registerCommands() {
  return new Promise((resolve) => {
    execFile(process.execPath, ['register-commands.js'], { cwd: path.join(ROOT, 'pc'), windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout}${stderr}`.trim().split('\n').slice(-25).join('\n') });
    });
  });
}

async function payments() {
  const msgs = await api('GET', `/channels/${CHANNELS.payments}/messages?limit=100`);
  return pendingPayments(msgs, GUILD_ID, CHANNELS.payments);
}

async function rolesAndChannels() {
  const [roles, channels, members] = await Promise.all([api('GET', `/guilds/${GUILD_ID}/roles`), api('GET', `/guilds/${GUILD_ID}/channels`), announce.allMembers()]);
  const people = members.filter((m) => !m.user.bot);
  return {
    roles: roles.filter((r) => !r.managed && r.name !== '@everyone').sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, plan: PLAN_ROLES[r.id] ? PLAN_NAMES[PLAN_ROLES[r.id]] : null, members: people.filter((m) => m.roles.includes(r.id)).length })),
    channels: channels.filter((c) => c.type === 0 || c.type === 5 || c.type === 15).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name, type: c.type === 15 ? 'forum' : 'text' })),
  };
}

const audienceFrom = (q) => { try { return q.get('aud') ? JSON.parse(q.get('aud')) : null; } catch { throw bad('That audience could not be read.'); } };
const batchesFrom = (v) => (Number(v) === 1 ? 1 : 3);

async function postMany(b) {
  const content = String(b.content || '').trim();
  if (!content || content.length > 2000) throw bad('A message of 1 to 2000 characters.');
  const ids = [...new Set((Array.isArray(b.channelIds) ? b.channelIds : []).map(String))].filter((id) => /^\d{5,25}$/.test(id));
  if (!ids.length) throw bad('Tick at least one channel.');
  if (ids.length > 25) throw bad('Up to 25 channels at a time.');
  const done = [];
  for (const id of ids) {
    try {
      const m = await api('POST', `/channels/${id}/messages`, { content, allowed_mentions: { parse: b.mentions ? ['roles', 'users', 'everyone'] : [] } });
      done.push({ id, ok: true, link: `https://discord.com/channels/${GUILD_ID}/${id}/${m.id}` });
    } catch (e) { done.push({ id, ok: false, error: String(e.message).slice(0, 160) }); }
  }
  return { posted: done.filter((d) => d.ok).length, results: done };
}

const routes = {
  'GET /api/overview': () => overview(),
  'GET /api/announcements': () => ({ names: announce.listAnnouncements(), job }),
  'GET /api/announcement': (q) => announce.plan(q.get('name'), { audience: audienceFrom(q), batches: batchesFrom(q.get('batches')) }).then((p) => ({ ...p.summary, text: p.text })),
  'GET /api/audience': (q) => announce.audienceSize(audienceFrom(q)),
  'PUT /api/announcement': (q, b) => { announce.writeText(q.get('name'), b.text); return { ok: true }; },
  'POST /api/announcement/send': (q, b) => {
    const name = q.get('name');
    if (!announce.validName(name)) throw bad('Pick an announcement.');
    if (job && !job.finished) throw bad(`Already sending "${job.name}" (${job.done}/${job.total}).`, 409);
    job = { name, done: 0, total: 0, sent: 0, closed: 0, finished: false, error: null, started: new Date().toISOString() };
    const audience = b.audience ? announce.cleanAudience(b.audience) : null;
    announce.sendStage(name, { audience, batches: batchesFrom(b.batches), onProgress: (p) => Object.assign(job, p) })
      .then((r) => Object.assign(job, { finished: true, failed: r.failed }))
      .catch((e) => Object.assign(job, { finished: true, error: e.message }));
    return job;
  },
  'GET /api/job': () => job,
  'GET /api/payments': () => payments(),
  'GET /api/discord': () => rolesAndChannels(),
  'PATCH /api/role': async (q, b) => {
    const name = String(b.name || '').trim();
    if (!name || name.length > 100) throw bad('A role name of 1 to 100 characters.');
    await api('PATCH', `/guilds/${GUILD_ID}/roles/${encodeURIComponent(q.get('id'))}`, { name });
    return { ok: true };
  },
  'PATCH /api/channel': async (q, b) => {
    const name = String(b.name || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[\p{L}\p{N}_-]{1,100}$/u.test(name)) throw bad('Channel names use letters, numbers, dashes and underscores.');
    await api('PATCH', `/channels/${encodeURIComponent(q.get('id'))}`, { name });
    return { ok: true, name };
  },
  'POST /api/post-many': (q, b) => postMany(b),
  'POST /api/post': async (q, b) => {
    const content = String(b.content || '').trim();
    if (!content || content.length > 2000) throw bad('A message of 1 to 2000 characters.');
    const m = await api('POST', `/channels/${encodeURIComponent(String(b.channelId))}/messages`, { content, allowed_mentions: { parse: b.mentions ? ['roles', 'users'] : [] } });
    return { ok: true, link: `https://discord.com/channels/${GUILD_ID}/${b.channelId}/${m.id}` };
  },
  'POST /api/register': () => registerCommands(),
  'POST /api/restart': () => restartBots(),
  'GET /api/logs': (q) => logs(q.get('bot')),
};

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(type === 'application/json' ? JSON.stringify(body ?? null) : body);
};
const keyOk = (given) => typeof given === 'string' && given.length === KEY.length && timingSafeEqual(Buffer.from(given), Buffer.from(KEY));

const server = http.createServer(async (req, res) => {
  // Only this computer, by its own name: blocks DNS-rebinding pages that point a domain at 127.0.0.1.
  if (!isLocalHost(req.headers.host, PORT)) return send(res, 403, { error: 'Local only.' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, PAGE, 'text/html');
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(res, 404, { error: 'Not found.' });
  if (!keyOk(req.headers['x-dash-key'])) return send(res, 401, { error: 'Open the dashboard from the link the start window printed.' });
  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 64 * 1024) return send(res, 413, { error: 'Too big.' }); }
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(res, 400, { error: 'Not JSON.' }); }
  }
  try { send(res, 200, await route(url.searchParams, body)); }
  catch (e) { send(res, e.status || 500, { error: String(e.message).replace(/Bot [\w.-]+/g, 'Bot …').slice(0, 300) }); }
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}/#key=${KEY}`;
  console.log(`Hub dashboard: ${link}\nKeep this window open. Close it to stop the dashboard.`);
  if (!process.argv.includes('--no-open')) spawn('cmd', ['/c', 'start', '', link], { windowsHide: true, detached: true }).unref();
});
