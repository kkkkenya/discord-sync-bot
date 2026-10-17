// Public data for the Study Hub Milestones board (public/board/). No sign-in: it shows what members chose to /log.
//   GET /api/board  → cycle dates, tracks, milestones, every member's year and the latest logs
import { db } from '../lib/db.js';
import { selectAll } from '../lib/logbook.js';
import { CYCLE, MILESTONES, TRACKS, addDays, daysWithin, hours, streakOf, summarise, today } from '../lib/milestones.js';

export async function GET() {
  const [members, logs, ms, recent] = await Promise.all([
    db.select('log_members', 'select=user_id,name,avatar,goal,joined'),
    selectAll('log_entries', `day=gte.${addDays(CYCLE.start, -14)}&select=user_id,day,minutes,track,track_name&order=id`),
    selectAll('log_milestones', 'select=user_id,milestone_id,title,track,day&order=day.desc'),
    db.select('log_entries', 'select=user_id,day,track,track_name,what,minutes,link,created_at&order=created_at.desc&limit=60'),
  ]);
  const sum = summarise(logs);
  const now = today();
  const out = members.map((m) => {
    const s = sum.get(m.user_id) || { days: new Set(), mins: 0, minsByDay: new Map() };
    const byTrack = {}, trackNames = {};
    for (const l of logs) {
      if (l.user_id !== m.user_id) continue;
      byTrack[l.track] = (byTrack[l.track] || 0) + (l.minutes || 0);
      if (l.track_name) trackNames[l.track] = l.track_name;
    }
    return {
      id: m.user_id,
      name: m.name,
      avatar: m.avatar ? `https://cdn.discordapp.com/avatars/${m.user_id}/${m.avatar}.png?size=64` : null,
      goal: m.goal,
      joined: m.joined,
      streak: streakOf(s.days, now),
      daysLogged: s.days.size,
      last30: daysWithin(s.days, 30, now),
      hours: hours(s.mins),
      byDay: Object.fromEntries(s.minsByDay),
      byTrack,
      trackNames,
      milestones: ms.filter((x) => x.user_id === m.user_id).map(({ milestone_id, title, track, day }) => ({ id: milestone_id, title, track, day })),
    };
  });
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  return new Response(JSON.stringify({
    today: now,
    cycle: CYCLE,
    tracks: TRACKS,
    milestones: MILESTONES,
    members: out,
    feed: recent.map((r) => ({ ...r, name: names.get(r.user_id) || 'Someone' })),
    milestoneFeed: ms.slice(0, 30).map((x) => ({ ...x, name: names.get(x.user_id) || 'Someone' })),
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}
