# Discord Personalized Messenger Bot

## Overview
A Discord bot that allows you to send messages to users and channels using both slash commands (/) and prefix commands (!). Includes a full ticket system with categories, modals, and transcripts.

## Recent Changes
- Ticket system uses the Jester's Club identity, with Reportes, Dudas Generales, and Soporte de Administración categories
- **2026-05-16**: Fixed all "interaction failed" errors — command registration now atomic, ticket button/claim/unclaim timing fixed
- **2026-05-16**: Removed Express web server (src/web.js deleted), minimal port listener in index.js
- **2026-04-05**: Added full ticket system with panel, staff roles, claim/unclaim/close buttons
- **2025-12-24**: Added web server for uptime monitoring, made ping command visible to everyone
- **2025-01-08**: Added slash command support alongside prefix commands

## Commands

### Ticket System
- `/tickets panel` - Post the ticket panel embed in the current channel (admin only)
- `/roleadd staff @role` - Add a role as staff so they can see and manage tickets (admin only)
- `/roleadd manager @role` - Add a role that can see and manage administration support tickets (admin only)
- `/transcript channel #canal` - Set the channel where ticket transcripts are sent (admin only)

#### Ticket Flow
1. User clicks **Abrir Ticket** button in the panel
2. A dropdown appears with 3 categories:
   - **🚨 Reportes** — Opens a modal asking for the reported user and reason
   - **❓ Dudas Generales** — Opens a modal asking for the ticket reason
   - **🛠️ Soporte de Administración** — Private ticket visible to the opener, administrators, and managers
3. Bot creates a private channel and sends an embed with the user's answers
4. Staff can **Reclamar**, **Liberar**, or **Cerrar Ticket** using the buttons inside

#### Ticket Buttons (inside ticket channels)
- `✋ Reclamar` - Staff claims the ticket (renames channel to reclamado-XXXX)
- `🔓 Liberar` - Releases the claim on the ticket
- `🔒 Cerrar Ticket` - Sends transcript (if configured) and deletes the channel after 5 seconds

### Slash Commands
- `/say #canal <mensaje>` - Send a message to a specific channel (admin only)
- `/ping` - Check the bot's latency
- `/lock` - Lock the current channel (admin only)
- `/unlock` - Unlock the current channel (admin only)
- `/help` - Show all available commands

### Prefix Commands (`!`)
- `!say #canal <mensaje>` - Send a message to a specific channel
- `!ping` - Check the bot's latency
- `!lock` / `!unlock` - Lock or unlock a channel
- `!help` - Show all available commands

## Project Structure
```
src/
  discord.js       - Discord client authentication and intents
  index.js         - Main bot: slash/prefix command handlers, interaction router
  tickets.js       - Ticket system: panel, category select, modals, claim/unclaim/close
  ticketConfig.js  - Persistent JSON storage for staff roles, tickets, and settings
data/
  ticketConfig.json - Stores staff roles, open tickets, counters, transcript channel per guild
package.json       - Node.js dependencies
```

## User Preferences
- Uses Discord.js v14 library
- ES Modules (`"type": "module"`)
- Supports both slash commands and prefix commands
- Bot token stored securely in DISCORD_BOT_TOKEN environment secret
- Admin-only commands (requires Administrator permission)
- All bot messages in Spanish

## Architecture
- Bot authenticates using `DISCORD_BOT_TOKEN` environment variable
- Slash commands registered globally on startup (single atomic PUT, no clear+register gap)
- Interaction router handles: buttons, string select menus, modal submits, slash commands, prefix commands
- Ticket data (category, fields/answers, claim state) persisted to `data/ticketConfig.json`
- Staff roles stored per guild
- Channel names: `reporte-NNNN-user`, `duda-NNNN-user`, `soporte-admin-NNNN-user`; claimed → `reclamado-NNNN-user`
- Minimal HTTP server on port 5000 (required by Replit to keep the process alive)
