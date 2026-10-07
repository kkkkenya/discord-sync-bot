// Server settings for the Vercel side of the bot. None of these are secrets —
// the bot token and cron secret come from Vercel environment variables.
export const GUILD_ID = '1114845424004632597';
export const APP_ID = '1550580619858284564'; // the bot's application (also the dashboard's Discord sign-in)
// Payments approved since this date count as "this semester" on the dashboard.
export const SEMESTER_START = new Date('2026-09-01T00:00:00+03:00');
export const PUBLIC_KEY = '37ce529df004465815c45262a17afd93f0c3e072a631b6888439cb36e554967d';

export const CHANNELS = {
  payments: '1555038929428938773',
  toSort: '1555835253455720511',   // files the bot couldn't place (Sort buttons)
  library: '1331200098402828308',  // #pdf-library, for files that aren't for one unit
};
export const ROLES = {
  trial: '1331202679334244352',   // free trial🥶🦧
  paid: '1418497015603527741',    // paid member (Basic)
  premium: '1554749411928711204', // Premium
};

export const MPESA = { number: '0745947704', name: 'Peter Mwangi' };
export const PRICES = { basic: 50, premium: 800 };
export const WHATSAPP = 'https://wa.me/254745947704';

// Free trial: 7 days from joining, reminder 2 days before the end.
export const TRIAL_DAYS = 7;
export const REMIND_DAYS_BEFORE = 2;
// Members who joined before CUTOFF keep free access until DEADLINE (announced in #announcements).
export const EXISTING = {
  cutoff: new Date('2026-10-01T00:00:00+03:00'),
  deadline: new Date('2026-10-08T23:59:00+03:00'),
  announced: true, // set false to stop the daily job removing their access
};

// Basic is per semester: access lasts this many days after approval, reminder a week before.
export const SEMESTER_DAYS = 120;
export const RENEW_REMIND_DAYS_BEFORE = 7;

// Channels and roles the PC bot creates on first start if they're missing. Both halves find them by name,
// so you can move or re-permission them freely; renaming one means changing it here too.
export const NAMES = {
  dailyChannel: 'daily-problems',  // the daily problem, answers revealed next morning, weekly leaderboard
  digestChannel: 'new-this-week',  // weekly list of new files
  groupsChannel: 'study-groups',   // one thread per study group / squad
  botLog: 'bot-log',               // staff-only: upload reports, files too big for Discord, errors
  dailyRole: 'Daily Problems',     // opt-in role pinged with each daily problem
  streak7: '🔥 7-day streak',
  streak30: '🔥 30-day streak',
};

// Roles whose names match this are reps: they can see #to-sort, use its Sort buttons, and get pinged with admins
// when new files land there.
export const SORTER_ROLE_MATCH = /\breps?\b|representative/i;

// Onboarding roles whose names match this are treated as course/year roles (for classmates and revision packs).
export const COURSE_ROLE_MATCH = /year|yr\b/i;

// KU semester calendar (1st semester 2026/27). Dates are Nairobi days.
export const CALENDAR = {
  cats: [
    { name: '1st CATs', start: '2026-09-28', end: '2026-10-02' },
    { name: '2nd CATs', start: '2026-11-02', end: '2026-11-06' },
  ],
  exams: { name: 'Engineering exams', start: '2026-11-30', end: '2026-12-10' },
  examPushDaysBefore: 14, // revision-pack DMs go out from this many days before exams
  countdownDays: [14, 7, 3, 1], // countdown line on the daily problem
};

// Switches. dailyProblems: the daily practice problem (written by Claude from a library past paper, needs
// ANTHROPIC_API_KEY on the PC). Off for now: no #daily-problems channel, no /daily, /streak or /leaderboard.
export const FEATURES = { dailyProblems: false };

// Daily problems: points for answering and for getting it right.
export const POINTS = { answered: 2, correct: 10 };
