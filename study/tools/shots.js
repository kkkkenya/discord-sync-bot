// Screenshots for UI checks, with the Edge that ships with Windows (no browser download):
//   node tools/shots.js <base url> [route ...]     e.g. node tools/shots.js http://localhost:5190 today units unit/EMM-302/papers
// Each route at 375×812 and 1280×800, light and dark, into study/shots/<route>-<theme>-<width>.png (git-ignored).
// Against the local server you are signed in as the owner (server/index.js), so no sign-in step is needed.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const [base, ...args] = process.argv.slice(2);
const routes = args.length ? args : ['today', 'units', 'practise', 'insights', 'settings'];
const out = fileURLToPath(new URL('../shots/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
for (const theme of ['light', 'dark']) {
  for (const [width, height] of [[375, 812], [1280, 800]]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
    for (const r of routes) {
      await page.goto(`${base}/#/${r}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const file = `${out}${r.replace(/\//g, '_')}-${theme}-${width}.png`;
      await page.screenshot({ path: file, fullPage: width > 600 });
      console.log(file);
    }
    await page.close();
  }
}
await browser.close();
