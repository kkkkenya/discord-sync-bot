// Pure functions that compute study insights from the store. No side effects; unit-tested with node --test.
// All time-of-day logic uses Nairobi (UTC+3, no DST). The `db` argument is the store's data object.
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

export const nairobiHour = (iso) => (new Date(iso).getUTCHours() + 3) % 24;
const nairobiDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const partOf = (h) => (h >= 5 && h <= 11 ? 'morning' : h >= 12 && h <= 16 ? 'afternoon' : h >= 17 && h <= 21 ? 'evening' : 'night');

// Activity per Nairobi hour (session minutes + one unit per review/teach/mock/paper event), plus weekday × day-part.
export function activeHours(db, days = 30) {
  const since = Date.now() - days * DAY_MS;
  const hours = Array(24).fill(0);
  const events = Array(24).fill(0);
  const parts = Object.fromEntries(WEEKDAYS.map((w) => [w, { morning: 0, afternoon: 0, evening: 0, night: 0 }]));
  const bump = (iso, weight) => {
    const t = new Date(iso).getTime();
    if (t < since) return;
    const h = nairobiHour(iso);
    hours[h] += weight;
    events[h] += 1;
    parts[WEEKDAYS[new Date(`${nairobiDay(iso)}T12:00:00Z`).getUTCDay()]][partOf(h)] += weight;
  };
  for (const s of db.sessions) bump(s.at, s.minutes || 0);
  for (const r of db.reviews) bump(r.at, 1);
  for (const t of db.teach) bump(t.at, 1);
  for (const m of db.mocks) bump(m.at, 1);
  for (const p of db.papers) bump(p.at, 1);
  return { hours, events, parts };
}

// Recall accuracy and exam % per Nairobi hour, with the count of data points for each.
export function performanceHours(db, days = 30) {
  const since = Date.now() - days * DAY_MS;
  const recall = Array.from({ length: 24 }, () => ({ good: 0, total: 0 }));
  const score = Array.from({ length: 24 }, () => ({ sum: 0, total: 0 }));
  for (const r of db.reviews) {
    if (new Date(r.at).getTime() < since) continue;
    const b = recall[nairobiHour(r.at)];
    b.total++;
    if (r.grade >= 3) b.good++;
  }
  const addScore = (at, pct) => {
    if (new Date(at).getTime() < since) return;
    const b = score[nairobiHour(at)];
    b.sum += pct;
    b.total++;
  };
  for (const m of db.mocks) if (m.score != null && m.outOf) addScore(m.at, (m.score / m.outOf) * 100);
  for (const p of db.papers) addScore(p.at, (p.score / p.outOf) * 100);
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    recall: recall[hour].total ? Math.round((recall[hour].good / recall[hour].total) * 100) : null,
    recallN: recall[hour].total,
    score: score[hour].total ? Math.round(score[hour].sum / score[hour].total) : null,
    scoreN: score[hour].total,
  }));
}

// Focus rating vs recall accuracy in the session and the 2 hours after it.
export function focusVsPerformance(db, days = 30) {
  const since = Date.now() - days * DAY_MS;
  const buckets = Array.from({ length: 6 }, () => ({ good: 0, total: 0 }));
  for (const s of db.sessions) {
    if (!s.focus) continue;
    const start = new Date(s.at).getTime();
    if (start < since) continue;
    const end = start + (s.minutes || 0) * 60000 + 2 * HOUR_MS;
    const b = buckets[s.focus];
    for (const r of db.reviews) {
      const t = new Date(r.at).getTime();
      if (t >= start && t <= end) { b.total++; if (r.grade >= 3) b.good++; }
    }
  }
  const list = buckets.slice(1).map((b, i) => ({ focus: i + 1, total: b.total, pct: b.total ? Math.round((b.good / b.total) * 100) : null }));
  const n = list.reduce((a, b) => a + b.total, 0);
  return { buckets: list, n };
}

// Which topics need a deeper dive: 0-100, higher = needs more attention. Returns them sorted.
export function deeperDive(db, { examDays, now = Date.now(), days = 30 } = {}) {
  const since = now - days * DAY_MS;
  const cardById = new Map(db.cards.map((c) => [c.id, c]));
  const byTopic = {}; // lowercase topic -> { unit, total, good, lapses, lastAt }
  for (const r of db.reviews) {
    const card = cardById.get(r.card);
    if (!card?.topic) continue;
    const key = card.topic.toLowerCase();
    const b = byTopic[key] ||= { unit: card.unit, total: 0, good: 0, lapses: 0, lastAt: 0 };
    const t = new Date(r.at).getTime();
    b.lastAt = Math.max(b.lastAt, t);
    if (t >= since) { b.total++; if (r.grade >= 3) b.good++; if (r.grade === 1) b.lapses++; }
  }
  const teachByTopic = {}; // lowercase topic -> latest teach record
  for (const t of db.teach) {
    if (!t.topic) continue;
    const key = t.topic.toLowerCase();
    if (!teachByTopic[key] || new Date(t.at).getTime() > new Date(teachByTopic[key].at).getTime()) teachByTopic[key] = t;
  }
  const examDaysOf = examDays || (() => null);
  const out = db.topics.map((topic) => {
    const key = topic.name.toLowerCase();
    const b = byTopic[key] || { unit: topic.unit, total: 0, good: 0, lapses: 0, lastAt: 0 };
    const lapseRate = b.total ? b.lapses / b.total : 0;
    const recallAcc = b.total ? b.good / b.total : 0;
    const teach = teachByTopic[key];
    const teachScore = teach?.feedback?.score ?? 0;
    const teachGap = teachScore ? 1 - teachScore / 5 : 1;
    const lastTouch = Math.max(b.lastAt, teach ? new Date(teach.at).getTime() : 0);
    const staleness = lastTouch ? Math.min(1, (now - lastTouch) / DAY_MS / 21) : 1;
    const dte = examDaysOf(topic.unit);
    const examWeight = dte == null ? 0.5 : dte <= 0 ? 1 : Math.max(0, 1 - dte / 30);
    const score = Math.round(100 * (0.35 * lapseRate + 0.25 * (1 - recallAcc) + 0.20 * teachGap + 0.10 * staleness + 0.10 * examWeight));
    const reason = [];
    if (b.total && b.lapses) reason.push(`${b.lapses} lapse${b.lapses === 1 ? '' : 's'} in ${b.total} reviews`);
    if (!teachScore) reason.push('never taught back');
    else if (teachScore < 4) reason.push(`teach-back ${teachScore}/5`);
    if (lastTouch && now - lastTouch > 7 * DAY_MS) reason.push('gone stale');
    const next = !teachScore ? 'Teach-back now'
      : lapseRate >= 0.3 ? 'Rewrite cards + 10-min recall'
      : teachScore < 4 ? 'Re-teach, then 2 past-paper questions'
      : 'Quick review';
    return { topic: topic.name, unit: topic.unit, score, lapseRate, recallAcc, teachScore, reason: reason.join(' · ') || 'no data yet', next };
  });
  return out.sort((a, b) => b.score - a.score);
}

export function insights(db, days = 30, examDays) {
  const act = activeHours(db, days);
  return {
    activeHours: act.hours,
    events: act.events,
    parts: act.parts,
    performance: performanceHours(db, days),
    focus: focusVsPerformance(db, days),
    deeper: deeperDive(db, { examDays, days }),
  };
}
