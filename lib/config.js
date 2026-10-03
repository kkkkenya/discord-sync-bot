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
