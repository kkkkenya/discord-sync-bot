// Discord Interactions endpoint: the "I've paid" button, the payment form, and staff Approve/Reject.
// Set as the app's Interactions Endpoint URL: https://<project>.vercel.app/api/interactions
import { api, dm, isValidSignature, isoDay } from '../lib/discord.js';
import { CHANNELS, GUILD_ID, MPESA, PRICES, ROLES, WHATSAPP } from '../lib/config.js';
import { forwardTo, postsFor } from '../lib/sorting.js';

const ADMINISTRATOR = 1n << 3n;
const MANAGE_ROLES = 1n << 28n;
const json = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
const ephemeral = (content) => json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
const planName = (plan) => (plan === 'premium' ? 'Premium' : 'Basic');

const paymentForm = {
  type: 9, // MODAL
  data: {
    custom_id: 'pay:form',
    title: 'Confirm your M-Pesa payment',
    components: [
      { type: 1, components: [{ type: 4, custom_id: 'code', label: 'M-Pesa code (start of the SMS)', style: 1, min_length: 8, max_length: 12, placeholder: 'e.g. TJK4ABC12D', required: true }] },
      { type: 1, components: [{ type: 4, custom_id: 'sender', label: 'Name the money was sent from', style: 1, max_length: 60, placeholder: 'As it appears on M-Pesa', required: true }] },
      { type: 1, components: [{ type: 4, custom_id: 'plan', label: 'Plan: Basic (KES 50) or Premium (KES 800)', style: 1, value: 'Basic', max_length: 10, required: true }] },
    ],
  },
};

const premiumGuide = [
  '',
  '**How to find things in Premium:**',
  '• **Unit forums:** open the forum for your course and year (e.g. `mech-year-3`, `civil-year-2`, `ecu-year-1`). Each unit has its own post with its notes, past papers and slides. Search the unit code (e.g. EMM 305) to jump to it.',
  '• **Common units:** first-year ECU and university-wide UCU units are in `ecu-year-1`, `ecu-year-2`, `ecu-upper-years` and `ucu-university-common`.',
  '• **Book shelves:** textbooks are grouped by topic (Thermodynamics, Fluid Mechanics, Engineering Mathematics and more). Browse a shelf when you want a book, not a single unit.',
  '• **#pdf-library:** general files that don\'t belong to one unit.',
  `Can't find a unit? Message us on WhatsApp and we'll add it: ${WHATSAPP}`,
  '',
];

const receipt = (plan) => [
  `✅ **Payment confirmed: ${planName(plan)}** (KES ${PRICES[plan]})`,
  plan === 'premium'
    ? 'You now have Premium for life, plus all the unit libraries.'
    : 'You now have full access to the unit libraries for this semester.',
  ...(plan === 'premium' ? premiumGuide : []),
  'Thanks for supporting Engineering Study Hub. Good luck with your CATs!',
].join('\n');

const rejection = [
  'We couldn\'t match your M-Pesa payment yet.',
  `Check that you sent it to **${MPESA.number} (${MPESA.name})** and that the code is right, then press **I've paid** again.`,
  `Still stuck? Message us on WhatsApp: ${WHATSAPP}`,
].join('\n');

async function handleSort(i, user) {
  const perms = BigInt(i.member?.permissions || '0');
  if (!(perms & (ADMINISTRATOR | MANAGE_ROLES))) return ephemeral('Only staff can sort files.');
  const [, action, fileMsgId] = i.data.custom_id.split(':');
  const done = (line) => json({ type: 7, data: { content: `${i.message.content}\n\n${line}`, components: [], allowed_mentions: { parse: [] } } });

  if (i.type === 3 && action === 'start') {
    return json({ type: 9, data: {
      custom_id: `sort:form:${fileMsgId}`,
      title: 'Sort into a unit',
      components: [{ type: 1, components: [{ type: 4, custom_id: 'code', label: 'Unit code (e.g. EMM 305 or ECU107)', style: 1, min_length: 6, max_length: 9, required: true }] }],
    } });
  }
  if (i.type === 3 && action === 'library') {
    await forwardTo(CHANNELS.library, fileMsgId, i.channel_id);
    return done(`📚 Sent to #pdf-library by <@${user.id}> on ${isoDay(new Date())}`);
  }
  if (i.type === 5 && action === 'form') {
    const raw = i.data.components[0].components[0].value.toUpperCase();
    const m = raw.match(/([A-Z]{3})\s*-?\s*(\d{3})/);
    if (!m) return ephemeral(`"${raw}" doesn't look like a unit code. Use three letters and three numbers, like EMM 305.`);
    const code = `${m[1]} ${m[2]}`;
    const posts = await postsFor(code);
    if (!posts.length) return ephemeral(`There's no post for ${code} yet. Rename the file with its code and drop it in again; the bot creates the post.`);
    for (const p of posts) await forwardTo(p.id, fileMsgId, i.channel_id);
    return done(`✅ Sorted into **${posts[0].name}**${posts.length > 1 ? ` (and its other-year post)` : ''} by <@${user.id}> on ${isoDay(new Date())}`);
  }
  return ephemeral('Unknown sort action.');
}

export async function POST(request) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  if (!signature || !timestamp || !isValidSignature(signature, timestamp, body)) {
    return new Response('invalid request signature', { status: 401 });
  }
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 }); // PING (Discord checks the endpoint with this)

  const user = i.member?.user || i.user;
  try {
    // ── #to-sort: files the upload bot couldn't place ──
    if (i.data?.custom_id?.startsWith('sort:')) return await handleSort(i, user);

    // ── buttons ──
    if (i.type === 3) {
      const [ns, action, uid, plan] = i.data.custom_id.split(':');
      if (ns !== 'pay') return ephemeral('Unknown button.');
      if (action === 'start') return json(paymentForm);

      const perms = BigInt(i.member?.permissions || '0');
      if (!(perms & (ADMINISTRATOR | MANAGE_ROLES))) return ephemeral('Only staff can do that.');
      const original = i.message.content;

      if (action === 'approve') {
        const roles = plan === 'premium' ? [ROLES.premium, ROLES.paid] : [ROLES.paid];
        for (const r of roles) await api('PUT', `/guilds/${GUILD_ID}/members/${uid}/roles/${r}`);
        await api('DELETE', `/guilds/${GUILD_ID}/members/${uid}/roles/${ROLES.trial}`).catch(() => {});
        const sent = await dm(uid, receipt(plan));
        return json({ type: 7, data: {
          content: `${original}\n\n✅ **Approved ${plan}** by <@${user.id}> on ${isoDay(new Date())}${sent ? '' : ' (receipt DM failed: their DMs are closed)'}`,
          components: [], allowed_mentions: { parse: [] },
        } });
      }
      if (action === 'reject') {
        const sent = await dm(uid, rejection);
        return json({ type: 7, data: {
          content: `${original}\n\n❌ **Rejected** by <@${user.id}> on ${isoDay(new Date())}${sent ? '' : ' (DM failed: their DMs are closed)'}`,
          components: [], allowed_mentions: { parse: [] },
        } });
      }
      return ephemeral('Unknown button.');
    }

    // ── payment form submitted ──
    if (i.type === 5 && i.data.custom_id === 'pay:form') {
      const v = Object.fromEntries(i.data.components.flatMap((row) => row.components).map((c) => [c.custom_id, (c.value || '').trim()]));
      const code = v.code.toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9]{8,12}$/.test(code)) {
        return ephemeral('That doesn\'t look like an M-Pesa code. It\'s the letters and numbers at the very start of the M-Pesa SMS, like `TJK4ABC12D`. Press **I\'ve paid** and try again.');
      }
      const plan = /prem/i.test(v.plan) ? 'premium' : 'basic';
      // flag a code that was already claimed (same SMS used twice)
      const recent = await api('GET', `/channels/${CHANNELS.payments}/messages?limit=100`);
      const reused = recent.find((m) => m.content.includes(`\`${code}\``));
      await api('POST', `/channels/${CHANNELS.payments}/messages`, {
        content: [
          `💰 **Payment claim** from <@${user.id}> (${user.username})`,
          `Plan: **${planName(plan)}** (KES ${PRICES[plan]})`,
          `M-Pesa code: \`${code}\``,
          `Sent from: ${v.sender}`,
          reused ? `⚠️ This code was already claimed: ${reused.content.split('\n')[0]}` : `Check M-Pesa (${MPESA.number}) for this code and amount, then approve.`,
        ].join('\n'),
        components: [{ type: 1, components: [
          { type: 2, style: 3, label: `Approve ${planName(plan)}`, custom_id: `pay:approve:${user.id}:${plan}` },
          { type: 2, style: 4, label: 'Reject', custom_id: `pay:reject:${user.id}` },
        ] }],
        allowed_mentions: { parse: [] },
      });
      return ephemeral(`Thanks! We've got your M-Pesa code \`${code}\` for **${planName(plan)}**. You'll get access as soon as it's confirmed, usually within a few minutes, and we'll DM you when it's done.`);
    }
  } catch (e) {
    console.error(e);
    return ephemeral(`Something went wrong on our side. Message us on WhatsApp and we'll sort it out: ${WHATSAPP}`);
  }
  return ephemeral('Unknown action.');
}
