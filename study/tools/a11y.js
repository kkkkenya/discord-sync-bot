// Accessibility check with axe-core in Edge: node tools/a11y.js <base url> [route ...]. Lists serious and critical issues.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const [base, ...args] = process.argv.slice(2);
const routes = args.length ? args : ['today', 'units', 'practise', 'insights', 'settings'];
const browser = await chromium.launch({ channel: 'msedge' });
let bad = 0;
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: theme });
  for (const r of routes) {
    await page.goto(`${base}/#/${r}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000); // let loading states settle
    await page.addScriptTag({ content: axe });
    const found = await page.evaluate(async () => (await window.axe.run()).violations.filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => `${v.impact} ${v.id}: ${v.nodes.length}× e.g. ${v.nodes[0].target.join(' ')}`));
    bad += found.length;
    console.log(`${theme} ${r}: ${found.length ? `\n  ${found.join('\n  ')}` : 'ok'}`);
  }
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
