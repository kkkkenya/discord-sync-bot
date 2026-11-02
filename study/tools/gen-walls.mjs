// Adds the Dusk, Harbor and Fern wallpapers to web/src/wallpaper.css, made by the palette board's own code (crux-palettes
// v3, a scratch page from the redesign): its colours, textures and motion, light and dark. Fern's fronds are drawn once
// into web/src/wallpapers/fern-*.png. Run once; the CSS it appends is kept in the repo.
//   node tools/gen-walls.mjs <path to crux-palettes.v3.html>
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage();
await p.goto(pathToFileURL(process.argv[2]).href);
await p.waitForTimeout(1500);
const out = await p.evaluate(() => {
  const res = {};
  for (const id of ['dusk', 'harbor', 'fern']) {
    const pal = P.find((x) => x.id === id); // eslint-disable-line no-undef
    res[id] = { L: { v: pal.L, t: texture(pal, false) }, D: { v: pal.D, t: texture(pal, true) } }; // eslint-disable-line no-undef
  }
  const cs = getComputedStyle(document.documentElement);
  res.png = Object.fromEntries(['L-a', 'L-b', 'D-a', 'D-b'].map((k) => [k, cs.getPropertyValue(`--fern-${k}`).trim()]));
  return res;
});
await b.close();

for (const [k, v] of Object.entries(out.png)) writeFileSync(`web/src/wallpapers/fern-${k}.png`, Buffer.from(v.match(/base64,([^)"']+)/)[1], 'base64'));

// how each kind of motion moves its layer: [animation, inset, transform-origin]
const MOVE = {
  drift1: ['crux-drift1 36s ease-in-out infinite alternate', '-260px', '50% 50%'], drift2: ['crux-drift2 44s ease-in-out infinite alternate', '-260px', '50% 50%'],
  twinkle: ['crux-twinkle 4.5s ease-in-out infinite alternate', '0', '50% 50%'], haze: ['crux-haze 60s ease-in-out infinite alternate', '-80px', '50% 50%'],
  swayA: ['crux-sway 11s ease-in-out infinite alternate', '0', '0 100%'], swayB: ['crux-sway 13s ease-in-out infinite alternate-reverse', '0', '100% 0'],
};
const img = (x, mode) => x.img
  .replace(/^var\(--fern-[LD]-([ab])\)$/, (_, ab) => `url("./wallpapers/fern-${mode}-${ab}.png")`)
  .replace(/^url\('(data:[^']*)'\)$/, 'url("$1")');
const layer = (x, mode) => `${img(x, mode)} ${x.pos || '0 0'} / ${x.size || 'auto'} ${x.repeat || 'repeat'}`;
const base = (v) => [`radial-gradient(70% 45% at 92% 4%, ${v.g1}, transparent 70%) no-repeat`, `radial-gradient(65% 45% at 0% 92%, ${v.g2}, transparent 70%) no-repeat`, `linear-gradient(170deg, ${v.bg1}, ${v.bg2})`];
function block(id, mode, pad) {
  const { v, t } = out[id][mode];
  const moving = t.filter((x) => x.move);
  const lines = [`--a2: ${v.a2}; --bg1: ${v.bg1}; --bg2: ${v.bg2};`, `--wp-bg: ${[...t.filter((x) => !x.move).map((x) => layer(x, mode)), ...base(v)].join(', ')};`];
  for (const n of [1, 2]) {
    const m = moving[n - 1];
    if (!m) { lines.push(`--wp-m${n}: none; --wp-a${n}: none;`); continue; }
    const [anim, inset, origin] = MOVE[m.move];
    lines.push(`--wp-m${n}: ${layer(m, mode)};`, `--wp-a${n}: ${anim}; --wp-i${n}: ${inset}; --wp-o${n}: ${origin};`);
  }
  return lines.map((l) => `${pad}  ${l}`).join('\n');
}
const ids = ['dusk', 'harbor', 'fern'];
let css = '\n/* Dusk (stars that twinkle, a slow haze), Harbor (a harbour chart, still) and Fern (fronds swaying in from two corners):\n   made by tools/gen-walls.mjs from the palette board, like the two above. */\n';
for (const id of ids) css += `html[data-wp="${id}"] {\n${block(id, 'L', '')}\n}\n`;
css += '@media (prefers-color-scheme: dark) {\n';
for (const id of ids) css += `  html:not([data-theme="light"])[data-wp="${id}"] {\n${block(id, 'D', '  ')}\n  }\n`;
css += '}\n';
for (const id of ids) css += `html[data-theme="dark"][data-wp="${id}"] {\n${block(id, 'D', '')}\n}\n`;
css += '@keyframes crux-twinkle { from { opacity: .1; } to { opacity: 1; } }\n@keyframes crux-haze { to { transform: translate3d(-70px, 20px, 0); } }\n@keyframes crux-sway { from { transform: rotate(-1.2deg); } to { transform: rotate(1.2deg); } }\n';
writeFileSync('web/src/wallpaper.css', readFileSync('web/src/wallpaper.css', 'utf8') + css);
console.log(`wallpaper.css: +${css.length} characters`);
