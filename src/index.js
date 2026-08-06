import { createServer } from 'http';
import { getDiscordClient } from './discord.js';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { addStaffRole, setTranscriptChannel } from './ticketConfig.js';
import {
  handleTicketsPanel,
  handleTicketsPanel2,
  handleCategorySelect,
  handleCategorySelect2,
  handleReportUserSelect,
  handleModalReport,
  handleModalGeneral,
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
        .setDescription('Publicar el panel de tickets en este canal'))
    .addSubcommand(sub =>
      sub.setName('panel2')
        .setDescription('Publicar el panel de tickets 2 en este canal')),
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
            .setRequired(true))),
  new SlashCommandBuilder()
    .setName('hola')
    .setDescription('El bot te saluda'),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Muestra información del servidor'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes del canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(option =>
      option.setName('cantidad')
        .setDescription('Número de mensajes a borrar (máx 100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un miembro del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('miembro')
        .setDescription('Miembro a expulsar')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón de la expulsión')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un miembro del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('miembro')
        .setDescription('Miembro a banear')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón del baneo')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario por su ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID del usuario a desbanear')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia a un miembro del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('miembro')
        .setDescription('Miembro a silenciar')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón del silencio')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Quita el silencio a un miembro')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('miembro')
        .setDescription('Miembro al que quitar el silencio')
        .setRequired(true)),
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

        if (interaction.isStringSelectMenu()) {
          if (interaction.customId === 'ticket_category') {
            await handleCategorySelect(interaction);
          } else if (interaction.customId === 'ticket_category_2') {
            await handleCategorySelect2(interaction);
          } else if (interaction.customId === 'report_user_select') {
            await handleReportUserSelect(interaction);
          }
          return;
        }

        if (interaction.isUserSelectMenu()) {
          if (interaction.customId === 'report_user_select') {
            await handleReportUserSelect(interaction);
          }
          return;
        }

        if (interaction.isModalSubmit()) {
          if (interaction.customId.startsWith('modal_ticket_report_')) {
            await handleModalReport(interaction);
          } else if (interaction.customId === 'modal_ticket_general') {
            await handleModalGeneral(interaction);
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
            } else if (interaction.options.getSubcommand() === 'panel2') {
              await handleTicketsPanel2(interaction);
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
          case 'hola':
            await interaction.reply(`👋 ¡Hola, ${interaction.user}!`);
            break;
          case 'info':
            await handleSlashInfo(interaction);
            break;
          case 'clear':
            await handleSlashClear(interaction);
            break;
          case 'kick':
            await handleSlashKick(interaction);
            break;
          case 'ban':
            await handleSlashBan(interaction);
            break;
          case 'unban':
            await handleSlashUnban(interaction);
            break;
          case 'mute':
            await handleSlashMute(interaction);
            break;
          case 'unmute':
            await handleSlashUnmute(interaction);
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

      if (command === 'hola') {
        await message.reply(`👋 ¡Hola, ${message.author}!`);
        return;
      }

      if (command === 'info') {
        await handleInfoMsg(message);
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
          case 'clear':
            await handleClearMsg(message, args);
            break;
          case 'kick':
            await handleKickMsg(message, args);
            break;
          case 'ban':
            await handleBanMsg(message, args);
            break;
          case 'unban':
            await handleUnbanMsg(message, args);
            break;
          case 'mute':
            await handleMuteMsg(message, args);
            break;
          case 'unmute':
            await handleUnmuteMsg(message, args);
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
\`/tickets panel\` — Publicar el panel de tickets *(solo admins)*
\`/roleadd staff @rol\` — Agregar rol de staff *(solo admins)*
\`/transcript channel #canal\` — Canal de transcripciones *(solo admins)*

**🛡️ Moderación:**
\`/kick @user [razón]\` • \`/ban @user [razón]\` • \`/unban <ID>\`
\`/mute @user [razón]\` • \`/unmute @user\` • \`/clear [n]\`

**💬 Generales:**
\`/hola\` • \`/info\` • \`/ping\`
\`/say #canal <mensaje>\` • \`/lock\` • \`/unlock\` • \`/help\`

**Prefijo \`!\`:**
\`!hola\` • \`!info\` • \`!ping\`
\`!kick\` • \`!ban\` • \`!unban\` • \`!mute\` • \`!unmute\` • \`!clear\`
\`!say\` • \`!lock\` • \`!unlock\` • \`!help\`
`;

  await interaction.reply({ content: helpMessage, ephemeral: true });
}

// ── Slash handlers nuevos ────────────────────────────────

async function handleSlashInfo(interaction) {
  const guild = interaction.guild;
  const { EmbedBuilder } = await import('discord.js');
  const embed = new EmbedBuilder()
    .setTitle(`📊 Info de ${guild.name}`)
    .setColor(0x5865f2)
    .addFields(
      { name: '👥 Miembros', value: `${guild.memberCount}`, inline: true },
      { name: '💬 Canales', value: `${guild.channels.cache.size}`, inline: true },
      { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }
    );
  if (guild.iconURL()) embed.setThumbnail(guild.iconURL());
  await interaction.reply({ embeds: [embed] });
}

async function handleSlashClear(interaction) {
  const cantidad = interaction.options.getInteger('cantidad') ?? 5;
  await interaction.deferReply({ ephemeral: true });
  const deleted = await interaction.channel.bulkDelete(cantidad, true);
  await interaction.editReply(`🗑️ Se borraron **${deleted.size}** mensajes.`);
}

async function handleSlashKick(interaction) {
  const miembro = interaction.options.getMember('miembro');
  const razon = interaction.options.getString('razon') ?? 'Sin razón especificada';
  await miembro.kick(razon);
  await interaction.reply({ content: `👢 **${miembro.user.tag}** ha sido expulsado. Razón: ${razon}`, ephemeral: true });
}

async function handleSlashBan(interaction) {
  const miembro = interaction.options.getMember('miembro');
  const razon = interaction.options.getString('razon') ?? 'Sin razón especificada';
  await miembro.ban({ reason: razon });
  await interaction.reply({ content: `🔨 **${miembro.user.tag}** ha sido baneado. Razón: ${razon}`, ephemeral: true });
}

async function handleSlashUnban(interaction) {
  const id = interaction.options.getString('id');
  try {
    await interaction.guild.members.unban(id);
    await interaction.reply({ content: `✅ Usuario con ID **${id}** desbaneado.`, ephemeral: true });
  } catch {
    await interaction.reply({ content: '❌ No se encontró ese usuario en la lista de baneados.', ephemeral: true });
  }
}

async function handleSlashMute(interaction) {
  const miembro = interaction.options.getMember('miembro');
  const razon = interaction.options.getString('razon') ?? 'Sin razón especificada';
  let role = interaction.guild.roles.cache.find(r => r.name === 'Muted');
  if (!role) {
    role = await interaction.guild.roles.create({ name: 'Muted', permissions: [] });
    for (const channel of interaction.guild.channels.cache.values()) {
      await channel.permissionOverwrites.edit(role, { SendMessages: false, Speak: false }).catch(() => {});
    }
  }
  await miembro.roles.add(role, razon);
  await interaction.reply({ content: `🔇 **${miembro.user.tag}** ha sido silenciado. Razón: ${razon}`, ephemeral: true });
}

async function handleSlashUnmute(interaction) {
  const miembro = interaction.options.getMember('miembro');
  const role = interaction.guild.roles.cache.find(r => r.name === 'Muted');
  if (role && miembro.roles.cache.has(role.id)) {
    await miembro.roles.remove(role);
    await interaction.reply({ content: `🔊 **${miembro.user.tag}** ya puede hablar de nuevo.`, ephemeral: true });
  } else {
    await interaction.reply({ content: '❌ Ese miembro no está silenciado.', ephemeral: true });
  }
}

// ── Prefijo handlers nuevos ──────────────────────────────

async function handleInfoMsg(message) {
  const guild = message.guild;
  const { EmbedBuilder } = await import('discord.js');
  const embed = new EmbedBuilder()
    .setTitle(`📊 Info de ${guild.name}`)
    .setColor(0x5865f2)
    .addFields(
      { name: '👥 Miembros', value: `${guild.memberCount}`, inline: true },
      { name: '💬 Canales', value: `${guild.channels.cache.size}`, inline: true },
      { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }
    );
  if (guild.iconURL()) embed.setThumbnail(guild.iconURL());
  await message.reply({ embeds: [embed] });
}

async function handleClearMsg(message, args) {
  const cantidad = parseInt(args[0]) || 5;
  const deleted = await message.channel.bulkDelete(Math.min(cantidad + 1, 101), true);
  const msg = await message.channel.send(`🗑️ Se borraron **${deleted.size - 1}** mensajes.`);
  setTimeout(() => msg.delete().catch(() => {}), 4000);
}

async function handleKickMsg(message, args) {
  const miembro = message.mentions.members.first();
  if (!miembro) { await message.reply('Menciona a un miembro. Uso: `!kick @usuario [razón]`'); return; }
  const razon = args.slice(1).join(' ') || 'Sin razón especificada';
  await miembro.kick(razon);
  await message.reply(`👢 **${miembro.user.tag}** ha sido expulsado. Razón: ${razon}`);
}

async function handleBanMsg(message, args) {
  const miembro = message.mentions.members.first();
  if (!miembro) { await message.reply('Menciona a un miembro. Uso: `!ban @usuario [razón]`'); return; }
  const razon = args.slice(1).join(' ') || 'Sin razón especificada';
  await miembro.ban({ reason: razon });
  await message.reply(`🔨 **${miembro.user.tag}** ha sido baneado. Razón: ${razon}`);
}

async function handleUnbanMsg(message, args) {
  const id = args[0];
  if (!id) { await message.reply('Proporciona la ID del usuario. Uso: `!unban <ID>`'); return; }
  try {
    await message.guild.members.unban(id);
    await message.reply(`✅ Usuario con ID **${id}** desbaneado.`);
  } catch {
    await message.reply('❌ No se encontró ese usuario en la lista de baneados.');
  }
}

async function handleMuteMsg(message, args) {
  const miembro = message.mentions.members.first();
  if (!miembro) { await message.reply('Menciona a un miembro. Uso: `!mute @usuario [razón]`'); return; }
  const razon = args.slice(1).join(' ') || 'Sin razón especificada';
  let role = message.guild.roles.cache.find(r => r.name === 'Muted');
  if (!role) {
    role = await message.guild.roles.create({ name: 'Muted', permissions: [] });
    for (const channel of message.guild.channels.cache.values()) {
      await channel.permissionOverwrites.edit(role, { SendMessages: false, Speak: false }).catch(() => {});
    }
  }
  await miembro.roles.add(role, razon);
  await message.reply(`🔇 **${miembro.user.tag}** ha sido silenciado. Razón: ${razon}`);
}

async function handleUnmuteMsg(message, args) {
  const miembro = message.mentions.members.first();
  if (!miembro) { await message.reply('Menciona a un miembro. Uso: `!unmute @usuario`'); return; }
  const role = message.guild.roles.cache.find(r => r.name === 'Muted');
  if (role && miembro.roles.cache.has(role.id)) {
    await miembro.roles.remove(role);
    await message.reply(`🔊 **${miembro.user.tag}** ya puede hablar de nuevo.`);
  } else {
    await message.reply('❌ Ese miembro no está silenciado.');
  }
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
