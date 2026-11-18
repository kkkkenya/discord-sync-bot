// A code cell (fixplan-f F9, fixplan-g G6): write Python, SQL or JavaScript, run it on this device, and check it
// against the question's sample or the model answer. No AI and no server: the engine runs in a worker, stopped after
// 3 seconds. SQL runs on a fresh database with the question's own tables.
import { useRef, useState } from 'react';
import { compareOutputs, describe, languageOf, sampleFrom } from './code-check.js';
import { ordered, resultText, sameResult, tablesFrom } from './sql-run.js';

const LIMIT = 3000;
export const LANGS = { python: 'Python', sql: 'SQL', js: 'JavaScript' };
const BLOCKED = (lib) => `This cell runs plain Python, without ${lib}. Run it on a computer with Python installed.`;

// run code in a fresh worker; the language's result, or { stopped: true }
export function runCode(code, input, lang = 'python', setup = '') {
  return new Promise((resolve) => {
    const w = new Worker(new URL('./py-worker.js', import.meta.url), { type: 'module' });
    const stop = setTimeout(() => { w.terminate(); resolve({ stopped: true }); }, LIMIT + 1000); // + loading the engine
    w.onmessage = ({ data }) => { clearTimeout(stop); w.terminate(); resolve(data.ok ? data.result : { out: '', error: { line: null, type: 'Error', message: data.error } }); };
    w.onerror = (e) => { clearTimeout(stop); w.terminate(); resolve({ out: '', error: { line: null, type: 'Error', message: e.message || 'The code cell could not start.' } }); };
    w.postMessage({ code, input, lang, setup });
  });
}

// Tab puts spaces in (four for Python and JavaScript, two for SQL)
const onKey = (lang) => (e) => {
  if (e.key !== 'Tab' || e.shiftKey) return;
  e.preventDefault();
  const t = e.target, s = t.selectionStart;
  t.setRangeText(lang === 'sql' ? '  ' : '    ', s, t.selectionEnd, 'end');
  t.dispatchEvent(new Event('input', { bubbles: true }));
};

const PLACEHOLDER = { python: 'n = int(input())\nprint(n * 2)', sql: 'SELECT name, marks\nFROM students\nWHERE marks > 50;', js: 'const n = Number(input());\nconsole.log(n * 2);' };

function Table({ r }) {
  return (
    <div className="sql-table-wrap" tabIndex={0} aria-label="Query result">
      <table className="sql-table">
        <thead><tr>{r.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>{r.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v === null ? <span className="muted">NULL</span> : String(v)}</td>)}</tr>)}</tbody>
      </table>
      {r.truncated && <p className="row-sub">Showing the first 500 rows.</p>}
    </div>
  );
}

export default function CodeCell({ question = '', reference = null, referenceLanguage = '', storageKey = null, title = 'Your code' }) {
  const sample = sampleFrom(question);
  const setup = tablesFrom(question);
  const [lang, setLang] = useState(() => languageOf(question, referenceLanguage));
  const [code, setCode] = useState(() => { try { return (storageKey && localStorage.getItem(storageKey)) || ''; } catch { return ''; } });
  const [input, setInput] = useState(sample?.input || '');
  const [res, setRes] = useState(null);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const area = useRef(null);
  const keep = (v) => { setCode(v); try { if (storageKey) localStorage.setItem(storageKey, v); } catch { /* private window */ } };
  const refLang = languageOf('', referenceLanguage) === lang || !referenceLanguage ? reference : null; // a model answer in another language can't be compared

  const run = async () => { setBusy(true); setCheck(null); setRes(await runCode(code, input, lang, setup)); setBusy(false); };
  const failed = (r) => r.stopped || r.error || r.blocked;
  const against = async (expected, label, sameInput = input) => {
    setBusy(true);
    const mine = await runCode(code, sameInput, lang, setup);
    setRes(mine);
    if (failed(mine)) { setCheck(null); setBusy(false); return; }
    if (lang === 'sql') { // the model answer's rows, on the same tables
      const theirs = await runCode(refLang, '', 'sql', setup);
      if (failed(theirs)) { setCheck({ same: null, text: "The model answer didn't run here, so there is nothing to compare with." }); setBusy(false); return; }
      const r = sameResult(mine.results.at(-1), theirs.results.at(-1), ordered(refLang));
      setCheck({ same: r.same, text: r.same ? 'Same rows as the model answer.' : r.why });
      setBusy(false);
      return;
    }
    let want = expected;
    if (want == null) {
      const theirs = await runCode(refLang, sameInput, lang);
      if (failed(theirs)) { setCheck({ same: null, text: "The model answer didn't run here, so there is nothing to compare with." }); setBusy(false); return; }
      want = theirs.out;
    }
    const r = compareOutputs(mine.out, want);
    setCheck({ same: r.same, text: describe(r, label) });
    setBusy(false);
  };

  return (
    <section className="card stack code-cell" aria-label={title}>
      <div className="room-row">
        <h2 className="card-title">{title}</h2>
        <label className="code-lang"><span className="visually-hidden">Language</span>
          <select value={lang} onChange={(e) => { setLang(e.target.value); setRes(null); setCheck(null); }}>
            {Object.entries(LANGS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
      <textarea ref={area} className="code-input" value={code} onChange={(e) => keep(e.target.value)} onKeyDown={onKey(lang)} spellCheck="false" autoCapitalize="off" autoComplete="off"
        aria-label={`${LANGS[lang]} code`} placeholder={PLACEHOLDER[lang]} rows={Math.min(18, Math.max(6, code.split('\n').length + 1))} />
      {lang === 'sql'
        ? <p className="row-sub">{setup ? 'Runs on the tables in the question (a fresh copy each time).' : 'Runs on an empty database: CREATE your tables first.'}</p>
        : (
          <label className="field">Input <span className="hint">(one line for each input() call)</span>
            <textarea className="code-input small" value={input} onChange={(e) => setInput(e.target.value)} rows={2} spellCheck="false" />
          </label>
        )}
      <div className="actions start">
        <button className="btn primary" type="button" disabled={busy || !code.trim()} onClick={run}>{busy ? 'Running…' : 'Run'}</button>
        {sample && lang !== 'sql' && <button className="btn" type="button" disabled={busy || !code.trim()} onClick={() => { setInput(sample.input); against(sample.output, "the question's sample", sample.input); }}>Check with the sample</button>}
        {refLang && <button className="btn" type="button" disabled={busy || !code.trim()} onClick={() => against(null, 'the model answer')}>Compare with the model answer</button>}
      </div>
      {res && (
        <div className="stack-s" aria-live="polite">
          {res.stopped && <p className="notice bad">Stopped: it ran for more than 3 seconds. Check for a loop that never ends.</p>}
          {res.blocked && <p className="notice">{BLOCKED(res.blocked)}</p>}
          {res.setupError && <p className="notice">The question's tables didn't load ({res.setupError}). Your query ran on what did.</p>}
          {!res.stopped && !res.blocked && lang === 'sql' && !res.error && (
            res.results?.length ? res.results.map((r, i) => <Table key={i} r={r} />) : <p className="row-sub">Done. {res.changes ? `${res.changes} row${res.changes === 1 ? '' : 's'} changed.` : 'No rows returned.'}</p>
          )}
          {!res.stopped && !res.blocked && lang !== 'sql' && (res.out || !res.error) && <pre className="code-block code-out" tabIndex={0} aria-label="Output"><code>{res.out || '(no output)'}{res.truncated ? '\n… output cut at 20,000 characters' : ''}</code></pre>}
          {res.error && <p className="notice bad">{res.error.type}{res.error.line ? ` on line ${res.error.line}` : ''}: {res.error.message}</p>}
          {check && <p className={`notice${check.same === true ? ' good' : check.same === false ? ' bad' : ''}`} role="status">{check.text}</p>}
        </div>
      )}
      <p className="row-sub">Runs on this device. A match on one input does not prove the program right for every input.</p>
    </section>
  );
}

export { resultText };
