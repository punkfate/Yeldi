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
  nextTicketNumber
} from './ticketConfig.js';

export async function handleTicketsPanel(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Support Tickets')
    .setDescription(
      'Need help? Click the button below to open a support ticket.\n\nA private channel will be created just for you.'
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Support Ticket System' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel('Open Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ Ticket panel posted!', ephemeral: true });
}

export async function handleCreateTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const guildConfig = getGuildConfig(guild.id);
  const ticketNumber = nextTicketNumber(guild.id);
  const channelName = `ticket-${ticketNumber.toString().padStart(4, '0')}-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  await interaction.deferReply({ ephemeral: true });

  const existingTicket = Object.entries(guildConfig.tickets).find(
    ([, t]) => t.userId === member.user.id
  );
  if (existingTicket) {
    const existing = guild.channels.cache.get(existingTicket[0]);
    if (existing) {
      await interaction.editReply({
        content: `❌ You already have an open ticket: ${existing}`,
      });
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

  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets'
  );

  if (!category) {
    category = await guild.channels.create({
      name: 'Tickets',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      ],
    });
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
  });

  createTicket(guild.id, ticketChannel.id, member.user.id, ticketNumber);

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${ticketNumber.toString().padStart(4, '0')}`)
    .setDescription(
      `Welcome ${member}, your ticket has been created!\n\nPlease describe your issue and a staff member will assist you shortly.`
    )
    .addFields(
      { name: '👤 Opened by', value: `${member}`, inline: true },
      { name: '📋 Status', value: '🟢 Open', inline: true },
      { name: '🛡️ Claimed by', value: 'Nobody', inline: true }
    )
    .setColor(0x57f287)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('Claim')
      .setEmoji('✋')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('unclaim_ticket')
      .setLabel('Unclaim')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({ content: `${member}`, embeds: [embed], components: [row] });

  await interaction.editReply({
    content: `✅ Your ticket has been created: ${ticketChannel}`,
  });
}

export async function handleClaimTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const channel = interaction.channel;
  const ticket = getTicket(guild.id, channel.id);

  if (!ticket) {
    await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(guild.id);
  const isStaff =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    guildConfig.staffRoles.some((r) => member.roles.cache.has(r));

  if (!isStaff) {
    await interaction.reply({ content: '❌ Only staff members can claim tickets.', ephemeral: true });
    return;
  }

  if (ticket.claimedBy === member.user.id) {
    await interaction.reply({ content: '❌ You already claimed this ticket.', ephemeral: true });
    return;
  }

  claimTicket(guild.id, channel.id, member.user.id, member.user.tag);

  await channel.setName(channel.name.replace('ticket-', 'claimed-'));

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .spliceFields(1, 1, { name: '📋 Status', value: '🟡 Claimed', inline: true })
    .spliceFields(2, 1, { name: '🛡️ Claimed by', value: `${member}`, inline: true })
    .setColor(0xfee75c);

  await interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });
  await channel.send(`✋ **${member.user.tag}** has claimed this ticket.`);
}

export async function handleUnclaimTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const channel = interaction.channel;
  const ticket = getTicket(guild.id, channel.id);

  if (!ticket) {
    await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(guild.id);
  const isStaff =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    guildConfig.staffRoles.some((r) => member.roles.cache.has(r));

  if (!isStaff) {
    await interaction.reply({ content: '❌ Only staff members can unclaim tickets.', ephemeral: true });
    return;
  }

  if (!ticket.claimedBy) {
    await interaction.reply({ content: '❌ This ticket is not claimed.', ephemeral: true });
    return;
  }

  unclaimTicket(guild.id, channel.id);

  const newName = channel.name.replace('claimed-', 'ticket-');
  await channel.setName(newName);

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .spliceFields(1, 1, { name: '📋 Status', value: '🟢 Open', inline: true })
    .spliceFields(2, 1, { name: '🛡️ Claimed by', value: 'Nobody', inline: true })
    .setColor(0x57f287);

  await interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });
  await channel.send(`🔓 **${member.user.tag}** has unclaimed this ticket.`);
}

export async function handleCloseTicket(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  const channel = interaction.channel;
  const ticket = getTicket(guild.id, channel.id);

  if (!ticket) {
    await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    return;
  }

  const guildConfig = getGuildConfig(guild.id);
  const isStaff =
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    guildConfig.staffRoles.some((r) => member.roles.cache.has(r)) ||
    ticket.userId === member.user.id;

  if (!isStaff) {
    await interaction.reply({ content: '❌ You do not have permission to close this ticket.', ephemeral: true });
    return;
  }

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒 Ticket Closing')
    .setDescription(`This ticket is being closed by **${member.user.tag}**.\nChannel will be deleted in 5 seconds.`)
    .setColor(0xed4245)
    .setTimestamp();

  await interaction.reply({ embeds: [closeEmbed] });

  deleteTicket(guild.id, channel.id);

  setTimeout(async () => {
    try {
      await channel.delete(`Ticket closed by ${member.user.tag}`);
    } catch (err) {
      console.error('Failed to delete ticket channel:', err);
    }
  }, 5000);
}
