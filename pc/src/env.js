// Imported first by index.js so pc/.env is loaded before anything reads process.env.
import { config } from 'dotenv';

config({ path: new URL('../.env', import.meta.url), quiet: true });
for (const key of ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in pc/.env. Run setup.bat (or: npm run setup) to add your keys.`);
    process.exit(1);
  }
}
