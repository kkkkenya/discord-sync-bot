// Finds the channels and roles the bot needs (config.NAMES), creating any that are missing.
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { NAMES } from '../../lib/config.js';

const TOPICS = {
  dailyChannel: 'One practice problem a day from real KU past papers. Tap an answer to keep your streak. /daily on for pings, /streak, /leaderboard.',
  digestChannel: 'Every Sunday: the new notes, past papers and books added to the library that week. Search any time with /find resource.',
  groupsChannel: 'Study groups and build squads. Start one with /group create, find one with /find group.',
  botLog: 'Staff only. Upload reports, files too big for Discord, and bot errors.',
};

export async function ensureSetup(guild, log = console.log) {
  const channels = await guild.channels.fetch();
  const roles = await guild.roles.fetch();
  const out = { channels: {}, roles: {} };

  for (const key of ['dailyChannel', 'digestChannel', 'groupsChannel', 'botLog']) {
    let ch = channels.find((c) => c?.name === NAMES[key] && c.type === ChannelType.GuildText);
    if (!ch) {
      ch = await guild.channels.create({
        name: NAMES[key], type: ChannelType.GuildText, topic: TOPICS[key],
        // bot-log is hidden from everyone except admins (and the bot); the rest are public but read-mostly
        permissionOverwrites: key === 'botLog'
          ? [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }]
          : key === 'digestChannel'
            ? [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
            : [],
      });
      log(`Created #${NAMES[key]}`);
    }
    out.channels[key] = ch;
  }

  for (const key of ['dailyRole', 'streak7', 'streak30']) {
    let role = roles.find((r) => r.name === NAMES[key]);
    if (!role) {
      role = await guild.roles.create({ name: NAMES[key], mentionable: key === 'dailyRole', hoist: false, reason: 'Engineering Study Hub bot' });
      log(`Created role ${NAMES[key]}`);
    }
    out.roles[key] = role;
  }
  return out;
}
