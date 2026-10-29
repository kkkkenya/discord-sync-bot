// Registers the slash commands on the server. Run once (and again after changing this list): npm run register
// Each command is created or updated by name, so commands not listed here are left alone.
// Discord sends them to the Interactions Endpoint URL, so they're answered by Vercel (lib/commands.js).
import { config } from 'dotenv';
config({ path: new URL('./.env', import.meta.url) });
const { api } = await import('../lib/discord.js');
const { APP_ID, FEATURES, GUILD_ID } = await import('../lib/config.js');

const { TRACKS } = await import('../lib/milestones.js');

const SUB = 1, STRING = 3, INTEGER = 4, BOOLEAN = 5, USER = 6;
const choices = (...names) => names.map((n) => ({ name: n, value: n }));
const TRACK_CHOICES = TRACKS.map((t) => ({ name: t.name, value: t.id }));

const COMMANDS = [
  {
    name: 'find', description: 'Find notes, past papers and books, or a study group',
    options: [
      { type: SUB, name: 'resource', description: 'Search the library by unit code or title', options: [
        { type: STRING, name: 'query', description: 'A unit code like EMM 305, or words from the title', required: true, max_length: 80 },
        { type: STRING, name: 'kind', description: 'Only this kind of file', choices: choices('paper', 'notes', 'slides', 'book', 'any') },
      ] },
      { type: SUB, name: 'group', description: 'Find study groups, build squads and classmates', options: [
        { type: STRING, name: 'unit', description: 'A unit code like EMM 305, or part of a group name', max_length: 60 },
        { type: STRING, name: 'type', description: 'What to look for (default: all)', choices: choices('all', 'study', 'squad', 'classmates') },
      ] },
    ],
  },
  {
    name: 'group', description: 'Study groups and build squads',
    options: [
      { type: SUB, name: 'create', description: 'Start a study group or a build squad', options: [
        { type: STRING, name: 'type', description: 'Study group (free) or build squad (Premium)', required: true, choices: [{ name: 'study group', value: 'study' }, { name: 'build squad', value: 'squad' }] },
        { type: STRING, name: 'name', description: 'e.g. "Thermo CAT 2 revision"', required: true, max_length: 60 },
        { type: STRING, name: 'unit', description: 'Unit code, e.g. EMM 305', max_length: 9 },
        { type: INTEGER, name: 'size', description: 'Most members allowed (2 to 20, default 8)', min_value: 2, max_value: 20 },
      ] },
      { type: SUB, name: 'mine', description: 'Groups you are in (and leave buttons)' },
    ],
  },
  {
    name: 'classmates', description: 'Let classmates in your course and year find you',
    options: [
      { type: SUB, name: 'on', description: 'Show me in /find group', options: [
        { type: STRING, name: 'note', description: 'e.g. "Looking for an EMM 305 revision partner"', max_length: 100 },
      ] },
      { type: SUB, name: 'off', description: 'Hide me from /find group' },
    ],
  },
  { name: 'daily', description: 'Daily practice problem pings', options: [
    { type: SUB, name: 'on', description: 'Ping me for each daily problem' },
    { type: SUB, name: 'off', description: 'Stop pinging me' },
  ] },
  { name: 'nudges', description: 'Occasional DMs about what is new in your units', options: [
    { type: SUB, name: 'on', description: 'Send me check-ins' },
    { type: SUB, name: 'off', description: 'Stop check-in DMs' },
  ] },
  { name: 'streak', description: 'Your daily-problem streak and points' },
  { name: 'leaderboard', description: 'Top daily-problem players' },

  // Study Hub Milestones (lib/logbook.js)
  {
    name: 'log', description: 'Log what you worked on today (Study Hub Milestones)',
    options: [
      { type: STRING, name: 'what', description: 'What you did, e.g. "Finished MATLAB Onramp module 4"', required: true, max_length: 280 },
      { type: STRING, name: 'track', description: 'Pick a track, or type your own interest to add it', required: true, autocomplete: true, max_length: 60 },
      { type: INTEGER, name: 'minutes', description: 'How long you spent', min_value: 0, max_value: 720 },
      { type: STRING, name: 'link', description: 'Proof: a certificate, repo or video link', max_length: 300 },
      { type: STRING, name: 'day', description: 'Forgot yesterday? Log it now (default: today)', choices: choices('today', 'yesterday') },
    ],
  },
  { name: 'unlog', description: 'Delete your most recent log' },
  { name: 'today', description: "Today's tasks from the year plan, for the tracks you work on" },
  { name: 'plan', description: "A track's 12-month plan and milestones", options: [
    { type: STRING, name: 'track', description: 'Which track', required: true, choices: TRACK_CHOICES.filter((c) => c.value !== 'other') },
  ] },
  { name: 'goal', description: 'Set your goal for the year (shows on the board)', options: [
    { type: STRING, name: 'text', description: 'e.g. "Land 3 paying clients and pass HSK 2"', required: true, max_length: 140 },
  ] },
  { name: 'progress', description: 'Your streak, hours, milestones and last 4 weeks', options: [
    { type: USER, name: 'member', description: 'See someone else\'s progress instead' },
    { type: BOOLEAN, name: 'share', description: 'Post it in the channel instead of just showing you' },
  ] },
  { name: 'board', description: 'Top streaks this month and the link to everyone\'s year' },
  {
    name: 'milestone', description: 'Tick off a Study Hub milestone',
    options: [
      { type: SUB, name: 'done', description: 'Tick a preset milestone (announced in the channel)', options: [
        { type: STRING, name: 'milestone', description: 'Start typing, e.g. "CS50" or "HSK"', required: true, autocomplete: true },
      ] },
      { type: SUB, name: 'own', description: 'Tick a milestone of your own', options: [
        { type: STRING, name: 'title', description: 'e.g. "Passed Thermodynamics II"', required: true, max_length: 100 },
        { type: STRING, name: 'track', description: 'Which track (default: My field)', choices: TRACK_CHOICES },
      ] },
      { type: SUB, name: 'undo', description: 'Untick a milestone', options: [
        { type: STRING, name: 'milestone', description: 'Start typing its name', required: true, autocomplete: true },
      ] },
      { type: SUB, name: 'list', description: 'Milestones and which ones you have done', options: [
        { type: STRING, name: 'track', description: 'Only this track', choices: TRACK_CHOICES },
      ] },
    ],
  },
  {
    name: 'interest', description: 'Your own tracks for /log (courses, skills, hobbies)',
    options: [
      { type: SUB, name: 'add', description: 'Add a course or interest of your own', options: [
        { type: STRING, name: 'name', description: 'e.g. "Robotics", "Thermodynamics", "Guitar"', required: true, max_length: 40 },
      ] },
      { type: SUB, name: 'remove', description: 'Remove one of your interests', options: [
        { type: STRING, name: 'name', description: 'Start typing its name', required: true, autocomplete: true },
      ] },
      { type: SUB, name: 'list', description: 'Your own interests' },
    ],
  },
  { name: 'suggest', description: 'Suggest a course, track or milestone for everyone', options: [
    { type: STRING, name: 'text', description: 'e.g. "Add an AutoCAD track" or "Milestone: first internship"', required: true, max_length: 300 },
  ] },
];

// Daily-problem commands only exist while the feature is on; switching it off removes them.
const DAILY = ['daily', 'streak', 'leaderboard'];
const existing = await api('GET', `/applications/${APP_ID}/guilds/${GUILD_ID}/commands`);
for (const c of COMMANDS) {
  if (!FEATURES.dailyProblems && DAILY.includes(c.name)) {
    const old = existing.find((e) => e.name === c.name);
    if (old) { await api('DELETE', `/applications/${APP_ID}/guilds/${GUILD_ID}/commands/${old.id}`); console.log(`- /${c.name} (removed, daily problems are off)`); }
    continue;
  }
  await api('POST', `/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, { type: 1, ...c });
  console.log(`✓ /${c.name}`);
}
// /study is global, not server-only, so it also works in a DM with the bot (contexts 0 = server, 1 = bot DM).
// It drives a friend's own Study Desk (lib/study-gateway.js): link and connect are answered by Vercel, the rest by
// the friend's Study Desk while it runs.
const ATTACHMENT = 11;
const UNIT = { type: STRING, name: 'unit', description: 'A unit code like EMM 302', required: true, max_length: 8 };
const STUDY = {
  name: 'study', description: 'Your Study Desk: today’s plan, study a topic, check an answer', contexts: [0, 1], integration_types: [0],
  options: [
    { type: SUB, name: 'today', description: 'Today’s plan from your Study Desk' },
    { type: SUB, name: 'learn', description: 'Study a topic: what to read in your notes, worked examples, then questions', options: [UNIT, { type: STRING, name: 'topic', description: 'The topic, e.g. torsion', required: true, max_length: 80 }] },
    { type: SUB, name: 'mark', description: 'Get a past-paper question, or check your answer (typed or a photo of your working)', options: [UNIT, { type: STRING, name: 'answer', description: 'Your final answer with its unit, e.g. 142.5 MPa', max_length: 60 }, { type: ATTACHMENT, name: 'photo', description: 'A photo of your working' }] },
    { type: SUB, name: 'broke', description: 'The checkpoint where your working broke', options: [{ type: INTEGER, name: 'step', description: 'The checkpoint number', required: true, min_value: 1, max_value: 9 }, { type: STRING, name: 'mistake', description: 'What kind of mistake', choices: choices('units', 'sign', 'algebra', 'equation', 'concept', 'boundary', 'misread') }] },
    { type: SUB, name: 'teach', description: 'Explain a topic and get it marked (typed, or a voice note)', options: [UNIT, { type: STRING, name: 'topic', description: 'The topic', required: true, max_length: 80 }, { type: STRING, name: 'text', description: 'Your explanation', max_length: 1800 }, { type: ATTACHMENT, name: 'voice', description: 'A voice recording of your explanation' }] },
    { type: SUB, name: 'predict', description: 'The topics most likely to come', options: [UNIT] },
    { type: SUB, name: 'weakspots', description: 'Your highest-risk sub-topics', options: [UNIT] },
    { type: SUB, name: 'connect', description: 'Connect this Discord account to your Study Desk', options: [{ type: STRING, name: 'code', description: 'The 6-digit code from Study Desk (Settings → Connect Discord)', required: true, min_length: 6, max_length: 6 }] },
    { type: SUB, name: 'link', description: 'Premium: get a code to set up Study Desk on your laptop' },
  ],
};
const globals = await api('GET', `/applications/${APP_ID}/commands`);
const had = globals.find((c) => c.name === 'study');
await api(had ? 'PATCH' : 'POST', `/applications/${APP_ID}/commands${had ? `/${had.id}` : ''}`, { type: 1, ...STUDY });
console.log('✓ /study (global: works in the server and in DMs with the bot)');

console.log('Done. The commands show up in Discord within a minute (restart Discord if not).');
