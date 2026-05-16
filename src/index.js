import { createServer } from 'http';
import { getDiscordClient } from './discord.js';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { addStaffRole, setTranscriptChannel } from './ticketConfig.js';
import {
  handleTicketsPanel,
  handleCreateTicket,
  handleClaimTicket,
  handleUnclaimTicket,
  handleCloseTicket
} from './tickets.js';

createServer((_, res) => res.end('ok')).on('error', () => {}).listen(5000, '0.0.0.0');

const PREFIX = '!';

const slashCommands = [
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Enviar un mensaje a un canal específico')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal donde enviar el mensaje')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('mensaje')
        .setDescription('El mensaje a enviar')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Comprobar la latencia del bot'),
  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Bloquear el canal actual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Desbloquear el canal actual')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostrar todos los comandos disponibles'),
  new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Comandos del sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Publicar el panel de tickets en este canal')),
  new SlashCommandBuilder()
    .setName('roleadd')
    .setDescription('Gestionar permisos de roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('staff')
        .setDescription('Agregar un rol de staff para gestionar tickets')
        .addRoleOption(option =>
          option.setName('rol')
            .setDescription('El rol a agregar como staff')
            .setRequired(true))),
  new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Configurar canal de transcripciones de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Elegir el canal donde se enviarán las transcripciones')
        .addChannelOption(option =>
          option.setName('canal')
            .setDescription('El canal para las transcripciones')
            .setRequired(true)))
];

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function registerSlashCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    console.log('Registrando comandos slash...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('¡Comandos slash registrados correctamente!');
  } catch (error) {
    console.error('Error al registrar los comandos slash:', error);
  }
}

async function main() {
  console.log('Iniciando bot de Discord...');

  try {
    const client = await getDiscordClient();

    client.on('ready', async () => {
      console.log(`¡Bot en línea como ${client.user.tag}!`);
      await registerSlashCommands(client);
      console.log('Comandos disponibles:');
      console.log('  /say #canal <mensaje>');
      console.log('  /ping');
      console.log('  /lock / /unlock');
      console.log('  /help');
      console.log('  /tickets panel');
      console.log('  /roleadd staff @rol');
      console.log('  /transcript channel #canal');
    });

    client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isButton()) {
          switch (interaction.customId) {
            case 'create_ticket':
              await handleCreateTicket(interaction);
              break;
            case 'claim_ticket':
              await handleClaimTicket(interaction);
              break;
            case 'unclaim_ticket':
              await handleUnclaimTicket(interaction);
              break;
            case 'close_ticket':
              await handleCloseTicket(interaction);
              break;
          }
          return;
        }

        if (!interaction.isChatInputCommand()) return;

        switch (interaction.commandName) {
          case 'say':
            await handleSlashSay(interaction);
            break;
          case 'ping':
            await handleSlashPing(interaction);
            break;
          case 'lock':
            await handleSlashLock(interaction);
            break;
          case 'unlock':
            await handleSlashUnlock(interaction);
            break;
          case 'help':
            await handleSlashHelp(interaction);
            break;
          case 'tickets':
            if (interaction.options.getSubcommand() === 'panel') {
              await handleTicketsPanel(interaction);
            }
            break;
          case 'roleadd':
            if (interaction.options.getSubcommand() === 'staff') {
              const role = interaction.options.getRole('rol');
              const added = addStaffRole(interaction.guild.id, role.id);
              if (added) {
                await interaction.reply({
                  content: `✅ ${role} ha sido agregado como rol de staff para los tickets.`,
                  ephemeral: true
                });
              } else {
                await interaction.reply({
                  content: `❌ ${role} ya es un rol de staff.`,
                  ephemeral: true
                });
              }
            }
            break;
          case 'transcript':
            if (interaction.options.getSubcommand() === 'channel') {
              const canal = interaction.options.getChannel('canal');
              setTranscriptChannel(interaction.guild.id, canal.id);
              await interaction.reply({
                content: `✅ Las transcripciones de tickets se enviarán a ${canal}.`,
                ephemeral: true
              });
            }
            break;
        }
      } catch (error) {
        console.error('Error al manejar la interacción:', error);
        const reply = { content: 'Ocurrió un error al procesar tu comando.', ephemeral: true };
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        } catch (e) {
          console.error('Error al enviar respuesta de error:', e);
        }
      }
    });

    client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      if (!message.content.startsWith(PREFIX)) return;

      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'ping') {
        await handlePing(message);
        return;
      }

      if (!message.member || !isAdmin(message.member)) {
        await message.reply('Necesitas permisos de Administrador para usar este bot.');
        return;
      }

      try {
        switch (command) {
          case 'say':
            await handleSay(message, args);
            break;
          case 'lock':
            await handleLock(message);
            break;
          case 'unlock':
            await handleUnlock(message);
            break;
          case 'help':
            await handleHelp(message);
            break;
          default:
            await message.reply(`Comando desconocido: \`${command}\`. Usa \`!help\` o \`/help\` para ver los comandos disponibles.`);
        }
      } catch (error) {
        console.error('Error al manejar el comando:', error);
        await message.reply('Ocurrió un error al procesar tu comando.');
      }
    });

    console.log('Bot escuchando comandos...');

  } catch (error) {
    console.error('Error al iniciar el bot:', error);
    process.exit(1);
  }
}

async function handleSlashSay(interaction) {
  const targetChannel = interaction.options.getChannel('canal');
  const mensaje = interaction.options.getString('mensaje');

  try {
    await targetChannel.send(mensaje);
    await interaction.reply({ content: `✅ Mensaje enviado a ${targetChannel}!`, ephemeral: true });
  } catch (error) {
    console.error('Error al enviar al canal:', error);
    await interaction.reply({ content: `❌ No se pudo enviar el mensaje a ${targetChannel}. Verifica los permisos del bot.`, ephemeral: true });
  }
}

async function handleSlashPing(interaction) {
  const ping = interaction.client.ws.ping;
  await interaction.reply(`🏓 ¡Pong! Latencia del bot: **${ping}ms**`);
}

async function handleSlashLock(interaction) {
  try {
    const channel = interaction.channel;
    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      { SendMessages: false }
    );
    await interaction.reply({ content: `🔒 ¡Canal bloqueado! Los usuarios no pueden hablar.`, ephemeral: true });
  } catch (error) {
    console.error('Error al bloquear el canal:', error);
    await interaction.reply({ content: '❌ No se pudo bloquear el canal. Verifica los permisos del bot.', ephemeral: true });
  }
}

async function handleSlashUnlock(interaction) {
  try {
    const channel = interaction.channel;
    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      { SendMessages: null }
    );
    await interaction.reply({ content: `🔓 ¡Canal desbloqueado! Los usuarios ya pueden hablar.`, ephemeral: true });
  } catch (error) {
    console.error('Error al desbloquear el canal:', error);
    await interaction.reply({ content: '❌ No se pudo desbloquear el canal. Verifica los permisos del bot.', ephemeral: true });
  }
}

async function handleSlashHelp(interaction) {
  const helpMessage = `
**🤖 Comandos del Bot**

**🎫 Sistema de Tickets:**
\`/tickets panel\` — Publicar el panel de tickets en este canal *(solo admins)*
\`/roleadd staff @rol\` — Agregar un rol de staff para tickets *(solo admins)*
\`/transcript channel #canal\` — Configurar canal de transcripciones *(solo admins)*

**💬 Comandos Generales:**
\`/say #canal <mensaje>\` — Enviar un mensaje a un canal *(solo admins)*
\`/ping\` — Comprobar la latencia del bot
\`/lock\` — Bloquear el canal actual *(solo admins)*
\`/unlock\` — Desbloquear el canal actual *(solo admins)*
\`/help\` — Mostrar esta ayuda

**Prefijo \`!\`:**
\`!say\` • \`!ping\` • \`!lock\` • \`!unlock\` • \`!help\`
`;

  await interaction.reply({ content: helpMessage, ephemeral: true });
}

async function handleSay(message, args) {
  const targetChannel = message.mentions.channels.first();

  if (!targetChannel) {
    await message.reply('Por favor menciona un canal. Uso: `!say #canal Tu mensaje aquí`');
    return;
  }

  const texto = args.slice(1).join(' ');

  if (!texto) {
    await message.reply('Por favor proporciona un mensaje. Uso: `!say #canal Tu mensaje aquí`');
    return;
  }

  try {
    await targetChannel.send(texto);
    await message.reply(`✅ Mensaje enviado a ${targetChannel}!`);
  } catch (error) {
    console.error('Error al enviar al canal:', error);
    await message.reply(`❌ No se pudo enviar el mensaje. Verifica los permisos del bot.`);
  }
}

async function handlePing(message) {
  const ping = message.client.ws.ping;
  await message.reply(`🏓 ¡Pong! Latencia del bot: **${ping}ms**`);
}

async function handleLock(message) {
  try {
    const channel = message.channel;
    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      { SendMessages: false }
    );
    await message.reply('🔒 ¡Canal bloqueado! Los usuarios no pueden hablar.');
  } catch (error) {
    console.error('Error al bloquear el canal:', error);
    await message.reply('❌ No se pudo bloquear el canal. Verifica los permisos del bot.');
  }
}

async function handleUnlock(message) {
  try {
    const channel = message.channel;
    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      { SendMessages: null }
    );
    await message.reply('🔓 ¡Canal desbloqueado! Los usuarios ya pueden hablar.');
  } catch (error) {
    console.error('Error al desbloquear el canal:', error);
    await message.reply('❌ No se pudo desbloquear el canal. Verifica los permisos del bot.');
  }
}

async function handleHelp(message) {
  const helpMessage = `
**🤖 Comandos del Bot**

**🎫 Sistema de Tickets:**
\`/tickets panel\` — Panel de tickets *(solo admins)*
\`/roleadd staff @rol\` — Agregar staff *(solo admins)*
\`/transcript channel #canal\` — Canal de transcripciones *(solo admins)*

**💬 Generales:**
\`!say #canal <mensaje>\` • \`!ping\` • \`!lock\` • \`!unlock\` • \`!help\`
`;

  await message.reply(helpMessage);
}

main();
