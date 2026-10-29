// Point the store at a throwaway copy of a fixture before anything imports store.js. Each test file runs in its
// own process (node --test), so one call per file, before the dynamic imports.
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function useStore(fixture) {
  const dir = mkdtempSync(join(tmpdir(), 'study-test-'));
  if (fixture) copyFileSync(fileURLToPath(new URL(`fixtures/${fixture}`, import.meta.url)), join(dir, 'study.json'));
  process.env.STUDY_DATA_DIR = dir;
  return dir;
}

// Start the real server on a throwaway store (a fixture, or empty) with every key blanked, so the Discord bot, the
// AI providers and Supabase stay off even on a machine with pc/.env. Returns { call(method, path, body), stop() }.
export async function startServer(fixture, env = {}) {
  const { spawn } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'study-api-'));
  if (fixture) copyFileSync(fileURLToPath(new URL(`fixtures/${fixture}`, import.meta.url)), join(dir, 'study.json'));
  const port = 5400 + Math.floor(Math.random() * 500);
  const blank = Object.fromEntries(['DISCORD_TOKEN', 'OWNER_ID', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'AI_PROVIDER'].map((k) => [k, '']));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], { env: { ...process.env, ...blank, STUDY_DATA_DIR: dir, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, fail) => {
    child.stdout.on('data', (b) => { if (String(b).includes('Study dashboard')) ok(); });
    child.on('exit', (c) => fail(new Error(`server exited ${c}`)));
  });
  const call = async (method, path, body) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { dir, call, stop: () => child.kill() };
}

// an in-memory stand-in for the Supabase tables, understanding just the queries the gateway makes
export function fakeDb(clock = () => Date.now()) {
  const t = { study_friends: [], study_usage: [], study_inbox: [], files: [] };
  let seq = 1;
  const match = (qs) => {
    const conds = qs.split('&').map((p) => p.split('=')).filter(([k, v]) => v && !['order', 'limit', 'select'].includes(k));
    return (row) => conds.every(([k, v]) => {
      const val = decodeURIComponent(v);
      if (val.startsWith('eq.')) return String(row[k]) === val.slice(3);
      if (val.startsWith('in.(')) return val.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(row[k]));
      return true;
    });
  };
  return {
    t,
    select: async (table, qs = '') => t[table].filter(match(qs)).map((r) => ({ ...r })),
    insert: async (table, rows) => rows.map((r) => { const row = { id: table === 'study_inbox' ? seq++ : `f${seq++}`, ...(table === 'study_inbox' ? { status: 'new' } : { active: true, ai_daily_cap: 40, via: 'invite' }), created_at: new Date(clock()).toISOString(), ...r }; t[table].push(row); return row; }),
    update: async (table, qs, patch) => t[table].filter(match(qs)).map((r) => Object.assign(r, patch)),
    rpc: async (fn, { f, d, what }) => {
      let u = t.study_usage.find((x) => x.friend_id === f && x.day === d);
      if (!u) t.study_usage.push(u = { friend_id: f, day: d, ai_calls: 0, dms: 0 });
      if (what === 'dm') return ++u.dms;
      return ++u.ai_calls;
    },
  };
}
