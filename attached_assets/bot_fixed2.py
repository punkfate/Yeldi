import os
import discord
from discord.ext import commands
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

# Intents necesarios para que funcionen los comandos
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

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
    print(f"✅ Conectado como {bot.user} (ID: {bot.user.id})")

# ── Comandos ─────────────────────────────────────────────

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
    embed.set_thumbnail(url=guild.icon.url if guild.icon else None)
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
        value="`!clear [cantidad]` • `!kick @usuario` • `!ban @usuario`",
        inline=False
    )
    await ctx.send(embed=embed)

bot.run(TOKEN)
