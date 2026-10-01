// Minimal Discord REST client + request-signature check (no dependencies).
import { createPublicKey, verify } from 'node:crypto';
import { PUBLIC_KEY } from './config.js';

const API = 'https://discord.com/api/v10';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(method, path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(API + path, {
      method,
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) {
      const wait = ((await r.json()).retry_after || 1) * 1000 + 250;
      await sleep(wait);
      continue;
    }
    const text = await r.text();
    if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`${method} ${path} -> still rate-limited after 5 tries`);
}

// Discord signs every interaction with Ed25519; reject anything that doesn't verify.
const key = createPublicKey({
  key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(PUBLIC_KEY, 'hex')]),
  format: 'der',
  type: 'spki',
});
export function isValidSignature(signature, timestamp, body) {
  try {
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// Returns false when the member has DMs closed.
export async function dm(userId, content) {
  try {
    const ch = await api('POST', '/users/@me/channels', { recipient_id: userId });
    await api('POST', `/channels/${ch.id}/messages`, { content, allowed_mentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}

export const fmtDay = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Nairobi' });
export const isoDay = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // 2026-10-01
