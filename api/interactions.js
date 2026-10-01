// Discord Interactions endpoint: the "I've paid" button, the payment form, and staff Approve/Reject.
// Set as the app's Interactions Endpoint URL: https://<project>.vercel.app/api/interactions
import { api, dm, isValidSignature, isoDay } from '../lib/discord.js';
import { CHANNELS, GUILD_ID, MPESA, PRICES, ROLES, WHATSAPP } from '../lib/config.js';

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

const receipt = (plan) => [
  `✅ **Payment confirmed: ${planName(plan)}** (KES ${PRICES[plan]})`,
  plan === 'premium'
    ? 'You now have Premium for life, plus all the unit libraries.'
    : 'You now have full access to the unit libraries for this semester.',
  'Thanks for supporting Engineering Study Hub. Good luck with your CATs!',
].join('\n');

const rejection = [
  'We couldn\'t match your M-Pesa payment yet.',
  `Check that you sent it to **${MPESA.number} (${MPESA.name})** and that the code is right, then press **I've paid** again.`,
  `Still stuck? Message us on WhatsApp: ${WHATSAPP}`,
].join('\n');

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
