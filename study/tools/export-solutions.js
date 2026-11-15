// A unit's saved worked solutions as one Markdown study pack, for Crux Harness (the desktop tutor reads it as a
// session file) or for printing. Reads study/data/study.json; papers and tutorials only, CATs first.
//   node tools/export-solutions.js "EMM 302" [output folder]
// The default folder is Documents\Crux\Hub\<unit>, where Crux Harness keeps the unit's Hub files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const [unit, outArg] = process.argv.slice(2);
if (!unit) { console.error('usage: node tools/export-solutions.js "EMM 302" [output folder]'); process.exit(1); }
const { data } = await import('../server/store.js');
const { memberLabel } = await import('../server/diagram-check.js');

const LEVEL = { key: 'Checked against the printed answer', agreed: 'Two solvers agree (Opus and DeepSeek Flash)', single: 'Solved once, not double-checked' };
const order = (q) => [/cat/i.test(q.type || q.source) ? 0 : 1, q.source, q.number];
const rows = data.paperq.filter((q) => q.unit === unit && q.type !== 'Book' && q.explain?.breakdown)
  .sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || String(x[1]).localeCompare(String(y[1])) || x[2] - y[2]; });
if (!rows.length) { console.error(`No saved solutions for ${unit}.`); process.exit(1); }

function truss(d) {
  const lines = ['**Truss geometry (m, y up):** ' + d.nodes.map((n) => `${n.id} (${+n.x.toFixed(3)}, ${+n.y.toFixed(3)})`).join(', ') + '.', '',
    '| Member | Force (kN) |', '|---|---|', ...d.members.map((m) => `| ${m.a}${m.b} | ${memberLabel(m.force)} |`), '',
    `**Supports:** ${d.supports.map((s) => `${s.type} at ${s.node}`).join(', ')}. **Loads:** ${d.loads.map((f) => `${f.label} at ${f.node}`).join(', ')}. **Reactions:** ${d.reactions.map((f) => `${f.label.replace(/_/g, '')} at ${f.node}`).join(', ')}.`,
    d.checked ? '_Every joint balances with these forces (checked in code)._' : ''];
  return lines.join('\n');
}

const out = [`# ${unit}: checked worked solutions`, '',
  `${rows.length} questions from the CATs and tutorials, each with its free body diagram first and then the working. `
  + 'Use these as the answer key: when your working disagrees, find the step where it breaks. T is tension, C is compression.', ''];
let source = '';
for (const q of rows) {
  if (q.source !== source) { source = q.source; out.push(`## ${source.replace(/\.(pdf|docx?)$/i, '')}`, ''); }
  const e = q.explain;
  out.push(`### Question ${q.number}${q.marks ? ` (${q.marks} marks)` : ''}`, '', `> ${q.text.replace(/\[Diagram[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1600)}`, '',
    `**How far this was checked:** ${LEVEL[e.level] || LEVEL.single}.`, '');
  if (e.diagram?.kind === 'truss') out.push(truss(e.diagram), '');
  out.push(e.breakdown.replace(/^## /gm, '#### '), '', `**Final answer:** ${e.answer}`, '', '---', '');
}
const dir = outArg || [join(homedir(), 'OneDrive', 'Documents'), join(homedir(), 'Documents')].map((d) => join(d, 'Crux', 'Hub', unit)).find((d) => existsSync(join(d, '..'))) || join(homedir(), 'Documents', 'Crux', 'Hub', unit);
mkdirSync(dir, { recursive: true });
const file = join(dir, `${unit} checked solutions.md`);
writeFileSync(file, out.join('\n'));
console.log(`${rows.length} solutions → ${file}`);
