// Settings for the community bot. Nothing here is secret: keys live in community/.env (setup.bat writes it).
export { GUILD_ID } from '../../lib/config.js';

export const CHANNEL = '1300097451725819925'; // #general-chat: everything is posted here
export const MODEL = 'gemini-3.8-flash';       // Google's current stable Flash model

// Nairobi times for the daily posts (cron: minute hour * * *)
export const SCHEDULE = {
  trivia: '0 10 * * *',      // question with A-D buttons, answer revealed at the reveal time
  triviaReveal: '0 16 * * *',
  video: '0 14 * * *',
  article: '0 19 * * *',
};

// Joining conversations on its own: only in #general-chat, only when it's lively, and never often.
export const JUMP_IN = {
  minHumanMessages: 5,          // in the last 10 minutes
  quietMinutes: 90,             // after the bot last spoke in the channel
  maxPerDay: 6,
};
export const MAX_REPLIES_PER_DAY = 300; // keeps Gemini use (and cost) bounded

// YouTube channels whose new videos get posted (find a channel's ID on its "About" page, or ask Claude).
export const YOUTUBE = [
  { name: 'Practical Engineering', id: 'UCMOqf8ab-42UUQIdVoKwjlQ' },
  { name: 'Real Engineering', id: 'UCR1IuLEqb6UEA_zQ81kwXfg' },
  { name: 'The Efficient Engineer', id: 'UCXAS_Ekkq0iFJ9dSUIkcAkw' },
  { name: 'Branch Education', id: 'UCdp4_l1vPmpN-gDbUwhaRUQ' },
  { name: 'Veritasium', id: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
  { name: '3Blue1Brown', id: 'UCYO_jab_esuFRV4b17AJtAw' },
  { name: 'First Principles Engineering', id: 'UCZjXPcqOmUnd_IfFO8KJGHA' },
];

// Open-access article feeds. Posts link to the source; nothing is re-uploaded.
export const ARTICLES = [
  { name: 'arXiv', url: 'https://export.arxiv.org/api/query?search_query=cat:physics.flu-dyn+OR+cat:eess.SY+OR+cat:physics.app-ph+OR+cat:cond-mat.mtrl-sci+OR+cat:eess.SP&sortBy=submittedDate&sortOrder=descending&max_results=25' },
  { name: 'Phys.org Engineering', url: 'https://phys.org/rss-feed/technology-news/engineering/' },
];
