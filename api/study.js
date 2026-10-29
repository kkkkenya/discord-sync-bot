// The Study Desk gateway: friends' Study Desks call this for everything that needs a secret (lib/study-gateway.js).
// POST /api/study { action, ...body } with "Authorization: Bearer <device token>" (not needed for "link").
import { APP_ID } from '../lib/config.js';
import { db } from '../lib/db.js';
import { api as discord, dm } from '../lib/discord.js';
import { hubAI } from '../lib/study-ai.js';
import { makeGateway } from '../lib/study-gateway.js';

const handle = makeGateway({ db, discord, dm, ai: hubAI, appId: APP_ID });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    return json(await handle(String(body.action || ''), body, token));
  } catch (e) {
    if (!e.status) console.error('study gateway:', e);
    return json({ error: e.status ? e.message : 'Something went wrong on the Study Hub. Try again in a minute.' }, e.status || 500);
  }
}
