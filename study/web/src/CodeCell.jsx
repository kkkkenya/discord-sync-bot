// A code cell for programming units (fixplan-f F9): write Python, give it input, run it on this device, and check the
// output against the question's sample or the model answer. No AI and no server: the interpreter runs in a worker,
// stopped after 3 seconds.
import { useRef, useState } from 'react';
import { compareOutputs, describe, sampleFrom } from './code-check.js';

const LIMIT = 3000;
const BLOCKED = (lib) => `This cell runs plain Python, without ${lib}. Run it on a computer with Python installed.`;

// run code in a fresh worker; { out, error, truncated, blocked } or { stopped: true }
export function runCode(code, input) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('./py-worker.js', import.meta.url), { type: 'module' });
    const stop = setTimeout(() => { w.terminate(); resolve({ stopped: true }); }, LIMIT + 1000); // + loading the interpreter
    w.onmessage = ({ data }) => { clearTimeout(stop); w.terminate(); resolve(data.ok ? data.result : { out: '', error: { line: null, type: 'Error', message: data.error } }); };
    w.onerror = (e) => { clearTimeout(stop); w.terminate(); resolve({ out: '', error: { line: null, type: 'Error', message: e.message || 'The code cell could not start.' } }); };
    w.postMessage({ code, input });
  });
}

// Tab puts four spaces in, as Python wants
const onKey = (e) => {
  if (e.key !== 'Tab' || e.shiftKey) return;
  e.preventDefault();
  const t = e.target, s = t.selectionStart;
  t.setRangeText('    ', s, t.selectionEnd, 'end');
  t.dispatchEvent(new Event('input', { bubbles: true }));
};

export default function CodeCell({ question = '', reference = null, storageKey = null }) {
  const sample = sampleFrom(question);
  const [code, setCode] = useState(() => { try { return (storageKey && localStorage.getItem(storageKey)) || ''; } catch { return ''; } });
  const [input, setInput] = useState(sample?.input || '');
  const [res, setRes] = useState(null);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const area = useRef(null);
  const keep = (v) => { setCode(v); try { if (storageKey) localStorage.setItem(storageKey, v); } catch { /* private window */ } };

  const run = async () => { setBusy(true); setCheck(null); setRes(await runCode(code, input)); setBusy(false); };
  const against = async (expected, label, sameInput = input) => {
    setBusy(true);
    const mine = await runCode(code, sameInput);
    setRes(mine);
    if (mine.stopped || mine.error || mine.blocked) { setCheck(null); setBusy(false); return; }
    let want = expected;
    if (want == null) { // the model answer: run it with the same input
      const theirs = await runCode(reference, sameInput);
      if (theirs.stopped || theirs.error || theirs.blocked) { setCheck({ same: null, text: "The model answer didn't run here, so there is nothing to compare with." }); setBusy(false); return; }
      want = theirs.out;
    }
    const r = compareOutputs(mine.out, want);
    setCheck({ same: r.same, text: describe(r, label) });
    setBusy(false);
  };

  return (
    <section className="card stack code-cell" aria-label="Your code">
      <h2 className="card-title">Your code</h2>
      <textarea ref={area} className="code-input" value={code} onChange={(e) => keep(e.target.value)} onKeyDown={onKey} spellCheck="false" autoCapitalize="off" autoComplete="off"
        aria-label="Python code" placeholder={'n = int(input())\nprint(n * 2)'} rows={Math.min(18, Math.max(6, code.split('\n').length + 1))} />
      <label className="field">Input <span className="hint">(one line for each input() call)</span>
        <textarea className="code-input small" value={input} onChange={(e) => setInput(e.target.value)} rows={2} spellCheck="false" />
      </label>
      <div className="actions start">
        <button className="btn primary" type="button" disabled={busy || !code.trim()} onClick={run}>{busy ? 'Running…' : 'Run'}</button>
        {sample && <button className="btn" type="button" disabled={busy || !code.trim()} onClick={() => { setInput(sample.input); against(sample.output, "the question's sample", sample.input); }}>Check with the sample</button>}
        {reference && <button className="btn" type="button" disabled={busy || !code.trim()} onClick={() => against(null, 'the model answer')}>Compare with the model answer</button>}
      </div>
      {res && (
        <div className="stack-s" aria-live="polite">
          {res.stopped && <p className="notice bad">Stopped after 3 seconds. Check for a loop that never ends, or an input() waiting for a line.</p>}
          {res.blocked && <p className="notice">{BLOCKED(res.blocked)}</p>}
          {!res.stopped && !res.blocked && (
            <>
              {(res.out || !res.error) && <pre className="code-block code-out" tabIndex={0} aria-label="Output"><code>{res.out || '(no output)'}{res.truncated ? '\n… output cut at 20,000 characters' : ''}</code></pre>}
              {res.error && <p className="notice bad">{res.error.type}{res.error.line ? ` on line ${res.error.line}` : ''}: {res.error.message}</p>}
            </>
          )}
          {check && <p className={`notice${check.same === true ? ' good' : check.same === false ? ' bad' : ''}`} role="status">{check.text}</p>}
        </div>
      )}
      <p className="row-sub">Runs plain Python on this device. A match on one input does not prove the program right for every input.</p>
    </section>
  );
}
