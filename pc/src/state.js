// Small local state kept on this PC in pc/data/state.json: last activity per member (for nudges),
// when each member was last nudged, and which revision-pack DMs went out. Not synced anywhere.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const DIR = new URL('../data/', import.meta.url);
const FILE = new URL('state.json', DIR);
mkdirSync(DIR, { recursive: true });

const empty = { lastActive: {}, lastNudged: {}, examPushed: {}, seeded: false };
export const state = (() => {
  try { return { ...empty, ...JSON.parse(readFileSync(FILE, 'utf8')) }; } catch { return { ...empty }; }
})();

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = new URL('state.json.tmp', DIR);
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, FILE); // write-then-rename so a crash never leaves half a file
  }, 2000);
}

export function touch(userId) {
  state.lastActive[userId] = Date.now();
  save();
}
