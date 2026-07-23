import os
import discord
from discord.ext import commands
from discord import app_commands
from flask import Flask
from threading import Thread

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

TOKEN = os.environ.get("TOKEN")
if not TOKEN:
    raise ValueError("No se encontró el TOKEN. Añádelo en las variables de entorno o en el archivo .env")

PORT = int(os.environ.get("PORT", 10000))

# Intents necesarios
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

# ── Servidor web para mantener el bot activo ─────────────
app = Flask(__name__)

@app.route("/")
def home():
    return "Bot activo 🚀"

def run_web():
    app.run(host="0.0.0.0", port=PORT)

Thread(target=run_web).start()

# ── Eventos ──────────────────────────────────────────────

@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f"✅ Conectado como {bot.user} (ID: {bot.user.id})")
    print(f"📡 Slash commands sincronizados")

# ═══════════════════════════════════════════════════════════
#  COMANDOS DE PREFIJO (!)
# ═══════════════════════════════════════════════════════════

@bot.command()
async def ping(ctx):
    """Comprueba la latencia del bot"""
    latency = round(bot.latency * 1000)
    await ctx.send(f"🏓 Pong! Latencia: **{latency}ms**")

@bot.command()
async def hola(ctx):
    """Saluda al usuario"""
    await ctx.send(f"👋 ¡Hola, {ctx.author.mention}!")

@bot.command()
async def info(ctx):
    """Muestra información del servidor"""
    guild = ctx.guild
    embed = discord.Embed(title=f"📊 Info de {guild.name}", color=0x5865f2)
    embed.add_field(name="👥 Miembros", value=guild.member_count, inline=True)
    embed.add_field(name="💬 Canales", value=len(guild.channels), inline=True)
    embed.add_field(name="🎭 Roles", value=len(guild.roles), inline=True)
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    await ctx.send(embed=embed)

@bot.command()
async def clear(ctx, cantidad: int = 5):
    """Borra mensajes del canal (solo admins)"""
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5)
        return
    deleted = await ctx.channel.purge(limit=cantidad + 1)
    await ctx.send(f"🗑️ Se borraron **{len(deleted) - 1}** mensajes.", delete_after=5)

@bot.command()
async def kick(ctx, member: discord.Member, *, razon="Sin razón especificada"):
    """Expulsa a un miembro (solo admins)"""
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5)
        return
    await member.kick(reason=razon)
    await ctx.send(f"👢 **{member}** ha sido expulsado. Razón: {razon}")

@bot.command()
async def ban(ctx, member: discord.Member, *, razon="Sin razón especificada"):
    """Banea a un miembro (solo admins)"""
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5)
        return
    await member.ban(reason=razon)
    await ctx.send(f"🔨 **{member}** ha sido baneado. Razón: {razon}")

@bot.command()
async def unban(ctx, *, usuario):
    """Desbanea a un usuario por nombre#tag (solo admins)"""
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5)
        return
    banned = [entry async for entry in ctx.guild.bans()]
    nombre, discriminador = usuario.split("#") if "#" in usuario else (usuario, None)
    for entry in banned:
        if discriminador:
            if entry.user.name == nombre and entry.user.discriminator == discriminador:
                await ctx.guild.unban(entry.user)
                await ctx.send(f"✅ **{entry.user}** ha sido desbaneado.")
                return
        else:
            if entry.user.name == nombre:
                await ctx.guild.unban(entry.user)
                await ctx.send(f"✅ **{entry.user}** ha sido desbaneado.")
                return
    await ctx.send("❌ Usuario no encontrado en la lista de baneados.")

@bot.command()
async def mute(ctx, member: discord.Member, *, razon="Sin razón especificada"):
    """Silencia a un miembro (solo admins)"""
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5)
        return
    role = discord.utils.get(ctx.guild.roles, name="Muted")
    if not role:
        role = await ctx.guild.create_role(name="Muted")
        for channel in ctx.guild.channels:
            await channel.set_permissions(role, send_messages=False, speak=False)
    await member.add_roles(role, reason=razon)
    await ctx.send(f"🔇 **{member.mention}** ha sido silenciado. Razón: {razon}")

@bot.command()
async def unmute(ctx, member: discord.Member):
    """Quita el silencio a un miembro (solo admins)"""
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5)
        return
    role = discord.utils.get(ctx.guild.roles, name="Muted")
    if role in member.roles:
        await member.remove_roles(role)
        await ctx.send(f"🔊 **{member.mention}** ya puede hablar de nuevo.")
    else:
        await ctx.send("❌ Ese miembro no está silenciado.")

@bot.command()
async def ayuda(ctx):
    """Muestra todos los comandos disponibles"""
    embed = discord.Embed(title="📋 Comandos disponibles", color=0x5865f2)
    embed.add_field(
        name="💬 Generales",
        value="`!ping` • `!hola` • `!info` • `!ayuda`",
        inline=False
    )
    embed.add_field(
        name="🛡️ Moderación (admin)",
        value="`!clear [n]` • `!kick @user` • `!ban @user` • `!unban user` • `!mute @user` • `!unmute @user`",
        inline=False
    )
    embed.add_field(
        name="⚡ Slash commands",
        value="`/ping` • `/hola` • `/info` • `/clear` • `/kick` • `/ban` • `/mute` • `/unmute` • `/ayuda`",
        inline=False
    )
    await ctx.send(embed=embed)

# ═══════════════════════════════════════════════════════════
#  SLASH COMMANDS (/)
# ═══════════════════════════════════════════════════════════

@bot.tree.command(name="ping", description="Comprueba la latencia del bot")
async def slash_ping(interaction: discord.Interaction):
    latency = round(bot.latency * 1000)
    await interaction.response.send_message(f"🏓 Pong! Latencia: **{latency}ms**")

@bot.tree.command(name="hola", description="Saluda al usuario")
async def slash_hola(interaction: discord.Interaction):
    await interaction.response.send_message(f"👋 ¡Hola, {interaction.user.mention}!")

@bot.tree.command(name="info", description="Muestra información del servidor")
async def slash_info(interaction: discord.Interaction):
    guild = interaction.guild
    embed = discord.Embed(title=f"📊 Info de {guild.name}", color=0x5865f2)
    embed.add_field(name="👥 Miembros", value=guild.member_count, inline=True)
    embed.add_field(name="💬 Canales", value=len(guild.channels), inline=True)
    embed.add_field(name="🎭 Roles", value=len(guild.roles), inline=True)
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="clear", description="Borra mensajes del canal (solo admins)")
@app_commands.describe(cantidad="Número de mensajes a borrar (máx 100)")
async def slash_clear(interaction: discord.Interaction, cantidad: int = 5):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ Necesitas ser administrador.", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    deleted = await interaction.channel.purge(limit=cantidad)
    await interaction.followup.send(f"🗑️ Se borraron **{len(deleted)}** mensajes.", ephemeral=True)

@bot.tree.command(name="kick", description="Expulsa a un miembro (solo admins)")
@app_commands.describe(miembro="Miembro a expulsar", razon="Razón de la expulsión")
async def slash_kick(interaction: discord.Interaction, miembro: discord.Member, razon: str = "Sin razón especificada"):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ Necesitas ser administrador.", ephemeral=True)
        return
    await miembro.kick(reason=razon)
    await interaction.response.send_message(f"👢 **{miembro}** ha sido expulsado. Razón: {razon}")

@bot.tree.command(name="ban", description="Banea a un miembro (solo admins)")
@app_commands.describe(miembro="Miembro a banear", razon="Razón del baneo")
async def slash_ban(interaction: discord.Interaction, miembro: discord.Member, razon: str = "Sin razón especificada"):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ Necesitas ser administrador.", ephemeral=True)
        return
    await miembro.ban(reason=razon)
    await interaction.response.send_message(f"🔨 **{miembro}** ha sido baneado. Razón: {razon}")

@bot.tree.command(name="mute", description="Silencia a un miembro (solo admins)")
@app_commands.describe(miembro="Miembro a silenciar", razon="Razón del silencio")
async def slash_mute(interaction: discord.Interaction, miembro: discord.Member, razon: str = "Sin razón especificada"):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ Necesitas ser administrador.", ephemeral=True)
        return
    role = discord.utils.get(interaction.guild.roles, name="Muted")
    if not role:
        role = await interaction.guild.create_role(name="Muted")
        for channel in interaction.guild.channels:
            await channel.set_permissions(role, send_messages=False, speak=False)
    await miembro.add_roles(role, reason=razon)
    await interaction.response.send_message(f"🔇 **{miembro.mention}** ha sido silenciado. Razón: {razon}")

@bot.tree.command(name="unmute", description="Quita el silencio a un miembro (solo admins)")
@app_commands.describe(miembro="Miembro al que quitar el silencio")
async def slash_unmute(interaction: discord.Interaction, miembro: discord.Member):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ Necesitas ser administrador.", ephemeral=True)
        return
    role = discord.utils.get(interaction.guild.roles, name="Muted")
    if role and role in miembro.roles:
        await miembro.remove_roles(role)
        await interaction.response.send_message(f"🔊 **{miembro.mention}** ya puede hablar de nuevo.")
    else:
        await interaction.response.send_message("❌ Ese miembro no está silenciado.", ephemeral=True)

@bot.tree.command(name="ayuda", description="Muestra todos los comandos disponibles")
async def slash_ayuda(interaction: discord.Interaction):
    embed = discord.Embed(title="📋 Comandos disponibles", color=0x5865f2)
    embed.add_field(
        name="💬 Generales",
        value="`!ping` • `!hola` • `!info` • `!ayuda`\n`/ping` • `/hola` • `/info` • `/ayuda`",
        inline=False
    )
    embed.add_field(
        name="🛡️ Moderación (admin)",
        value="`!clear` • `!kick` • `!ban` • `!unban` • `!mute` • `!unmute`\n`/clear` • `/kick` • `/ban` • `/mute` • `/unmute`",
        inline=False
    )
    await interaction.response.send_message(embed=embed)

bot.run(TOKEN)
