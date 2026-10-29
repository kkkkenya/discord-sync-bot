// Friend mode: this Study Desk was set up with a Study Hub code (setup.js) and holds no secret of the Hub's. Anything
// that needs the bot token, the Supabase key or the Hub's AI key goes through the gateway on Vercel (api/study.js),
// signed in with this laptop's own token (STUDY_HUB_TOKEN in study/.env).
export const HUB_URL = process.env.STUDY_HUB_URL || 'https://discord-sync-bot.vercel.app/api/study';
export const friendMode = () => Boolean(process.env.STUDY_HUB_TOKEN);

export async function hub(action, body = {}, { timeout = 70000 } = {}) {
  let r;
  try {
    r = await fetch(HUB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.STUDY_HUB_TOKEN || ''}` },
      body: JSON.stringify({ action, ...body }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw Object.assign(new Error('Can’t reach the Study Hub. Check your internet connection.'), { status: 503, retryable: true });
  }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(out.error || `Study Hub ${r.status}`), { status: r.status, retryable: [502, 503, 504].includes(r.status) });
  return out;
}
