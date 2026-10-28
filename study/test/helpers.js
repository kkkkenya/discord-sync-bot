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
