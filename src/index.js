import { getDiscordClient } from './discord.js';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import express from 'express';

const PREFIX = '!';

const slashCommands = [
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a personalized direct message to a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to send the DM to')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to send')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message to a specific channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send the message to')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to send')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send a message to the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to send')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s latency')
];

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function registerSlashCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
}

async function main() {
  console.log('Starting Discord bot...');
  
  try {
    const client = await getDiscordClient();
    
    client.on('ready', async () => {
      console.log(`Bot is online as ${client.user.tag}!`);
      await registerSlashCommands(client);
      console.log('Available commands (prefix ! or slash /):');
      console.log('  /send or !send @user <message> - Send a personalized DM');
      console.log('  /say or !say #channel <message> - Send to a channel');
      console.log('  /announce or !announce <message> - Send to current channel');
      console.log('  /ping - Check bot latency');
      console.log('  /help or !help - Show all commands');
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        switch (interaction.commandName) {
          case 'send':
            await handleSlashSendDM(interaction);
            break;
          case 'say':
            await handleSlashSayChannel(interaction);
            break;
          case 'announce':
            await handleSlashAnnounce(interaction);
            break;
          case 'ping':
            await handleSlashPing(interaction);
            break;
          case 'help':
            await handleSlashHelp(interaction);
            break;
        }
      } catch (error) {
        console.error('Error handling slash command:', error);
        const reply = { content: 'An error occurred while processing your command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    });

    client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.content.startsWith(PREFIX)) return;

      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // Ping command is available to everyone
      if (command === 'ping') {
        await handlePing(message);
        return;
      }

      // All other commands require admin
      if (!message.member || !isAdmin(message.member)) {
        await message.reply('You need Administrator permissions to use this bot.');
        return;
      }

      try {
        switch (command) {
          case 'send':
            await handleSendDM(message, args);
            break;
          case 'say':
            await handleSayChannel(message, args);
            break;
          case 'announce':
            await handleAnnounce(message, args);
            break;
          case 'help':
            await handleHelp(message);
            break;
          default:
            await message.reply(`Unknown command: \`${command}\`. Use \`!help\` or \`/help\` to see available commands.`);
        }
      } catch (error) {
        console.error('Error handling command:', error);
        await message.reply('An error occurred while processing your command.');
      }
    });

    console.log('Bot is now listening for commands...');
    
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

async function handleSlashSendDM(interaction) {
  const targetUser = interaction.options.getUser('user');
  const personalizedMessage = interaction.options.getString('message');

  try {
    await targetUser.send(personalizedMessage);
    await interaction.reply({ content: `Message sent to ${targetUser.tag}!`, ephemeral: true });
  } catch (error) {
    if (error.code === 50007) {
      await interaction.reply({ content: `Cannot send DM to ${targetUser.tag}. They may have DMs disabled.`, ephemeral: true });
    } else {
      throw error;
    }
  }
}

async function handleSlashSayChannel(interaction) {
  const targetChannel = interaction.options.getChannel('channel');
  const personalizedMessage = interaction.options.getString('message');

  try {
    await targetChannel.send(personalizedMessage);
    await interaction.reply({ content: `Message sent to ${targetChannel}!`, ephemeral: true });
  } catch (error) {
    console.error('Failed to send to channel:', error);
    await interaction.reply({ content: `Failed to send message to ${targetChannel}. Check bot permissions.`, ephemeral: true });
  }
}

async function handleSlashAnnounce(interaction) {
  const personalizedMessage = interaction.options.getString('message');
  await interaction.channel.send(personalizedMessage);
  await interaction.reply({ content: 'Message announced!', ephemeral: true });
}

async function handleSlashPing(interaction) {
  const ping = interaction.client.ws.ping;
  await interaction.reply(`🏓 Pong! Bot latency: **${ping}ms**`);
}

async function handleSlashHelp(interaction) {
  const helpMessage = `
**Discord Bot Commands**

**Slash Commands:**
\`/send user:<@user> message:<text>\` - Send a DM to a user
\`/say channel:<#channel> message:<text>\` - Send to a channel
\`/announce message:<text>\` - Send to current channel
\`/ping\` - Check bot latency
\`/help\` - Show this help

**Prefix Commands:**
\`!send @user <message>\` - Send a DM to a user
\`!say #channel <message>\` - Send to a channel
\`!announce <message>\` - Send to current channel
\`!ping\` - Check bot latency
\`!help\` - Show this help

**Tips:**
- Use Discord formatting (bold, italic, etc.)
- Mention users with @username for personalization
`;

  await interaction.reply({ content: helpMessage, ephemeral: true });
}

async function handleSendDM(message, args) {
  const targetUser = message.mentions.users.first();
  
  if (!targetUser) {
    await message.reply('Please mention a user to send a DM to. Usage: `!send @user Your message here`');
    return;
  }

  const personalizedMessage = args.slice(1).join(' ');
  
  if (!personalizedMessage) {
    await message.reply('Please provide a message. Usage: `!send @user Your message here`');
    return;
  }

  try {
    await targetUser.send(personalizedMessage);
    await message.reply(`Message sent to ${targetUser.tag}!`);
  } catch (error) {
    if (error.code === 50007) {
      await message.reply(`Cannot send DM to ${targetUser.tag}. They may have DMs disabled.`);
    } else {
      throw error;
    }
  }
}

async function handleSayChannel(message, args) {
  const targetChannel = message.mentions.channels.first();
  
  if (!targetChannel) {
    await message.reply('Please mention a channel. Usage: `!say #channel Your message here`');
    return;
  }

  const personalizedMessage = args.slice(1).join(' ');
  
  if (!personalizedMessage) {
    await message.reply('Please provide a message. Usage: `!say #channel Your message here`');
    return;
  }

  try {
    await targetChannel.send(personalizedMessage);
    await message.reply(`Message sent to ${targetChannel}!`);
  } catch (error) {
    console.error('Failed to send to channel:', error);
    await message.reply(`Failed to send message to ${targetChannel}. Check bot permissions.`);
  }
}

async function handleAnnounce(message, args) {
  const personalizedMessage = args.join(' ');
  
  if (!personalizedMessage) {
    await message.reply('Please provide a message. Usage: `!announce Your message here`');
    return;
  }

  await message.channel.send(personalizedMessage);
}

async function handlePing(message) {
  const ping = message.client.ws.ping;
  await message.reply(`🏓 Pong! Bot latency: **${ping}ms**`);
}

async function handleHelp(message) {
  const helpMessage = `
**Discord Bot Commands**

**Slash Commands:**
\`/send user:<@user> message:<text>\` - Send a DM to a user
\`/say channel:<#channel> message:<text>\` - Send to a channel
\`/announce message:<text>\` - Send to current channel
\`/ping\` - Check bot latency
\`/help\` - Show this help

**Prefix Commands:**
\`!send @user <message>\` - Send a DM to a user
\`!say #channel <message>\` - Send to a channel
\`!announce <message>\` - Send to current channel
\`!ping\` - Check bot latency
\`!help\` - Show this help

**Tips:**
- Use Discord formatting (bold, italic, etc.)
- Mention users with @username for personalization
`;

  await message.reply(helpMessage);
}

// Start Express server for uptime monitoring
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Discord Bot is running!');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

main();
