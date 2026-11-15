// Programming answers the way the course teaches them (owner, 2026-11-15). Pure: no store, no AI, no I/O.
// - taughtNames: every function, method, class and module the unit's notes use, read from the notes' own code.
// - stripComments: comments out of the code (an answer has none inside it), kept as text to show after the code.
// - untaught: what an answer calls that the notes never use and the answer doesn't define itself.
import { PROGRAMMING_UNIT } from './defs.js';

export const isProgramming = (title) => PROGRAMMING_UNIT.test(String(title || ''));

// Python keywords that look like calls (`if (`, `print` is a function and is not here).
const KEYWORDS = new Set(['if', 'elif', 'else', 'for', 'while', 'return', 'and', 'or', 'not', 'in', 'is', 'with', 'as', 'except', 'try', 'finally', 'lambda', 'yield', 'assert', 'del', 'global', 'nonlocal', 'pass', 'break', 'continue', 'raise', 'from', 'import', 'def', 'class', 'True', 'False', 'None', 'switch', 'catch', 'new', 'sizeof', 'typeof', 'foreach', 'using', 'do']);

// name( and .name( : the last part of a dotted call
const CALL = /(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/g;
const lastPart = (dotted) => dotted.split('.').pop().trim();

export function callsIn(code) {
  const out = new Set();
  for (const m of String(code || '').matchAll(CALL)) {
    const name = lastPart(m[1]);
    if (!KEYWORDS.has(name)) out.add(name);
  }
  for (const m of String(code || '').matchAll(/\.\s*([A-Za-z_]\w*)\s*\(/g)) out.add(m[1]); // ).pack( : a method on a call's result
  return out;
}

// import numpy as np, from tkinter import messagebox, Button → modules and the names they bring in
export function importsIn(code) {
  const out = new Set();
  for (const m of String(code || '').matchAll(/(?:^|\n|\s)import\s+([A-Za-z_][\w.]*)(?:\s+as\s+(\w+))?/g)) { out.add(m[1].split('.')[0]); if (m[2]) out.add(m[2]); }
  for (const m of String(code || '').matchAll(/from\s+([A-Za-z_][\w.]*)\s+import\s+([\w\s,*]+)/g)) {
    out.add(m[1].split('.')[0]);
    for (const n of m[2].split(',')) if (n.trim() && n.trim() !== '*') out.add(n.trim().split(/\s+/)[0]);
  }
  return out;
}

// The names an answer defines itself: def f(, class C, and names it assigns.
export function definedIn(code) {
  const out = new Set();
  for (const m of String(code || '').matchAll(/\b(?:def|class)\s+([A-Za-z_]\w*)/g)) out.add(m[1]);
  for (const m of String(code || '').matchAll(/(?:^|\n)\s*([A-Za-z_]\w*)\s*=(?!=)/g)) out.add(m[1]);
  return out;
}

// Everything the notes call or import. texts: the unit's file texts.
export function taughtNames(texts) {
  const out = new Set();
  for (const t of texts) { for (const n of callsIn(t)) out.add(n); for (const n of importsIn(t)) out.add(n); }
  return out;
}

// Calls and imports in the answer that the notes never use, minus what the answer defines. Sorted.
// String contents emptied: "Enter the mass (kg): " is text, not a call to mass().
export const blankStrings = (code) => String(code || '').replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)/g, (s) => s.slice(0, s.startsWith('"""') || s.startsWith("'''") ? 3 : 1).repeat(2));

export function untaught(code, taught) {
  if (!taught.size) return [];
  code = blankStrings(code);
  const own = definedIn(code);
  const used = new Set([...callsIn(code), ...importsIn(code)]);
  return [...used].filter((n) => !taught.has(n) && !own.has(n)).sort();
}

// Comments out of Python or C-style code, strings left alone. → { code, comments: [text] }.
// A comment on its own line goes with its line; a trailing one is cut from the end of the line.
export function stripComments(code, language = 'python') {
  const src = String(code || '');
  // # comments only in languages that use them (Python is the default); in C, #include and #define are code
  const hash = /^(|python\d?|py|r|sh|bash|shell|ruby|perl)$/i.test(String(language || '').trim());
  const comments = [];
  let out = '';
  let i = 0;
  let quote = null; // the open string's delimiter: ' " ''' """
  // a comment that was alone on its line takes the line with it
  const cut = (end) => {
    const start = out.lastIndexOf('\n') + 1;
    if (out.slice(start).trim()) return end;
    out = out.slice(0, start);
    return src[end] === '\n' ? end + 1 : end;
  };
  while (i < src.length) {
    const rest = src.slice(i);
    if (quote) {
      if (rest.startsWith(quote)) { out += quote; i += quote.length; quote = null; continue; }
      if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
      out += src[i++];
      continue;
    }
    const triple = rest.match(/^('''|""")/);
    if (triple) {
      // a docstring on its own line is a comment; one that is assigned or passed is a string
      const lineStart = out.slice(out.lastIndexOf('\n') + 1);
      const end = src.indexOf(triple[1], i + 3);
      if (hash && !lineStart.trim() && end > 0) {
        const text = src.slice(i + 3, end).trim();
        if (text) comments.push(text);
        i = cut(end + 3);
        continue;
      }
      quote = triple[1]; out += quote; i += 3; continue;
    }
    if (src[i] === '"' || src[i] === "'" || (!hash && src[i] === '`')) { quote = src[i]; out += src[i++]; continue; }
    if ((hash && src[i] === '#') || (!hash && rest.startsWith('//'))) {
      const end = src.indexOf('\n', i);
      const text = src.slice(i + (hash ? 1 : 2), end < 0 ? undefined : end).trim();
      if (text) comments.push(text);
      i = end < 0 ? src.length : cut(end);
      continue;
    }
    if (!hash && rest.startsWith('/*')) {
      const end = src.indexOf('*/', i + 2);
      const text = src.slice(i + 2, end < 0 ? undefined : end).replace(/^\s*\*\s?/gm, '').trim();
      if (text) comments.push(text);
      i = end < 0 ? src.length : cut(end + 2);
      continue;
    }
    out += src[i++];
  }
  const lines = out.split('\n').map((l) => l.replace(/\s+$/, ''));
  // drop lines that held only a comment, and runs of blank lines
  const tidy = lines.filter((l, n) => l.trim() || (n > 0 && lines[n - 1].trim()));
  return { code: tidy.join('\n').replace(/^\n+|\n+$/g, ''), comments };
}
