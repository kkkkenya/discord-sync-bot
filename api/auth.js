// Dashboard sign-in with Discord. Reached through /auth/login, /auth/callback and /auth/logout (see vercel.json).
// Only the server owner and members with Administrator or Manage Roles get a session.
import { randomBytes } from 'node:crypto';
import { api } from '../lib/discord.js';
import { APP_ID, GUILD_ID } from '../lib/config.js';
import { cookieHeader, readCookie, sign } from '../lib/session.js';

const ADMINISTRATOR = 1n << 3n;
const MANAGE_ROLES = 1n << 28n;
const WEEK = 7 * 24 * 3600;

const page = (message, status) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in</title>
<body style="font:16px system-ui;max-width:520px;margin:15vh auto;padding:0 16px"><h2>Engineering Study Hub admin</h2><p>${message}</p><p><a href="/dashboard/">Back to the dashboard</a></p></body>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

export async function GET(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const redirectUri = `${url.origin}/auth/callback`;

  if (action === 'login') {
    const state = randomBytes(16).toString('hex');
    const params = new URLSearchParams({ client_id: APP_ID, response_type: 'code', scope: 'identify', redirect_uri: redirectUri, state, prompt: 'none' });
    return new Response(null, { status: 302, headers: { Location: `https://discord.com/oauth2/authorize?${params}`, 'Set-Cookie': cookieHeader('esh_state', state, 600) } });
  }

  if (action === 'callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || state !== readCookie(request, 'esh_state')) return page('That sign-in link expired. Please try again.', 400);
    if (!process.env.DISCORD_CLIENT_SECRET) return page('The dashboard is not set up yet: DISCORD_CLIENT_SECRET is missing in Vercel.', 500);

    const token = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: APP_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    }).then((r) => r.json());
    if (!token.access_token) return page('Discord sign-in failed. Please try again.', 400);
    const me = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());

    const [guild, roles, member] = await Promise.all([
      api('GET', `/guilds/${GUILD_ID}`),
      api('GET', `/guilds/${GUILD_ID}/roles`),
      api('GET', `/guilds/${GUILD_ID}/members/${me.id}`).catch(() => null),
    ]);
    const perms = member
      ? roles.filter((r) => r.id === GUILD_ID || member.roles.includes(r.id)).reduce((p, r) => p | BigInt(r.permissions), 0n)
      : 0n;
    if (!member || (guild.owner_id !== me.id && !(perms & (ADMINISTRATOR | MANAGE_ROLES)))) {
      return page('This dashboard is for server staff only.', 403);
    }
    const session = sign({ uid: me.id, name: member.nick || me.global_name || me.username, exp: Date.now() + WEEK * 1000 });
    const headers = new Headers({ Location: '/dashboard/' });
    headers.append('Set-Cookie', cookieHeader('esh_session', session, WEEK));
    headers.append('Set-Cookie', cookieHeader('esh_state', '', 0));
    return new Response(null, { status: 302, headers });
  }

  if (action === 'logout') {
    return new Response(null, { status: 302, headers: { Location: '/dashboard/', 'Set-Cookie': cookieHeader('esh_session', '', 0) } });
  }
  return page('Unknown page.', 404);
}
