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

const UNITS = 'mm|cm|km|m|kN·m|kNm|N·m|Nm|N/mm²|N/mm2|N/m²|MN|kN|N|GPa|MPa|kPa|Pa|rad/s|rpm|rev/min|kg|g|ms|s|min|h|kW|MW|W|kJ|J|°C|K|%|°|Hz|kHz|V|A|Ω';
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

export default function Rich({ text, as: Tag = 'div', className = '', math = true }) {
  const t = String(text ?? '');
  const [, setReady] = useState(Boolean(katex));
  useEffect(() => { if (math && !katex && hasMath(t)) loadKatex().then(() => setReady(true)).catch(() => {}); }, [t]);
  const lines = t.split('\n');
  return (
    <Tag className={`rich ${className}`}>
      {lines.map((line, n) => (
        <Fragment key={n}>
          {n > 0 && <br />}
          {(math ? line.split(MATH) : [line]).map((part, k) => {
            if (!part) return null;
            if (/^\$\$[\s\S]+\$\$$/.test(part)) return <MathBit key={k} tex={part.slice(2, -2)} display />;
            if (/^\\\[[\s\S]+\\\]$/.test(part)) return <MathBit key={k} tex={part.slice(2, -2)} display />;
            if (/^\\\([\s\S]+\\\)$/.test(part)) return <MathBit key={k} tex={part.slice(2, -2)} />;
            if (/^\$[^$]+\$$/.test(part)) return <MathBit key={k} tex={part.slice(1, -1)} />;
            return <Fragment key={k}>{inline(part, `${n}-${k}`)}</Fragment>;
          })}
        </Fragment>
      ))}
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
