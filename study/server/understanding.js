// The Breakpoint model (UNDERSTANDING.md): how well a concept is understood, from where your reasoning breaks.
// Understanding is a chain with three kinds of link: why (the governing principle), how (setting the method up) and
// do (carrying it through to the right number). Every teach-back, checked answer, mock answer and self-rating becomes
// weighted evidence on those links; each link is a Beta posterior with a credible floor; the concept is its weakest
// link, softly (a power mean with a strongly negative exponent), judged on that floor. Pure: give it the lists.

export const LAYERS = ['why', 'how', 'do'];
export const LAYER_NAME = { why: 'why it works', how: 'setting it up', do: 'carrying it through' };
const LAMBDA = { why: 0.4, how: 0.35, do: 0.25 };
export const LAYER_OF_ERROR = {
  'concept-gap': 'why', 'wrong-equation': 'why', 'sign-convention': 'how', 'boundary-condition': 'how',
  units: 'do', 'algebra-calculus': 'do', 'misread-question': 'do',
};
const LAYER_OF_KIND = { concept: 'why', derivation: 'why', assumption: 'why', method: 'how' };
const SELF = { solid: 0.9, shaky: 0.5, stuck: 0.1 };
export const GREEN = 0.6; // the floor U_lo must reach for "understood": a teach-back + 4 different questions over 2 weeks gets there
const RED = 0.4;
const Z = 1.28; // 90% one-sided
const DAY = 86400000;

const same = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
const difficulty = (marks) => Math.min(2, Math.max(0.5, (Number(marks) || 10) / 10));
const time = (iso) => Date.parse(iso) || 0;
// weighted power mean; rho < 0 leans towards the smallest value
export const powerMean = (xs, ws, rho) => {
  const wsum = ws.reduce((a, b) => a + b, 0);
  return Math.pow(xs.reduce((s, x, i) => s + ws[i] * Math.max(x, 0.01) ** rho, 0) / wsum, 1 / rho);
};

// Evidence for one topic: [{ layer, y, ws, wf, t, sub, q, self }]. ws weighs the part that held (y), wf the part that
// broke (1 - y): difficulty raises ws and lowers wf (holding on a hard question says more, breaking on an easy one
// says more), and a repeat success on the same question counts ws / (1 + r). Failures are never discounted.
export function evidenceFor(topic, { subtopics = [], teach = [], attempts = [], mocks = [], paperq = [] }) {
  const subs = subtopics.filter((s) => s.topicId === topic.id);
  const subIds = new Set(subs.map((s) => s.id));
  const ev = [];
  const put = (e) => ev.push({ sub: null, q: null, self: false, ...e });

  // teach-backs: explaining it is the strongest evidence of "why"
  for (const tb of teach.filter((x) => x.unit === topic.unit && same(x.topic, topic.name) && x.feedback)) {
    const t = time(tb.at);
    put({ layer: 'why', y: clamp01(tb.feedback.score / 5), ws: 1.5, wf: 1.5, t });
    for (const _ of (tb.feedback.gaps || []).slice(0, 3)) put({ layer: 'why', y: 0, ws: 0.3, wf: 0.3, t });
  }

  // self-ratings (teach-back gaps that rated a sub-topic are already counted above)
  for (const s of subs) {
    if (!s.auditAt || !(s.audit in SELF) || s.auditFrom === 'teach') continue;
    put({ layer: LAYER_OF_KIND[s.kind] || 'why', y: SELF[s.audit], ws: 0.6, wf: 0.6, t: time(s.auditAt), sub: s.id, self: true });
  }

  // checked answers: the broken step is evidence against one layer; the steps before it held; the steps after it
  // were never reached, so they say nothing
  const marksOf = (id) => paperq.find((q) => q.id === id)?.marks;
  const wins = {}; // questionId -> successes so far
  const tries = attempts.filter((a) => a.topicId === topic.id || subIds.has(a.subtopicId)).sort((a, b) => time(a.at) - time(b.at));
  for (const a of tries) {
    const t = time(a.at);
    const d = Math.sqrt(difficulty(marksOf(a.questionId)));
    const r = a.questionId ? wins[a.questionId] || 0 : 0;
    const sub = subIds.has(a.subtopicId) ? a.subtopicId : null;
    const held = (layer, w, s = sub) => put({ layer, y: 1, ws: (w * d) / (1 + r), wf: w / d, t, sub: s, q: a.questionId });
    const broke = (layer, w, s = sub) => put({ layer, y: 0, ws: w * d, wf: w / d, t, sub: s, q: a.questionId });
    if (a.verdict === 'right') {
      held('do', 1); held('how', 0.8); held('why', 0.6);
      if (a.questionId) wins[a.questionId] = r + 1;
    } else if (a.verdict === 'wrong' && a.brokeAt) {
      for (const cp of (a.checkpoints || []).slice(0, a.brokeAt - 1)) held(LAYER_OF_ERROR[cp.errorType] || 'how', 0.5, subIds.has(cp.subtopicId) ? cp.subtopicId : sub);
      broke(LAYER_OF_ERROR[a.errorType] || 'why', 1);
    } else if (a.verdict === 'mismatch' || a.verdict === 'wrong') {
      for (const l of LAYERS) broke(l, 0.3); // something broke, place unknown
    } // disputed: no evidence
  }

  // mock answers on the topic: partly how, partly do
  for (const m of mocks.filter((x) => x.unit === topic.unit)) {
    (m.questions || []).forEach((qq, i) => {
      const a = m.answers?.[i];
      if (!same(qq.topic, topic.name) || a?.earned == null || !qq.marks) return;
      const d = Math.sqrt(difficulty(qq.marks));
      for (const layer of ['how', 'do']) put({ layer, y: clamp01(a.earned / qq.marks), ws: 0.8 * d, wf: 0.8 / d, t: time(m.finishedAt || m.at) });
    });
  }
  return ev;
}

// Each layer as a Beta posterior on decayed evidence. The half-life is 10 days × (1 + spaced successes), a success
// counting as spaced when it is 2+ days after the last counted one. kappa scales self-ratings (calibration).
export function layersOf(events, now, kappa = 0.7) {
  const out = {};
  for (const l of LAYERS) {
    const ev = events.filter((e) => e.layer === l);
    let spaced = 0;
    let last = -Infinity;
    for (const t of ev.filter((e) => e.y >= 0.7 && !e.self).map((e) => e.t).sort((a, b) => a - b)) if (t - last >= 2 * DAY) { spaced++; last = t; }
    const halfLife = 10 * (1 + spaced);
    let alpha = 1;
    let beta = 1;
    for (const e of ev) {
      const k = 2 ** (-Math.max(0, now - e.t) / DAY / halfLife) * (e.self ? kappa : 1);
      alpha += e.ws * e.y * k;
      beta += e.wf * (1 - e.y) * k;
    }
    const p = alpha / (alpha + beta);
    out[l] = { p, lo: Math.max(0.01, p - Z * Math.sqrt((p * (1 - p)) / (alpha + beta + 1))), alpha, beta, halfLife, evidence: alpha + beta - 2 };
  }
  return out;
}

// Weakest link, softly: U = (Σ λ p^-4)^(-1/4); U_lo the same on the floors. The bottleneck is the biggest term.
export function combine(layers) {
  const lam = LAYERS.map((l) => LAMBDA[l]);
  const terms = LAYERS.map((l) => LAMBDA[l] * Math.max(layers[l].p, 0.01) ** -4);
  return {
    U: powerMean(LAYERS.map((l) => layers[l].p), lam, -4),
    lo: powerMean(LAYERS.map((l) => layers[l].lo), lam, -4),
    bottleneck: LAYERS[terms.indexOf(Math.max(...terms))],
  };
}

// How far to trust self-ratings: 1 - the mean gap between what you rated a sub-topic and what the evidence says.
export function calibration(topics, lists, now) {
  const gaps = [];
  for (const topic of topics) {
    const ev = evidenceFor(topic, lists);
    for (const s of lists.subtopics.filter((x) => x.topicId === topic.id && x.auditFrom !== 'teach' && x.audit in SELF)) {
      const objective = ev.filter((e) => e.sub === s.id && !e.self);
      if (!objective.length) continue;
      gaps.push(Math.abs(SELF[s.audit] - combine(layersOf(objective, now)).U));
    }
  }
  return gaps.length ? Math.max(0.2, Math.min(1, 1 - gaps.reduce((a, b) => a + b, 0) / gaps.length)) : 0.7;
}

const NEXT = {
  why: 'Teach it back: explain why the method works, not just the steps',
  how: 'Solve a past-paper question you haven’t seen, in Check answer',
  do: 'One timed question, checking units and signs at every line',
};

// One topic: { U, lo, status, bottleneck, layers, subs: { id: { U, lo, bottleneck, tried } }, lastsDays, next, tried }.
export function understand(topic, lists, now = Date.now(), kappa = 0.7) {
  const ev = evidenceFor(topic, lists);
  const at = (when) => {
    const pooled = combine(layersOf(ev, when, kappa));
    const subs = lists.subtopics.filter((s) => s.topicId === topic.id).map((s) => {
      const mine = ev.filter((e) => e.sub === s.id);
      return { id: s.id, ...combine(layersOf(mine, when, kappa)), tried: mine.length > 0 };
    });
    if (!subs.length) return { ...pooled, subs };
    const ones = subs.map(() => 1);
    return {
      U: powerMean([pooled.U, powerMean(subs.map((x) => x.U), ones, -2)], [1, 1], -2),
      lo: powerMean([pooled.lo, powerMean(subs.map((x) => x.lo), ones, -2)], [1, 1], -2),
      bottleneck: pooled.bottleneck,
      subs,
    };
  };
  const nowView = at(now);
  const tried = ev.length > 0;
  const status = !tried || nowView.U < RED ? 'red' : nowView.lo >= GREEN ? 'green' : 'amber';
  // how long it stays understood if you don't touch it
  let lastsDays = null;
  if (status === 'green') lastsDays = [1, 2, 4, 7, 10, 14, 21, 30, 45, 60, 90].find((d) => at(now + d * DAY).lo < GREEN) ?? 90;
  const layers = layersOf(ev, now, kappa);
  const thin = LAYERS.reduce((n, l) => n + layers[l].evidence, 0) < 2;
  const untried = nowView.subs.find((x) => !x.tried);
  const next = !tried || thin ? 'Try it once: a past-paper question in Check answer, or teach it back'
    : untried ? `Try ${lists.subtopics.find((s) => s.id === untried.id)?.name || 'its untried sub-topic'}: it hasn’t been tested yet`
      : status === 'green' ? `Understood. Revisit within ${lastsDays} days to keep it` : NEXT[nowView.bottleneck];
  return { ...nowView, layers, status, tried, lastsDays, next };
}
