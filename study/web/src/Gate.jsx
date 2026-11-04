import { useEffect, useState } from 'react';
import App from './App.jsx';

const INVITE = 'https://discord.gg/7yUz2rXumm';
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
        </>
      ) : (
        <>
          <p>Crux comes with Engineering Hub membership. Join the server, then sign in again.</p>
          <p>Used Crux before? Your work is kept: units, notes, highlights and answers all come back when your membership is active again.</p>
          <div className="gate-actions">
            <a className="btn primary" href={INVITE}>Join Discord</a>
            <a className="btn" href="/auth/logout">Sign in again</a>
          </div>
        </>
      )}
    </main>
  );
}
