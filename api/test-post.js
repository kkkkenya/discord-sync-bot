// Temporary: posts a test message in every text channel of the Premium category.
// Auth: "Authorization: Bearer <CRON_SECRET>". Without ?send=1 it only lists the channels (dry run).
import { api, sleep } from '../lib/discord.js';
import { GUILD_ID } from '../lib/config.js';

const PREMIUM_CATEGORY = '1554749484142035014';
const MESSAGE = 'Test message from Engineering Study Hub, please ignore.';
const TEXT = 0, ANNOUNCEMENT = 5, FORUM = 15;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const send = new URL(request.url).searchParams.get('send') === '1';
  const channels = (await api('GET', `/guilds/${GUILD_ID}/channels`)).filter((c) => c.parent_id === PREMIUM_CATEGORY);
  const report = { send, posted: [], skipped: [], failed: [] };
  for (const c of channels) {
    if (c.type !== TEXT && c.type !== ANNOUNCEMENT) {
      report.skipped.push({ name: c.name, type: c.type === FORUM ? 'forum' : c.type });
      continue;
    }
    if (!send) { report.posted.push(c.name); continue; }
    try {
      await api('POST', `/channels/${c.id}/messages`, { content: MESSAGE, allowed_mentions: { parse: [] } });
      report.posted.push(c.name);
    } catch (e) {
      report.failed.push({ name: c.name, error: String(e.message).slice(0, 120) });
    }
    await sleep(500);
  }
  return Response.json(report);
}
