const SECTION = { recall: 'recall', teach: 'teach', paper: 'papers', topics: 'units' };

export default function Today({ s, go }) {
  return (
    <section id="today" className="reveal" data-tour="today">
      <h2>Today</h2>
      {!s.plan.length ? (
        <p className="muted">Pick your units below and the plan fills in: weakest and closest CAT first.</p>
      ) : (
        <ol className="plan">
          {s.plan.map((p) => (
            <li key={p.code}>
              <div>
                <span className="code">{p.code}</span>
                <span className="title">{p.title}</span>
                {p.cat && <span className={`when ${p.days <= 3 ? 'hot' : ''}`}>CAT in {p.days}d</span>}
              </div>
              <button onClick={() => go(SECTION[p.task.kind], { unit: p.code, topic: p.task.topic })}>{p.task.text} →</button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">Active recall beats re-reading: answer from memory first, then check. Teach a topic out loud before you call it done.</p>
    </section>
  );
}
