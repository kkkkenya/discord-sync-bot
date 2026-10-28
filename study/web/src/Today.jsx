const SECTION = { teach: 'teach', paper: 'papers', topics: 'units', mock: 'mock', practice: 'practice', prompt: 'prompt' };

export default function Today({ s, go }) {
  return (
    <section id="today" className="reveal" data-tour="today">
      <h2>Today</h2>
      {!s.plan.length ? (
        <p className="muted">Pick your units below and the plan fills in: weakest and closest paper first, one task each, shaped by its study stage.</p>
      ) : (
        <ol className="plan">
          {s.plan.map((p) => (
            <li key={p.code}>
              <div>
                <span className="code">{p.code}</span>
                <span className="title">{p.title}</span>
                <span className={`stage ${p.stage.id}`} title={p.stage.source === 'unit' || p.stage.source === 'all' ? 'Set by you' : p.stage.source === 'tba' ? 'Date TBA' : 'From the date'}>{p.stage.name}</span>
                {p.cat && p.days >= 0 && <span className={`when ${p.days <= 3 ? 'hot' : ''}`}>{p.days ? `in ${p.days}d` : 'today'}</span>}
              </div>
              <button onClick={() => go(SECTION[p.task.kind], { unit: p.code, topic: p.task.topic, kind: p.task.promptKind, questionId: p.task.questionId })}>{p.task.text} →</button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">Solve before you re-read: attempt the question closed book, then check. Teach a topic out loud before you call it done.</p>
    </section>
  );
}
