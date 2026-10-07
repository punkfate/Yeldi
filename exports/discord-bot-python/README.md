# Jester Bot para Python

Paquete portable del bot de Discord, preparado para ejecutarse fuera de Replit.

## Contenido

- `bot.py`: bot Python con comandos, tickets de Reporte, Duda General, Administración y Twitch.
- `requirements.txt`: dependencia de Discord.
- `data/ticketConfig.json`: configuración inicial vacía; el bot la completa al usarse.
- `Procfile`: proceso de trabajo para hostings que usan Procfile.

## Requisitos

- Python 3.10 o posterior.
- Un token de bot de Discord configurado como variable de entorno `DISCORD_BOT_TOKEN`.
- Para sincronizar comandos rápidamente en un servidor concreto, configura también `GUILD_ID` con el ID del servidor. Si no se define, los comandos se sincronizan globalmente y Discord puede tardar en mostrarlos.

No incluyas el token en `bot.py`, en este ZIP ni en repositorios públicos. Guárdalo en el gestor de variables/secretos de tu hosting.

## Instalar y ejecutar

```bash
python -m pip install -r requirements.txt
python bot.py
```

En un hosting basado en Procfile, el proceso ya está declarado como:

```text
worker: python bot.py
```

Configura un volumen persistente si quieres conservar `data/ticketConfig.json` y las transcripciones al reiniciar o redeplegar.

## Permisos e intents de Discord

Activa **Server Members Intent** y **Message Content Intent** en Discord Developer Portal para que funcionen la moderación y los comandos con prefijo `!`.

Al invitar el bot, concede como mínimo:

- Ver canales, enviar mensajes, leer historial e insertar enlaces/adjuntos.
- Gestionar canales, roles y mensajes.
- Expulsar y banear miembros.

El rol del bot debe estar por encima de los roles que administra. Si falta un permiso, el bot responderá con un error en lugar de completar esa acción.

## Comandos incluidos

- Generales: `/ping`, `/hola`, `/help`, `/info`, `/say`.
- Canales y moderación: `/lock`, `/unlock`, `/clear`, `/kick`, `/ban`, `/unban`, `/mute`, `/unmute`.
- Tickets: `/tickets panel`, `/roleadd staff`, `/roleadd manager`, `/roleadd twitch`, `/transcript channel`.
- Comandos con prefijo `!`: `!ping`, `!hola`, `!info`, `!help`, `!say`, `!lock`, `!unlock`, `!clear`, `!kick`, `!ban`, `!unban`, `!mute`, `!unmute`.

`/help` y `!help` muestran un embed. `!kick`, `!ban`, `!mute` y `!unmute` aceptan una mención, un ID o el nombre exacto del miembro; escribe la razón después del usuario y usa comillas para nombres con espacios, por ejemplo `!mute "Nombre Apellido" spam`. `/unban` y `!unban` aceptan un ID y una razón opcional. Si no indicas razón, el bot muestra `Razón no especificada`. Las respuestas mencionan al miembro sancionado.

En los reportes se pueden seleccionar hasta 25 usuarios. Al abrir un ticket, el bot muestra un enlace `#canal` clicable; las acciones de los botones y el cierre se anuncian con embeds.

Los tickets de Administración solo los ve la persona que los abre, los administradores y los roles añadidos con `/roleadd manager`. Los tickets de Twitch solo los ve la persona que los abre, los administradores y los roles añadidos con `/roleadd twitch`.

El comando `/tickets panel` publica el nuevo panel inmediatamente y limpia paneles recientes antiguos en segundo plano. Para ello necesita permiso para ver canales, leer historial y gestionar mensajes.

## Migración desde el bot JavaScript

El ZIP inicia con configuración vacía. Para conservar roles ya configurados, copia el archivo `data/ticketConfig.json` del bot anterior antes de iniciar este bot. No ejecutes las dos versiones a la vez con el mismo token.
