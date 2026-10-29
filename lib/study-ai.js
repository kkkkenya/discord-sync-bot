// The owner's AI for friends' Study Desks (through the gateway): Gemini with GEMINI_API_KEY from Vercel's settings.
// The same request shape Study Desk's structured() uses: { schema, system, content, maxTokens, media }.
const MODEL = process.env.STUDY_AI_MODEL || 'gemini-3.8-flash';
const FALLBACK = 'gemini-3.5-flash-lite';

// Gemini's responseSchema rejects additionalProperties, so strip it
const geminiSchema = (s) => (Array.isArray(s) ? s.map(geminiSchema)
  : s && typeof s === 'object' ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'additionalProperties').map(([k, v]) => [k, geminiSchema(v)])) : s);

export async function hubAI({ schema, system, content, maxTokens = 4000, media = [] }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('The Study Hub’s AI isn’t set up yet. Use your own key in Settings for now.'), { status: 503 });
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: String(system || '') }] },
    contents: [{ role: 'user', parts: [...media.map((m) => ({ inlineData: { mimeType: m.mime, data: m.data } })), { text: String(content || '') }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(schema), temperature: 0.2, maxOutputTokens: Math.min(Number(maxTokens) || 4000, 8000) },
  });
  let last;
  for (const model of [MODEL, FALLBACK]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(55000) }).catch((e) => ({ ok: false, status: 504, json: async () => ({ error: { message: e.message } }) }));
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
      if (!text) throw Object.assign(new Error('The AI gave no answer. Try again.'), { status: 502 });
      return { result: JSON.parse(text), tokens: d.usageMetadata?.totalTokenCount || 0 };
    }
    last = Object.assign(new Error(`Gemini ${r.status}: ${d.error?.message || 'request failed'}`), { status: r.status === 429 ? 503 : 502 });
    if (![429, 500, 502, 503, 504].includes(r.status)) break;
  }
  throw last;
}
