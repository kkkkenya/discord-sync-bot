// Crux, the Hub's study app, in hub buddy: what it knows about it (in the persona), the line under each trivia
// answer, and a short tip on Mondays and Thursdays. Every tip is something Crux really does.
export const CRUX_URL = 'https://crux.engineeringhub.site';
export const TIP_DAYS = ['Monday', 'Thursday'];

// what hub buddy may say about Crux (added to its persona in gemini.js)
export const CRUX_FACTS = `About Crux, the Hub's study app (${CRUX_URL}, sign in with Discord):
- Past papers and CATs split into questions, sorted by topic and sub-topic. Book examples have "Open in book" at the right page.
- Type your final answer and it checks it. If it's wrong, you pick the step where your working broke and it's saved as a weak spot. Full worked solutions with free body diagrams, and you can ask follow-up questions about any question.
- Paste the class message with the CAT date and Today builds a plan up to it.
- It has already read the Hub's files. They open in Crux's own PDF viewer with no download, and you can search them and pin lines to your notes.
- A formula sheet per unit, built from its notes and questions. There is also a focus timer and a study room.
- Comes with Basic (KES 50 a semester: 15 AI actions and 2 downloads a day) and Premium (KES 500 a semester, or KES 350 to upgrade from Basic). Add 10 files from Crux in a semester and you get Premium for the rest of it.
When someone asks about revising, past papers, CAT topics, a worked solution, formula sheets or where notes are, answer them properly first, then you may add ONE short line pointing to the part of Crux that fits, with the link. At most once in a conversation (check your earlier messages), never as the whole answer, never in jokes, banter or off-topic chat, and never invent features.`;

export const TIPS = [
  { title: 'Paste the CAT date', body: 'Got the class message with the CAT date? Paste it into Crux\'s Today screen. It reads the date and builds the days between now and the CAT: what to read, what to practise, what to check.', ask: 'When is your next CAT, and how far are you with it?' },
  { title: 'Past papers, sorted by topic', body: 'In Crux\'s Practise tab, every past paper and CAT is split into questions and grouped by topic and sub-topic. Search "tapered" or "Mohr" and you get every question on it across the years.', ask: 'Which topic keeps coming back in your unit\'s papers?' },
  { title: 'Find the step that broke', body: 'Type your final answer in Crux and it checks it. If it\'s wrong, you pick the step where your working went off, and it\'s saved as a weak spot, so Insights shows what to fix first.', ask: 'What\'s the mistake you make most in calculations?' },
  { title: 'Your Hub notes, no download', body: 'Every file posted on the Hub opens inside Crux, at the right page, without using a download. Find in the file, highlight a line, pin it to your notes bar.', ask: 'Do you revise from your phone or a laptop?' },
  { title: 'A formula sheet for your unit', body: 'Crux\'s Sheet tab makes a one-page formula sheet from your unit\'s notes and questions, with the formulas tied to specific questions marked, and the traps you keep falling into.', ask: 'Which formula do you always forget in the exam?' },
  { title: 'Ask why', body: 'Under any worked solution in Crux there\'s "Ask about this question". Why this formula and not another? Where did that 4 come from? It answers about that question, not in general.', ask: 'What\'s a "why" you never got an answer to in a lecture?' },
  { title: 'Earn Mimosa by sharing', body: 'Add 10 files to the Hub from Crux in a semester (past papers, CATs, notes you have) and you get Mimosa free for the rest of the semester, with a contributor medal. Everyone in your unit gets the files too.', ask: 'Which unit is missing papers on the Hub?' },
];

const DAY_MS = 864e5;
// the tip for a Nairobi day ('YYYY-MM-DD'), or null on days without one; they rotate through the list
export function tipFor(day) {
  const d = new Date(`${day}T12:00:00+03:00`);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Africa/Nairobi' });
  if (!TIP_DAYS.includes(weekday)) return null;
  const n = Math.floor(d.getTime() / (7 * DAY_MS)) * TIP_DAYS.length + TIP_DAYS.indexOf(weekday);
  return TIPS[n % TIPS.length];
}

export const tipPost = (tip) => [`💡 **Crux tip: ${tip.title}**`, tip.body, `<${CRUX_URL}>`].join('\n');
export const revealLine = (unitCode) => (unitCode ? `📚 More ${unitCode} questions, sorted by topic, in Crux: <${CRUX_URL}>` : '');
