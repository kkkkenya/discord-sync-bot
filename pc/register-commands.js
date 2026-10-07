// Registers the slash commands on the server. Run once (and again after changing this list): npm run register
// Each command is created or updated by name, so commands not listed here are left alone.
// Discord sends them to the Interactions Endpoint URL, so they're answered by Vercel (lib/commands.js).
import { config } from 'dotenv';
config({ path: new URL('./.env', import.meta.url) });
const { api } = await import('../lib/discord.js');
const { APP_ID, GUILD_ID } = await import('../lib/config.js');

const SUB = 1, STRING = 3, INTEGER = 4;
const choices = (...names) => names.map((n) => ({ name: n, value: n }));

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
];

for (const c of COMMANDS) {
  await api('POST', `/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, { type: 1, ...c });
  console.log(`✓ /${c.name}`);
}
console.log('Done. The commands show up in Discord within a minute (restart Discord if not).');
