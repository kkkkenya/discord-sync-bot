// Sets up the key that signs the Crux Android app.
//   node setup-key.js             asks for the key's password (hidden); Enter keeps the saved one, or makes a new one
//   node setup-key.js --generate  no questions: keeps the saved password, or makes a new random one
// The password goes in study/android/.env (git-ignored) and the key in crux.keystore (git-ignored). Keep a copy of
// both somewhere safe: an app on Google Play can only be updated with the same key.
// It also writes web/public/.well-known/assetlinks.json, which tells Android the app and crux.engineeringhub.site
// belong together, so the app opens without an address bar.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ENV = join(here, '.env');
const KEY = join(here, 'crux.keystore');
const ALIAS = 'crux';
const PACKAGE = JSON.parse(readFileSync(join(here, 'twa-manifest.json'), 'utf8')).packageId;
const LINKS = join(here, '..', 'web', 'public', '.well-known', 'assetlinks.json');

// keytool from Bubblewrap's own JDK (installed by Bubblewrap the first time), else from PATH
const jdk = (() => { try { return JSON.parse(readFileSync(join(homedir(), '.bubblewrap', 'config.json'), 'utf8')).jdkPath; } catch { return null; } })();
const keytool = jdk ? join(jdk, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';

const readEnv = () => (existsSync(ENV) ? Object.fromEntries(readFileSync(ENV, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])) : {});

function askHidden(question) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.startsWith(question)) rl.output.write(s); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); done(a.trim()); });
  });
}

// keytool reads the passwords from the environment (:env), so they never appear in a command line
const kt = (args, pass) => execFileSync(keytool, args, { env: { ...process.env, CRUX_KS: pass }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const saved = readEnv().CRUX_KEYSTORE_PASSWORD || '';
let pass = '';
if (!process.argv.includes('--generate') && process.stdin.isTTY) {
  pass = await askHidden(`Signing key password (${saved ? 'Enter keeps the saved one' : 'Enter makes a random one'}, at least 6 characters): `);
}
if (!pass) pass = saved || randomBytes(18).toString('base64url');
if (pass.length < 6) { console.error('The password needs at least 6 characters. Nothing was changed.'); process.exit(1); }

if (existsSync(KEY)) {
  try { kt(['-list', '-keystore', KEY, '-storepass:env', 'CRUX_KS', '-alias', ALIAS], pass); }
  catch { console.error(`That password doesn't open crux.keystore (or it has no "${ALIAS}" key). Run again and type the password the key was made with.`); process.exit(1); }
  console.log('crux.keystore opens with this password.');
} else {
  kt(['-genkeypair', '-keystore', KEY, '-alias', ALIAS, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass:env', 'CRUX_KS', '-keypass:env', 'CRUX_KS', '-dname', 'CN=Engineering Study Hub, O=Engineering Study Hub, L=Nairobi, C=KE'], pass);
  console.log('Made a new signing key: crux.keystore. Keep a copy of it and of .env somewhere safe.');
}
writeFileSync(ENV, `CRUX_KEYSTORE_PASSWORD=${pass}\n`);

// the key's public fingerprint (not a secret) for assetlinks.json
const sha = kt(['-list', '-v', '-keystore', KEY, '-storepass:env', 'CRUX_KS', '-alias', ALIAS], pass).match(/SHA256:\s*([0-9A-F:]+)/)[1];
let fingerprints = [sha];
try { fingerprints = [...new Set([sha, ...JSON.parse(readFileSync(LINKS, 'utf8'))[0].target.sha256_cert_fingerprints])]; } catch { /* first run */ }
mkdirSync(dirname(LINKS), { recursive: true });
writeFileSync(LINKS, `${JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: fingerprints } }], null, 2)}\n`);
console.log(`Wrote web/public/.well-known/assetlinks.json for ${PACKAGE}. It goes live with the next Crux deploy.`);
