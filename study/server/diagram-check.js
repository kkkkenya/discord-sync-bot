// Checks a drawn free body diagram in code, so a solution is only marked checked when its forces really balance
// (fixplan-e E1b). Pure: no store, no AI.
//
// A truss diagram: { kind: 'truss', nodes: [{ id, x, y }] (metres, y up), members: [{ a, b, force }] (kN, + tension,
// - compression, null when not found), supports: [{ node, type: 'pin'|'roller' }], loads and reactions: [{ node, fx,
// fy, label }] (kN, x right, y up) }.

const unit = (p, q) => {
  const dx = q.x - p.x, dy = q.y - p.y;
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
};

// The out-of-balance force at every joint: members pull on a joint along themselves when in tension and push when in
// compression. → [{ id, fx, fy }].
export function jointResiduals(d) {
  const at = new Map((d.nodes || []).map((n) => [n.id, n]));
  const sum = new Map((d.nodes || []).map((n) => [n.id, [0, 0]]));
  const add = (id, fx, fy) => { const s = sum.get(id); if (s) { s[0] += Number(fx) || 0; s[1] += Number(fy) || 0; } };
  for (const m of d.members || []) {
    const p = at.get(m.a), q = at.get(m.b);
    if (!p || !q || m.force == null) continue;
    const [ux, uy] = unit(p, q);
    add(m.a, m.force * ux, m.force * uy);
    add(m.b, -m.force * ux, -m.force * uy);
  }
  for (const f of [...(d.loads || []), ...(d.reactions || [])]) add(f.node, f.fx, f.fy);
  return [...sum].map(([id, [fx, fy]]) => ({ id, fx, fy }));
}

// { ok, worst, unbalanced: [ids] }. A joint balances when what is left over is under 1% of the largest force in the
// diagram (answers carry 3-4 figures), or under 0.01 kN. ok is false while any member force is missing.
export function checkTruss(d) {
  const forces = [...(d.members || []).map((m) => m.force), ...[...(d.loads || []), ...(d.reactions || [])].flatMap((f) => [f.fx, f.fy])]
    .map((v) => Math.abs(Number(v) || 0));
  const tol = Math.max(0.01, 0.01 * Math.max(0, ...forces));
  const res = jointResiduals(d);
  const unbalanced = res.filter((r) => Math.hypot(r.fx, r.fy) > tol).map((r) => r.id);
  const worst = Math.max(0, ...res.map((r) => Math.hypot(r.fx, r.fy)));
  const complete = (d.members || []).length > 0 && (d.members || []).every((m) => m.force != null);
  return { ok: complete && !unbalanced.length, worst, unbalanced, complete };
}

// "15.0 kN T", "18.0 kN C", "0"
export function memberLabel(force) {
  if (force == null) return '?';
  const v = Math.abs(force);
  if (v < 0.005) return '0';
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)} ${force > 0 ? 'T' : 'C'}`;
}
