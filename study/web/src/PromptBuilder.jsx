import { Fragment, useEffect, useState } from 'react';
import { api } from './api.js';
import PickList, { fileSize, tokensLabel } from './PickList.jsx';
import Rich from './Rich.jsx';

const AIS = [['ChatGPT', 'https://chatgpt.com/'], ['Claude', 'https://claude.ai/new'], ['Gemini', 'https://gemini.google.com/app'], ['DeepSeek', 'https://chat.deepseek.com/']];

// The prompt, readable: "## " lines become headings, the rest keeps bold and maths.
function PromptView({ text }) {
  return (
    <div className="promptview" tabIndex={0} role="region" aria-label="Prompt preview">
      {text.split('\n\n').map((block, i) => {
        const [first, ...rest] = block.split('\n');
        if (first.startsWith('## ')) return <Fragment key={i}><h3>{first.slice(3)}</h3>{rest.length > 0 && <Rich text={rest.join('\n')} math={false} />}</Fragment>;
        return <Rich key={i} text={block} math={false} />;
      })}
    </div>
  );
}

// The Prompt Builder: pick the unit, topic, question, goal, prep time, explanation style and a key focus, and Crux
// writes a prompt plus a context pack (your weak spots, past questions, notes) to take to any chat AI.
export default function PromptBuilder({ s, unit, target }) {
  // questionIds: the past-paper questions to solve (any number, up to 12); fileIds: the files the pack carries (null = all)
  const [o, setO] = useState(() => ({ unit: target?.unit || unit, topicId: target?.topicId || '', questionIds: target?.questionId ? [target.questionId] : [], fileIds: null, goal: target?.goal || '', stage: '', style: 'steps', focus: '' }));
  useEffect(() => { if (target) setO((x) => ({ ...x, unit: target.unit || x.unit, topicId: target.topicId || '', questionIds: target.questionId ? [target.questionId] : [], goal: target.goal || '' })); }, [target]);
  const set = (k) => (e) => setO((x) => ({ ...x, [k]: e.target.value, ...(k === 'unit' ? { topicId: '', questionIds: [], fileIds: null } : k === 'topicId' ? { questionIds: [] } : {}) }));
  const [questions, setQuestions] = useState([]);
  useEffect(() => { api('GET', `predict?unit=${encodeURIComponent(o.unit)}`).then((p) => setQuestions(p.questions || [])).catch(() => setQuestions([])); }, [o.unit]);
  const [files, setFiles] = useState([]);
  useEffect(() => { api('GET', `pack/files?unit=${encodeURIComponent(o.unit)}`).then((x) => setFiles(x.files || [])).catch(() => setFiles([])); }, [o.unit]);
  const [pack, setPack] = useState(null);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setProblem('');
    const t = setTimeout(() => {
      api('POST', 'pack', { unit: o.unit, topicId: o.topicId || undefined, questionIds: o.questionIds, fileIds: o.fileIds || undefined, goal: o.goal || undefined, stage: o.stage || undefined, style: o.style, focus: o.focus || undefined })
        .then(setPack).catch((e) => setProblem(e.message));
    }, 400);
    return () => clearTimeout(t);
  }, [o]);

  const topics = s.data.topics.filter((t) => t.unit === o.unit);
  const qs = questions.filter((q) => !o.topicId || q.topicId === o.topicId);
  const stageNow = s.units[o.unit]?.stage?.name;
  const readable = files.filter((f) => !f.scanned);
  const pickedFiles = new Set(o.fileIds || readable.map((f) => f.id));
  const fileTokens = readable.filter((f) => pickedFiles.has(f.id)).reduce((n, f) => n + f.tokens, 0);
  const copy = async () => {
    try { await navigator.clipboard.writeText(pack.prompt); } catch {
      const t = document.getElementById('prompt-text'); t.select(); document.execCommand('copy'); // older phones
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([pack.md], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: pack.filename });
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="builder">
      <header className="page-head">
        <h1>Prompt builder</h1>
        <p>A prompt and a context pack for ChatGPT, Claude, Gemini or DeepSeek, made from your units, weak spots and past papers.</p>
      </header>
      <section className="card stack" aria-label="What to ask for">
        <div className="pair">
          <label className="field">Unit
            <select value={o.unit} onChange={set('unit')}>{s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} · {u.title}</option>)}</select>
          </label>
          <label className="field">Topic
            <select value={o.topicId} onChange={set('topicId')}><option value="">The whole unit</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </label>
          <label className="field">What you want
            <select value={o.goal} onChange={set('goal')}><option value="">Best for this stage</option>{s.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </label>
          <label className="field">Prep time
            <select value={o.stage} onChange={set('stage')}><option value="">From the unit's date{stageNow ? ` (${stageNow})` : ''}</option>{s.stages.map((st) => <option key={st.id} value={st.id}>{st.name} ({st.window})</option>)}</select>
          </label>
        </div>
        {qs.length > 0 && (
          <details className="disclosure" open={o.questionIds.length > 0 || undefined}>
            <summary>Past-paper questions to solve <span className="muted num">({o.questionIds.length ? `${o.questionIds.length} picked` : 'optional'})</span></summary>
            <PickList label="Past-paper questions" max={12} picked={new Set(o.questionIds)} set={(n) => setO((x) => ({ ...x, questionIds: [...n] }))}
              items={qs.map((q) => ({ id: q.id, label: `${q.source} · Q${q.number}`, meta: q.marks ? `${q.marks} marks` : null, sub: q.text }))} />
          </details>
        )}
        {files.length > 0 && (
          <details className="disclosure">
            <summary>Files in the pack <span className="muted num">({pickedFiles.size} of {readable.length}, about {tokensLabel(fileTokens)})</span></summary>
            <PickList label="Files in the pack" picked={pickedFiles} set={(n) => setO((x) => ({ ...x, fileIds: [...n] }))}
              items={files.map((f) => ({ id: f.id, label: f.name, meta: fileSize(f.size) || null, disabled: f.scanned, sub: f.scanned ? 'Scanned, no text: attach the file itself' : `${f.paper ? 'Past paper' : 'Notes'} · about ${tokensLabel(f.tokens)} in the pack` }))} />
          </details>
        )}
        <div className="field">Explanation style
          <div className="segmented" role="group" aria-label="Explanation style">
            {(s.styles || []).map((x) => <button key={x.id} type="button" aria-pressed={o.style === x.id} onClick={() => setO((y) => ({ ...y, style: x.id }))}>{x.name}</button>)}
          </div>
        </div>
        <label className="field">Key focus <span className="hint">optional</span>
          <input value={o.focus} onChange={set('focus')} placeholder="Sign conventions in Mohr's circle" maxLength={200} />
        </label>
      </section>

      {problem && <p className="notice bad" role="alert">{problem}</p>}
      {!pack && !problem && <div className="skeleton" style={{ height: 220 }} />}
      {pack && (
        <section className="card stack" aria-labelledby="prompt-title">
          <div className="card-head">
            <h2 className="card-title" id="prompt-title">Your prompt</h2>
            <span className="chip num">about {Math.round(pack.tokens / 100) / 10}k tokens</span>
          </div>
          {pack.cut?.length > 0 && <p className="notice">The pack hit its size limit, so some notes were cut: {pack.cut.join(', ')}.</p>}
          <PromptView text={pack.prompt} />
          <textarea id="prompt-text" className="visually-hidden" readOnly value={pack.prompt} tabIndex={-1} aria-hidden="true" />
          <div className="toolbar">
            <button type="button" className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy prompt'}</button>
            <button type="button" className="btn" onClick={download}>Download pack (.md)</button>
          </div>
          <p className="muted small">Attach the pack, then paste the prompt. Open: {AIS.map(([n, url], i) => <Fragment key={n}>{i > 0 && ' · '}<a href={url} target="_blank" rel="noreferrer">{n}</a></Fragment>)}</p>
        </section>
      )}
    </div>
  );
}
