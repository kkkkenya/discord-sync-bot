// Offline preview: where every file in WATCH_DIRS would go, using the saved post list (lib/threads.json).
// Needs no token and posts nothing. `npm run dry-run` does the same against the live server.
import { config } from 'dotenv';
import THREADS from '../../lib/threads.json' with { type: 'json' };
import { startUploader } from './uploader/index.js';
import { PostIndex } from './uploader/posts.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
const index = new PostIndex(null).loadSaved(THREADS);
console.log(`Offline preview: ${index.byCode.size} unit codes across ${index.forums.size} forums (from lib/threads.json).`);
await startUploader({ guild: { premiumTier: 0 }, index, dry: true, log: console.log, onDryRunDone: () => process.exit(0) });
