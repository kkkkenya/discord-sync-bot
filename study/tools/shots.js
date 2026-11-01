// Screenshots for UI checks: node tools/shots.js <url> <name> [--dark]. Saves to study/data/shots/<name>-<width>.png
// at 375 and 1280 px wide, with the Edge that ships with Windows (no browser download).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const [url, name] = process.argv.slice(2);
const dark = process.argv.includes('--dark');
const out = new URL('../data/shots/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
for (const width of [375, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 812 : 800 }, colorScheme: dark ? 'dark' : 'light' });
  await page.goto(url, { waitUntil: 'networkidle' });
  const file = fileURLToPath(new URL(`${name}${dark ? '-dark' : ''}-${width}.png`, out));
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  await page.close();
}
await browser.close();
