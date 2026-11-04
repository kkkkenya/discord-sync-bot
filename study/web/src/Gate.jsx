import { useEffect, useState } from 'react';
import App from './App.jsx';
import './gate.css';

const INVITE = 'https://discord.gg/7yUz2rXumm';
const PROBLEMS = { expired: 'That sign-in took too long. Try again.', discord: 'Discord didn\'t finish the sign-in. Try again.' };

// The class chat on the right: the panic Crux answers. Lines stagger in with CSS, then the Crux card lands on top.
const CHAT = [
  ['Rep', 'CAT 1 is Monday the 16th', 'rep'],
  ['', 'which topics??'],
  ['', 'does anyone have past papers'],
  ['', 'the book is 500 pages bana 😭'],
  ['', 'we\'re finished'],
];

const FEATURES = [
  ['Reads the whole library', 'Every past paper, CAT, note and book from the Hub, read down to the page. Topics open at the page you need.', 'p. 23'],
  ['Plans from one date', 'Paste the class message with the CAT date. Crux builds the days between now and then.', '12 days'],
  ['Past papers by topic', 'Real questions sorted by topic and subtopic, so you practise what\'s coming.', 'Q1 · 15 marks'],
  ['Finds the step that broke', 'Get one wrong and Crux shows the exact step, then works it through, diagram and all.', '79.6 GPa'],
];

const DiscordMark = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>
);

function Landing({ who, problem }) {
  const out = who === 'out';
  return (
    <div className="land">
      <header className="land-top">
        <span className="land-mark"><img src="/favicon.svg" alt="" width="28" height="28" />Crux</span>
        <span className="land-by">from the Engineering Study Hub</span>
      </header>

      <main className="land-hero">
        <section className="land-copy">
          <p className="land-eyebrow">For KU engineering students</p>
          <h1>The group chat panics.<br /><em>You don&apos;t.</em></h1>
          <p className="land-lede">
            The Hub gave you the library. Crux gets you through it: a plan from the CAT date, past papers by topic,
            and every wrong step worked out with you.
          </p>
          {problem && <p className="land-alert" role="alert">{problem}</p>}
          {out ? (
            <>
              <a className="land-cta" href="/auth/login"><DiscordMark />Sign in with Discord</a>
              <p className="land-note">
                Included with Hub membership. On a computer, Discord shows a QR code: scan it with the Discord app on your phone
                and you&apos;re in, no password.
              </p>
            </>
          ) : (
            <>
              <p className="land-note">Crux comes with Engineering Hub membership. Join the server, then sign in again. Used Crux before? Your units, notes, highlights and answers come back when your membership is active.</p>
              <div className="land-actions">
                <a className="land-cta" href={INVITE}><DiscordMark />Join the Hub</a>
                <a className="land-ghost" href="/auth/logout">Sign in again</a>
              </div>
            </>
          )}
        </section>

        <section className="land-stage" aria-hidden="true">
          <div className="land-chat">
            <div className="land-chat-head"><span>EMM 302 class</span><b>99+</b></div>
            {CHAT.map(([who_, text, kind], i) => (
              <div key={i} className={`land-bubble ${kind || ''}`} style={{ '--i': i }}>
                {who_ && <small>{who_}</small>}{text}
              </div>
            ))}
          </div>
          <div className="land-card">
            <div className="land-card-top"><span>Today</span><span className="land-pill">CAT 1 · Mon 16</span></div>
            <p className="land-card-title">Simple stresses and strains</p>
            <ol>
              <li className="done">Read p. 23–31, tapered bars</li>
              <li className="now">Practise CAT 2023 Q1</li>
              <li>Check: Young&apos;s modulus</li>
            </ol>
            <div className="land-stamp">79.6 GPa</div>
          </div>
        </section>
      </main>

      <section className="land-grid" aria-label="What Crux does">
        {FEATURES.map(([title, body, tag], i) => (
          <article key={title} className="land-tile" style={{ '--i': i }}>
            <span className="land-tag">{tag}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <footer className="land-foot">
        <span>Not in the Hub yet? <a href={INVITE}>Join on Discord</a></span>
        <span>crux.engineeringhub.site</span>
      </footer>
    </div>
  );
}

// Who's signed in decides the screen: Crux itself, or the landing page (signed out, or no membership).
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
  if (who === 'loading') return null;
  if (who === 'in') return <App user={user} />;
  const problem = PROBLEMS[new URLSearchParams(location.hash.split('?')[1] || '').get('problem')];
  return <Landing who={who} problem={problem} />;
}
