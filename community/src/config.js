// Settings for the community bot. Nothing here is secret: keys live in community/.env and in the GitHub
// repository's Actions secrets (setup.bat puts them in both).
export { GUILD_ID } from '../../lib/config.js';

export const CHANNEL = '1300097451725819925'; // #general-chat: everything is posted here
export const MODEL = 'gemini-3.8-flash';       // Google's current stable Flash model

// Daily posts, Nairobi time. They're sent by GitHub Actions (.github/workflows/community-posts.yml), so they go out
// even when the PC is off; a late or missed run catches up on anything still due that day.
export const SCHEDULE = [
  { job: 'trivia', at: '10:00' },  // question with 🇦🇧🇨🇩 reactions (reactions work while the bot is offline)
  { job: 'video', at: '14:00' },
  { job: 'reveal', at: '16:00' },  // trivia answer and working
  { job: 'paper', at: '17:00' },   // research paper for the department of the day, pinging its role
  { job: 'news', at: '19:00' },    // engineering news article
];

// The research paper rotates through the departments, one a day. role = the department's role ID.
// arXiv categories: arxiv.org/category_taxonomy
export const DEPARTMENTS = [
  { name: 'Mechanical', role: '1300102160843018281', arxiv: ['physics.flu-dyn', 'cs.RO', 'cond-mat.mtrl-sci'] },
  { name: 'Aerospace', role: '1300102164030558270', arxiv: ['physics.flu-dyn', 'physics.space-ph', 'eess.SY'] },
  { name: 'Electrical', role: '1300102165481918486', arxiv: ['eess.SP', 'eess.SY', 'physics.app-ph'] },
  { name: 'Biosystems', role: '1300102166823960707', arxiv: ['q-bio.QM', 'physics.bio-ph', 'physics.ao-ph'] },
  { name: 'Civil', role: '1300102167872409700', arxiv: ['physics.geo-ph', 'cs.CE'] },
  { name: 'Biomedical', role: '1300102172951711764', arxiv: ['physics.med-ph', 'eess.IV'] },
  { name: 'Petroleum', role: '1300102173547565158', arxiv: ['physics.geo-ph', 'physics.flu-dyn', 'physics.chem-ph'] },
  { name: 'Software', role: '1448215071762157608', arxiv: ['cs.SE'] },
];

// Joining conversations on its own (PC bot): only in #general-chat, only when it's lively, and never often.
export const JUMP_IN = {
  minHumanMessages: 5,          // in the last 10 minutes
  quietMinutes: 90,             // after the bot last spoke in the channel
  maxPerDay: 6,
};
export const MAX_REPLIES_PER_DAY = 300; // keeps Gemini use (and cost) bounded

// YouTube channels whose new videos get posted (the ID is in the channel's page source as "channelId").
export const YOUTUBE = [
  { name: 'Practical Engineering', id: 'UCMOqf8ab-42UUQIdVoKwjlQ' },
  { name: 'Real Engineering', id: 'UCR1IuLEqb6UEA_zQ81kwXfg' },
  { name: 'The Efficient Engineer', id: 'UCXAS_Ekkq0iFJ9dSUIkcAkw' },
  { name: 'Branch Education', id: 'UCdp4_l1vPmpN-gDbUwhaRUQ' },
  { name: 'Veritasium', id: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
  { name: '3Blue1Brown', id: 'UCYO_jab_esuFRV4b17AJtAw' },
  { name: 'First Principles Engineering', id: 'UCZjXPcqOmUnd_IfFO8KJGHA' },
];

// Engineering news feeds (links only; nothing is re-uploaded).
export const NEWS = [
  { name: 'TechXplore', url: 'https://techxplore.com/rss-feed/engineering-news/' },
  { name: 'TechXplore Energy', url: 'https://techxplore.com/rss-feed/energy-green-tech-news/' },
  { name: 'TechXplore Robotics', url: 'https://techxplore.com/rss-feed/robotics-news/' },
  { name: 'TechXplore Tech', url: 'https://techxplore.com/rss-feed/hi-tech-news/' },
  { name: 'Phys.org Environment', url: 'https://phys.org/rss-feed/earth-news/environment/' },
];
