import { Fragment, useEffect, useState } from 'react';

// Text from questions and the AI, made readable: maths in $…$, $$…$$, \(…\) or \[…\] is typeset with KaTeX (loaded
// only when a page has maths), **bold** and `code` work, and plain-text questions get their values with units and
// symbol = value pairs in bold, with x^2 and x_1 as real superscripts and subscripts.
let katex = null;
let loading = null;
const loadKatex = () => {
  loading = loading || Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => { katex = m.default; });
  return loading;
};
const MATH = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;
const hasMath = (t) => /\$[^$]+\$|\\\(|\\\[/.test(t);
// a field that holds only an equation, written in LaTeX without the $…$ around it (checkpoint equations)
const asTex = (t) => (!hasMath(t) && /\\[a-zA-Z]+|[_^]\{/.test(t) ? `$\\displaystyle ${t.replace(/\$/g, '')}$` : t);

const UNITS = 'kN/m|mm|cm|km|m|kN·m|kNm|N·m|Nm|N/mm²|N/mm2|N/m²|N/m|MN|kN|N|GPa|MPa|kPa|Pa|rad/s|rpm|rev/min|kg|g|ms|s|min|h|kW|MW|W|kJ|J|°C|K|%|°|Hz|kHz|V|A|Ω';
const VALUE = new RegExp(`(\\b[A-Za-zα-ωΑ-Ω][\\w']{0,3}\\s*=\\s*-?[\\d.,/]+\\s*(?:${UNITS})?|-?\\b\\d+(?:[.,]\\d+)?(?:\\s*[x×]\\s*10\\^?-?\\d+)?\\s?(?:${UNITS})(?![\\w]))`, 'g');

// plain text: bold values, real superscripts and subscripts
function plain(text, key) {
  const out = [];
  let i = 0;
  for (const m of text.matchAll(VALUE)) {
    if (m.index > i) out.push(scripts(text.slice(i, m.index), `${key}-t${i}`));
    out.push(<b key={`${key}-v${m.index}`} className="qv">{scripts(m[0], `${key}-s${m.index}`)}</b>);
    i = m.index + m[0].length;
  }
  if (i < text.length) out.push(scripts(text.slice(i), `${key}-t${i}`));
  return out;
}
function scripts(text, key) {
  const parts = text.split(/(\^\{[^}]+\}|\^-?[\w.]+|_\{[^}]+\}|_[A-Za-z0-9]+)/g);
  return parts.map((p, n) => {
    if (/^\^/.test(p)) return <sup key={`${key}-${n}`}>{p.replace(/^\^\{?|\}$/g, '')}</sup>;
    if (/^_/.test(p) && p.length > 1) return <sub key={`${key}-${n}`}>{p.replace(/^_\{?|\}$/g, '')}</sub>;
    return <Fragment key={`${key}-${n}`}>{p}</Fragment>;
  });
}
// **bold** and `code` inside a stretch of non-maths text
function inline(text, key) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, n) => {
    if (/^\*\*[\s\S]+\*\*$/.test(p)) return <b key={`${key}-b${n}`}>{plain(p.slice(2, -2), `${key}-b${n}`)}</b>;
    if (/^`[\s\S]+`$/.test(p)) return <code key={`${key}-c${n}`}>{p.slice(1, -1)}</code>;
    return <Fragment key={`${key}-p${n}`}>{plain(p, `${key}-p${n}`)}</Fragment>;
  });
}
function MathBit({ tex, display }) {
  if (!katex) return <code>{tex}</code>;
  let html;
  try { html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' }); } catch { return <code>{tex}</code>; }
  return <span className={display ? 'mathblock' : 'math'} dangerouslySetInnerHTML={{ __html: html }} />;
}

// one line: maths, then bold, code and values; a leading "Label:" (Spot it:, Final answer:) is bolded
const LABEL = /^([A-Z][A-Za-z' ]{1,26}):\s+(?=\S)/;
function line(text, math, key) {
  const lab = text.match(LABEL);
  const rest = lab ? text.slice(lab[0].length) : text;
  const parts = (math ? rest.split(MATH) : [rest]).map((part, k) => {
    if (!part) return null;
    if (math && /^\$\$[\s\S]+\$\$$/.test(part)) return <MathBit key={k} tex={part.slice(2, -2)} display />;
    if (math && /^\\\[[\s\S]+\\\]$/.test(part)) return <MathBit key={k} tex={part.slice(2, -2)} display />;
    if (math && /^\\\([\s\S]+\\\)$/.test(part)) return <MathBit key={k} tex={part.slice(2, -2)} />;
    if (math && /^\$[^$]+\$$/.test(part)) return <MathBit key={k} tex={part.slice(1, -1)} />;
    return <Fragment key={k}>{inline(part, `${key}-${k}`)}</Fragment>;
  });
  return lab ? <><b className="md-label">{lab[1]}:</b> {parts}</> : parts;
}

// AI text as blocks: headings (#, ##, ###), bullet and numbered lists, notes ("> …", or lines that start with
// Note:, Tip:, Trap:, Warning:, Remember:), and paragraphs separated by blank lines.
const NOTE = /^(note|tip|exam tip|trap|warning|watch out|common mistake|remember|key point)\s*:\s*/i;
const noteKind = (t) => (/^(trap|warning|watch out|common mistake)/i.test(t) ? 'warn' : /^(tip|exam tip)/i.test(t) ? 'tip' : 'note');
function blocks(t) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const raw of t.replace(/\r/g, '').split('\n')) {
    const ln = raw.trimEnd();
    let m;
    if (!ln.trim()) { flush(); continue; }
    if ((m = ln.match(/^(#{1,4})\s+(.*)/))) { flush(); out.push({ type: 'h', level: m[1].length, text: m[2].replace(/\*\*/g, '') }); continue; }
    if ((m = ln.match(/^\s*[-*•]\s+(.*)/))) { if (cur?.type !== 'ul') { flush(); cur = { type: 'ul', items: [] }; } cur.items.push(m[1]); continue; }
    if ((m = ln.match(/^\s*(\d+)[.)]\s+(.*)/))) { if (cur?.type !== 'ol') { flush(); cur = { type: 'ol', start: Number(m[1]), items: [] }; } cur.items.push(m[2]); continue; }
    // a line straight after a list item (an equation, its result) belongs to that item
    if ((cur?.type === 'ul' || cur?.type === 'ol') && !NOTE.test(ln) && !/^>/.test(ln)) { cur.items[cur.items.length - 1] += `\n${ln.trim()}`; continue; }
    if ((m = ln.match(/^>\s?(.*)/)) || NOTE.test(ln)) {
      const body = m ? m[1] : ln;
      if (cur?.type !== 'note') { flush(); cur = { type: 'note', kind: noteKind(body), lines: [] }; }
      cur.lines.push(body); continue;
    }
    if (cur?.type !== 'p') { flush(); cur = { type: 'p', lines: [] }; }
    cur.lines.push(ln);
  }
  flush();
  return out;
}

const item = (it, math, key) => it.split('\n').map((l, n) => <Fragment key={n}>{n > 0 && <br />}{line(l, math, `${key}-${n}`)}</Fragment>);

export default function Rich({ text, as: Tag = 'div', className = '', math = true, tex = false }) {
  const t = tex ? asTex(String(text ?? '')) : String(text ?? '');
  const [, setReady] = useState(Boolean(katex));
  useEffect(() => { if (math && !katex && hasMath(t)) loadKatex().then(() => setReady(true)).catch(() => {}); }, [t]);
  if (Tag === 'span') {
    return <span className={`rich ${className}`}>{t.split('\n').map((l, n) => <Fragment key={n}>{n > 0 && <br />}{line(l, math, n)}</Fragment>)}</span>;
  }
  const bs = blocks(t);
  return (
    <Tag className={`rich${bs.length > 1 ? ' md' : ''} ${className}`}>
      {bs.map((b, i) => {
        if (b.type === 'h') return <p key={i} className={`md-h md-h${Math.min(b.level, 3)}`}>{line(b.text, math, i)}</p>;
        if (b.type === 'ul') return <ul key={i} className="md-list">{b.items.map((it, j) => <li key={j}>{item(it, math, `${i}-${j}`)}</li>)}</ul>;
        if (b.type === 'ol') return <ol key={i} className="md-list" start={b.start}>{b.items.map((it, j) => <li key={j}>{item(it, math, `${i}-${j}`)}</li>)}</ol>;
        if (b.type === 'note') return <div key={i} className={`md-note ${b.kind}`}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{line(l, math, `${i}-${j}`)}</Fragment>)}</div>;
        return <p key={i} className="md-p">{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{line(l, math, `${i}-${j}`)}</Fragment>)}</p>;
      })}
    </Tag>
  );
}

// A question in its own box: a label, source and marks, then the question text.
export function QuestionBox({ text, meta = [], marks, label = 'Question', children }) {
  return (
    <section className="qbox" aria-label={label}>
      <div className="qbox-head">
        <span className="qbox-label">{label}</span>
        {meta.filter(Boolean).map((m) => <span key={m} className="chip">{m}</span>)}
        {marks ? <span className="chip num">{marks} marks</span> : null}
      </div>
      <Rich text={text} className="qbox-text" />
      {children}
    </section>
  );
}

// An answer in its own box, coloured apart from the question: tone 'key' (the right answer), 'mine' (yours) or 'model'.
export function AnswerBox({ text, label = 'Answer', tone = 'key', children }) {
  return (
    <section className={`abox ${tone}`} aria-label={label}>
      <span className="qbox-label">{label}</span>
      {text != null && <Rich text={text} />}
      {children}
    </section>
  );
}
