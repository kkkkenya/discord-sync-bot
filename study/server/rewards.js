// Premium earned by adding files to the hub (lib/rewards.js): a trial or Basic member with enough posted files this
// semester uses Crux as Premium until the semester ends. Looked up at most every 10 minutes per student.
import { db } from '../../lib/db.js';
import { REWARD, creditsQuery, earned } from '../../lib/rewards.js';

const cache = new Map(); // user id → { at, count }
export async function credits(userId, { select = db.select, now = Date.now() } = {}) {
  const hit = cache.get(userId);
  if (hit && now - hit.at < 10 * 60e3) return hit.count;
  const count = (await select('crux_uploads', creditsQuery(userId)).catch(() => [])).length;
  cache.set(userId, { at: now, count });
  return count;
}
export const forgetCredits = (userId) => cache.delete(userId);

// the tier a request runs with: trial and Basic become Premium once earned
export async function withReward(user, today, deps) {
  if (!['trial', 'basic'].includes(user.tier) || !process.env.SUPABASE_URL) return user;
  return earned(await credits(user.id, deps), today) ? { ...user, tier: 'premium', earned: true } : user;
}

export const rewardInfo = async (user, today) => {
  const count = process.env.SUPABASE_URL ? await credits(user.id) : 0;
  return { count, goal: REWARD.goal, until: REWARD.end, premium: earned(count, today) || ['premium', 'owner'].includes(user.tier), earned: earned(count, today) };
};
