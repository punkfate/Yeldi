import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  OverwriteType
} from 'discord.js';
import {
  getGuildConfig,
  createTicket,
  getTicket,
  claimTicket,
  unclaimTicket,
  deleteTicket,
  nextTicketNumber,
  getTranscriptChannel
} from './ticketConfig.js';
import { getTranscriptUrl, saveTranscript } from './transcripts.js';

const CATEGORY_LABELS = {
  report: '🚨 Reporte',
  general: '❓ Duda General',
  admin_support: '🛠️ Soporte de Administración'
};

const CATEGORY_COLORS = {
  report: 0xed4245,
  general: 0x5865f2,
  admin_support: 0x9b59b6
};

export async function handleTicketsPanel(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle("🎫 Sistema de Tickets — Jester's Club")
    .setDescription(
      "Bienvenido al sistema oficial de soporte de **Jester's Club**.\nSelecciona la categoría correspondiente a tu consulta en el menú de abajo."
    )
    .addFields(
      {
        name: '🚨 Reportes',
        value: 'Para informar sobre usuarios que hayan incumplido las normas del servidor. Incluye todos los detalles y evidencias posibles.',
        inline: false
      },
      {
        name: '❓ Dudas Generales',
        value: 'Para preguntas, problemas o ayuda general relacionada con Jester\'s Club.',
        inline: false
      },
      {
        name: '🛠️ Soporte de Administración',
        value: 'Para asuntos que necesitan la atención de administradores o managers. Estos tickets son privados y solo los verá el usuario que lo abre, los administradores y los managers.',
        inline: false
      },
      {
        name: '📋 Normas del Sistema de Tickets',
        value: [
          '> • Sé respetuoso con el staff y los demás usuarios en todo momento.',
          '> • No abras tickets innecesarios, de broma o spam.',
          '> • Abre **un solo ticket** por asunto, no duplicados.',
          '> • Proporciona información clara y detallada en tu ticket.',
          '> • Si tu ticket es un reporte, incluye evidencia si es posible.',
          '> • Espera la respuesta del staff, no insistas de forma repetitiva.'
        ].join('\n')
      }
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Usa el menú desplegable para abrir tu ticket' })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('📂 Selecciona una categoría...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Reportes')
        .setDescription('Reporta a un usuario que haya infringido las normas del servidor')
        .setEmoji('🚨')
        .setValue('report'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Dudas Generales')
        .setDescription('¿Tienes una pregunta o necesitas ayuda? Abre un ticket aquí')
        .setEmoji('❓')
        .setValue('general'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Soporte de Administración')
        .setDescription('Contacta con los administradores o managers de Jester\'s Club')
        .setEmoji('🛠️')
        .setValue('admin_support')
    );

  const row = new ActionRowBuilder().addComponents(select);

  try {
    const channel = interaction.channel ?? await interaction.client.channels.fetch(interaction.channelId);

    // Reemplaza únicamente los paneles de tickets publicados por este bot
    // en el canal actual para que nunca queden categorías antiguas visibles.
    const recentMessages = await channel.messages.fetch({ limit: 100 });
    const oldPanels = recentMessages.filter(message =>
      message.author.id === interaction.client.user.id &&
      message.components.some(componentRow =>
        componentRow.components?.some(component => component.customId === 'ticket_category')
      )
    );

    await Promise.all([...oldPanels.values()].map(message => message.delete().catch(() => {})));
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ ¡Panel de tickets publicado!' });
  } catch (error) {
    console.error('Error al enviar el panel de tickets:', error);
    await interaction.editReply({ content: '❌ No se pudo publicar el panel. Verifica los permisos del bot en este canal.' });
  }
}

function hasOpenTicket(interaction) {
  const config = getGuildConfig(interaction.guild.id);
  const existing = Object.entries(config.tickets).find(([, t]) => t.userId === interaction.user.id);
  if (!existing) return null;
  const channel = interaction.guild.channels.cache.get(existing[0]);
  return channel || null;
}

export async function handleCategorySelect(interaction) {
  const selectedCategory = interaction.values[0];
  const categoryAliases = {
    administration: 'admin_support',
    admin: 'admin_support',
    soporte_administracion: 'admin_support',
    soporte_administrativo: 'admin_support'
  };
  const category = categoryAliases[selectedCategory] || selectedCategory;

  // La creación del canal y la lectura/escritura de configuración pueden
  // tardar más que la ventana de respuesta de Discord. Confirmamos primero
  // la categoría administrativa para que la interacción no expire.
  if (category === 'admin_support') {
    await interaction.deferReply({ ephemeral: true });
  }

  const openChannel = hasOpenTicket(interaction);
  if (openChannel) {
    const response = { content: `❌ Ya tienes un ticket abierto: ${openChannel}`, components: [] };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(response);
    } else {
      await interaction.reply({ ...response, ephemeral: true });
    }
    return;
  }

  if (!['report', 'general', 'admin_support'].includes(category)) {
    await interaction.reply({
      content: '❌ Esta categoría pertenece a un panel antiguo. Pide a un administrador que publique de nuevo `/tickets panel`.',
      ephemeral: true
    });
    return;
  }

  if (category === 'report') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('report_user_select')
      .setPlaceholder('Busca y selecciona al usuario a reportar...')
      .setMinValues(1)
      .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(userSelect);

    await interaction.reply({
      content: '**🚨 Reporte — Paso 1/2:** Selecciona al usuario que quieres reportar:',
      components: [row],
      ephemeral: true
    });
    return;
  }

  if (category === 'general') {
    const modal = new ModalBuilder()
      .setCustomId('modal_ticket_general')
      .setTitle('❓ Duda General');

    const reasonInput = new TextInputBuilder()
      .setCustomId('general_reason')
      .setLabel('¿Cuál es el motivo de tu ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe tu duda o problema con el mayor detalle posible.')
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
    return;
  }

  if (category === 'admin_support') {
    await openTicket(interaction, 'admin_support', {});
  }
}

export async function handleReportUserSelect(interaction) {
  const selectedUserId = interaction.values[0];
  const selectedUser = interaction.guild.members.cache.get(selectedUserId)?.user
    || await interaction.guild.members.fetch(selectedUserId).then(m => m.user).catch(() => null);

  const displayName = selectedUser
    ? `${selectedUser.username} (${selectedUserId})`
    : selectedUserId;

  const modal = new ModalBuilder()
    .setCustomId(`modal_ticket_report_${selectedUserId}`)
    .setTitle('🚨 Reporte — Paso 2/2');

  const userDisplay = new TextInputBuilder()
    .setCustomId('reported_display')
    .setLabel('Usuario a reportar')
    .setStyle(TextInputStyle.Short)
    .setValue(displayName)
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId('report_reason')
    .setLabel('Razón del reporte')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Explica detalladamente el motivo del reporte. Si tienes evidencia, menciónala.')
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(userDisplay),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

export async function handleModalReport(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const reportedUserId = interaction.customId.slice('modal_ticket_report_'.length);
  const reportedDisplay = interaction.fields.getTextInputValue('reported_display');
  const reportReason = interaction.fields.getTextInputValue('report_reason');

  const reportedUser = reportedUserId
    ? `<@${reportedUserId}> — ${reportedDisplay}`
    : reportedDisplay;

  await openTicket(interaction, 'report', { reportedUser, reportReason });
}

export async function handleModalGeneral(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const generalReason = interaction.fields.getTextInputValue('general_reason');
  await openTicket(interaction, 'general', { generalReason });
}

function getManagerRoles(guild, guildConfig) {
  const configuredRoleIds = new Set(guildConfig.managerRoles || []);
  return guild.roles.cache.filter(role =>
    configuredRoleIds.has(role.id) ||
    ['manager', 'managers'].includes(role.name.trim().toLowerCase())
  );
}

function canManageTicket(member, guildConfig, ticket) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  if (ticket.category === 'admin_support') {
    return getManagerRoles(member.guild, guildConfig).some(role => member.roles.cache.has(role.id));
  }

  return guildConfig.staffRoles.some(roleId => member.roles.cache.has(roleId));
}

async function openTicket(interaction, category, fields) {
  const guild = interaction.guild;
  const member = interaction.member;
  const guildConfig = getGuildConfig(guild.id);
  const ticketNumber = nextTicketNumber(guild.id);

  const prefixes = { report: 'reporte', general: 'duda', admin_support: 'soporte-admin' };
  const prefix = prefixes[category] || 'ticket';
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'usuario';
  const channelName = `${prefix}-${ticketNumber.toString().padStart(4, '0')}-${safeName}`;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: member.user.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  const visibleRoles = category === 'admin_support'
    ? getManagerRoles(guild, guildConfig)
    : guildConfig.staffRoles
        .map(roleId => guild.roles.cache.get(roleId))
        .filter(Boolean);

  for (const role of visibleRoles) {
    permissionOverwrites.push({
      id: role.id,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  try {
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: interaction.channel?.parentId || null,
      permissionOverwrites
    });

    createTicket(guild.id, ticketChannel.id, member.user.id, ticketNumber, category, fields);

    const embed = buildNewTicketEmbed(ticketNumber, category, member, fields);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_ticket')
        .setLabel('Reclamar')
        .setEmoji('✋')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('unclaim_ticket')
        .setLabel('Liberar')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Cerrar Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({ content: `${member}`, embeds: [embed], components: [row] });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `✅ Tu ticket ha sido creado: ${ticketChannel}`, components: [] });
    } else {
      await interaction.followUp({ content: `✅ Tu ticket ha sido creado: ${ticketChannel}`, ephemeral: true });
    }
  } catch (error) {
    console.error('Error al crear el ticket:', error);
    const msg = { content: '❌ No se pudo crear el ticket. Verifica los permisos del bot.', components: [] };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.followUp({ ...msg, ephemeral: true });
      }
    } catch {}
  }
}

function buildNewTicketEmbed(ticketNumber, category, member, fields) {
  const num = ticketNumber.toString().padStart(4, '0');
  const label = CATEGORY_LABELS[category] || '🎫 Ticket';
  const color = CATEGORY_COLORS[category] || 0x5865f2;

  const descriptions = {
    report: `¡Hola ${member}! Tu reporte ha sido recibido.\nEl staff lo revisará lo antes posible.`,
    general: `¡Hola ${member}! Tu ticket ha sido creado.\nDescribe tu situación y el staff te atenderá pronto.`,
    admin_support: `¡Hola ${member}! Este canal es para asuntos que requieren la atención de los administradores o managers de Jester's Club.`
  };

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${num} — ${label}`)
    .setDescription(descriptions[category] || `¡Hola ${member}! Tu ticket ha sido creado.`)
    .addFields(
      { name: '👤 Abierto por', value: `${member}`, inline: true },
      { name: '📋 Estado', value: '🟢 Abierto', inline: true },
      { name: '🛡️ Reclamado por', value: 'Nadie', inline: true }
    )
    .setColor(color)
    .setTimestamp();

  if (category === 'report') {
    embed.addFields(
      { name: '\u200b', value: '**— Detalles del Reporte —**', inline: false },
      { name: '🎯 Usuario reportado', value: fields.reportedUser || '—', inline: false },
      { name: '📝 Razón del reporte', value: fields.reportReason || '—', inline: false }
    );
  }

  if (category === 'general') {
    embed.addFields(
      { name: '\u200b', value: '**— Detalles —**', inline: false },
      { name: '📝 Motivo del ticket', value: fields.generalReason || '—', inline: false }
    );
  }

  if (category === 'admin_support') {
    embed.addFields(
      { name: '\u200b', value: '**— Soporte de Administración —**', inline: false },
      { name: '🔐 Acceso', value: 'Solo administradores y managers pueden ver y gestionar este ticket.', inline: false }
    );
  }

  return embed;
}

function buildTicketEmbed(ticket, ticketNumber, openerId, claimedMention) {
  const isClaimed = !!claimedMention;
  const num = ticketNumber.toString().padStart(4, '0');
  const label = CATEGORY_LABELS[ticket.category] || '🎫 Ticket';
  const color = isClaimed ? 0xfee75c : (CATEGORY_COLORS[ticket.category] || 0x5865f2);

  const descriptions = {
    report: `Tu reporte ha sido recibido.\nEl staff lo revisará lo antes posible.`,
    general: `Tu ticket ha sido creado.\nEl staff te atenderá pronto.`,
    admin_support: `Este ticket es para asuntos que requieren la atención de los administradores o managers de Jester's Club.`
  };

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${num} — ${label}`)
    .setDescription(descriptions[ticket.category] || 'Ticket abierto.')
    .addFields(
      { name: '👤 Abierto por', value: `<@${openerId}>`, inline: true },
      { name: '📋 Estado', value: isClaimed ? '🟡 Reclamado' : '🟢 Abierto', inline: true },
      { name: '🛡️ Reclamado por', value: claimedMention || 'Nadie', inline: true }
    )
    .setColor(color)
    .setTimestamp();

  if (ticket.category === 'report' && ticket.fields) {
    embed.addFields(
      { name: '\u200b', value: '**— Detalles del Reporte —**', inline: false },
      { name: '🎯 Usuario reportado', value: ticket.fields.reportedUser || '—', inline: false },
      { name: '📝 Razón del reporte', value: ticket.fields.reportReason || '—', inline: false }
    );
  }

  if (ticket.category === 'general' && ticket.fields) {
    embed.addFields(
      { name: '\u200b', value: '**— Detalles —**', inline: false },
      { name: '📝 Motivo del ticket', value: ticket.fields.generalReason || '—', inline: false }
    );
  }

  if (ticket.category === 'admin_support') {
    embed.addFields(
      { name: '\u200b', value: '**— Soporte de Administración —**', inline: false },
      { name: '🔐 Acceso', value: 'Solo administradores y managers pueden ver y gestionar este ticket.', inline: false }
    );
  }

  return embed;
}

export async function handleClaimTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const channel = interaction.channel;
  const ticket = getTicket(guild.id, channel.id);

  if (!ticket) {
    await interaction.reply({ content: '❌ Este no es un canal de ticket.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(guild.id);
  const isStaff = canManageTicket(member, guildConfig, ticket);

  if (!isStaff) {
    await interaction.reply({ content: '❌ No tienes permiso para reclamar este ticket.', ephemeral: true });
    return;
  }

  if (ticket.claimedBy === member.user.id) {
    await interaction.reply({ content: '❌ Ya reclamaste este ticket.', ephemeral: true });
    return;
  }

  claimTicket(guild.id, channel.id, member.user.id, member.user.tag);

  const updatedEmbed = buildTicketEmbed(ticket, ticket.ticketNumber, ticket.userId, `${member}`);
  await interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });

  const notifEmbed = new EmbedBuilder()
    .setDescription(`✋ ${member} ha **reclamado** este ticket.`)
    .setColor(0xfee75c)
    .setTimestamp();
  await channel.send({ embeds: [notifEmbed] });

  const baseName = channel.name.replace(/^reclamado-/, '');
  channel.setName(`reclamado-${baseName}`).catch(err => console.error('Error al renombrar canal:', err));
}

export async function handleUnclaimTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const channel = interaction.channel;
  const ticket = getTicket(guild.id, channel.id);

  if (!ticket) {
    await interaction.reply({ content: '❌ Este no es un canal de ticket.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(guild.id);
  const isStaff = canManageTicket(member, guildConfig, ticket);

  if (!isStaff) {
    await interaction.reply({ content: '❌ No tienes permiso para liberar este ticket.', ephemeral: true });
    return;
  }

  if (!ticket.claimedBy) {
    await interaction.reply({ content: '❌ Este ticket no está reclamado.', ephemeral: true });
    return;
  }

  unclaimTicket(guild.id, channel.id);

  const updatedEmbed = buildTicketEmbed(ticket, ticket.ticketNumber, ticket.userId, null);
  await interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });

  const notifEmbed = new EmbedBuilder()
    .setDescription(`🔓 ${member} ha **liberado** este ticket.`)
    .setColor(0x5865f2)
    .setTimestamp();
  await channel.send({ embeds: [notifEmbed] });

  const newName = channel.name.replace(/^reclamado-/, '');
  channel.setName(newName).catch(err => console.error('Error al renombrar canal:', err));
}

export async function handleCloseTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const channel = interaction.channel;
  const ticket = getTicket(guild.id, channel.id);

  if (!ticket) {
    await interaction.reply({ content: '❌ Este no es un canal de ticket.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(guild.id);
  const isStaff =
    canManageTicket(member, guildConfig, ticket) ||
    ticket.userId === member.user.id;

  if (!isStaff) {
    await interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
    return;
  }

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒 Cerrando Ticket')
    .setDescription(`${member} ha cerrado este ticket.\nEl canal se eliminará en 5 segundos.`)
    .setColor(0xed4245)
    .setTimestamp();

  await interaction.reply({ embeds: [closeEmbed] });

  deleteTicket(guild.id, channel.id);

  try {
    const allMessages = [];
    let before;

    // Discord devuelve como máximo 100 mensajes por petición; recorremos
    // todas las páginas para que el transcript no pierda mensajes antiguos.
    while (true) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(before ? { before } : {})
      });

      if (!batch.size) break;
      allMessages.push(...batch.values());
      if (batch.size < 100) break;
      before = batch.last().id;
    }

    const sorted = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const transcriptLines = sorted.map(message => {
      const time = new Date(message.createdTimestamp).toLocaleString('es-ES');
      const content =
        message.content ||
        (message.embeds.length ? '[Embed]' : '[Sin contenido]');
      const attachments = message.attachments.size
        ? ` [Adjuntos: ${[...message.attachments.values()].map(file => file.url).join(', ')}]`
        : '';

      return `[${time}] ${message.author.tag}: ${content}${attachments}`;
    });

        const transcriptId = saveTranscript({
          guildId: guild.id,
          channelId: channel.id,
          ticketNumber: ticket.ticketNumber,
          categoryLabel: CATEGORY_LABELS[ticket.category] || '🎫 Ticket',
          openerTag: `<@${ticket.userId}>`,
          closedByTag: member.user.tag,
          claimedByTag: ticket.claimedByTag || 'Nadie',
          closedAt: new Date().toLocaleString('es-ES'),
          messages: sorted.map(message => ({
            authorTag: message.author.tag,
            timestamp: new Date(message.createdTimestamp).toLocaleString('es-ES'),
            content: message.content || (
              message.embeds.length
                ? message.embeds.map(embed =>
                    [embed.title, embed.description].filter(Boolean).join(' — ')
                  ).filter(Boolean).join('\n') || '[Embed]'
                : '[Sin contenido]'
            ),
            avatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 64 }),
            attachments: [...message.attachments.values()].map(file => file.url)
          }))
        });

    const transcriptChannelId = getTranscriptChannel(guild.id);
    if (transcriptChannelId) {
      const transcriptChannel = guild.channels.cache.get(transcriptChannelId);
      if (transcriptChannel) {
        const ticketNum = ticket.ticketNumber.toString().padStart(4, '0');
        const label = CATEGORY_LABELS[ticket.category] || '🎫 Ticket';
        const transcriptEmbed = new EmbedBuilder()
          .setTitle(`📄 Transcripción — Ticket #${ticketNum} — ${label}`)
          .addFields(
            { name: '👤 Abierto por', value: `<@${ticket.userId}>`, inline: true },
            { name: '🔒 Cerrado por', value: member.user.tag, inline: true },
            { name: '🛡️ Reclamado por', value: ticket.claimedByTag || 'Nadie', inline: true },
            { name: '📅 Fecha de cierre', value: new Date().toLocaleString('es-ES'), inline: false }
          )
          .setColor(0x5865f2)
          .setTimestamp();

        const transcriptChunks = [];
        let currentChunk = '';

        for (const line of (transcriptLines.length ? transcriptLines : ['Sin mensajes.'])) {
          if (line.length > 1900) {
            if (currentChunk) {
              transcriptChunks.push(currentChunk);
              currentChunk = '';
            }
            for (let index = 0; index < line.length; index += 1900) {
              transcriptChunks.push(line.slice(index, index + 1900));
            }
          } else if (currentChunk && currentChunk.length + line.length + 1 > 1900) {
            transcriptChunks.push(currentChunk);
            currentChunk = line;
          } else {
            currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
          }
        }

        if (currentChunk) transcriptChunks.push(currentChunk);

        let firstTranscriptMessage;
        for (const chunk of transcriptChunks) {
          const transcriptMessage = await transcriptChannel.send({
            content: `\`\`\`\n${chunk}\n\`\`\``
          });
          if (!firstTranscriptMessage) firstTranscriptMessage = transcriptMessage;
        }

        const transcriptButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Abrir transcript web')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Link)
            .setURL(
              getTranscriptUrl(transcriptId) ||
              firstTranscriptMessage?.url ||
              transcriptChannel.url
            )
        );

        await transcriptChannel.send({
          embeds: [transcriptEmbed],
          components: [transcriptButton]
        });
      }
    }
  } catch (err) {
    console.error('Error al generar transcripción:', err);
  }

  setTimeout(async () => {
    try {
      await channel.delete(`Ticket cerrado por ${member.user.tag}`);
    } catch (err) {
      console.error('Error al eliminar el canal del ticket:', err);
    }
  }, 5000);
}
