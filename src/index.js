import { createServer } from 'http';
import { getDiscordClient } from './discord.js';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import {
  addStaffRole,
  addManagerRole,
  addTwitchModRole,
  setTranscriptChannel
} from './ticketConfig.js';
import { renderTranscriptHtml } from './transcripts.js';
import {
  handleTicketsPanel,
  handleCategorySelect,
  handleReportUserSelect,
  handleModalReport,
  handleModalGeneral,
  handleClaimTicket,
  handleUnclaimTicket,
  handleCloseTicket,
  reconcileTicketPanels
} from './tickets.js';

const transcriptServer = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const match = requestUrl.pathname.match(/^\/transcripts\/([a-zA-Z0-9_-]+)$/);

  if (match) {
    const html = renderTranscriptHtml(match[1]);

    if (html) {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8'
      });
      response.end(html);
      return;
    }

    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8'
    });
    response.end('Transcript no encontrado');
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8'
  });

  response.end('Jester Bot activo');
});

transcriptServer.on('error', error => {
  console.error('Error en el servidor de transcripts:', error.message);
});

transcriptServer.listen(5000, '0.0.0.0');

const PREFIX = '!';

const slashCommands = [

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Enviar un mensaje a un canal específico')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('El canal donde enviar el mensaje')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('mensaje')
        .setDescription('El mensaje a enviar')
        .setRequired(true)
    ),

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
      sub
        .setName('panel')
        .setDescription('Publicar o actualizar el panel de tickets de Jester\'s Club')
    ),

  new SlashCommandBuilder()
    .setName('roleadd')
    .setDescription('Gestionar permisos de roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub =>
      sub
        .setName('staff')
        .setDescription('Agregar un rol de staff para gestionar tickets')
        .addRoleOption(option =>
          option
            .setName('rol')
            .setDescription('El rol a agregar como staff')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('manager')
        .setDescription('Agregar un rol de manager para soporte de administración')
        .addRoleOption(option =>
          option
            .setName('rol')
            .setDescription('El rol cuyos miembros podrán ver soporte de administración')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('twitch')
        .setDescription('Agregar un rol de moderador para soporte de Twitch')
        .addRoleOption(option =>
          option
            .setName('rol')
            .setDescription('El rol cuyos miembros podrán ver soporte de Twitch')
            .setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Configurar canal de transcripciones de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription('Elegir el canal donde se enviarán las transcripciones')
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('El canal para las transcripciones')
            .setRequired(true)
        )
    ),

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
      option
        .setName('cantidad')
        .setDescription('Número de mensajes a borrar (máx 100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un miembro del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('miembro')
        .setDescription('Miembro a expulsar')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('razon')
        .setDescription('Razón de la expulsión')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un miembro del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('miembro')
        .setDescription('Miembro a banear')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('razon')
        .setDescription('Razón del baneo')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario por su ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('id')
        .setDescription('ID del usuario a desbanear')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('razon')
        .setDescription('Razón del desbaneo')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia a un miembro del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('miembro')
        .setDescription('Miembro a silenciar')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('razon')
        .setDescription('Razón del silencio')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Quita el silencio a un miembro')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('miembro')
        .setDescription('Miembro al que quitar el silencio')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('razon')
        .setDescription('Razón para quitar el silencio')
        .setRequired(false)
    )

];

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}


/* =========================================================
   REGISTRO DE SLASH COMMANDS
   ========================================================= */

async function registerSlashCommands(client) {

  if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN no está configurado.');
    return;
  }

  const rest = new REST({ version: '10' })
    .setToken(process.env.DISCORD_BOT_TOKEN);

  const commandBody = slashCommands.map(command => command.toJSON());

  console.log(`🔄 Preparando ${commandBody.length} comandos slash...`);

  try {
    let previousGlobalCommandCount;

    try {
      const previousGlobalCommands = await rest.get(
        Routes.applicationCommands(client.user.id)
      );
      previousGlobalCommandCount = previousGlobalCommands.length;
    } catch (error) {
      console.error(
        'No se pudo consultar el registro global de comandos:',
        error.message
      );
    }

    try {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: [] }
      );

      console.log(
        previousGlobalCommandCount === undefined
          ? '🧹 Registro global de comandos vaciado; usaré solo comandos por servidor.'
          : `🧹 Registro global vaciado (${previousGlobalCommandCount} comando(s) anterior(es)); usaré solo comandos por servidor.`
      );
    } catch (error) {
      console.error(
        'No se pudieron eliminar los comandos globales antiguos; continuaré con la sincronización por servidor.',
        error.message
      );
    }

    if (client.guilds.cache.size === 0) {
      console.log('⚠️ El bot no está en ningún servidor.');
      return;
    }

    for (const guild of client.guilds.cache.values()) {

      console.log(
        `📌 Registrando comandos en: ${guild.name} (${guild.id})`
      );

      const result = await rest.put(
        Routes.applicationGuildCommands(
          client.user.id,
          guild.id
        ),
        {
          body: commandBody
        }
      );

      console.log(
        `✅ ${result.length} comandos registrados en ${guild.name}`
      );
    }

    console.log('');
    console.log('======================================');
    console.log('🎉 SLASH COMMANDS REGISTRADOS');
    console.log(`📊 Total: ${commandBody.length}`);
    console.log('======================================');
    console.log('');

  } catch (error) {

    console.error('');
    console.error('======================================');
    console.error('❌ ERROR REGISTRANDO SLASH COMMANDS');
    console.error('======================================');
    console.error(error);
    console.error('');

  }
}


/* =========================================================
   MAIN
   ========================================================= */

async function main() {

  console.log('Iniciando bot de Discord...');

  try {

    const client = await getDiscordClient();

    client.once('ready', async () => {

      try {

        if (client.user.username !== 'Jester Bot') {

          await client.user.setUsername('Jester Bot')
            .catch(error => {
              console.error(
                'No se pudo cambiar el nombre del bot:',
                error.message
              );
            });

        }

        client.user.setPresence({
          activities: [
            {
              name: "Jester's Club",
              type: 3
            }
          ],
          status: 'online'
        });

        console.log(
          `¡Jester Bot en línea como ${client.user.tag}!`
        );

        console.log(
          `🏠 Servidores detectados: ${client.guilds.cache.size}`
        );

        await registerSlashCommands(client);
        reconcileTicketPanels(client).catch(error => {
          console.error('Error al reconciliar paneles de tickets:', error);
        });

        console.log('Comandos disponibles:');
        console.log('  /say #canal <mensaje>');
        console.log('  /ping');
        console.log('  /lock');
        console.log('  /unlock');
        console.log('  /help');
        console.log('  /tickets panel');
        console.log('  /roleadd staff @rol');
        console.log('  /roleadd manager @rol');
        console.log('  /roleadd twitch @rol');
        console.log('  /transcript channel #canal');
        console.log('  /hola');
        console.log('  /info');
        console.log('  /clear');
        console.log('  /kick');
        console.log('  /ban');
        console.log('  /unban');
        console.log('  /mute');
        console.log('  /unmute');

      } catch (error) {

        console.error(
          '❌ Error durante la inicialización:',
          error
        );

      }

    });


    /* =====================================================
       INTERACCIONES
       ===================================================== */

    client.on('interactionCreate', async interaction => {

      try {

        /* BOTONES */

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


        /* MENÚS DE TEXTO */

        if (interaction.isStringSelectMenu()) {

          if (
            interaction.customId === 'report_user_select'
          ) {

            await handleReportUserSelect(interaction);

          } else {

            await handleCategorySelect(interaction);

          }

          return;
        }


        /* MENÚ DE USUARIOS */

        if (interaction.isUserSelectMenu()) {

          if (
            interaction.customId === 'report_user_select'
          ) {

            await handleReportUserSelect(interaction);

          }

          return;
        }


        /* MODALES */

        if (interaction.isModalSubmit()) {

          if (
            interaction.customId.startsWith(
              'modal_ticket_report_'
            )
          ) {

            await handleModalReport(interaction);

          } else if (
            interaction.customId === 'modal_ticket_general'
          ) {

            await handleModalGeneral(interaction);

          }

          return;
        }


        /* SLASH COMMANDS */

        if (!interaction.isChatInputCommand()) {
          return;
        }


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

            if (
              interaction.options.getSubcommand() === 'panel'
            ) {

              await handleTicketsPanel(interaction);

            }

            break;


          case 'roleadd':

            if (
              interaction.options.getSubcommand() === 'staff'
            ) {

              const role =
                interaction.options.getRole('rol');

              const added =
                addStaffRole(
                  interaction.guild.id,
                  role.id
                );

              if (added) {

                await interaction.reply({
                  content:
                    `✅ ${role} ha sido agregado como rol de staff para los tickets.`,
                  ephemeral: true
                });

              } else {

                await interaction.reply({
                  content:
                    `❌ ${role} ya es un rol de staff.`,
                  ephemeral: true
                });

              }

            }

            else if (
              interaction.options.getSubcommand() === 'manager'
            ) {

              const role =
                interaction.options.getRole('rol');

              const added =
                addManagerRole(
                  interaction.guild.id,
                  role.id
                );

              if (added) {

                await interaction.reply({
                  content:
                    `✅ ${role} ha sido agregado como rol de manager para Soporte de Administración.`,
                  ephemeral: true
                });

              } else {

                await interaction.reply({
                  content:
                    `❌ ${role} ya es un rol de manager.`,
                  ephemeral: true
                });

              }

            }

            else if (
              interaction.options.getSubcommand() === 'twitch'
            ) {

              const role =
                interaction.options.getRole('rol');

              const added =
                addTwitchModRole(
                  interaction.guild.id,
                  role.id
                );

              if (added) {

                await interaction.reply({
                  content:
                    `✅ ${role} ha sido agregado como rol de moderador para Soporte de Twitch.`,
                  ephemeral: true
                });

              } else {

                await interaction.reply({
                  content:
                    `❌ ${role} ya es un rol de moderador de Twitch.`,
                  ephemeral: true
                });

              }

            }

            break;


          case 'transcript':

            if (
              interaction.options.getSubcommand() === 'channel'
            ) {

              const canal =
                interaction.options.getChannel('canal');

              setTranscriptChannel(
                interaction.guild.id,
                canal.id
              );

              await interaction.reply({
                content:
                  `✅ Las transcripciones de tickets se enviarán a ${canal}.`,
                ephemeral: true
              });

            }

            break;


          case 'hola':

            await interaction.reply(
              `👋 ¡Hola, ${interaction.user}!`
            );

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

        console.error(
          'Error al manejar la interacción:',
          error
        );

        const reply = {
          content:
            'Ocurrió un error al procesar tu comando.',
          ephemeral: true
        };

        try {

          if (
            interaction.replied ||
            interaction.deferred
          ) {

            await interaction.followUp(reply);

          } else {

            await interaction.reply(reply);

          }

        } catch (e) {

          console.error(
            'Error al enviar respuesta de error:',
            e
          );

        }

      }

    });


    /* =====================================================
       COMANDOS CON PREFIJO !
       ===================================================== */

    client.on('messageCreate', async message => {

      if (message.author.bot) return;

      if (!message.content.startsWith(PREFIX)) {
        return;
      }

      const args =
        message.content
          .slice(PREFIX.length)
          .trim()
          .match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+/g)
          ?.map(value => value.replace(/^(['"])([\s\S]*)\1$/, '$2'))
        || [];

      const command =
        (args.shift() || '').toLowerCase();

      if (!command) return;


      if (command === 'ping') {

        await handlePing(message);
        return;

      }


      if (command === 'hola') {

        await message.reply(
          `👋 ¡Hola, ${message.author}!`
        );

        return;

      }


      if (command === 'info') {

        await handleInfoMsg(message);
        return;

      }


      if (
        !message.member ||
        !isAdmin(message.member)
      ) {

        await message.reply(
          'Necesitas permisos de Administrador para usar este bot.'
        );

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

            await message.reply(
              `Comando desconocido: \`${command}\`. Usa \`!help\` o \`/help\` para ver los comandos disponibles.`
            );

        }

      } catch (error) {

        console.error(
          'Error al manejar el comando:',
          error
        );

        await message.reply(
          'Ocurrió un error al procesar el comando.'
        );

      }

    });


    console.log('Bot escuchando comandos...');

  } catch (error) {

    console.error(
      'Error al iniciar el bot:',
      error
    );

    process.exit(1);

  }

}


/* =========================================================
   SLASH HANDLERS
   ========================================================= */

async function handleSlashSay(interaction) {

  if (!isAdmin(interaction.member)) {

    await interaction.reply({
      content:
        '❌ Solo los administradores pueden usar `/say`.',
      ephemeral: true
    });

    return;
  }

  const targetChannel =
    interaction.options.getChannel('canal');

  const mensaje =
    interaction.options.getString('mensaje');

  try {

    await targetChannel.send(mensaje);

    await interaction.reply({
      content:
        `✅ Mensaje enviado a ${targetChannel}!`,
      ephemeral: true
    });

  } catch (error) {

    console.error(
      'Error al enviar al canal:',
      error
    );

    await interaction.reply({
      content:
        `❌ No se pudo enviar el mensaje a ${targetChannel}. Verifica los permisos del bot.`,
      ephemeral: true
    });

  }

}


async function handleSlashPing(interaction) {

  const ping =
    interaction.client.ws.ping;

  await interaction.reply(
    `🏓 ¡Pong! Latencia del bot: **${ping}ms**`
  );

}


async function handleSlashLock(interaction) {

  try {

    const channel =
      interaction.channel;

    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    await interaction.reply({
      content:
        '🔒 ¡Canal bloqueado! Los usuarios no pueden hablar.',
      ephemeral: true
    });

  } catch (error) {

    console.error(
      'Error al bloquear el canal:',
      error
    );

    await interaction.reply({
      content:
        '❌ No se pudo bloquear el canal. Verifica los permisos del bot.',
      ephemeral: true
    });

  }

}


async function handleSlashUnlock(interaction) {

  try {

    const channel =
      interaction.channel;

    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    await interaction.reply({
      content:
        '🔓 ¡Canal desbloqueado! Los usuarios ya pueden hablar.',
      ephemeral: true
    });

  } catch (error) {

    console.error(
      'Error al desbloquear el canal:',
      error
    );

    await interaction.reply({
      content:
        '❌ No se pudo desbloquear el canal. Verifica los permisos del bot.',
      ephemeral: true
    });

  }

}


async function buildHelpEmbed() {
  const { EmbedBuilder } = await import('discord.js');
  return new EmbedBuilder()
    .setTitle('🤖 Comandos del Bot')
    .setColor(0x5865f2)
    .addFields(
      {
        name: '🎫 Sistema de Tickets',
        value: [
          '`/tickets panel` — Publicar el panel (administradores)',
          '`/roleadd staff @rol`, `/roleadd manager @rol`, `/roleadd twitch @rol`',
          '`/transcript channel #canal` — Elegir canal de transcripciones'
        ].join('\n')
      },
      {
        name: '🛡️ Moderación',
        value: [
          '`/kick`, `/ban`, `/mute`, `/unmute` — miembro y razón opcional',
          '`/unban` — ID y razón opcional; los comandos `!` reciben primero el usuario/ID y luego la razón.',
          'Si no indicas razón, se usará “Razón no especificada”.'
        ].join('\n')
      },
      {
        name: '💬 Generales',
        value: '`/hola`, `/info`, `/ping`, `/say`, `/lock`, `/unlock`, `/help`'
      },
      {
        name: '⌨️ Comandos con prefijo !',
        value: [
          '`!hola`, `!info`, `!ping`, `!say`, `!lock`, `!unlock`, `!clear`',
          '`!kick`, `!ban`, `!unban`, `!mute`, `!unmute`, `!help`',
          'En `!kick`, `!ban`, `!mute` y `!unmute` puedes usar mención, nombre exacto o ID; pon entre comillas los nombres con espacios. Añade la razón después del usuario. `!unban` usa ID y acepta razón.'
        ].join('\n')
      }
    )
    .setFooter({ text: 'Los comandos de moderación requieren permisos de administrador.' });
}


async function handleSlashHelp(interaction) {
  await interaction.reply({
    embeds: [await buildHelpEmbed()],
    ephemeral: true
  });
}


/* =========================================================
   NUEVOS SLASH HANDLERS
   ========================================================= */

async function handleSlashInfo(interaction) {

  const guild =
    interaction.guild;

  const { EmbedBuilder } =
    await import('discord.js');

  const embed =
    new EmbedBuilder()
      .setTitle(`📊 Info de ${guild.name}`)
      .setColor(0x5865f2)
      .addFields(
        {
          name: '👥 Miembros',
          value: `${guild.memberCount}`,
          inline: true
        },
        {
          name: '💬 Canales',
          value: `${guild.channels.cache.size}`,
          inline: true
        },
        {
          name: '🎭 Roles',
          value: `${guild.roles.cache.size}`,
          inline: true
        }
      );

  if (guild.iconURL()) {
    embed.setThumbnail(guild.iconURL());
  }

  await interaction.reply({
    embeds: [embed]
  });

}


async function handleSlashClear(interaction) {

  const cantidad =
    interaction.options.getInteger('cantidad') ?? 5;

  await interaction.deferReply({
    ephemeral: true
  });

  const deleted =
    await interaction.channel.bulkDelete(
      cantidad,
      true
    );

  await interaction.editReply(
    `🗑️ Se borraron **${deleted.size}** mensajes.`
  );

}


async function handleSlashKick(interaction) {

  const miembro =
    interaction.options.getMember('miembro');

  const razon =
    interaction.options.getString('razon')?.trim()
    || 'Razón no especificada';

  await miembro.kick(razon);

  await interaction.reply({
    content:
      `👢 <@${miembro.id}> ha sido expulsado. Razón: ${razon}`,
    ephemeral: true
  });

}


async function handleSlashBan(interaction) {

  const miembro =
    interaction.options.getMember('miembro');

  const razon =
    interaction.options.getString('razon')?.trim()
    || 'Razón no especificada';

  await miembro.ban({
    reason: razon
  });

  await interaction.reply({
    content:
      `🔨 <@${miembro.id}> ha sido baneado. Razón: ${razon}`,
    ephemeral: true
  });

}


async function handleSlashUnban(interaction) {

  const id =
    interaction.options.getString('id');
  const razon =
    interaction.options.getString('razon')?.trim()
    || 'Razón no especificada';

  try {

    await interaction.guild.members.unban(id, razon);

    await interaction.reply({
      content:
        `✅ <@${id}> ha sido desbaneado. Razón: ${razon}`,
      ephemeral: true
    });

  } catch {

    await interaction.reply({
      content:
        '❌ No se encontró ese usuario en la lista de baneados.',
      ephemeral: true
    });

  }

}


async function handleSlashMute(interaction) {

  const miembro =
    interaction.options.getMember('miembro');

  const razon =
    interaction.options.getString('razon')?.trim()
    || 'Razón no especificada';

  let role =
    interaction.guild.roles.cache.find(
      r => r.name === 'Muted'
    );

  if (!role) {

    role =
      await interaction.guild.roles.create({
        name: 'Muted',
        permissions: []
      });

    for (
      const channel
      of interaction.guild.channels.cache.values()
    ) {

      await channel.permissionOverwrites
        .edit(
          role,
          {
            SendMessages: false,
            Speak: false
          }
        )
        .catch(() => {});

    }

  }

  await miembro.roles.add(
    role,
    razon
  );

  await interaction.reply({
    content:
      `🔇 <@${miembro.id}> ha sido silenciado. Razón: ${razon}`,
    ephemeral: true
  });

}


async function handleSlashUnmute(interaction) {

  const miembro =
    interaction.options.getMember('miembro');
  const razon =
    interaction.options.getString('razon')?.trim()
    || 'Razón no especificada';

  const role =
    interaction.guild.roles.cache.find(
      r => r.name === 'Muted'
    );

  if (
    role &&
    miembro.roles.cache.has(role.id)
  ) {

    await miembro.roles.remove(role, razon);

    await interaction.reply({
      content:
        `🔊 <@${miembro.id}> ya puede hablar de nuevo. Razón: ${razon}`,
      ephemeral: true
    });

  } else {

    await interaction.reply({
      content:
        `❌ <@${miembro.id}> no está silenciado.`,
      ephemeral: true
    });

  }

}


/* =========================================================
   PREFIX HANDLERS
   ========================================================= */

async function handleInfoMsg(message) {

  const guild =
    message.guild;

  const { EmbedBuilder } =
    await import('discord.js');

  const embed =
    new EmbedBuilder()
      .setTitle(`📊 Info de ${guild.name}`)
      .setColor(0x5865f2)
      .addFields(
        {
          name: '👥 Miembros',
          value: `${guild.memberCount}`,
          inline: true
        },
        {
          name: '💬 Canales',
          value: `${guild.channels.cache.size}`,
          inline: true
        },
        {
          name: '🎭 Roles',
          value: `${guild.roles.cache.size}`,
          inline: true
        }
      );

  if (guild.iconURL()) {
    embed.setThumbnail(guild.iconURL());
  }

  await message.reply({
    embeds: [embed]
  });

}


async function handleClearMsg(message, args) {

  const cantidad =
    parseInt(args[0]) || 5;

  const deleted =
    await message.channel.bulkDelete(
      Math.min(cantidad + 1, 101),
      true
    );

  const msg =
    await message.channel.send(
      `🗑️ Se borraron **${deleted.size - 1}** mensajes.`
    );

  setTimeout(
    () => msg.delete().catch(() => {}),
    4000
  );

}


async function resolvePrefixMember(message, value) {
  if (!message.guild || !value) {
    return { member: null, matches: [] };
  }

  const input = String(value).trim();
  const mentionId = input.match(/^<@!?(\d+)>$/)?.[1];
  const userId = mentionId || (/^\d+$/.test(input) ? input : null);

  if (userId) {
    const member =
      message.guild.members.cache.get(userId)
      || await message.guild.members.fetch(userId).catch(() => null);
    return { member: member || null, matches: [] };
  }

  const query = input.replace(/^@/, '').trim().toLocaleLowerCase();
  const isExactMatch = member => [
    member.user.username,
    member.displayName,
    member.user.globalName,
    member.user.tag
  ].some(name => name?.toLocaleLowerCase() === query);

  let matches = [...message.guild.members.cache.values()].filter(isExactMatch);

  if (!matches.length && typeof message.guild.members.search === 'function') {
    try {
      const searchResults = await message.guild.members.search({
        query: input.replace(/^@/, '').trim(),
        limit: 25
      });
      matches = [...searchResults.values()].filter(isExactMatch);
    } catch (error) {
      console.warn('No se pudo buscar al miembro por nombre:', error.message);
    }
  }

  const uniqueMatches = [...new Map(matches.map(member => [member.id, member])).values()];
  return {
    member: uniqueMatches.length === 1 ? uniqueMatches[0] : null,
    matches: uniqueMatches
  };
}

async function getPrefixModerationTarget(message, args, command) {
  const result = await resolvePrefixMember(message, args[0]);
  if (result.member) {
    return {
      member: result.member,
      reason: args.slice(1).join(' ').trim() || 'Razón no especificada'
    };
  }

  if (result.matches.length > 1) {
    const choices = result.matches
      .slice(0, 5)
      .map(member => `${member.user.tag} (${member.id})`)
      .join(', ');
    await message.reply(
      `Encontré varios miembros con ese nombre. Usa su ID o una mención: ${choices}`
    );
    return null;
  }

  await message.reply(
    `No encontré ese miembro. Uso: \`!${command} usuario|ID|@mención ["razón"]\``
  );
  return null;
}


async function handleKickMsg(message, args) {

  const target = await getPrefixModerationTarget(message, args, 'kick');
  if (!target) return;
  const { member: miembro, reason: razon } = target;

  await miembro.kick(razon);

  await message.reply(
    `👢 <@${miembro.id}> ha sido expulsado. Razón: ${razon}`
  );

}


async function handleBanMsg(message, args) {

  const target = await getPrefixModerationTarget(message, args, 'ban');
  if (!target) return;
  const { member: miembro, reason: razon } = target;

  await miembro.ban({
    reason: razon
  });

  await message.reply(
    `🔨 <@${miembro.id}> ha sido baneado. Razón: ${razon}`
  );

}


async function handleUnbanMsg(message, args) {

  const id =
    args[0]?.match(/^<@!?(\d+)>$/)?.[1] || args[0];

  if (!id) {

    await message.reply(
      'Proporciona la ID del usuario. Uso: `!unban <ID>`'
    );

    return;
  }

  try {

    const razon = args.slice(1).join(' ').trim() || 'Razón no especificada';
    await message.guild.members.unban(id, razon);

    await message.reply(
      `✅ <@${id}> ha sido desbaneado. Razón: ${razon}`
    );

  } catch {

    await message.reply(
      '❌ No se encontró ese usuario en la lista de baneados.'
    );

  }

}


async function handleMuteMsg(message, args) {

  const target = await getPrefixModerationTarget(message, args, 'mute');
  if (!target) return;
  const { member: miembro, reason: razon } = target;

  let role =
    message.guild.roles.cache.find(
      r => r.name === 'Muted'
    );

  if (!role) {

    role =
      await message.guild.roles.create({
        name: 'Muted',
        permissions: []
      });

    for (
      const channel
      of message.guild.channels.cache.values()
    ) {

      await channel.permissionOverwrites
        .edit(
          role,
          {
            SendMessages: false,
            Speak: false
          }
        )
        .catch(() => {});

    }

  }

  await miembro.roles.add(role, razon);

  await message.reply(
    `🔇 <@${miembro.id}> ha sido silenciado. Razón: ${razon}`
  );

}


async function handleUnmuteMsg(message, args) {

  const target = await getPrefixModerationTarget(message, args, 'unmute');
  if (!target) return;
  const { member: miembro, reason: razon } = target;

  const role =
    message.guild.roles.cache.find(
      r => r.name === 'Muted'
    );

  if (
    role &&
    miembro.roles.cache.has(role.id)
  ) {

    await miembro.roles.remove(role, razon);

    await message.reply(
      `🔊 <@${miembro.id}> ya puede hablar de nuevo. Razón: ${razon}`
    );

  } else {

    await message.reply(
      `❌ <@${miembro.id}> no está silenciado.`
    );

  }

}


async function handleSay(message, args) {

  const targetChannel =
    message.mentions.channels.first();

  if (!targetChannel) {

    await message.reply(
      'Por favor menciona un canal. Uso: `!say #canal Tu mensaje aquí`'
    );

    return;
  }

  const texto =
    args.slice(1).join(' ');

  if (!texto) {

    await message.reply(
      'Por favor proporciona un mensaje. Uso: `!say #canal Tu mensaje aquí`'
    );

    return;
  }

  try {

    await targetChannel.send(texto);

    await message.reply(
      `✅ Mensaje enviado a ${targetChannel}!`
    );

  } catch (error) {

    console.error(
      'Error al enviar al canal:',
      error
    );

    await message.reply(
      '❌ No se pudo enviar el mensaje. Verifica los permisos del bot.'
    );

  }

}


async function handlePing(message) {

  const ping =
    message.client.ws.ping;

  await message.reply(
    `🏓 ¡Pong! Latencia del bot: **${ping}ms**`
  );

}


async function handleLock(message) {

  try {

    const channel =
      message.channel;

    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    await message.reply(
      '🔒 ¡Canal bloqueado! Los usuarios no pueden hablar.'
    );

  } catch (error) {

    console.error(
      'Error al bloquear el canal:',
      error
    );

    await message.reply(
      '❌ No se pudo bloquear el canal. Verifica los permisos del bot.'
    );

  }

}


async function handleUnlock(message) {

  try {

    const channel =
      message.channel;

    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    await message.reply(
      '🔓 ¡Canal desbloqueado! Los usuarios ya pueden hablar.'
    );

  } catch (error) {

    console.error(
      'Error al desbloquear el canal:',
      error
    );

    await message.reply(
      '❌ No se pudo desbloquear el canal. Verifica los permisos del bot.'
    );

  }

}


async function handleHelp(message) {
  await message.reply({ embeds: [await buildHelpEmbed()] });
}


main();