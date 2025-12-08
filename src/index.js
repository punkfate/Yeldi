import { getDiscordClient } from './discord.js';

const PREFIX = '!';

async function main() {
  console.log('Starting Discord bot...');
  
  try {
    const client = await getDiscordClient();
    
    client.on('ready', () => {
      console.log(`Bot is online as ${client.user.tag}!`);
      console.log('Available commands:');
      console.log('  !send @user <message> - Send a personalized DM to a user');
      console.log('  !say #channel <message> - Send a message to a specific channel');
      console.log('  !announce <message> - Send a message to the current channel');
      console.log('  !help - Show all available commands');
    });

    client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.content.startsWith(PREFIX)) return;

      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

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
            await message.reply(`Unknown command: \`${command}\`. Use \`!help\` to see available commands.`);
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

async function handleHelp(message) {
  const helpMessage = `
**Discord Bot Commands**

\`!send @user <message>\` - Send a personalized direct message to a user
  Example: \`!send @John Hello John, welcome to our server!\`

\`!say #channel <message>\` - Send a message to a specific channel
  Example: \`!say #general Hello everyone!\`

\`!announce <message>\` - Send a message to the current channel
  Example: \`!announce Important announcement here!\`

\`!help\` - Show this help message

**Tips:**
- You can use Discord formatting in your messages (bold, italic, etc.)
- Mention users with @username in your messages for personalization
`;

  await message.reply(helpMessage);
}

main();
