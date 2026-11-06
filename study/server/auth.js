// Sign-in with Discord through the "Crux" application (identify only), reached at /auth/login, /auth/callback and
// /auth/logout. The membership tier comes from the member's roles in the Engineering Hub server, read with the bot
// token, and rides in the signed crux_session cookie (30 days). It's checked again once a day (router.js).
import { randomBytes } from 'node:crypto';
import { GUILD_ID, ROLES } from '../../lib/config.js';
import { cookieHeader, readCookie, sign, verify } from '../../lib/session.js';

export const SESSION_DAYS = 30;
export const RECHECK_MS = 24 * 3600e3;
const DISCORD = 'https://discord.com/api/v10';

// The best tier among the member's roles. Not in the server at all → none.
export function tierFor(member, userId, ownerId = process.env.OWNER_ID) {
  if (ownerId && userId === ownerId) return 'owner';
  if (!member) return 'none';
  const roles = new Set(member.roles || []);
  if (roles.has(ROLES.premium)) return 'premium';
  if (roles.has(ROLES.paid)) return 'basic';
  if (roles.has(ROLES.trial)) return 'trial';
  return 'none';
}

export const sessionCookie = (user, now = Date.now()) => cookieHeader('crux_session',
  sign({ id: user.id, name: user.name, tier: user.tier, ...(user.avatar && { avatar: user.avatar }), checked: now, exp: now + SESSION_DAYS * 864e5 }), SESSION_DAYS * 86400);
// a Discord user's picture (Today's greeting), or null when they use the default one
export const avatarOf = (u) => (u?.id && u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=96` : null);
export const readSession = (request) => verify(readCookie(request, 'crux_session'));

// The member's server record (roles, nickname), or null when they aren't in the server.
export async function memberOf(userId, botToken = process.env.DISCORD_TOKEN) {
  const r = await fetch(`${DISCORD}/guilds/${GUILD_ID}/members/${userId}`, { headers: { Authorization: `Bot ${botToken}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Discord member lookup failed (${r.status})`);
  return r.json();
}

// Upserts the student's row: crux_docs needs it, and it records the tier and the last visit.
export const rememberUser = (db, user) => db.upsert('crux_users', [{
  id: user.id, name: user.name, tier: user.tier, tier_checked_at: new Date().toISOString(), last_seen: new Date().toISOString(),
}], 'id');

// The sign-in's state is signed and lasts 15 minutes, so Discord's reply is accepted in whichever browser it opens:
// on phones the Discord app and its 2FA step often hand back to a different tab or browser than the one that started.
const STATE_MS = 15 * 60e3;
export const signInState = (now = Date.now()) => sign({ n: randomBytes(12).toString('hex'), exp: now + STATE_MS });
export const stateOk = (state) => Boolean(state && verify(state)?.n);

const redirect = (to, cookies = []) => {
  const headers = new Headers({ Location: to });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
};

export async function authRoute(action, request, { db }) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/auth/callback`;
  const clientId = process.env.CRUX_DISCORD_CLIENT_ID;

  if (action === 'login') {
    const state = signInState();
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'identify', redirect_uri: redirectUri, state, prompt: 'none' });
    return redirect(`https://discord.com/oauth2/authorize?${params}`);
  }

  if (action === 'callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !stateOk(state)) return redirect('/app#/signin?problem=expired');
    const token = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: process.env.CRUX_DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    }).then((r) => r.json());
    if (!token.access_token) return redirect('/app#/signin?problem=discord');
    const me = await fetch(`${DISCORD}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());
    const member = await memberOf(me.id);
    const user = { id: me.id, name: member?.nick || me.global_name || me.username, tier: tierFor(member, me.id), avatar: avatarOf(me) };
    await rememberUser(db, user);
    return redirect('/', [sessionCookie(user), cookieHeader('crux_state', '', 0)]);
  }

  if (action === 'logout') return redirect('/', [cookieHeader('crux_session', '', 0)]);
  return new Response('Not found', { status: 404 });
}
