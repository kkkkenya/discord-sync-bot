// The honest warning before heavy built-in AI work: its context and effort limits, and the way round them.
export default function LimitNote({ s, unit, topic, go, what = 'long engineering working' }) {
  if (!s.ai) return null;
  const synced = Object.values(s.library || {}).filter((e) => e.unit === unit).reduce((n, e) => n + (e.chars || 0), 0);
  return (
    <p className="limitnote small">
      Heads up: the built-in AI is a fast model with context and reasoning limits; on {what} it can skip steps or slip on signs and algebra.
      {synced > 12000 && ` Only about 12,000 of the ${synced.toLocaleString()} characters synced for ${unit} fit into it.`}
      {' '}For a full derivation or a verified solution, take a Deep Context Pack to Claude, DeepSeek R1 or ChatGPT.{' '}
      {unit && <button type="button" className="link" onClick={() => go('prompt', { unit, topic })}>Open in Prompt Builder →</button>}
    </p>
  );
}
