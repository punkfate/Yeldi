# Discord Personalized Messenger Bot

## Overview
A Discord bot that allows you to send personalized messages to users and channels using commands.

## Recent Changes
- **2025-01-08**: Initial bot creation with command handler

## Commands
- `!send @user <message>` - Send a personalized direct message to a user
- `!say #channel <message>` - Send a message to a specific channel
- `!announce <message>` - Send a message to the current channel
- `!help` - Show all available commands

## Project Structure
```
src/
  discord.js  - Discord client authentication using Replit integration
  index.js    - Main bot code with command handlers
package.json  - Node.js dependencies
```

## User Preferences
- Uses Discord.js library
- Uses Replit Discord integration for authentication

## Architecture
- The bot uses Replit's Discord connector for OAuth authentication
- Commands are processed with a `!` prefix
- Error handling for DM failures and permission issues
