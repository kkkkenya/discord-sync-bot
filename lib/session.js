// Signed session cookie for the dashboard: base64url(JSON) + "." + HMAC-SHA256, valid 7 days.
// Signed with SESSION_SECRET if set, otherwise CRON_SECRET (both live only in Vercel's settings).
import { createHmac, timingSafeEqual } from 'node:crypto';

const key = () => process.env.SESSION_SECRET || process.env.CRON_SECRET || '';
const mac = (body) => createHmac('sha256', key()).update(body).digest('base64url');

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body)}`;
}

export function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !key()) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return data.exp > Date.now() ? data : null;
}

export const readCookie = (request, name) =>
  (request.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];

export const cookieHeader = (name, value, maxAgeSeconds) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

export const currentUser = (request) => verify(readCookie(request, 'esh_session'));
