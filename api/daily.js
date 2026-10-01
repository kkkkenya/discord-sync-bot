// Called once a day by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
import { runDaily } from '../lib/daily.js';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const report = await runDaily();
  console.log(JSON.stringify(report));
  return Response.json(report);
}
