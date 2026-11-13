// Replaces the text of the bot's price list in #plans with pc/announce/plans-channel.md, keeping its "I've paid" button.
//   node ops/update-plans-message.js
import fs from 'node:fs';
const env = fs.readFileSync(new URL('../pc/.env', import.meta.url), 'utf8');
const token = (env.match(/^DISCORD_TOKEN=(.*)$/m) || [])[1]?.trim().replace(/^"|"$/g, '');
if (!token) { console.error('No DISCORD_TOKEN in pc/.env. Run pc/setup.bat first.'); process.exit(1); }
const CHANNEL = '1554749649280049246', MESSAGE = '1555042140533301399'; // #plans, the message with the button
const content = fs.readFileSync(new URL('../pc/announce/plans-channel.md', import.meta.url), 'utf8').trim();
if (content.length > 2000) { console.error(`Too long for Discord: ${content.length} characters (max 2000).`); process.exit(1); }
const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages/${MESSAGE}`, {
  method: 'PATCH', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ content, flags: 4 }), // 4: no link preview
});
const j = await r.json();
if (!r.ok) { console.error(`Discord said ${r.status}: ${j.message || JSON.stringify(j)}`); process.exit(1); }
console.log(`#plans updated (${j.content.length} characters). Button kept: ${j.components?.[0]?.components?.[0]?.label || 'no!'}`);
