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
export async function startServer(fixture) {
  const { spawn } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'study-api-'));
  if (fixture) copyFileSync(fileURLToPath(new URL(`fixtures/${fixture}`, import.meta.url)), join(dir, 'study.json'));
  const port = 5400 + Math.floor(Math.random() * 500);
  const blank = Object.fromEntries(['DISCORD_TOKEN', 'OWNER_ID', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'AI_PROVIDER'].map((k) => [k, '']));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], { env: { ...process.env, ...blank, STUDY_DATA_DIR: dir, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
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
