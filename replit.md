# Discord Bot Project

## Overview
This project contains two Discord bots:
1. **Discord Personalized Messenger** - Send personalized messages to users and channels using both slash commands (/) and prefix commands (!)
2. **Bot Activo** - Active Developer badge bot with slash commands

## Recent Changes
- **2025-12-24**: Added bot-activo for Active Developer badge
- **2025-01-08**: Added slash command support to Messenger bot
- **2025-01-08**: Initial bot creation with command handler

## Bot 1: Discord Personalized Messenger

### Commands
#### Slash Commands
- `/send user:@user message:<text>` - Send a personalized DM to a user
- `/say channel:#channel message:<text>` - Send a message to a specific channel
- `/announce message:<text>` - Send a message to the current channel
- `/help` - Show all available commands

#### Prefix Commands
- `!send @user <message>` - Send a personalized direct message to a user
- `!say #channel <message>` - Send a message to a specific channel
- `!announce <message>` - Send a message to the current channel
- `!help` - Show all available commands

### Structure
```
src/
  discord.js  - Discord client authentication
  index.js    - Main bot code with command handlers (slash + prefix)
```

## Bot 2: Bot Activo

### Commands
- `/activo` - Global slash command for Active Developer badge

### Structure
```
bot-activo/
  index.js    - Bot with global slash command and express server
  package.json
```

## User Preferences
- Uses Discord.js library
- Supports both slash commands and prefix commands
- Bot token stored securely in environment secrets
- Admin-only commands (requires Administrator permission)

## Architecture
- Bot authenticates using DISCORD_BOT_TOKEN environment variable
- Slash commands are registered globally on startup
- Both slash and prefix commands are handled in parallel
- Commands restricted to users with Administrator permission
- Error handling for DM failures and permission issues
