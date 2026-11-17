// Anki export (fixplan-e E9). Pure: cards to Anki's tab-separated import text, with GUIDs that stay the same between
// exports, so a second import updates the cards instead of duplicating them.
//
// Ported from DeepTutor, deeptutor/notes/anki_export.py (https://github.com/HKUDS/DeepTutor), licensed Apache-2.0.
// Changed for Crux: the header and the rendering are the same (Anki 2.1.55+ text import); the deck is Crux::<unit>
// and the tag is `crux <unit>`; the cards come from a unit's recipes and from questions the student got wrong
// (cardsFor below), and the GUIDs are hashes of Crux ids, not DeepTutor card ids.
import { createHash } from 'node:crypto';
import { ERROR_TYPES } from './defs.js';

export const ANKI_HEADERS = ['#separator:tab', '#html:true', '#notetype:Basic', '#deck column:3', '#tags column:4', '#guid column:5'];

// $...$ is maths only when the opening $ is followed by a non-space and the closing $ follows a non-space and is not
// followed by a digit, so "Cost $5 and $10" stays money.
const PROTECTED_SPANS = /(?<fence>```[\s\S]*?```)|(?<code>`[^`]+`)|(?<block_math>\$\$[\s\S]+?\$\$)|(?<math>(?<!\$)\$(?![\s$])[^$\n]+?(?<=\S)\$(?!\d))/g;
const BOLD = /\*\*(.+?)\*\*|__(.+?)__/g;
// *italic* only when the opening * is not preceded by a letter or digit ("2*3" stays) and is followed by a non-space,
// and the closing * follows a non-space
const ITALIC = /(?<![A-Za-z0-9*])\*(?![\s*])(.+?)(?<=\S)\*(?!\*)|(?<![A-Za-z0-9_])_(?!_)(.+?)(?<!_)_(?![A-Za-z0-9_])/g;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const SLUG_SPLIT = /[^\p{L}\p{N}_]+/gu;
const SLOT = /\x00(\d+)\x00/g;

// Python's html.escape (quote=True)
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

// Anki deck for a unit: Crux::EMM 302. "::" would make extra decks, so it becomes " — ".
export function deckName(unit) {
  const cleaned = String(unit || '').replace(CONTROL_CHARS, '').trim().replace(/::/g, ' — ') || 'Untitled';
  return `Crux::${cleaned}`;
}

// Space-separated tags: "crux" plus a slug of the unit ("crux emm-302").
export function noteTags(unit) {
  const slug = String(unit || '').trim().replace(SLUG_SPLIT, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return !slug || slug === 'crux' ? 'crux' : `crux ${slug}`;
}

// Card Markdown to minimal HTML Anki can import safely. Paragraphs, bold, italic, code and line breaks are kept;
// $...$ and $$...$$ become MathJax \(...\) and \[...\]; existing markup is escaped.
export function markdownToAnkiHtml(text) {
  if (!text) return '';
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '');
  const slots = [];
  const stash = (fragment) => { slots.push(fragment); return `\x00${slots.length - 1}\x00`; };
  // match spans once: code inside maths (or the reverse) is literal, never a nested placeholder
  const protectedText = normalized.replace(PROTECTED_SPANS, (...args) => {
    const raw = args[0];
    const groups = args.at(-1);
    if (groups.fence !== undefined) {
      const inner = raw.slice(3, -3);
      const newline = inner.indexOf('\n'); // the opening line holds the optional language, not code
      const code = newline !== -1 ? inner.slice(newline + 1) : inner;
      return stash(`<pre><code>${escapeHtml(code.replace(/^\n+|\n+$/g, '')).replace(/\n/g, '<br>')}</code></pre>`);
    }
    if (groups.code !== undefined) return stash(`<code>${escapeHtml(raw.slice(1, -1))}</code>`);
    if (groups.block_math !== undefined) return stash(`\\[${escapeHtml(raw.slice(2, -2).trim())}\\]`);
    return stash(`\\(${escapeHtml(raw.slice(1, -1).trim())}\\)`);
  });
  const escaped = escapeHtml(protectedText);
  const marked = escaped
    .replace(BOLD, (_, a, b) => `<b>${a ?? b}</b>`)
    .replace(ITALIC, (_, a, b) => `<i>${a ?? b}</i>`);
  const paragraphs = marked.trim().split(/\n{2,}/).filter((c) => c !== '')
    .map((c) => `<p>${c.replace(/\n/g, '<br>')}</p>`).join('');
  return anki(paragraphs.replace(SLOT, (_, n) => slots[Number(n)]));
}

// A value that must stay on one line of the import file.
const anki = (value) => String(value).replace(/\t/g, ' ').replace(/\r/g, '').replace(/\n/g, '');

// A GUID that is the same every time for the same Crux id (a recipe in a sheet, a question's latest wrong answer).
export const stableGuid = (...parts) => `crux-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)}`;

// Anki's import text: the header lines, then one row per card: front, back, deck, tags, guid. Each card is
// { front, back, unit, guid }.
export function renderAnki(cards) {
  const lines = [...ANKI_HEADERS];
  for (const card of cards) {
    lines.push([
      markdownToAnkiHtml(card.front),
      markdownToAnkiHtml(card.back),
      anki(deckName(card.unit)),
      anki(noteTags(card.unit)),
      anki(card.guid),
    ].join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

const plain = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const LABEL = Object.fromEntries(ERROR_TYPES.map((e) => [e.id, e.label]));

// The cards for one unit, from its method recipes (formula → when to use it) and from questions the student got
// wrong (question → the final answer, and the step that broke). The latest wrong answer on a question is the one
// kept. Pure: give it the lists. Right answers and disputed ones make no card.
export function cardsFor({ unit, materials = [], attempts = [], paperq = [] }) {
  const cards = [];
  for (const m of materials.filter((x) => x.unit === unit && x.kind === 'recipes')) {
    (m.content?.recipes || []).forEach((r) => {
      const name = plain(r.name);
      const when = plain(r.when);
      if (!name || !when) return;
      const shortcut = plain(r.shortcut);
      cards.push({
        front: name, unit,
        back: shortcut ? `Use when: ${when}\n\nShortcut: ${shortcut}` : `Use when: ${when}`,
        // the name, not the material id or the position: a re-made sheet or a reorder keeps the card's GUID
        guid: stableGuid('recipe', unit, name.toLowerCase().replace(/\s+/g, ' ')),
      });
    });
  }

  const latest = new Map();
  const byTime = [...attempts].filter((a) => a.unit === unit && (a.verdict === 'wrong' || a.verdict === 'mismatch'))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  for (const a of byTime) {
    const row = paperq.find((q) => q.id === a.questionId && q.unit === unit);
    const text = plain(row?.text || a.question);
    const id = a.questionId || text;
    if (!text || !id || latest.has(id)) continue;
    latest.set(id, { a, row, text });
  }
  for (const [id, { a, row, text }] of latest) {
    const step = a.brokeAt ? a.checkpoints?.[a.brokeAt - 1] : null;
    const front = row ? `${row.source} ${row.label || `Q${row.number}`}: ${text}` : text;
    const backLines = [];
    if (a.keyAnswer) backLines.push(`Final answer: ${plain(a.keyAnswer)}`);
    if (step && (step.step || step.equation)) {
      const why = LABEL[step.errorType] ? ` (${LABEL[step.errorType]})` : '';
      backLines.push(`Broke at: ${plain(step.step || step.equation)}${why}`);
    }
    if (!backLines.length) backLines.push(`Your answer was ${plain(a.answer) || 'not recorded'}; no key to check against yet.`);
    cards.push({ front, back: backLines.join('\n\n'), unit, guid: stableGuid('wrong', unit, id) });
  }
  return cards;
}
