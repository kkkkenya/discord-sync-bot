// `npm run dev`: the local API on :5190 (you are the one student, data in study/data/) and Vite on :5173 in front of it.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (args, env) => spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
const api = run(['--watch-path=server', 'server/index.js'], { PORT: '5190' }); // vite.config.js sends /api here, whatever PORT the shell has

const web = run(['node_modules/vite/bin/vite.js']);
const stop = () => { api.kill(); web.kill(); process.exit(0); };
process.on('SIGINT', stop);
api.on('exit', (c) => { if (c) console.error(`API stopped (${c})`); });
web.on('exit', stop);
