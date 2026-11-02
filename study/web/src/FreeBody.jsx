// A free body diagram drawn from the AI's description of it (server/brain.js FBD_SCHEMA): one beam or bar along x,
// its supports, the applied loads above and the reactions below, and the distances between every marked point.
const W = 520, X0 = 50, X1 = 470, Y = 110;

// R_A or R_{Ay} as a real subscript
function Label({ text, className = '', ...at }) {
  const parts = String(text).split(/(_\{[^}]+\}|_[A-Za-z0-9]+)/g).filter(Boolean);
  return (
    <text {...at} className={`fbd-text ${className}`}>
      {parts.map((p, i) => (p.startsWith('_') ? <tspan key={i} baselineShift="sub" fontSize="0.75em">{p.replace(/^_\{?|\}$/g, '')}</tspan> : <tspan key={i}>{p}</tspan>))}
    </text>
  );
}
const arrowTo = (x1, y1, x2, y2, cls, key) => <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} className={cls} markerEnd={`url(#fbd-${cls})`} />;

function moment(x, y, dir, cls, key) {
  const r = 20;
  // a three-quarter arc around the point; the arrowhead sits at the end of the turn
  const d = dir === 'cw' ? `M ${x - r} ${y} A ${r} ${r} 0 1 1 ${x} ${y + r}` : `M ${x + r} ${y} A ${r} ${r} 0 1 0 ${x} ${y + r}`;
  return <path key={key} d={d} className={cls} fill="none" markerEnd={`url(#fbd-${cls})`} />;
}

function arrow(x, dir, cls, above, key) {
  const [a, b] = above ? [Y - 62, Y - 7] : [Y + 80, Y + 32];
  if (dir === 'down') return above ? arrowTo(x, a, x, b, cls, key) : arrowTo(x, b, x, a, cls, key);
  if (dir === 'up') return above ? arrowTo(x, b, x, a, cls, key) : arrowTo(x, a, x, b, cls, key);
  if (dir === 'left') return arrowTo(x + (x > W / 2 ? 50 : 0), Y, x - (x > W / 2 ? 0 : 50), Y, cls, key);
  if (dir === 'right') return arrowTo(x - (x < W / 2 ? 50 : 0), Y, x + (x < W / 2 ? 0 : 50), Y, cls, key);
  return moment(x, above ? Y - 30 : Y + 30, dir, cls, key);
}

function support(s, x, key) {
  if (s.type === 'fixed') {
    const left = x < W / 2;
    const wx = left ? x - 6 : x + 6;
    return (
      <g key={key}>
        <line x1={wx} y1={Y - 30} x2={wx} y2={Y + 30} className="fbd-body" />
        {[-24, -12, 0, 12, 24].map((d) => <line key={d} x1={wx} y1={Y + d} x2={wx + (left ? -10 : 10)} y2={Y + d + 8} className="fbd-thin" />)}
      </g>
    );
  }
  if (s.type === 'free') return null;
  const base = s.type === 'roller' ? Y + 26 : Y + 30;
  return (
    <g key={key}>
      <path d={`M ${x} ${Y + 6} L ${x - 13} ${Y + 26} L ${x + 13} ${Y + 26} Z`} className="fbd-support" />
      {s.type === 'roller' && [-7, 7].map((d) => <circle key={d} cx={x + d} cy={Y + 30} r="4" className="fbd-support" />)}
      <line x1={x - 20} y1={base + (s.type === 'roller' ? 8 : 0)} x2={x + 20} y2={base + (s.type === 'roller' ? 8 : 0)} className="fbd-thin" />
    </g>
  );
}

export default function FreeBody({ d }) {
  const L = Number(d?.length) || 0;
  if (!L) return null;
  const X = (at) => X0 + (Math.min(Math.max(Number(at) || 0, 0), L) / L) * (X1 - X0);
  const marks = [...new Set([0, L, ...d.supports.map((s) => s.at), ...d.loads.flatMap((l) => [l.at, l.to]), ...d.reactions.map((r) => r.at)]
    .map((v) => Math.round(Math.min(Math.max(Number(v) || 0, 0), L) * 1000) / 1000))].sort((a, b) => a - b);
  const words = [
    `${d.kind === 'bar' ? 'Bar' : 'Beam'}, ${L} m long.`,
    ...d.supports.map((s) => `${s.type} support ${s.label} at ${s.at} m.`),
    ...d.loads.map((l) => (l.type === 'udl' ? `${l.label} from ${l.at} to ${l.to} m.` : `${l.label} ${l.dir} at ${l.at} m.`)),
    ...d.reactions.map((r) => `Reaction ${r.label} at ${r.at} m.`),
  ].join(' ');
  return (
    <figure className="fbd">
      <svg viewBox={`0 0 ${W} 250`} role="img" aria-label={`Free body diagram. ${words}`}>
        <defs>
          {['fbd-load', 'fbd-react'].map((c) => (
            <marker key={c} id={`fbd-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className={`${c}-head`} />
            </marker>
          ))}
        </defs>
        <rect x={X0} y={Y - 5} width={X1 - X0} height="10" rx="1" className="fbd-beam" />
        {d.supports.map((s, i) => support(s, X(s.at), `s${i}`))}
        {d.supports.filter((s) => s.label).map((s, i) => <Label key={`sl${i}`} text={s.label} x={X(s.at)} y={Y - 12} textAnchor={X(s.at) > W / 2 ? 'start' : 'end'} dx={X(s.at) > W / 2 ? 6 : -6} />)}
        {d.loads.map((l, i) => {
          if (l.type === 'udl') {
            const a = X(l.at), b = X(Math.max(l.to, l.at));
            const n = Math.max(2, Math.round((b - a) / 26));
            return (
              <g key={`l${i}`}>
                <line x1={a} y1={Y - 52} x2={b} y2={Y - 52} className="fbd-load" />
                {Array.from({ length: n + 1 }, (_, k) => arrowTo(a + ((b - a) * k) / n, Y - 52, a + ((b - a) * k) / n, Y - 7, 'fbd-load', k))}
                <Label text={l.label} x={(a + b) / 2} y={Y - 60} textAnchor="middle" />
              </g>
            );
          }
          const x = X(l.at);
          const side = l.dir === 'left' || l.dir === 'right';
          return (
            <g key={`l${i}`}>
              {l.type === 'moment' ? moment(x, Y, l.dir === 'ccw' ? 'ccw' : 'cw', 'fbd-load') : arrow(x, l.dir, 'fbd-load', true)}
              <Label text={l.label} x={x} y={side ? Y - 14 : l.type === 'moment' ? Y + 44 : Y - 68} textAnchor="middle" />
            </g>
          );
        })}
        {d.reactions.map((r, i) => {
          const x = X(r.at);
          const side = r.dir === 'left' || r.dir === 'right';
          return (
            <g key={`r${i}`}>
              {arrow(x, r.dir, 'fbd-react', false)}
              <Label text={r.label} x={x} y={side ? Y + 24 : Y + 96} textAnchor="middle" className="react" />
            </g>
          );
        })}
        <line x1={X0} y1={226} x2={X1} y2={226} className="fbd-thin" />
        {marks.map((m) => <line key={`t${m}`} x1={X(m)} y1={220} x2={X(m)} y2={232} className="fbd-thin" />)}
        {marks.slice(1).map((m, i) => (X(m) - X(marks[i]) > 24
          ? <text key={`d${m}`} x={(X(m) + X(marks[i])) / 2} y={246} textAnchor="middle" className="fbd-text dim">{Math.round((m - marks[i]) * 1000) / 1000} m</text>
          : null))}
      </svg>
    </figure>
  );
}
