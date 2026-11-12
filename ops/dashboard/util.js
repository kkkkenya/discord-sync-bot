// Pure helpers for the local dashboard (tested in ops/test/dashboard.test.js).
import fs from 'node:fs';

/** Payment claims in #payments that nobody has approved or rejected yet, newest first. */
export function pendingPayments(messages, guildId, channelId) {
  return messages
    .filter((m) => m.content.startsWith('💰') && !/✅ \*\*Approved|❌ \*\*Rejected/.test(m.content))
    .map((m) => ({
      id: m.id,
      at: m.timestamp,
      who: (m.content.match(/from <@\d+> \(([^)]+)\)/) || [])[1] || '?',
      plan: (m.content.match(/Plan: \*\*([^*]+)\*\*/) || [])[1] || '?',
      amount: (m.content.match(/\(KES (\d+)\)/) || [])[1] || null,
      code: (m.content.match(/M-Pesa code: `([^`]+)`/) || [])[1] || null,
      reused: m.content.includes('already claimed'),
      link: `https://discord.com/channels/${guildId}/${channelId}/${m.id}`,
    }));
}

/** The last n lines of a text file, or [] when it doesn't exist. Reads only the end of big files. */
export function tail(file, n) {
  if (!fs.existsSync(file)) return [];
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  const len = Math.min(size, 256 * 1024);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  return buf.toString('utf8').split(/\r?\n/).filter(Boolean).slice(-n);
}

/** The Host header names this computer and the dashboard's port. */
export function isLocalHost(host, port) {
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}
