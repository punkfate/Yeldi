import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
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

export async function handleTicketsPanel(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle('🎫 Sistema de Tickets')
    .setDescription(
      '¿Necesitas ayuda? Haz clic en el botón de abajo para abrir un ticket de soporte.\n\nSe creará un canal privado exclusivamente para ti.'
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Sistema de Soporte' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel('Abrir Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary)
  );

  try {
    const channel = interaction.channel ?? await interaction.client.channels.fetch(interaction.channelId);
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ ¡Panel de tickets publicado!' });
  } catch (error) {
    console.error('Error al enviar el panel de tickets:', error);
    await interaction.editReply({ content: '❌ No se pudo publicar el panel. Verifica que el bot tenga permisos en este canal.' });
  }
}

export async function handleCreateTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const member = interaction.member;
  const guildConfig = getGuildConfig(guild.id);
  const ticketNumber = nextTicketNumber(guild.id);
  const channelName = `ticket-${ticketNumber.toString().padStart(4, '0')}-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  const existingTicket = Object.entries(guildConfig.tickets).find(
    ([, t]) => t.userId === member.user.id
  );
  if (existingTicket) {
    const existing = guild.channels.cache.get(existingTicket[0]);
    if (existing) {
      await interaction.editReply({ content: `❌ Ya tienes un ticket abierto: ${existing}` });
      return;
    }
  }

  const permissionOverwrites = [
    {
      id: guild.roles.everyone,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  for (const roleId of guildConfig.staffRoles) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  try {
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: interaction.channel.parentId || null,
      permissionOverwrites,
    });

    createTicket(guild.id, ticketChannel.id, member.user.id, ticketNumber);

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${ticketNumber.toString().padStart(4, '0')}`)
      .setDescription(
        `¡Bienvenido ${member}! Tu ticket ha sido creado.\n\nDescribe tu problema y un miembro del staff te atenderá en breve.`
      )
      .addFields(
        { name: '👤 Abierto por', value: `${member}`, inline: true },
        { name: '📋 Estado', value: '🟢 Abierto', inline: true },
        { name: '🛡️ Reclamado por', value: 'Nadie', inline: true }
      )
      .setColor(0x57f287)
      .setTimestamp();

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
    await interaction.editReply({ content: `✅ Tu ticket ha sido creado: ${ticketChannel}` });
  } catch (error) {
    console.error('Error al crear el ticket:', error);
    await interaction.editReply({ content: '❌ No se pudo crear el ticket. Verifica los permisos del bot.' });
  }
}

function buildTicketEmbed(ticket, ticketNumber, openerId, claimedMention) {
  const isClaimed = !!claimedMention;
  return new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticketNumber.toString().padStart(4, '0')}`)
    .setDescription(
      `¡Bienvenido <@${openerId}>! Tu ticket ha sido creado.\n\nDescribe tu problema y un miembro del staff te atenderá en breve.`
    )
    .addFields(
      { name: '👤 Abierto por', value: `<@${openerId}>`, inline: true },
      { name: '📋 Estado', value: isClaimed ? '🟡 Reclamado' : '🟢 Abierto', inline: true },
      { name: '🛡️ Reclamado por', value: claimedMention || 'Nadie', inline: true }
    )
    .setColor(isClaimed ? 0xfee75c : 0x57f287)
    .setTimestamp();
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
  const isStaff =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    guildConfig.staffRoles.some((r) => member.roles.cache.has(r));

  if (!isStaff) {
    await interaction.reply({ content: '❌ Solo el staff puede reclamar tickets.', ephemeral: true });
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

  const safeName = channel.name.replace(/^reclamado-/, 'ticket-').replace(/^ticket-/, 'reclamado-');
  channel.setName(safeName).catch(err => console.error('Error al renombrar canal:', err));
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
  const isStaff =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    guildConfig.staffRoles.some((r) => member.roles.cache.has(r));

  if (!isStaff) {
    await interaction.reply({ content: '❌ Solo el staff puede liberar tickets.', ephemeral: true });
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

  const newName = channel.name.replace(/^reclamado-/, 'ticket-');
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
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    guildConfig.staffRoles.some((r) => member.roles.cache.has(r)) ||
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
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();

    const transcriptLines = sorted.map(m => {
      const time = new Date(m.createdTimestamp).toLocaleString('es-ES');
      const content = m.content || (m.embeds.length ? '[Embed]' : '[Sin contenido]');
      return `[${time}] ${m.author.tag}: ${content}`;
    });

    const transcriptChannelId = getTranscriptChannel(guild.id);
    if (transcriptChannelId) {
      const transcriptChannel = guild.channels.cache.get(transcriptChannelId);
      if (transcriptChannel) {
        const ticketNum = ticket.ticketNumber.toString().padStart(4, '0');
        const transcriptEmbed = new EmbedBuilder()
          .setTitle(`📄 Transcripción — Ticket #${ticketNum}`)
          .addFields(
            { name: '👤 Abierto por', value: `<@${ticket.userId}>`, inline: true },
            { name: '🔒 Cerrado por', value: member.user.tag, inline: true },
            { name: '🛡️ Reclamado por', value: ticket.claimedByTag || 'Nadie', inline: true },
            { name: '📅 Fecha de cierre', value: new Date().toLocaleString('es-ES'), inline: false }
          )
          .setColor(0x5865f2)
          .setTimestamp();

        const transcriptText = transcriptLines.join('\n').slice(0, 1900);
        await transcriptChannel.send({ embeds: [transcriptEmbed] });
        await transcriptChannel.send({
          content: `\`\`\`\n${transcriptText || 'Sin mensajes.'}\n\`\`\``
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
