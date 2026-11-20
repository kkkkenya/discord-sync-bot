// Track H3 (owner, 2026-11-20): every kind of AI error gets one plain sentence, the right action, and no key or
// stack reaches the student. server/ai-errors.js is the one table; the relay and structured() both use it.
import assert from 'node:assert/strict';
import test from 'node:test';

const { classify, redact } = await import('../server/ai-errors.js');

const KEY = 'sk-live-abcdef1234567890';
const GKEY = 'AIzaSyD-abcdefghijklmnopqrstuvwxyz12345';

// [what happened, input, expected code, expected action, switch?, a phrase the sentence must have]
const TABLE = [
  ['wrong key (DeepSeek 401)', { provider: 'deepseek', status: 401, text: `{"error":{"message":"Authentication Fails, Your api key: ${KEY} is invalid"}}` }, 'bad_key', 'switch', true, /isn't working on Crux/],
  ['forbidden (Gemini 403)', { provider: 'gemini', status: 403, text: `{"error":{"message":"API key not valid. key=${GKEY}","status":"PERMISSION_DENIED"}}` }, 'bad_key', 'switch', true, /isn't working on Crux/],
  ['no balance (DeepSeek 402)', { provider: 'deepseek', status: 402, text: '{"error":{"message":"Insufficient Balance"}}' }, 'no_credit', 'switch', true, /out of credit/],
  ['no balance (z.ai 429 code 1113)', { provider: 'glm', status: 429, text: '{"error":{"code":"1113","message":"余额不足或无可用资源包,请充值。"}}' }, 'no_credit', 'switch', true, /out of credit/],
  ['quota used up (Gemini 429 RESOURCE_EXHAUSTED)', { provider: 'gemini', status: 429, text: '{"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota"}}' }, 'busy', 'switch', true, /busy/],
  ['rate limit with retry-after', { provider: 'deepseek', status: 429, text: 'Too Many Requests', retryAfter: '120' }, 'rate_limit', 'switch', true, /2 minutes/],
  ['overloaded (503)', { provider: 'gemini', status: 503, text: '{"error":{"status":"UNAVAILABLE","message":"The model is overloaded"}}' }, 'busy', 'switch', true, /busy/],
  ['overloaded (529)', { provider: 'deepseek', status: 529, text: 'overloaded' }, 'busy', 'switch', true, /busy/],
  ['server error (500)', { provider: 'deepseek', status: 500, text: 'Internal error' }, 'busy', 'switch', true, /busy/],
  ['timeout', { provider: 'deepseek', kind: 'timeout' }, 'timeout', 'switch', true, /too long/],
  ['network down', { provider: 'gemini', kind: 'network', text: 'getaddrinfo ENOTFOUND generativelanguage.googleapis.com' }, 'down', 'switch', true, /couldn't be reached/],
  ['stream cut off', { provider: 'deepseek', kind: 'cut' }, 'cut', 'retry', false, /stopped partway/],
  ['context too long', { provider: 'deepseek', status: 400, text: '{"error":{"message":"This model\'s maximum context length is 131072 tokens. However, you requested 140000 tokens"}}' }, 'too_long', 'shorten', false, /too long for/],
  ['content refused (DeepSeek)', { provider: 'deepseek', status: 400, text: '{"error":{"message":"Content Exists Risk"}}' }, 'refused', 'rephrase', false, /wouldn't answer/],
  ['content blocked (Gemini SAFETY)', { provider: 'gemini', kind: 'blocked', text: 'SAFETY' }, 'refused', 'rephrase', false, /wouldn't answer/],
  ['content refused (z.ai 1301)', { provider: 'glm', status: 400, text: '{"error":{"code":"1301","message":"系统检测到输入或生成内容可能包含不安全或敏感内容"}}' }, 'refused', 'rephrase', false, /wouldn't answer/],
  ['bad effort or parameter (GLM medium)', { provider: 'glm', status: 400, text: '{"error":{"message":"reasoning_effort: use low, high, or max"}}' }, 'bad_request', 'switch', true, /couldn't take/],
  ['malformed reply (bad JSON)', { provider: 'deepseek', kind: 'bad_json', text: 'Unexpected token } in JSON' }, 'bad_json', 'retry', false, /garbled/],
  ['daily allowance used up', { kind: 'daily_limit', perDay: 15 }, 'daily_limit', 'wait', false, /15 answers/],
];

for (const [what, input, code, action, change, phrase] of TABLE) {
  test(`error table: ${what}`, () => {
    const out = classify(input, { model: 'DeepSeek Flash' });
    assert.equal(out.code, code);
    assert.equal(out.action, action);
    assert.equal(out.switch, change, 'move to the next model only when it is not the student\'s doing');
    assert.match(out.say, phrase);
    assert.equal(out.say.split(/(?<=[.!?])\s+(?=[A-Z])/).length <= 2, true, 'one sentence and what to do next');
    assert.doesNotMatch(out.say, /\n\s+at /, 'no stack');
    for (const secret of [KEY, GKEY, 'Bearer', 'Error:', '{', 'api.deepseek.com', 'googleapis']) assert.equal(out.say.includes(secret), false, `"${secret}" reached the student`);
    assert.ok(Number.isInteger(out.status) && out.status >= 400, 'an HTTP status to answer with');
  });
}

test('rate limit: retry-after is read as seconds or as a date, and rounds up to minutes', () => {
  assert.equal(classify({ status: 429, retryAfter: '30' }).waitSeconds, 30);
  assert.match(classify({ status: 429, retryAfter: '30' }).say, /a minute/);
  const at = new Date(Date.now() + 5 * 60e3).toUTCString();
  assert.ok(Math.abs(classify({ status: 429, retryAfter: at }).waitSeconds - 300) <= 2);
});

test('redact: keys and bearer tokens never reach a log line', () => {
  const line = redact(`Authorization: Bearer ${KEY} key=${GKEY} x-goog-api-key: ${GKEY}`, { DEEPSEEK_API_KEY: KEY });
  assert.equal(line.includes(KEY), false);
  assert.equal(line.includes(GKEY), false);
  assert.match(line, /\[key\]/);
});

// structured() (server/ai.js): the same table, a provider switch on its own, and a note for the student.
test('structured(): DeepSeek out of credit, Gemini answers, and the request carries one note', async () => {
  process.env.DEEPSEEK_API_KEY = 'sk-test-deepseek-key-0001';
  process.env.GEMINI_API_KEY = 'AIzaTestGeminiKey000000000000000';
  const { emptyDoc, withDoc, requestScope } = await import('../server/store.js');
  const { structured } = await import('../server/ai.js');
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes('deepseek')
    ? new Response('{"error":{"message":"Insufficient Balance"}}', { status: 402 })
    : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 }));
  try {
    const { result } = await withDoc(emptyDoc(), async () => {
      const scope = requestScope();
      scope.aiNotes = [];
      const out = await structured({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, 'sys', 'hi', 100);
      return { out, notes: scope.aiNotes };
    });
    assert.deepEqual(result.out, { ok: true });
    assert.deepEqual(result.notes, ['DeepSeek is out of credit, so Gemini answered.']);
  } finally { globalThis.fetch = real; }
});

test('structured(): both providers fail: a plain sentence with a status, no key, no raw text', async () => {
  const { emptyDoc, withDoc } = await import('../server/store.js');
  const { structured } = await import('../server/ai.js');
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(`{"error":{"message":"bad key ${process.env.DEEPSEEK_API_KEY}"}}`, { status: String(url).includes('deepseek') ? 401 : 503 });
  try {
    const err = await withDoc(emptyDoc(), () => structured({ type: 'object' }, 'sys', 'hi', 100)).then(() => null, (e) => e);
    assert.ok(err, 'it fails');
    assert.equal(err.status, 503);
    assert.equal(err.code, 'busy');
    assert.match(err.message, /^Gemini is busy right now\./);
    assert.doesNotMatch(err.message, /sk-test|AIza|bad key|\{/);
  } finally { globalThis.fetch = real; }
});
