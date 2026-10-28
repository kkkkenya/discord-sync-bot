// Unit-aware answer comparison for checkpoint feedback (Phase 8). Pure: no store, no AI, no I/O.
// parseAnswer('142.5 MPa') -> { value, unit } and compareAnswers(student, key) -> a verdict with a reason.

const PI = Math.PI;
// symbol -> dimension exponents (L length, M mass, T time) and the factor to SI. Angles are dimensionless.
const BASE = {
  m: { d: { L: 1 }, f: 1 }, g: { d: { M: 1 }, f: 1e-3 }, s: { d: { T: 1 }, f: 1 }, min: { d: { T: 1 }, f: 60 }, h: { d: { T: 1 }, f: 3600 },
  N: { d: { M: 1, L: 1, T: -2 }, f: 1 }, Pa: { d: { M: 1, L: -1, T: -2 }, f: 1 }, J: { d: { M: 1, L: 2, T: -2 }, f: 1 },
  Nm: { d: { M: 1, L: 2, T: -2 }, f: 1 }, W: { d: { M: 1, L: 2, T: -3 }, f: 1 }, Hz: { d: { T: -1 }, f: 1 },
  rpm: { d: { T: -1 }, f: (2 * PI) / 60 }, rad: { d: {}, f: 1 }, deg: { d: {}, f: PI / 180 },
};
const PREFIX = { G: 1e9, M: 1e6, k: 1e3, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, n: 1e-9 };

function symbol(letters) {
  if (BASE[letters]) return BASE[letters];
  const p = PREFIX[letters[0]];
  const rest = BASE[letters.slice(1)];
  return p && rest ? { d: rest.d, f: rest.f * p } : null;
}

// 'N/mm^2', 'kN.m', 'mm2', 'rad/s' -> { dims, factor } | null when any part isn't a unit we know.
export function parseUnit(text) {
  const s = String(text || '').trim().replace(/[·⋅*×]/g, '.').replace(/µ/g, 'u').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\s+/g, '');
  if (!s) return null;
  const dims = {};
  let factor = 1;
  const [top, ...bottom] = s.split('/');
  for (const [part, sign] of [[top, 1], [bottom.join('.'), -1]]) {
    for (const tok of part.split('.').filter(Boolean)) {
      const m = tok.match(/^([A-Za-z]+)(?:\^?(-?\d+))?$/);
      const sym = m && symbol(m[1]);
      if (!sym) return null;
      const exp = (m[2] ? Number(m[2]) : 1) * sign;
      factor *= sym.f ** exp;
      for (const [k, v] of Object.entries(sym.d)) dims[k] = (dims[k] || 0) + v * exp;
    }
  }
  for (const k of Object.keys(dims)) if (!dims[k]) delete dims[k];
  return { dims, factor };
}

const NUMBER = /^\s*(?:[=≈~]\s*)?([+\-−–]?)\s*(\d[\d,]*\.?\d*|\.\d+)\s*(?:[eE]\s*([+\-−–]?\d+)|[x×*]\s*10\s*\^?\s*\(?([+\-−–]?\d+)\)?)?/;
const sign = (s) => (/[\-−–]/.test(s || '') ? -1 : 1);

// '142.5 MPa' -> { value: 142.5, unitText: 'MPa', unit: {dims, factor} | null }. value null = no number found.
// A label in front of the value is dropped: "d = 3.23 mm", "∴ d = 3.23 mm", "Ans: 3.23 mm" all read as 3.23 mm.
const LABEL = /^\s*(?:\u2234|therefore\b)?\s*(?:(?:ans(?:wer)?|final(?: answer)?)\s*[:=]?|[A-Za-z\u0391-\u03c9_]{1,6}(?:_?\{?[\w,]{0,6}\}?)?\s*=)\s*/i;

// superscripts typed or pasted: 10⁻³ → 10^-3
const SUP = { '⁻': '-', '⁺': '+', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const unSup = (s) => s.replace(/10([⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, e) => `10^${[...e].map((c) => SUP[c]).join('')}`);

export function parseAnswer(text) {
  text = unSup(String(text ?? ''));
  const m = text.replace(LABEL, '').match(NUMBER);
  if (!m) return { value: null, unitText: '', unit: null };
  const digits = /^\d{1,3}(,\d{3})+(\.\d*)?$/.test(m[2]) ? m[2].replace(/,/g, '') : m[2].replace(',', '.');
  const exp = m[3] ?? m[4];
  const value = sign(m[1]) * Number(digits) * (exp ? 10 ** (sign(exp) * Number(exp.replace(/[^\d]/g, ''))) : 1);
  const unitText = String(text).replace(LABEL, '').slice(m[0].length).trim().replace(/^[\s.,;]+|[\s.,;]+$/g, '');
  return { value, unitText, unit: parseUnit(unitText) };
}

const sameDims = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] || 0) === (b[k] || 0));
};
const near = (x, y, tol) => Math.abs(x - y) <= tol * Math.abs(y);

// verdict 'right' | 'wrong' | 'unreadable'. reason: ok | sign | units | dimension | value | unreadable. errorType is a
// best guess for the error list in defs.js (null when the numbers alone can't say). `assumed` = one side had no unit.
export function compareAnswers(student, key, { tol = 0.01 } = {}) {
  const a = parseAnswer(student);
  const k = parseAnswer(key);
  if (a.value == null) return { verdict: 'unreadable', reason: 'unreadable', note: 'Start with the number, then the unit, for example 142.5 MPa.' };
  if (k.value == null) return { verdict: 'unreadable', reason: 'unreadable', note: 'The answer key has no number to compare with.' };
  let A = a.value;
  let K = k.value;
  let assumed = false;
  if (a.unit && k.unit) {
    if (!sameDims(a.unit.dims, k.unit.dims)) return { verdict: 'wrong', reason: 'dimension', errorType: 'units', note: `Your unit (${a.unitText}) isn't the same kind of quantity as the key's (${k.unitText}).` };
    A *= a.unit.factor;
    K *= k.unit.factor;
  } else if (a.unitText && k.unitText && !a.unit && !k.unit && a.unitText !== k.unitText) {
    return { verdict: 'unreadable', reason: 'unreadable', note: `I don't know the units "${a.unitText}" and "${k.unitText}", so can't compare them.` };
  } else if (a.unitText !== k.unitText && (a.unitText || k.unitText)) {
    assumed = true; // compared as plain numbers
  }
  if (K === 0 ? Math.abs(A) <= 1e-9 : near(A, K, tol)) return { verdict: 'right', reason: 'ok', assumed };
  if (K !== 0 && near(A, -K, tol)) return { verdict: 'wrong', reason: 'sign', errorType: 'sign-convention', note: 'The size matches but the sign is opposite: check your sign convention.', assumed };
  const ratio = K === 0 ? 0 : A / K;
  const slip = [3, 6, 9, 1, 2].flatMap((p) => [p, -p]).find((p) => ratio > 0 && near(ratio, 10 ** p, tol));
  if (slip != null) return { verdict: 'wrong', reason: 'units', errorType: 'units', note: `Off by a factor of ${10 ** slip}: check the unit conversion (mm to m, kN to N, MPa to Pa).`, assumed };
  return { verdict: 'wrong', reason: 'value', errorType: null, assumed };
}
