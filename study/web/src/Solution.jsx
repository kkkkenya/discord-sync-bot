import FreeBody from './FreeBody.jsx';
import Rich, { AnswerBox } from './Rich.jsx';

// A worked solution laid out like a model answer: Given and Find, the assumptions, the free body diagram with the
// reasoning behind it, then one equation per line with its reason on the right, the answer in a box and a check.
// Solutions saved before this layout (one markdown text, no steps) are shown as they were.
export default function Solution({ sol }) {
  const fbd = (sol.diagram || sol.fbd) && (
    <div className="stack-s">
      <h3 className="sub-title">Free body diagram</h3>
      {sol.diagram && <FreeBody d={sol.diagram} />}
      {sol.fbd && (sol.steps?.length
        ? <p className="sol-p"><b>FBD reasoning: </b><Rich as="span" text={sol.fbd} /></p>
        : <Rich text={sol.fbd} className="fbd-words" />)}
    </div>
  );
  if (!sol.steps?.length) {
    return <>{fbd}<Rich text={sol.breakdown} />{sol.answer && <AnswerBox text={sol.answer} label="Final answer" />}</>;
  }
  return (
    <div className="sol stack">
      <dl className="sol-gf">
        {sol.given?.length > 0 && <div><dt>Given</dt><dd><ul>{sol.given.map((g) => <li key={g}><Rich as="span" text={g} /></li>)}</ul></dd></div>}
        {sol.find && <div><dt>Find</dt><dd><Rich as="span" text={sol.find} /></dd></div>}
      </dl>
      {sol.assumptions?.length > 0 && (
        <div className="stack-s">
          <h3 className="sub-title">Assumptions</h3>
          <ol className="sol-assume">{sol.assumptions.map((a, i) => <li key={a}><b>A{i + 1}</b> <Rich as="span" text={a} /></li>)}</ol>
        </div>
      )}
      {fbd}
      {sol.method && <p className="sol-p"><b>Method: </b><Rich as="span" text={sol.method} /></p>}
      <div className="stack-s">
        <h3 className="sub-title">Solution</h3>
        <ol className="sol-steps">
          {sol.steps.map((s, i) => (
            <li key={i}>
              <div className="sol-eq"><Rich text={`$$${s.math}$$`} /></div>
              {s.reason && <span className="sol-why">[{s.reason}]</span>}
              {s.note && <p className="sol-note"><Rich as="span" text={s.note} /></p>}
            </li>
          ))}
        </ol>
      </div>
      {sol.answer && <AnswerBox text={sol.answer} label="Answer" />}
      {sol.check && <p className="sol-p"><b>Check: </b><Rich as="span" text={sol.check} /></p>}
      {sol.trap && <p className="sol-p sol-trap"><b>Trap: </b><Rich as="span" text={sol.trap} /></p>}
      {sol.realLife && <p className="sol-p muted"><b>Real life: </b><Rich as="span" text={sol.realLife} /></p>}
    </div>
  );
}
