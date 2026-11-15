// Checks a drawn free body diagram in code, so a solution is only marked checked when its forces really balance
// (fixplan-e E1b). Pure: no store, no AI.
//
// A truss diagram: { kind: 'truss', nodes: [{ id, x, y }] (metres, y up), members: [{ a, b, force }] (kN, + tension,
// - compression, null when not found), supports: [{ node, type: 'pin'|'roller' }], loads and reactions: [{ node, fx,
// fy, label }] (kN, x right, y up) }.
// Balance is necessary, not sufficient: a statically indeterminate truss can balance with wrong forces. Only a
// determinate one (members + reactions = 2 x joints) counts as checked.

const num = (v) => (v == null || v === '' ? NaN : Number(v));
const list = (a) => (Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : []);
const unit = (p, q) => {
  const dx = q.x - p.x, dy = q.y - p.y;
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
};

// What is wrong with the diagram's data, before any balance: [reasons]. Empty when every joint has finite
// coordinates, every member and force names a joint that exists, and every number is finite.
export function trussProblems(d) {
  const nodes = list(d?.nodes);
  const ids = new Set(nodes.map((n) => n.id));
  const out = [];
  if (nodes.length < 2) out.push('fewer than two joints');
  if (ids.size !== nodes.length) out.push('two joints share a name');
  for (const n of nodes) if (!Number.isFinite(num(n.x)) || !Number.isFinite(num(n.y))) out.push(`joint ${n.id} has no position`);
  for (const m of list(d?.members)) {
    if (!ids.has(m.a) || !ids.has(m.b)) out.push(`member ${m.a}${m.b} names a missing joint`);
    if (m.force != null && !Number.isFinite(num(m.force))) out.push(`member ${m.a}${m.b} has no number`);
  }
  for (const f of [...list(d?.loads), ...list(d?.reactions)]) {
    if (!ids.has(f.node)) out.push(`a force at missing joint ${f.node}`);
    if (!Number.isFinite(num(f.fx ?? 0)) || !Number.isFinite(num(f.fy ?? 0))) out.push(`a force at ${f.node} has no number`);
  }
  return out;
}

// The out-of-balance force at every joint: members pull on a joint along themselves when in tension and push when in
// compression. → [{ id, fx, fy, scale }], scale being the largest force meeting at that joint.
export function jointResiduals(d) {
  const nodes = list(d?.nodes);
  const at = new Map(nodes.map((n) => [n.id, { x: num(n.x), y: num(n.y) }]));
  const sum = new Map(nodes.map((n) => [n.id, [0, 0, 0]]));
  const add = (id, fx, fy) => { const s = sum.get(id); if (s) { s[0] += fx; s[1] += fy; s[2] = Math.max(s[2], Math.hypot(fx, fy)); } };
  for (const m of list(d?.members)) {
    const p = at.get(m.a), q = at.get(m.b);
    if (!p || !q || m.force == null) continue;
    const F = num(m.force);
    const [ux, uy] = unit(p, q);
    add(m.a, F * ux, F * uy);
    add(m.b, -F * ux, -F * uy);
  }
  for (const f of [...list(d?.loads), ...list(d?.reactions)]) add(f.node, num(f.fx ?? 0), num(f.fy ?? 0));
  return [...sum].map(([id, [fx, fy, scale]]) => ({ id, fx, fy, scale }));
}

// { ok, worst, unbalanced: [ids], complete, determinate, problems }. A joint balances when what is left over is under
// 0.5% of the largest force at that joint, or 0.02 kN (answers carry 3-4 figures). ok needs good data, every member
// force, a determinate truss and every joint balanced.
export function checkTruss(d) {
  const problems = trussProblems(d);
  const members = list(d?.members);
  const res = problems.length ? [] : jointResiduals(d);
  const unbalanced = res.filter((r) => !(Math.hypot(r.fx, r.fy) <= Math.max(0.02, 0.005 * r.scale))).map((r) => r.id);
  const worst = Math.max(0, ...res.map((r) => Math.hypot(r.fx, r.fy)).filter(Number.isFinite));
  const complete = members.length > 0 && members.every((m) => m.force != null);
  const reactions = list(d?.reactions).reduce((n, f) => n + (num(f.fx) ? 1 : 0) + (num(f.fy) ? 1 : 0), 0);
  const supports = list(d?.supports).reduce((n, s) => n + (s.type === 'pin' ? 2 : 1), 0);
  const determinate = members.length + Math.max(reactions, supports) === 2 * list(d?.nodes).length;
  return { ok: !problems.length && complete && determinate && !unbalanced.length, worst, unbalanced, complete, determinate, problems };
}

// "15.0 T", "18.0 C", "0"
export function memberLabel(force) {
  if (force == null || !Number.isFinite(Number(force))) return '?';
  const v = Math.abs(force);
  if (v < 0.005) return '0';
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)} ${force > 0 ? 'T' : 'C'}`;
}
