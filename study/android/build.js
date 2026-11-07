// Builds the Crux Android app from twa-manifest.json with Bubblewrap: crux.apk (to install directly) and crux.aab
// (for Google Play). Run setup-key.js once first. Bump appVersionCode in twa-manifest.json for each Play upload.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = existsSync(join(here, '.env')) ? Object.fromEntries(readFileSync(join(here, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])) : {};
if (!env.CRUX_KEYSTORE_PASSWORD || !existsSync(join(here, 'crux.keystore'))) {
  console.error('No signing key yet. Run: node setup-key.js');
  process.exit(1);
}
const BW = 'npx -y @bubblewrap/cli@1.24.1';
const pass = env.CRUX_KEYSTORE_PASSWORD;
const jdk = (() => { try { return JSON.parse(readFileSync(join(homedir(), '.bubblewrap', 'config.json'), 'utf8')).jdkPath; } catch { return null; } })();
// Bubblewrap runs gradlew.bat by name, which Windows won't find in the folder when NoDefaultCurrentDirectoryInExePath
// is set, and calls jarsigner from PATH, so the JDK's bin folder goes first.
const { NoDefaultCurrentDirectoryInExePath, ...base } = process.env;
const PATH = jdk ? `${join(jdk, 'bin')}${delimiter}${base.PATH || base.Path}` : base.PATH || base.Path;
// Bubblewrap echoes its signing command, password included, when a step fails: the output is passed on with it hidden.
const hide = (s) => s.split(pass).join('********');
const run = (cmd) => {
  const r = spawnSync(cmd, { cwd: here, shell: true, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...base, PATH, Path: PATH, BUBBLEWRAP_KEYSTORE_PASSWORD: pass, BUBBLEWRAP_KEY_PASSWORD: pass } });
  process.stdout.write(hide(r.stdout || ''));
  process.stderr.write(hide(r.stderr || ''));
  if (r.status !== 0) { console.error(`
Failed: ${cmd}`); process.exit(1); }
};

run(`${BW} update --skipVersionUpgrade`); // (re)writes the Gradle project from twa-manifest.json
run(`${BW} build --skipPwaValidation`);
copyFileSync(join(here, 'app-release-signed.apk'), join(here, 'crux.apk'));
copyFileSync(join(here, 'app-release-bundle.aab'), join(here, 'crux.aab'));
console.log('\nBuilt study/android/crux.apk and study/android/crux.aab');
