// Every AI error, one table (owner, 2026-11-20, Track H3). Used by the hosted-models relay (ai-relay.js) and by
// structured() (ai.js). The student gets one plain sentence and what to do next; the raw error goes to the log,
// redacted, never to the student.
//
// classify({ provider, status, text, retryAfter, kind, perDay }, { model }) → { code, say, action, switch, status, waitSeconds? }
//   kind: 'timeout' | 'network' | 'cut' (a stream stopped mid-reply) | 'bad_json' | 'blocked' | 'daily_limit'
//   action: 'retry' (send again) | 'switch' (another model) | 'wait' | 'shorten' (new session) | 'rephrase'
//   switch: true when the failure is not the student's doing (credit, busy, down, our own bad request), so the caller
//   moves to the next live model on its own and says so once.

const CREDIT = /insufficient.?balance|insufficient_quota|"1113"|余额不足|no (available )?credit|credit balance|billing|payment required/i;
const REFUSED = /content exists risk|content_filter|content.?policy|safety|"1301"|不安全|敏感|prohibited_content|\bblocked\b|recitation/i;
const TOO_LONG = /context.?length|context window|maximum context|too many tokens|prompt is too long|"1261"|exceeds? the (maximum|limit)|input token count/i;
const QUOTA = /resource_exhausted|quota/i;

/** Pure: seconds to wait from a Retry-After header (seconds or an HTTP date). */
export function retrySeconds(value, now = Date.now()) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.ceil(n));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.round((at - now) / 1000)) : null;
}
const minutes = (s) => (s <= 60 ? 'a minute' : `${Math.ceil(s / 60)} minutes`);

const ROWS = {
  bad_key: { action: 'switch', switch: true, status: 503, say: (m) => `${m} isn't working on Crux right now. Pick another model in the list.` },
  no_credit: { action: 'switch', switch: true, status: 503, say: (m) => `${m} is out of credit on Crux for now. Pick another model in the list.` },
  busy: { action: 'switch', switch: true, status: 503, say: (m) => `${m} is busy right now. Try again in a minute or pick another model.` },
  rate_limit: { action: 'switch', switch: true, status: 429, say: (m, w) => `${m} is getting too many requests. Wait ${minutes(w ?? 60)} or pick another model.` },
  timeout: { action: 'switch', switch: true, status: 504, say: (m) => `${m} took too long to answer. Try again or pick another model.` },
  down: { action: 'switch', switch: true, status: 502, say: (m) => `${m} couldn't be reached. Try again in a minute or pick another model.` },
  bad_request: { action: 'switch', switch: true, status: 502, say: (m) => `${m} couldn't take this request. Pick another model in the list.` },
  cut: { action: 'retry', switch: false, status: 502, say: () => 'The answer stopped partway. Send your message again.' },
  too_long: { action: 'shorten', switch: false, status: 413, say: (m) => `This session is too long for ${m}. Start a new session, or pick a model that reads more.` },
  refused: { action: 'rephrase', switch: false, status: 422, say: (m) => `${m} wouldn't answer that. Rephrase the question and try again.` },
  bad_json: { action: 'retry', switch: false, status: 502, say: () => 'The answer came back garbled. Try again.' },
  daily_limit: { action: 'wait', switch: false, status: 429, say: (m, w, perDay) => `Today's ${perDay} answers on your plan are used. They reset at midnight, Nairobi time.` },
  unknown: { action: 'retry', switch: false, status: 502, say: (m) => `${m} didn't answer. Try again in a moment.` },
};

function codeFor({ status, text = '', kind }) {
  if (kind === 'daily_limit') return 'daily_limit';
  if (kind === 'timeout') return 'timeout';
  if (kind === 'network') return 'down';
  if (kind === 'cut') return 'cut';
  if (kind === 'bad_json') return 'bad_json';
  if (kind === 'blocked') return 'refused';
  if (CREDIT.test(text) || status === 402) return 'no_credit';
  if (REFUSED.test(text)) return 'refused';
  if (TOO_LONG.test(text) || status === 413) return 'too_long';
  if (status === 401 || status === 403) return 'bad_key';
  if (status === 429) return QUOTA.test(text) ? 'busy' : 'rate_limit';
  if (status === 408) return 'timeout';
  if (status >= 500) return 'busy';
  if (status === 400 || status === 404 || status === 422) return 'bad_request';
  return 'unknown';
}

/** Pure: what the student is told and what happens next. */
export function classify(err = {}, { model = 'This model', now = Date.now() } = {}) {
  const code = codeFor(err);
  const row = ROWS[code];
  const waitSeconds = code === 'rate_limit' ? retrySeconds(err.retryAfter, now) ?? 60 : undefined;
  return { code, action: row.action, switch: row.switch, status: row.status, say: row.say(model, waitSeconds, err.perDay), ...(waitSeconds != null && { waitSeconds }) };
}

/** Pure: a log line with every key taken out (env values, bearer tokens, sk-…, AIza…, key=…). */
export function redact(text, env = process.env) {
  let out = String(text ?? '');
  for (const [k, v] of Object.entries(env || {})) if (/(_KEY|_SECRET|TOKEN)$/.test(k) && typeof v === 'string' && v.length >= 8) out = out.split(v).join('[key]');
  return out
    .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [key]')
    .replace(/\bsk-[\w-]{8,}/g, '[key]')
    .replace(/\bAIza[\w-]{20,}/g, '[key]')
    .replace(/((?:api[_-]?)?key[=:]\s*)[\w.-]{8,}/gi, '$1[key]');
}

/** Log the raw error for the owner (redacted), never for the student. */
export const logAiError = (where, detail, env) => console.error(`${where}:`, redact(typeof detail === 'string' ? detail : detail?.stack || detail?.message || JSON.stringify(detail), env).slice(0, 600));

// What a note says happened to the model that failed when another one answered.
const BECAUSE = { bad_key: "isn't working on Crux right now", no_credit: 'is out of credit', busy: 'is busy', rate_limit: 'is getting too many requests', timeout: 'took too long', down: "couldn't be reached", bad_request: "couldn't take this request" };
export const becauseOf = (code) => BECAUSE[code] || "didn't answer";
