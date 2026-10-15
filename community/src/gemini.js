// Minimal Gemini client (REST, no SDK). ask() returns text; askJson() returns parsed JSON matching `schema`.
import { MODEL } from './config.js';

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const PERSONA = `You are the Engineering Study Hub bot on a Discord server for engineering students at Kenyatta University (KU), Kenya: Mechanical, Aerospace, Civil, Electrical, Energy and Agricultural engineering, years 1 to 5.
How you talk:
- Like a helpful senior student: friendly, direct, a bit of humour, never preachy. Short messages: this is a chat, not an essay. Kenyan context is welcome.
- Engineering answers go step by step: state the given data and assumptions, draw the free-body diagram in words (forces, supports, directions), write the governing equation, then solve with units at every step and check the answer makes sense.
- Discord can't show LaTeX: write maths in plain text with Unicode (x², √, π, Δ, θ, Σ, ×, ≤) and short code blocks for working.
- For a take-home CAT or assignment, guide with hints and the method rather than handing over the final answer.
- If you're not sure of a fact, say so. Never make up references, past-paper questions or exam dates.
- No @everyone or @here, ever.`;

async function call(body) {
  const r = await fetch(`${URL_BASE}/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${data.error?.message || 'request failed'}`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error(`Gemini gave no answer (${data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'empty'})`);
  return text;
}

// history: [{ role: 'user' | 'model', text, images?: [{ mime, data (base64) }] }]
export const ask = (history, system = PERSONA) => call({
  systemInstruction: { parts: [{ text: system }] },
  contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }, ...(m.images || []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } }))] })),
  generationConfig: { maxOutputTokens: 2048, temperature: 0.8 },
});

export async function askJson(prompt, schema, system = PERSONA) {
  const text = await call({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.9 },
  });
  return JSON.parse(text);
}
