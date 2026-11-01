// Daily AI limits per tier and the DeepSeek budget (server/usage.js, ai.js provider choice, the router's 429).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
process.env.SESSION_SECRET = 'test-secret';
process.env.GEMINI_API_KEY = 'test';
process.env.DEEPSEEK_API_KEY = 'test';
const { DEEPSEEK, LIMITS, deepseekCost } = await import('../server/defs.js');
const { addDeepseekSpend, bump, deepseekOpen, resetUsageForTests } = await import('../server/usage.js');
const { emptyDoc, withDoc, requestScope } = await import('../server/store.js');
const { provider } = await import('../server/ai.js');
const { sign } = await import('../../lib/session.js');
const { makeRouter } = await import('../api/router.js');

test('Basic and trial get 15 AI actions a day, Premium 40, the owner no limit', async () => {
  resetUsageForTests();
  for (const [tier, n] of [['basic', 15], ['trial', 15], ['premium', 40]]) {
    const user = { id: `u-${tier}`, tier };
    for (let i = 1; i <= n; i++) assert.equal((await bump(user, 'ai')).ok, true, `${tier} #${i}`);
    assert.deepEqual(await bump(user, 'ai'), { ok: false, used: n, limit: n });
  }
  for (let i = 0; i < 100; i++) assert.equal((await bump({ id: 'boss', tier: 'owner' }, 'ai')).ok, true);
  assert.equal((await bump({ id: 'x', tier: 'none' }, 'ai')).ok, false);
});

test('DeepSeek is for Premium only; others are moved to Gemini', async () => {
  resetUsageForTests();
  const doc = emptyDoc();
  doc.settings.aiProvider = 'deepseek';
  const as = (tier) => withDoc(doc, () => { requestScope().user = { id: 'u', tier }; return provider(); }).then((r) => r.result);
  assert.equal(await as('basic'), 'gemini');
  assert.equal(await as('premium'), 'deepseek');
});

test('DeepSeek stops at the monthly cap and Gemini takes over', async () => {
  resetUsageForTests();
  assert.equal(Math.round(deepseekCost({ prompt_tokens: 1e6, completion_tokens: 1e6 }) * 100) / 100, DEEPSEEK.inputPerM + DEEPSEEK.outputPerM);
  await addDeepseekSpend(2.5);
  assert.equal(deepseekOpen(), true);
  await addDeepseekSpend(0.5);
  assert.equal(deepseekOpen(), false);
  const doc = emptyDoc();
  doc.settings.aiProvider = 'deepseek';
  const { result } = await withDoc(doc, () => { requestScope().user = { id: 'u', tier: 'premium' }; return provider(); });
  assert.equal(result, 'gemini');
});

test('with the limit at 1, the second AI action is refused with the plain message', async () => {
  resetUsageForTests();
  const was = LIMITS.ai.basic;
  LIMITS.ai.basic = 1;
  try {
    const docs = { load: async () => ({ rev: 1, doc: emptyDoc() }), save: async () => 2 };
    const router = makeRouter(docs, { db: { upsert: async () => [] }, member: async () => null });
    const cookie = `crux_session=${sign({ id: 'amina', name: 'Amina', tier: 'basic', checked: Date.now(), exp: Date.now() + 60e3 })}`;
    const teach = () => router(new Request('https://crux.test/api/router?path=teach', { method: 'POST', headers: { cookie }, body: '{}' }));
    assert.notEqual((await teach()).status, 429); // the first one is let through (and fails on its own input)
    const second = await teach();
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error, "Today's AI limit is used. Take this pack to any AI.");
  } finally { LIMITS.ai.basic = was; }
});
