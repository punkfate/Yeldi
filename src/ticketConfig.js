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

export function getGuildConfig(guildId) {
  const config = loadConfig();
  if (!config[guildId]) {
    config[guildId] = { staffRoles: [], tickets: {}, ticketCounter: 0 };
    saveConfig(config);
  }
  return config[guildId];
}

export function addStaffRole(guildId, roleId) {
  const config = loadConfig();
  if (!config[guildId]) config[guildId] = { staffRoles: [], tickets: {}, ticketCounter: 0 };
  if (!config[guildId].staffRoles.includes(roleId)) {
    config[guildId].staffRoles.push(roleId);
    saveConfig(config);
    return true;
  }
  return false;
}

export function removeStaffRole(guildId, roleId) {
  const config = loadConfig();
  if (!config[guildId]) return false;
  const idx = config[guildId].staffRoles.indexOf(roleId);
  if (idx !== -1) {
    config[guildId].staffRoles.splice(idx, 1);
    saveConfig(config);
    return true;
  }
  return false;
}

export function createTicket(guildId, channelId, userId, ticketNumber) {
  const config = loadConfig();
  if (!config[guildId]) config[guildId] = { staffRoles: [], tickets: {}, ticketCounter: 0 };
  config[guildId].tickets[channelId] = {
    userId,
    claimedBy: null,
    claimedByTag: null,
    ticketNumber,
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
  const config = loadConfig();
  if (!config[guildId]) config[guildId] = { staffRoles: [], tickets: {}, ticketCounter: 0 };
  const next = (config[guildId].ticketCounter || 0) + 1;
  return next;
}
