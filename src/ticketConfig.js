import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../data/ticketConfig.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function ensureGuild(config, guildId) {
  if (!config[guildId]) {
    config[guildId] = {
      staffRoles: [],
      managerRoles: [],
      twitchModRoles: [],
      ticketPanel: null,
      tickets: {},
      ticketCounter: 0,
      transcriptChannel: null
    };
  }
  if (!('managerRoles' in config[guildId])) {
    config[guildId].managerRoles = [];
  }
  if (!('twitchModRoles' in config[guildId])) {
    config[guildId].twitchModRoles = [];
  }
  if (!('ticketPanel' in config[guildId])) {
    config[guildId].ticketPanel = null;
  }
  if (!('transcriptChannel' in config[guildId])) {
    config[guildId].transcriptChannel = null;
  }
  return config;
}

export function getGuildConfig(guildId) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  saveConfig(config);
  return config[guildId];
}

export function addStaffRole(guildId, roleId) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  if (!config[guildId].staffRoles.includes(roleId)) {
    config[guildId].staffRoles.push(roleId);
    saveConfig(config);
    return true;
  }
  return false;
}

export function addManagerRole(guildId, roleId) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  if (!config[guildId].managerRoles.includes(roleId)) {
    config[guildId].managerRoles.push(roleId);
    saveConfig(config);
    return true;
  }
  return false;
}

export function addTwitchModRole(guildId, roleId) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  if (!config[guildId].twitchModRoles.includes(roleId)) {
    config[guildId].twitchModRoles.push(roleId);
    saveConfig(config);
    return true;
  }
  return false;
}

export function setTranscriptChannel(guildId, channelId) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  config[guildId].transcriptChannel = channelId;
  saveConfig(config);
}

export function getTranscriptChannel(guildId) {
  const config = loadConfig();
  return config[guildId]?.transcriptChannel || null;
}

export function getTicketPanel(guildId) {
  const config = loadConfig();
  return config[guildId]?.ticketPanel || null;
}

export function setTicketPanel(guildId, channelId, messageId) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  config[guildId].ticketPanel = { channelId, messageId };
  saveConfig(config);
}

export function createTicket(guildId, channelId, userId, ticketNumber, category, fields) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  config[guildId].tickets[channelId] = {
    userId,
    claimedBy: null,
    claimedByTag: null,
    ticketNumber,
    category: category || 'general',
    fields: fields || {},
    createdAt: Date.now()
  };
  config[guildId].ticketCounter = ticketNumber;
  saveConfig(config);
}

export function getTicket(guildId, channelId) {
  const config = loadConfig();
  return config[guildId]?.tickets?.[channelId] || null;
}

export function claimTicket(guildId, channelId, userId, userTag) {
  const config = loadConfig();
  if (!config[guildId]?.tickets?.[channelId]) return false;
  config[guildId].tickets[channelId].claimedBy = userId;
  config[guildId].tickets[channelId].claimedByTag = userTag;
  saveConfig(config);
  return true;
}

export function unclaimTicket(guildId, channelId) {
  const config = loadConfig();
  if (!config[guildId]?.tickets?.[channelId]) return false;
  config[guildId].tickets[channelId].claimedBy = null;
  config[guildId].tickets[channelId].claimedByTag = null;
  saveConfig(config);
  return true;
}

export function deleteTicket(guildId, channelId) {
  const config = loadConfig();
  if (!config[guildId]?.tickets?.[channelId]) return false;
  delete config[guildId].tickets[channelId];
  saveConfig(config);
  return true;
}

export function nextTicketNumber(guildId) {
  let config = loadConfig();
  config = ensureGuild(config, guildId);
  const next = (config[guildId].ticketCounter || 0) + 1;
  return next;
}
