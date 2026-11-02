// Screenshots of Crux in use, for the /crux/ page on engineeringhub.site: real screens with content on them (a book
// question, a worked solution with its free body diagram, a study guide, the notes bar), light and dark, laptop and
// phone, into study/shots/site/ (git-ignored). Run against local Crux on your own data:
//   start "Crux (local).bat" (or CRUX_LIVE_DATA=1 node server/index.js), then
//   node tools/site-shots.js http://localhost:5180
// Two notes are added for the notes bar and deleted at the end. Then, in the website repo: cd tools && npm run crux-shots
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5180';
const out = fileURLToPath(new URL('../shots/site/', import.meta.url));
mkdirSync(out, { recursive: true });
const call = (method, path, body) => fetch(`${base}/api/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json());

const UNIT = 'EMM 302';
const qs = (await call('GET', `predict?unit=${encodeURIComponent(UNIT)}`)).questions;
const bookQ = qs.find((q) => /FUNDAMENTALS OF STRENGTH/i.test(q.source) && q.label === 'Example 1.1') || qs.find((q) => q.type === 'Book');
const solved = qs.find((q) => q.id === '1797-2' && q.explain) || qs.find((q) => q.explain);
const topic = (await call('GET', 'state')).data.topics.find((t) => t.unit === UNIT && t.guide);
const notes = [
  await call('POST', 'stickies', { unit: UNIT, from: `${UNIT} · Stress and Strain`, text: "Hooke's law: $\\sigma = E\\varepsilon$, with $E \\approx 200$ GPa for steel" }),
  await call('POST', 'stickies', { unit: UNIT, from: `${UNIT} · Shear`, text: 'Double shear: $\\tau = \\dfrac{P}{2A}$' }),
];

// the screens: [name, route, set up the page (optional), what to scroll to the top (optional)]
const scenes = [
  ['today', 'today'],
  ['question', 'practise', async (p) => { await p.locator('label:has-text("Question") select').selectOption(bookQ.id); }, '.qbox'],
  ['solution', 'practise', async (p) => {
    await p.locator('label:has-text("Question") select').selectOption(solved.id);
    await p.getByRole('button', { name: /full solution/i }).first().click();
    await p.locator('.fbd').waitFor();
  }, '.solution'],
  ['guide', 'unit/EMM-302/topics', async (p) => {
    await p.locator('#learn select').selectOption(topic.id);
    await p.locator('.guide').waitFor();
    await p.locator('.guide details').first().evaluate((d) => { d.open = true; });
  }, '#learn'],
  ['focus', 'focus'],
];

const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const theme of ['light', 'dark']) {
    for (const [device, viewport, scale] of [['laptop', { width: 1280, height: 800 }, 1.5], ['phone', { width: 390, height: 844 }, 2]]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: scale, colorScheme: theme });
      await page.addInitScript((unit) => { localStorage.setItem('study-unit', unit); }, UNIT);
      for (const [name, route, setup, top] of scenes) {
        if (device === 'phone' && !['today', 'question', 'solution', 'guide'].includes(name)) continue;
        await page.goto(`${base}/#/${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        if (setup) await setup(page);
        await page.waitForLoadState('networkidle');
        if (top) await page.locator(top).first().evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -88); });
        await page.waitForTimeout(700); // maths and the wallpaper settle
        const file = `${out}${name}-${device}-${theme}.png`;
        await page.screenshot({ path: file });
        console.log(file);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  for (const n of notes) if (n?.id) await call('DELETE', `stickies/${n.id}`);
}
