// Replaces the bot's price list in #plans with pc/announce/plans-channel.json (two embeds: the plans and how to pay),
// keeps its "I've paid" button, and adds the reactions listed in the file so the message stands out.
//   node ops/update-plans-message.js
import fs from 'node:fs';
const env = fs.readFileSync(new URL('../pc/.env', import.meta.url), 'utf8');
const token = (env.match(/^DISCORD_TOKEN=(.*)$/m) || [])[1]?.trim().replace(/^"|"$/g, '');
if (!token) { console.error('No DISCORD_TOKEN in pc/.env. Run pc/setup.bat first.'); process.exit(1); }
const CHANNEL = '1554749649280049246', MESSAGE = '1555042140533301399'; // #plans, the message with the button
const { content = '', embeds = [], reactions = [] } = JSON.parse(fs.readFileSync(new URL('../pc/announce/plans-channel.json', import.meta.url), 'utf8'));
const size = embeds.reduce((n, e) => n + JSON.stringify(e).length, 0);
if (content.length > 2000 || embeds.length > 10 || size > 5500) { console.error('Too long for Discord (2000 characters of text, 6000 across embeds).'); process.exit(1); }
const base = `https://discord.com/api/v10/channels/${CHANNEL}/messages/${MESSAGE}`;
const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
const r = await fetch(base, { method: 'PATCH', headers, body: JSON.stringify({ content, embeds, flags: 0 }) }); // flags 0: embeds shown
const j = await r.json();
if (!r.ok) { console.error(`Discord said ${r.status}: ${j.message || JSON.stringify(j)}`); process.exit(1); }
console.log(`#plans updated (${j.embeds?.length || 0} embeds). Button kept: ${j.components?.[0]?.components?.[0]?.label || 'no!'}`);
for (const emoji of reactions) {
  const put = await fetch(`${base}/reactions/${encodeURIComponent(emoji)}/@me`, { method: 'PUT', headers });
  console.log(`reaction ${emoji}: ${put.ok ? 'added' : `Discord said ${put.status}`}`);
  await new Promise((done) => setTimeout(done, 400)); // reactions are rate-limited per message
}
