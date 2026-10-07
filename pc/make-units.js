// Builds lib/units.json, the unit catalogue the uploader uses to recognise folders named by title
// ("Fluid Mechanics 2", "Heat Transfer") instead of code. Sources: the website's unit pages
// (engstudyhub/public/redesign/units/<codes>-<title>) and the titled posts in lib/threads.json.
//   node make-units.js [path to the engstudyhub repo]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = process.argv[2] || join(process.env.USERPROFILE || '', 'engstudyhub');
const threads = JSON.parse(readFileSync(new URL('../lib/threads.json', import.meta.url), 'utf8'));
const units = new Map(); // first code -> { codes, title }
const add = (codes, title) => {
  if (!codes.length || !title) return;
  const key = codes[0];
  const old = units.get(key);
  if (!old || title.length > old.title.length) units.set(key, { codes: [...new Set([...(old?.codes || []), ...codes])], title });
};

for (const posts of Object.values(threads)) {
  for (const p of posts) {
    const [codePart, title] = p.name.split(' — ');
    add(codePart.match(/[A-Z]{3} \d{3}/g) || [], title?.trim());
  }
}
const dir = join(site, 'public', 'redesign', 'units');
if (existsSync(dir)) {
  for (const slug of readdirSync(dir)) {
    const codes = [];
    const words = slug.split('-');
    let n = 0;
    while (n + 1 < words.length && /^[a-z]{3}$/.test(words[n]) && /^\d{3}$/.test(words[n + 1])) { codes.push(`${words[n].toUpperCase()} ${words[n + 1]}`); n += 2; }
    const title = words.slice(n).join(' ').replace(/\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b/g, (r) => r.toUpperCase()).replace(/\b[a-z]/g, (c) => c.toUpperCase());
    add(codes, title);
  }
} else console.warn(`Website repo not found at ${site}; using lib/threads.json titles only.`);

const list = [...units.values()].sort((a, b) => a.codes[0].localeCompare(b.codes[0]));
writeFileSync(new URL('../lib/units.json', import.meta.url), `${JSON.stringify(list, null, 1)}\n`);
console.log(`Wrote lib/units.json: ${list.length} units.`);
