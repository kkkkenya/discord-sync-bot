// A topic's colour, from the Breakpoint model (understanding.js, UNDERSTANDING.md): green when its understanding floor
// U_lo is 0.6 or more, red when nothing has been tried or U is under 0.4, amber in between. A manual override wins but
// is shown separately. Self-ratings are weighted by the unit's calibration (how well past ratings matched the evidence).
import { LAYER_NAME, LAYERS, calibration, understand } from './understanding.js';
import { data } from './store.js';

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const pct = (x) => Math.round(x * 100);
const lists = () => ({ subtopics: data.subtopics, teach: data.teach, attempts: data.attempts, mocks: data.mocks, paperq: data.paperq });
// "as of" a Nairobi day: the end of that day, or now if that's sooner
const asOf = (today) => Math.min(Date.now(), Date.parse(`${today}T23:59:59+03:00`));

export function topicMastery(topic, today = nairobiDay(), kappa) {
  const now = asOf(today);
  const k = kappa ?? calibration(data.topics.filter((t) => t.unit === topic.unit), lists(), now);
  const r = understand(topic, lists(), now, k);
  const manual = topic.manual || null;
  const why = r.tried
    ? `understanding ${pct(r.U)}, sure of at least ${pct(r.lo)}; weakest link: ${LAYER_NAME[r.bottleneck]}`
    : 'nothing tried yet';
  return {
    status: manual || r.status,
    manual: Boolean(manual),
    U: r.U, lo: r.lo, bottleneck: r.bottleneck, lastsDays: r.lastsDays, kappa: k,
    layers: Object.fromEntries(LAYERS.map((l) => [l, { p: r.layers[l].p, lo: r.layers[l].lo }])),
    subs: Object.fromEntries(r.subs.map((x) => [x.id, { U: x.U, lo: x.lo, bottleneck: x.bottleneck, tried: x.tried }])),
    why,
    next: manual ? 'marked by you' : r.next,
  };
}

export const topicStatus = (topic, today) => topicMastery(topic, today).status;
export function masteryMap(today = nairobiDay()) {
  const now = asOf(today);
  const kappa = Object.fromEntries([...new Set(data.topics.map((t) => t.unit))].map((u) => [u, calibration(data.topics.filter((t) => t.unit === u), lists(), now)]));
  return Object.fromEntries(data.topics.map((t) => [t.id, topicMastery(t, today, kappa[t.unit])]));
}
