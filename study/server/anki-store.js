// Anki export with the app's data (fixplan-e E9): GET /api/export/anki?unit= returns the unit's cards as a text file.
// Store-aware glue around anki.js (pure).
import { cardsFor, renderAnki } from './anki.js';
import { data } from './store.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export function ankiExport(unit) {
  if (!data.units.some((u) => u.code === unit)) throw bad('Pick one of your units first.');
  const cards = cardsFor({ unit, materials: data.materials, attempts: data.attempts, paperq: data.paperq });
  if (!cards.length) throw bad(`No cards for ${unit} yet. Make a method recipes sheet on its Sheet tab, or check some answers, then export again.`);
  const slug = unit.replace(/\s+/g, '-').toLowerCase();
  return { text: renderAnki(cards), filename: `crux-${slug}-anki.txt`, count: cards.length };
}

// The download itself: a plain text response the browser saves.
export function ankiResponse(unit) {
  const { text, filename } = ankiExport(unit);
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}
