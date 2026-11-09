// A free body diagram drawn from the AI's description of it (server/brain.js FBD_SCHEMA): one beam or bar along x,
// its supports, the applied loads above and the reactions below, and the distances between every marked point; or a
// shaft in torsion with its torques and cuts, and its cross-section with the shear stress.
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

// the distances between every marked point, along the bottom
function dims(marks, X) {
  return (
    <>
      <line x1={X(marks[0])} y1={226} x2={X(marks.at(-1))} y2={226} className="fbd-thin" />
      {marks.map((m) => <line key={`t${m}`} x1={X(m)} y1={220} x2={X(m)} y2={232} className="fbd-thin" />)}
      {marks.slice(1).map((m, i) => (X(m) - X(marks[i]) > 24
        ? <text key={`d${m}`} x={(X(m) + X(marks[i])) / 2} y={246} textAnchor="middle" className="fbd-text dim">{Math.round((m - marks[i]) * 1000) / 1000} m</text>
        : null))}
    </>
  );
}
const markers = (
  <defs>
    {['fbd-load', 'fbd-react'].map((c) => (
      <marker key={c} id={`fbd-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" className={`${c}-head`} />
      </marker>
    ))}
  </defs>
);

// A torque as a double-headed vector along the shaft axis (right-hand rule), from x1 to x2 with the heads at x2
function torqueArrow(x1, x2, y, cls, key) {
  const s = Math.sign(x2 - x1) || 1;
  const head = (tip) => <path d={`M ${tip} ${y} L ${tip - s * 11} ${y - 6} L ${tip - s * 11} ${y + 6} Z`} className={`${cls}-head`} />;
  return <g key={key}><line x1={x1} y1={y} x2={x2 - s * 4} y2={y} className={cls} />{head(x2)}{head(x2 - s * 10)}</g>;
}

// A shaft in torsion: its segments (stepped, tapered or hollow), every applied torque (red) and reaction torque
// (blue) as a double-headed vector, the cuts where an internal torque is found, and the distances.
function Shaft({ d }) {
  const L = Number(d.length) || 0;
  const S0 = 110, S1 = 410; // narrower than a beam: the end torques are drawn outside the shaft
  const X = (at) => S0 + (Math.min(Math.max(Number(at) || 0, 0), L) / L) * (S1 - S0);
  const segs = d.segments?.length ? d.segments : [{ from: 0, to: L, d: 1, d2: 1, bore: 0, label: '' }];
  const dmax = Math.max(...segs.flatMap((s) => [Number(s.d) || 0, Number(s.d2) || Number(s.d) || 0]), 1);
  const half = (v) => Math.max(10, (40 * (Number(v) || 0)) / dmax);
  const top = Y - Math.max(...segs.flatMap((s) => [half(s.d), half(s.d2 || s.d)]));
  const torques = d.torques || [];
  const end = (at) => (Number(at) <= L * 0.001 ? 'left' : Number(at) >= L * 0.999 ? 'right' : null);
  const marks = [...new Set([0, L, ...segs.flatMap((s) => [s.from, s.to]), ...torques.map((t) => t.at), ...(d.cuts || []).map((c) => c.at)]
    .map((v) => Math.round(Math.min(Math.max(Number(v) || 0, 0), L) * 1000) / 1000))].sort((a, b) => a - b);
  const words = [
    `Shaft, ${L} m long.`,
    ...segs.filter((s) => s.label).map((s) => `${s.label} from ${s.from} to ${s.to} m.`),
    ...torques.map((t) => `${t.reaction ? 'Reaction torque' : 'Torque'} ${t.label} at ${t.at} m, vector pointing ${t.dir === '+x' ? 'right' : 'left'}.`),
    ...(d.cuts || []).map((c) => `Cut at ${c.at} m.`),
  ].join(' ');
  return (
    <svg viewBox={`0 0 ${W} 250`} role="img" aria-label={`Free body diagram. ${words}`}>
      {markers}
      <line x1={S0 - 16} y1={Y} x2={S1 + 16} y2={Y} className="fbd-axis" />
      {segs.map((s, i) => {
        const a = X(s.from), b = X(s.to), ha = half(s.d), hb = half(s.d2 || s.d), bore = Number(s.bore) ? half(s.bore) : 0;
        return (
          <g key={`g${i}`}>
            <path d={`M ${a} ${Y - ha} L ${b} ${Y - hb} L ${b} ${Y + hb} L ${a} ${Y + ha} Z`} className="fbd-shaft" />
            {bore > 0 && [-bore, bore].map((o) => <line key={o} x1={a} y1={Y + o} x2={b} y2={Y + o} className="fbd-hidden" />)}
            {s.label && <Label text={s.label} x={(a + b) / 2} y={Y + Math.max(ha, hb) + 18} textAnchor="middle" className="dim" />}
          </g>
        );
      })}
      {(d.supports || []).map((s, i) => {
        const x = X(s.at);
        if (s.type === 'fixed') {
          const left = x < W / 2, wx = left ? x - 2 : x + 2, h = Math.max(30, Y - top + 8);
          return (
            <g key={`s${i}`}>
              <line x1={wx} y1={Y - h} x2={wx} y2={Y + h} className="fbd-body" />
              {Array.from({ length: Math.floor((2 * h) / 12) + 1 }, (_, k) => Y - h + k * 12).map((y) => <line key={y} x1={wx} y1={y} x2={wx + (left ? -10 : 10)} y2={y + 8} className="fbd-thin" />)}
            </g>
          );
        }
        if (s.type === 'free') return null;
        const h = Y - top; // a bearing: a block above and below the shaft
        return <g key={`s${i}`}>{[-1, 1].map((k) => <rect key={k} x={x - 9} y={k < 0 ? Y - h - 12 : Y + h} width="18" height="12" className="fbd-support" />)}</g>;
      })}
      {(d.supports || []).filter((s) => s.label).map((s, i) => <Label key={`sl${i}`} text={s.label} x={X(s.at)} y={top - 22} textAnchor="middle" />)}
      {(d.cuts || []).map((c, i) => (
        <g key={`c${i}`}>
          <line x1={X(c.at)} y1={top - 12} x2={X(c.at)} y2={2 * Y - top + 12} className="fbd-cut" />
          <Label text={c.label || 'cut'} x={X(c.at)} y={top - 18} textAnchor="middle" className="dim" />
        </g>
      ))}
      {torques.map((t, i) => {
        const x = X(t.at), cls = t.reaction ? 'fbd-react' : 'fbd-load', right = t.dir === '+x';
        const side = end(t.at);
        const g = (d.supports || []).some((s) => s.type === 'fixed' && end(s.at) === side) ? 16 : 6; // clear of a wall's hatching
        let a, b, y = Y, lx, anchor = 'middle';
        if (side === 'left') { [a, b] = right ? [x - g - 70, x - g] : [x - g, x - g - 70]; lx = x - g; anchor = 'end'; }
        else if (side === 'right') { [a, b] = right ? [x + g, x + g + 70] : [x + g + 70, x + g]; lx = x + g; anchor = 'start'; }
        else { y = top - 34; [a, b] = right ? [x - 24, x + 24] : [x + 24, x - 24]; lx = x; }
        return (
          <g key={`t${i}`}>
            {!side && <line x1={x} y1={y + 6} x2={x} y2={top} className="fbd-thin" strokeDasharray="3 3" />}
            {torqueArrow(a, b, y, cls)}
            <Label text={t.label} x={lx} y={y - 16} textAnchor={anchor} className={t.reaction ? 'react' : ''} />
          </g>
        );
      })}
      {dims(marks, X)}
    </svg>
  );
}

// The cross-section and its shear stress, linear in r: zero at the centre, largest at the outside. A hollow shaft has
// no material inside the bore, so its stress starts at the inner radius.
function Section({ s }) {
  const outer = Number(s.outer) || 0;
  if (!outer) return null;
  const inner = Math.min(Number(s.inner) || 0, outer * 0.95);
  const R = 62, r = (R * inner) / outer, cx = 100, cy = 100;
  const ax = 250, len = 120; // the stress profile: the radius runs up from the centre at cy
  const at = (v) => cy - (v / outer) * 70; // v a diameter in mm: the outside sits 70 px above the centre
  const rows = [outer, ...(inner ? [inner] : [])];
  const fill = [0.25, 0.5, 0.75].map((f) => inner + f * (outer - inner)).filter((v) => v > inner);
  return (
    <svg viewBox="0 0 520 200" role="img" aria-label={`Cross-section: ${outer} mm outside${inner ? `, ${inner} mm bore` : ', solid'}. Shear stress grows linearly with radius: ${s.tauOuter} at the outside${inner && s.tauInner ? `, ${s.tauInner} at the bore` : ', zero at the centre'}.`}>
      {markers}
      <circle cx={cx} cy={cy} r={R} className="fbd-shaft" />
      {inner > 0 && <circle cx={cx} cy={cy} r={r} className="fbd-bore" />}
      <circle cx={cx} cy={cy} r="2" className="fbd-dot" />
      <text x={cx} y={190} textAnchor="middle" className="fbd-text dim">{inner ? `Ø${outer} outside, Ø${inner} bore` : `Ø${outer}, solid`}</text>
      <line x1={ax} y1={at(outer) - 10} x2={ax} y2={cy + 70 + 10} className="fbd-body" />
      <line x1={ax} y1={cy} x2={ax + len} y2={at(outer)} className="fbd-cut" />
      <line x1={ax} y1={cy} x2={ax - len} y2={cy + (cy - at(outer))} className="fbd-cut" />
      {[...rows, ...fill].map((v, i) => {
        const l = (len * v) / outer, y = at(v);
        return <g key={i}>{arrowTo(ax, y, ax + l, y, 'fbd-load', 'u')}{arrowTo(ax, 2 * cy - y, ax - l, 2 * cy - y, 'fbd-load', 'd')}</g>;
      })}
      <Label text={s.tauOuter || 'τmax'} x={ax + len + 8} y={at(outer) + 4} />
      {inner > 0 && s.tauInner && <Label text={s.tauInner} x={ax + (len * inner) / outer + 8} y={at(inner) + 4} />}
      {inner > 0 && <text x={ax + 8} y={cy + 18} className="fbd-text dim">bore: no material</text>}
      {!inner && <text x={ax + 8} y={cy + 16} className="fbd-text dim">τ = 0 at the centre</text>}
    </svg>
  );
}

export default function FreeBody({ d }) {
  const L = Number(d?.length) || 0;
  if (!L) return null;
  if (d.kind === 'shaft') {
    return (
      <figure className="fbd stack-s">
        <Shaft d={d} />
        {d.section?.show && <Section s={d.section} />}
      </figure>
    );
  }
  const X = (at) => X0 + (Math.min(Math.max(Number(at) || 0, 0), L) / L) * (X1 - X0);
  d = { supports: [], loads: [], reactions: [], ...d };
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
        {markers}
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
        {dims(marks, X)}
      </svg>
    </figure>
  );
}
