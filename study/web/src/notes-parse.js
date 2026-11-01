// Reading notes exported from Obsidian (a vault folder or .zip of .md files) or Notion (a .zip, often with another
// .zip inside, every name ending in a 32-character id). Pure: the browser and the tests both use it.
// entries: [{ path, data }], data a string or bytes. JSZip is passed in, so it's only loaded when there's a zip.

export const UNIT_CODE = /\b([A-Z]{3})\s?(\d{3})\b/;
const NOTION_ID = /\s[0-9a-f]{32}(?=\.|\/|$)/g;
const HAS_NOTION_ID = /\s[0-9a-f]{32}(?=\.|\/|$)/;
const TEXT_FILE = /\.(md|markdown|txt)$/i;

const decode = (data) => (typeof data === 'string' ? data : new TextDecoder().decode(data));
const unitOf = (s) => { const m = String(s || '').match(UNIT_CODE); return m ? `${m[1]} ${m[2]}` : null; };

// Markdown → plain study text: no front matter, no images or embeds, wiki links as their words.
export function cleanMarkdown(md) {
  return String(md)
    .replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')                       // Obsidian embeds
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                  // images
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')         // [[Note|alias]] → alias
    .replace(/\[\[([^\]]+)\]\]/g, '$1')                    // [[Note]] → Note
    .replace(/\[([^\]]+)\]\((?:[^)]*\.md|[^)]*%20[^)]*)\)/g, '$1') // Notion links between pages
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const frontMatter = (md) => String(md).match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';

// One note from one file. fallbackUnit is the unit picked in the dialog.
export function noteFrom(path, raw, fallbackUnit = null) {
  const clean = path.replace(NOTION_ID, '');
  const title = clean.split('/').pop().replace(TEXT_FILE, '').trim();
  const text = cleanMarkdown(raw);
  const unit = unitOf(frontMatter(raw)) || unitOf(title) || unitOf(clean) || fallbackUnit;
  return { title, unit, text, path: clean };
}

// Every note in a set of files, opening zips (and zips inside them, one level deep, as Notion makes them).
export async function readNotes(entries, { JSZip = null, fallbackUnit = null } = {}) {
  const files = [];
  const open = async (list, depth) => {
    for (const e of list) {
      if (/(^|\/)\.obsidian\//.test(e.path) || /(^|\/)__MACOSX\//.test(e.path)) continue;
      if (/\.zip$/i.test(e.path)) {
        if (!JSZip || depth > 1) continue;
        const zip = await JSZip.loadAsync(e.data);
        const inner = [];
        for (const f of Object.values(zip.files)) if (!f.dir) inner.push({ path: f.name, data: await f.async('uint8array') });
        await open(inner, depth + 1);
      } else if (TEXT_FILE.test(e.path)) files.push(e);
    }
  };
  await open(entries, 0);
  const source = entries.some((e) => /notion/i.test(e.path)) || files.some((f) => HAS_NOTION_ID.test(f.path)) ? 'notion'
    : files.some((f) => /\[\[/.test(decode(f.data))) || entries.some((e) => /\.obsidian\//.test(e.path)) ? 'obsidian' : 'file';
  const notes = files.map((f) => ({ ...noteFrom(f.path, decode(f.data), fallbackUnit), source })).filter((n) => n.text.length >= 20);
  // the same title twice in a unit: keep the longer one
  const best = new Map();
  for (const n of notes) { const k = `${n.unit}|${n.title.toLowerCase()}`; if (!best.has(k) || best.get(k).text.length < n.text.length) best.set(k, n); }
  return [...best.values()];
}
