// Daily reply counters for the PC bot (community/data/state.json). What's been posted lives in Supabase.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const DIR = new URL('../data/', import.meta.url);
const FILE = new URL('state.json', DIR);
mkdirSync(DIR, { recursive: true });

export const state = (() => {
  const empty = { day: '', replies: 0, jumpIns: 0, lastSpoke: 0 };
  try { return { ...empty, ...JSON.parse(readFileSync(FILE, 'utf8')) }; } catch { return empty; }
})();

export function save() {
  writeFileSync(new URL('state.json.tmp', DIR), JSON.stringify(state));
  renameSync(new URL('state.json.tmp', DIR), FILE);
}

// Daily counters reset at Nairobi midnight.
export function today() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  if (state.day !== d) Object.assign(state, { day: d, replies: 0, jumpIns: 0 });
  return state;
}
