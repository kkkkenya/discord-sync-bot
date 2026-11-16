import { useEffect, useState } from 'react';
import App from './App.jsx';

const INVITE = 'https://discord.gg/7yUz2rXumm';
const PLANS = 'https://discord.com/channels/1114845424004632597/1554749649280049246'; // #plans: pay, then "I've paid"
const SITE = 'https://www.engineeringhub.site/crux/'; // Crux's one landing page, on the Hub's website
const PROBLEMS = { expired: 'That sign-in took too long. Try again.', discord: 'Discord didn\'t finish the sign-in. Try again.' };
// the app installed to a home screen: sending it to another site would leave the app, so it signs in here
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Who's signed in decides the screen: Crux itself; signed out, the website's Crux page (or a plain sign-in screen
// in the installed app and after a failed sign-in); not a member, how to join.
export default function Gate() {
  const [who, setWho] = useState('loading');
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch('/api/me').then(async (r) => {
      if (r.ok) setUser(await r.json());
      setWho(r.ok ? 'in' : r.status === 403 ? 'no-access' : r.status === 401 ? 'out' : 'in');
    }).catch(() => setWho('in')); // offline: the app shows its own message
  }, []);
  // Signed out and back from Discord: its 2FA step often finishes the sign-in in another tab, so look again on return.
  useEffect(() => {
    if (who !== 'out') return undefined;
    const look = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/me').then(async (r) => { if (r.ok) { setUser(await r.json()); setWho('in'); } }).catch(() => {});
    };
    document.addEventListener('visibilitychange', look);
    addEventListener('focus', look);
    addEventListener('pageshow', look);
    return () => { document.removeEventListener('visibilitychange', look); removeEventListener('focus', look); removeEventListener('pageshow', look); };
  }, [who]);
  const problem = PROBLEMS[new URLSearchParams(location.hash.split('?')[1] || '').get('problem')];
  const away = who === 'out' && !problem && !installed();
  useEffect(() => { if (away) location.replace(SITE); }, [away]);
  if (who === 'loading' || away) return null;
  if (who === 'in') return <App user={user} />;
  return (
    <main className="gate">
      <img src="/favicon.svg" alt="" width="72" height="72" />
      <h1>Crux</h1>
      {who === 'out' ? (
        <>
          <p>Your study plan for every unit, built from past papers.</p>
          {problem && <p role="alert">{problem}</p>}
          <a className="btn primary" href="/auth/login">Sign in with Discord</a>
          <a className="btn plain" href={SITE}>What Crux does</a>
          <HowToJoin />
        </>
      ) : (
        <>
          <p>This Discord account has no Study Hub plan yet.</p>
          <HowToJoin open />
          <p className="small">Used Crux before? Your units, notes, highlights and answers come back when your plan is active again.</p>
          <a className="btn" href="/auth/logout">Sign in again</a>
        </>
      )}
    </main>
  );
}

// For anyone who can't get in: Crux opens for Study Hub members whose plan an admin has checked on the server.
function HowToJoin({ open = false }) {
  const [shot, setShot] = useState(true);
  return (
    <details className="gate-join" open={open}>
      <summary>No Discord account, or no access yet?</summary>
      <p>Crux is for Study Hub members. Are you a member of the Study Hub on Discord? Have you paid for a plan, and has an admin checked your Discord account on the server?</p>
      <ol>
        <li>Join the Study Hub on Discord. Make a Discord account first if you don't have one.</li>
        <li>Go to <b>#plans</b>, pay by M-Pesa and press <b>I've paid</b>.</li>
        <li>An admin checks your payment and your Discord account. You get a DM, then sign in here.</li>
      </ol>
      {shot && <img src="/plans-channel.png" alt="The #plans channel: the plans, how to pay, and the I've paid button" loading="lazy" onError={() => setShot(false)} />}
      <div className="gate-actions">
        <a className="btn primary" href={INVITE}>Join the Study Hub</a>
        <a className="btn" href={PLANS}>Open #plans</a>
      </div>
    </details>
  );
}
