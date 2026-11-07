import { useState } from 'react';
import { useInstall } from './install.js';

const SEEN = 'crux-install-note';

// The iPhone steps, shown in place of a button Safari doesn't allow
function IosSteps() {
  return (
    <ol className="install-steps">
      <li>Tap <b>Share</b> at the bottom of Safari (the square with an arrow).</li>
      <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
    </ol>
  );
}

// Settings › Install Crux. Hidden once Crux is installed, or in a browser that can't install it.
export function InstallCard({ notify }) {
  const { kind, run } = useInstall();
  const [how, setHow] = useState(false);
  if (!kind) return null;
  return (
    <div className="card">
      <div className="field">Install Crux
        <span className="hint">Crux then opens from your home screen like any other app, full screen, and the pages you've opened still read without a connection.</span>
      </div>
      {kind === 'ios' && how && <IosSteps />}
      <div className="actions start">
        {kind === 'prompt'
          ? <button type="button" className="btn primary" onClick={async () => { if (await run()) notify('Crux is on your home screen.'); }}>Install</button>
          : <button type="button" className="btn" aria-expanded={how} onClick={() => setHow(!how)}>{how ? 'Hide the steps' : 'Show me how'}</button>}
      </div>
    </div>
  );
}

// Today: a small note, on phones only, until it's dismissed or Crux is installed
export function InstallNote({ notify }) {
  const { kind, run } = useInstall();
  const [gone, setGone] = useState(() => { try { return !!localStorage.getItem(SEEN); } catch { return false; } });
  const [how, setHow] = useState(false);
  if (!kind || gone || !matchMedia('(pointer: coarse)').matches) return null;
  const dismiss = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* private window */ } setGone(true); };
  return (
    <section className="card install-note" aria-label="Install Crux">
      <p>Put Crux on your home screen so it opens like an app.</p>
      {kind === 'ios' && how && <IosSteps />}
      <div className="actions start">
        {kind === 'prompt'
          ? <button type="button" className="btn primary" onClick={async () => { if (await run()) { notify('Crux is on your home screen.'); dismiss(); } }}>Install</button>
          : <button type="button" className="btn primary" aria-expanded={how} onClick={() => setHow(!how)}>{how ? 'Hide the steps' : 'Show me how'}</button>}
        <button type="button" className="btn" onClick={dismiss}>Not now</button>
      </div>
    </section>
  );
}
