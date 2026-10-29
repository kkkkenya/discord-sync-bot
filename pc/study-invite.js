// Study Desk for friends: hand out codes and see who uses what. Uses pc/.env (the Supabase key never leaves this PC).
//   node study-invite.js "Amos Kariuki"          a one-time code for a new friend (or a new code for an existing one)
//   node study-invite.js "Amos Kariuki" --cap 60 the same, with 60 free AI actions a day instead of 40
//   node study-invite.js --list                  everyone, linked or not, with today's AI use
//   node study-invite.js --off "Amos Kariuki"    switch a friend off (their Study Desk stops working with the Hub)
//   node study-invite.js --on "Amos Kariuki"     switch them back on
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
config({ path: new URL('./.env', import.meta.url), quiet: true });
const { db, enc } = await import('../lib/db.js');
const { newCode } = await import('../lib/study-gateway.js');

const sha = (s) => createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const capAt = args.indexOf('--cap');
const cap = capAt >= 0 ? Number(args[capAt + 1]) : null;
const name = args.filter((a, i) => !a.startsWith('--') && (capAt < 0 || i !== capAt + 1)).join(' ').trim();
const byName = async (n) => (await db.select('study_friends', `name=ilike.${enc(n)}&limit=1`))[0];

if (flag('--list')) {
  const friends = await db.select('study_friends', 'order=created_at');
  const usage = await db.select('study_usage', `day=eq.${today}`);
  if (!friends.length) console.log('No friends yet. Make a code: node study-invite.js "Their name"');
  for (const f of friends) {
    const u = usage.find((x) => x.friend_id === f.id);
    console.log(`${f.active ? '●' : '○'} ${f.name.padEnd(24)} ${f.via.padEnd(8)} ${f.token_hash ? 'linked' : 'code not used yet'}${f.discord_id ? ', Discord connected' : ''} · AI today ${u?.ai_calls || 0}/${f.ai_daily_cap}${f.last_seen ? ` · last seen ${f.last_seen.slice(0, 16).replace('T', ' ')}` : ''}`);
  }
} else if (flag('--off') || flag('--on')) {
  const f = await byName(name);
  if (!f) { console.log(`No friend called "${name}". See --list.`); process.exit(1); }
  await db.update('study_friends', `id=eq.${f.id}`, { active: flag('--on') });
  console.log(`${f.name} is ${flag('--on') ? 'on again' : 'switched off'}.`);
} else if (name) {
  const code = newCode();
  const f = await byName(name);
  if (f) await db.update('study_friends', `id=eq.${f.id}`, { invite_hash: sha(code), active: true, ...(cap && { ai_daily_cap: cap }) });
  else await db.insert('study_friends', [{ name, via: 'invite', invite_hash: sha(code), ...(cap && { ai_daily_cap: cap }) }]);
  console.log(`\nStudy Desk code for ${name}: ${code}\n`);
  console.log('Send them the installer link and this code. It works once; run this again for a new one.');
} else {
  console.log('Usage: node study-invite.js "Their name" [--cap 40] | --list | --off "Name" | --on "Name"');
}
