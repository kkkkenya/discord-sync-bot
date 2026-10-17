// Creates (or updates) the bot's Supabase tables from supabase/schema.sql, then checks the bot can see them.
// Asks for a Supabase access token (hidden, used once, not saved). Run: make-tables.bat
// The token must come from the Supabase account that owns the project in pc/.env (SUPABASE_URL).
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: new URL('./.env', import.meta.url) });

const red = (s) => `\x1b[31m${s}\x1b[0m`, green = (s) => `\x1b[32m${s}\x1b[0m`, dim = (s) => `\x1b[2m${s}\x1b[0m`;
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.log(red('pc/.env has no SUPABASE_URL or SUPABASE_SERVICE_KEY. Run setup.bat first.')); process.exit(1); }
const ref = new URL(url).hostname.split('.')[0];

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let value = '';
    const { stdin } = process;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(value.trim()); }
      else if (ch === '\u0003') process.exit(1);
      else if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
      else value += ch;
    };
    stdin.on('data', onData);
  });
}

console.log(`Bot's Supabase project: ${ref}`);
console.log(dim('Make a token at supabase.com/dashboard/account/tokens while signed in to the account that owns this project.'));
const token = await askHidden('Supabase access token (starts with sbp_, hidden): ');
if (!token.startsWith('sbp_')) { console.log(red('✗ That isn\'t an access token. It starts with sbp_.')); process.exit(1); }

const mgmt = (path, opts = {}) => fetch(`https://api.supabase.com/v1${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
const list = await mgmt('/projects');
if (list.status === 401) { console.log(red('✗ Supabase didn\'t accept that token. Make a new one and try again.')); process.exit(1); }
const projects = await list.json();
if (!projects.some((p) => (p.ref || p.id) === ref)) {
  console.log(red(`✗ This token's account can't see project ${ref}.`));
  console.log(`  It sees: ${projects.map((p) => `${p.name} (${p.ref || p.id})`).join(', ') || 'no projects'}`);
  console.log('  Sign in to the Supabase account that owns the bot\'s project, make a token there, and run this again.');
  process.exit(1);
}

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8') + "\nnotify pgrst, 'reload schema';\n";
const r = await mgmt(`/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query: sql }) });
if (!r.ok) { console.log(red(`✗ Couldn't run the SQL (${r.status}): ${(await r.text()).slice(0, 300)}`)); process.exit(1); }
console.log(green('✓ Ran supabase/schema.sql.'));

await new Promise((res) => setTimeout(res, 3000));
let missing = [];
for (const t of ['files', 'log_members', 'log_entries', 'log_milestones', 'log_tracks']) {
  const c = await fetch(`${url}/rest/v1/${t}?limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (c.status !== 200) missing.push(t);
}
console.log(missing.length ? red(`✗ The bot still can't see: ${missing.join(', ')}. Wait a minute and run this again.`) : green('✓ The bot can see every table. You can close this window.'));
