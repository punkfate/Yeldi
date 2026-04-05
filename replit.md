# Discord Personalized Messenger Bot

## Overview
A Discord bot that allows you to send personalized messages to users and channels using both slash commands (/) and prefix commands (!). Includes a full ticket system.

## Recent Changes
- **2026-04-05**: Added full ticket system with panel, staff roles, claim/unclaim/close buttons
- **2025-12-24**: Added web server for uptime monitoring, made ping command visible to everyone
- **2025-12-24**: Added ping command to check bot latency, removed bot-activo
- **2025-01-08**: Added slash command support alongside prefix commands
- **2025-01-08**: Initial bot creation with command handler

## Commands

### Ticket System (NEW)
- `/tickets panel` - Post the ticket panel embed in the current channel (admin only)
- `/roleadd staff @role` - Add a role as staff so they can see and manage tickets (admin only)

#### Ticket Buttons (inside ticket channels)
- `✋ Claim` - Staff claims the ticket (renames channel to claimed-XXXX)
- `🔓 Unclaim` - Releases the claim on the ticket
- `🔒 Close Ticket` - Closes and deletes the ticket channel after 5 seconds

### Slash Commands
- `/send user:@user message:<text>` - Send a personalized DM to a user
- `/say channel:#channel message:<text>` - Send a message to a specific channel
- `/announce message:<text>` - Send a message to the current channel
- `/ping` - Check the bot's latency
- `/lock` - Lock the current channel to prevent users from talking (admin only)
- `/unlock` - Unlock the current channel to allow users to talk (admin only)
- `/help` - Show all available commands

### Prefix Commands
- `!send @user <message>` - Send a personalized direct message to a user
- `!say #channel <message>` - Send a message to a specific channel
- `!announce <message>` - Send a message to the current channel
- `!ping` - Check the bot's latency
- `!lock` - Lock the current channel (admin only)
- `!unlock` - Unlock the current channel (admin only)
- `!help` - Show all available commands

## Project Structure
```
src/
  discord.js       - Discord client authentication
  index.js         - Main bot code with command handlers (slash + prefix)
  tickets.js       - Ticket system logic (panel, create, claim, unclaim, close)
  ticketConfig.js  - Persistent storage for staff roles and ticket data
  web.js           - Express web server for uptime monitoring
data/
  ticketConfig.json - Stores staff roles and open tickets per guild
package.json       - Node.js dependencies
```

## User Preferences
- Uses Discord.js library
- Supports both slash commands and prefix commands
- Bot token stored securely in environment secrets
- Admin-only commands (requires Administrator permission)
- Web server for uptime monitoring with UptimeRobot

## Architecture
- Bot authenticates using DISCORD_BOT_TOKEN environment variable
- Slash commands are registered globally on startup
- Both slash and prefix commands are handled in parallel
- Button interactions handled for ticket system
- Ticket data persisted to data/ticketConfig.json
- Staff roles stored per guild
- Tickets created in a "Tickets" category (auto-created if missing)
- Commands restricted to users with Administrator permission (except ping)
- Express web server runs on port 5000 for uptime monitoring

## Uptime Monitoring
To keep the bot alive 24/7:
1. Get your Replit domain from the web server URL
2. Visit [UptimeRobot.com](https://uptimerobot.com)
3. Create a monitor pointing to your Replit web server
4. Set interval to ping every 5 minutes
