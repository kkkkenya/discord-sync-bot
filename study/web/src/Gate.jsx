import { useEffect, useState } from 'react';
import App from './App.jsx';

const INVITE = 'https://discord.gg/7yUz2rXumm';
const PROBLEMS = { expired: 'That sign-in took too long. Try again.', discord: 'Discord didn\'t finish the sign-in. Try again.' };

// Who's signed in decides the screen: Crux itself, the sign-in page, or the no-access page.
export default function Gate() {
  const [who, setWho] = useState('loading');
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch('/api/me').then(async (r) => {
      if (r.ok) setUser(await r.json());
      setWho(r.ok ? 'in' : r.status === 403 ? 'no-access' : r.status === 401 ? 'out' : 'in');
    }).catch(() => setWho('in')); // offline: the app shows its own message
  }, []);
  if (who === 'loading') return null;
  if (who === 'in') return <App user={user} />;
  const problem = PROBLEMS[new URLSearchParams(location.hash.split('?')[1] || '').get('problem')];
  return (
    <main className="gate">
      <img src="/favicon.svg" alt="" width="72" height="72" />
      <h1>Crux</h1>
      {who === 'out' ? (
        <>
          <p>Your study plan for every unit, built from past papers.</p>
          {problem && <p role="alert">{problem}</p>}
          <a className="btn primary" href="/auth/login">Sign in with Discord</a>
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
