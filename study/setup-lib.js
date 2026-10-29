// Shared by setup.js and setup-friend.js: .env reading and writing, hidden prompts, API key checks, port checks.
import net from 'node:net';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

export const green = (s) => `\x1b[32m${s}\x1b[0m`;
export const red = (s) => `\x1b[31m${s}\x1b[0m`;
export const dim = (s) => `\x1b[2m${s}\x1b[0m`;
export const bold = (s) => `\x1b[1m${s}\x1b[0m`;

export const NAMES = { gemini: 'Gemini', deepseek: 'DeepSeek', anthropic: 'Claude' };

export const readEnv = (url) => (existsSync(url)
  ? Object.fromEntries(readFileSync(url, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
  : {});

// Keeps every value you pass (and, because callers spread what they read, anything else already saved); drops empty ones.
// Written to a temp file and renamed, so a crash mid-write can't leave a half-empty .env.
export function writeEnv(url, values) {
  const text = Object.entries(values).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${v}`).join('\n');
  const tmp = new URL(`${url.href}.tmp`);
  writeFileSync(tmp, `${text}\n`);
  renameSync(tmp, url);
}

export function ask(question, { secret = false, current = '' } = {}) {
  const keep = current ? dim(` (Enter keeps ${secret ? `…${current.slice(-4)}` : current})`) : '';
  process.stdout.write(`\n${question}${keep}\n> `);
  return new Promise((done) => {
    const stdin = process.stdin;
    let value = '';
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') { stdin.off('data', onData); stdin.setRawMode?.(false); stdin.pause(); stdin.unref?.(); process.stdout.write('\n'); return done(value.trim() || current); }
        if (ch === '\u0003') { stdin.setRawMode?.(false); process.stdout.write('\nCancelled, nothing saved.\n'); process.exit(1); }
        if (ch === '\u001b') break; // arrow keys, Home, End: ignore the whole sequence instead of typing "[A"
        if (ch === '\u0008' || ch === '\u007f') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        if (ch < ' ') continue;
        value += ch;
        process.stdout.write(secret ? '*' : ch);
      }
    };
    stdin.ref?.(); // unref'd between prompts so the script can exit; ref'd while waiting for you
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

// 'ok' | 'rejected' (the provider says the key is wrong) | 'unreachable' (no network or timeout) | 'error' (anything else, e.g. 429 or 5xx)
export async function checkKey(provider, key) {
  const [url, headers] = {
    gemini: ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': key }],
    deepseek: ['https://api.deepseek.com/models', { Authorization: `Bearer ${key}` }],
    anthropic: ['https://api.anthropic.com/v1/models?limit=1', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }],
  }[provider];
  let r;
  try { r = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }); } catch { return 'unreachable'; }
  if (r.ok) return 'ok';
  return [400, 401, 403].includes(r.status) ? 'rejected' : 'error';
}

export function verdict(provider, status) {
  const name = NAMES[provider];
  return {
    ok: green(`✓ ${name} key works.`),
    rejected: red(`${name} rejected that key. Check you copied all of it.`),
    unreachable: red(`Couldn’t reach ${name} to check the key. It is saved; check your internet and run setup again later.`),
    error: red(`${name} didn’t give a clear answer. The key is saved; run setup again later to re-check it.`),
  }[status];
}

// Asks for a key and checks it. A rejected key is never returned: you get up to 3 tries, then ''.
export async function askKey(provider, question, current = '') {
  let key = await ask(question, { secret: true, current });
  for (let tries = 0; key; tries++) {
    const status = await checkKey(provider, key);
    console.log(verdict(provider, status));
    if (status !== 'rejected') return key;
    if (tries === 2) { console.log(dim('Three rejected keys, so none was saved.')); return ''; }
    key = await ask(`Paste the ${NAMES[provider]} key again (Enter to skip):`, { secret: true });
  }
  return '';
}

export const portBusy = (port) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', (e) => resolve(e.code === 'EADDRINUSE'));
  s.once('listening', () => s.close(() => resolve(false)));
  s.listen(port, '127.0.0.1');
});

// 1024-65535 only. A busy port is a warning, not an error: it may just be Study Desk itself still open.
export async function askPort(current = '5190') {
  for (;;) {
    const port = await ask('Dashboard port (keep 5190 unless something else uses it):', { current });
    if (!/^\d+$/.test(port) || +port < 1024 || +port > 65535) { console.log(red('A port is a number from 1024 to 65535.')); continue; }
    if (await portBusy(+port)) console.log(dim(`Something is already using port ${port}. If that is Study Desk, close its black window first; otherwise run setup again and pick another port.`));
    return port;
  }
}
