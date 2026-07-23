import os
import json
import re
import discord
from discord.ext import commands
from discord import app_commands
from flask import Flask
from threading import Thread
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

TOKEN = os.environ.get("TOKEN")
if not TOKEN:
    raise ValueError("No se encontró el TOKEN. Añádelo en las variables de entorno o en el .env")

PORT = int(os.environ.get("PORT", 10000))
CONFIG_PATH = "ticketConfig.json"
FORM_LINK = "https://docs.google.com/forms/d/1aEH3rfgI23UCZZ765cXKe_aLpZvdxKy3KgwUEfTctRw/viewform"

CATEGORY_LABELS = {"report": "🚨 Reporte", "general": "❓ Duda General", "postulation": "📝 Postulación"}
CATEGORY_COLORS = {"report": 0xed4245, "general": 0x5865f2, "postulation": 0x57f287}
CATEGORY_PREFIXES = {"report": "reporte", "general": "duda", "postulation": "postulacion"}

# ── Servidor web ─────────────────────────────────────────
app = Flask(__name__)

@app.route("/")
def home():
    return "Bot activo 🚀"

Thread(target=lambda: app.run(host="0.0.0.0", port=PORT), daemon=True).start()

# ── Config JSON ──────────────────────────────────────────

def load_config():
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_config(config):
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)

def ensure_guild(config, guild_id):
    gid = str(guild_id)
    if gid not in config:
        config[gid] = {"staffRoles": [], "tickets": {}, "ticketCounter": 0, "transcriptChannel": None}
    if "transcriptChannel" not in config[gid]:
        config[gid]["transcriptChannel"] = None
    return config

def get_guild_config(guild_id):
    config = load_config()
    config = ensure_guild(config, guild_id)
    save_config(config)
    return config[str(guild_id)]

def add_staff_role(guild_id, role_id):
    config = load_config()
    config = ensure_guild(config, guild_id)
    gid = str(guild_id)
    rid = str(role_id)
    if rid not in config[gid]["staffRoles"]:
        config[gid]["staffRoles"].append(rid)
        save_config(config)
        return True
    return False

def set_transcript_channel(guild_id, channel_id):
    config = load_config()
    config = ensure_guild(config, guild_id)
    config[str(guild_id)]["transcriptChannel"] = str(channel_id)
    save_config(config)

def get_transcript_channel(guild_id):
    config = load_config()
    return config.get(str(guild_id), {}).get("transcriptChannel")

def next_ticket_number(guild_id):
    config = load_config()
    config = ensure_guild(config, guild_id)
    return config[str(guild_id)]["ticketCounter"] + 1

def create_ticket(guild_id, channel_id, user_id, ticket_number, category, fields):
    config = load_config()
    config = ensure_guild(config, guild_id)
    config[str(guild_id)]["tickets"][str(channel_id)] = {
        "userId": str(user_id),
        "claimedBy": None,
        "claimedByTag": None,
        "ticketNumber": ticket_number,
        "category": category,
        "fields": fields,
        "createdAt": int(datetime.utcnow().timestamp())
    }
    config[str(guild_id)]["ticketCounter"] = ticket_number
    save_config(config)

def get_ticket(guild_id, channel_id):
    config = load_config()
    return config.get(str(guild_id), {}).get("tickets", {}).get(str(channel_id))

def claim_ticket(guild_id, channel_id, user_id, user_tag):
    config = load_config()
    t = config.get(str(guild_id), {}).get("tickets", {}).get(str(channel_id))
    if not t:
        return False
    t["claimedBy"] = str(user_id)
    t["claimedByTag"] = user_tag
    save_config(config)
    return True

def unclaim_ticket(guild_id, channel_id):
    config = load_config()
    t = config.get(str(guild_id), {}).get("tickets", {}).get(str(channel_id))
    if not t:
        return False
    t["claimedBy"] = None
    t["claimedByTag"] = None
    save_config(config)
    return True

def delete_ticket(guild_id, channel_id):
    config = load_config()
    tickets = config.get(str(guild_id), {}).get("tickets", {})
    if str(channel_id) in tickets:
        del tickets[str(channel_id)]
        save_config(config)
        return True
    return False

def has_open_ticket(guild, user_id):
    gc = get_guild_config(guild.id)
    for ch_id, t in gc["tickets"].items():
        if t["userId"] == str(user_id):
            ch = guild.get_channel(int(ch_id))
            if ch:
                return ch
    return None

# ── Embeds ────────────────────────────────────────────────

def build_ticket_embed(ticket, ticket_number, opener_id, claimed_mention=None):
    is_claimed = bool(claimed_mention)
    num = str(ticket_number).zfill(4)
    label = CATEGORY_LABELS.get(ticket["category"], "🎫 Ticket")
    color = 0xfee75c if is_claimed else CATEGORY_COLORS.get(ticket["category"], 0x5865f2)

    postulation_desc = "\n".join([
        f"Para completar tu postulación rellena el formulario oficial:",
        f"",
        f"**[📝 Formulario de Postulación]({FORM_LINK})**",
        f"",
        f"**📋 Normas de postulación:**",
        f"> • Rellena el formulario con información **verídica** y detallada.",
        f"> • Envía el formulario **una sola vez**, no lo repitas.",
        f"> • No insistas al staff por el estado de tu postulación.",
        f"> • Debes cumplir los requisitos del servidor para ser aceptado.",
        f"> • El staff te contactará si tu candidatura es aceptada."
    ])

    descriptions = {
        "report": "Tu reporte ha sido recibido.\nEl staff lo revisará lo antes posible.",
        "general": "Tu ticket ha sido creado.\nEl staff te atenderá pronto.",
        "postulation": postulation_desc
    }

    embed = discord.Embed(
        title=f"🎫 Ticket #{num} — {label}",
        description=descriptions.get(ticket["category"], "Ticket abierto."),
        color=color,
        timestamp=datetime.utcnow()
    )
    embed.add_field(name="👤 Abierto por", value=f"<@{opener_id}>", inline=True)
    embed.add_field(name="📋 Estado", value="🟡 Reclamado" if is_claimed else "🟢 Abierto", inline=True)
    embed.add_field(name="🛡️ Reclamado por", value=claimed_mention or "Nadie", inline=True)

    if ticket["category"] == "report" and ticket.get("fields"):
        embed.add_field(name="\u200b", value="**— Detalles del Reporte —**", inline=False)
        embed.add_field(name="🎯 Usuario reportado", value=ticket["fields"].get("reportedUser", "—"), inline=False)
        embed.add_field(name="📝 Razón del reporte", value=ticket["fields"].get("reportReason", "—"), inline=False)

    if ticket["category"] == "general" and ticket.get("fields"):
        embed.add_field(name="\u200b", value="**— Detalles —**", inline=False)
        embed.add_field(name="📝 Motivo del ticket", value=ticket["fields"].get("generalReason", "—"), inline=False)

    return embed

# ── Modales ───────────────────────────────────────────────

class ReportModal(discord.ui.Modal, title="🚨 Reporte — Paso 2/2"):
    def __init__(self, reported_user_id, reported_display):
        super().__init__()
        self.reported_user_id = reported_user_id
        self.reported_display_field = discord.ui.TextInput(
            label="Usuario a reportar",
            default=reported_display,
            required=True,
            max_length=200
        )
        self.reason = discord.ui.TextInput(
            label="Razón del reporte",
            style=discord.TextStyle.paragraph,
            placeholder="Explica detalladamente el motivo del reporte.",
            required=True,
            max_length=1000
        )
        self.add_item(self.reported_display_field)
        self.add_item(self.reason)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        reported_user = f"<@{self.reported_user_id}> — {self.reported_display_field.value}"
        await open_ticket(interaction, "report", {
            "reportedUser": reported_user,
            "reportReason": self.reason.value
        })

class GeneralModal(discord.ui.Modal, title="❓ Duda General"):
    reason = discord.ui.TextInput(
        label="¿Cuál es el motivo de tu ticket?",
        style=discord.TextStyle.paragraph,
        placeholder="Describe tu duda o problema con el mayor detalle posible.",
        required=True,
        max_length=1000
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        await open_ticket(interaction, "general", {"generalReason": self.reason.value})

# ── Views ─────────────────────────────────────────────────

class ReportUserSelect(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=120)

    @discord.ui.select(
        cls=discord.ui.UserSelect,
        placeholder="Busca y selecciona al usuario a reportar...",
        min_values=1,
        max_values=1
    )
    async def select_user(self, interaction: discord.Interaction, select: discord.ui.UserSelect):
        user = select.values[0]
        display = f"{user.name} ({user.id})"
        await interaction.response.send_modal(ReportModal(user.id, display))

class CategorySelectView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.select(
        custom_id="ticket_category",
        placeholder="📂 Selecciona una categoría...",
        options=[
            discord.SelectOption(label="Reportes", description="Reporta a un usuario que haya infringido las normas del servidor", emoji="🚨", value="report"),
            discord.SelectOption(label="Dudas Generales", description="¿Tienes una pregunta o necesitas ayuda? Abre un ticket aquí", emoji="❓", value="general"),
            discord.SelectOption(label="Postulaciones", description="¿Quieres unirte al equipo de staff? Postúlate aquí", emoji="📝", value="postulation"),
        ]
    )
    async def select_category(self, interaction: discord.Interaction, select: discord.ui.Select):
        category = select.values[0]
        existing = has_open_ticket(interaction.guild, interaction.user.id)
        if existing:
            await interaction.response.send_message(f"❌ Ya tienes un ticket abierto: {existing.mention}", ephemeral=True)
            return

        if category == "report":
            view = ReportUserSelect()
            await interaction.response.send_message(
                "**🚨 Reporte — Paso 1/2:** Selecciona al usuario que quieres reportar:",
                view=view,
                ephemeral=True
            )
        elif category == "general":
            await interaction.response.send_modal(GeneralModal())
        elif category == "postulation":
            await interaction.response.defer(ephemeral=True)
            await open_ticket(interaction, "postulation", {})

def is_staff(member, guild_config):
    if member.guild_permissions.administrator:
        return True
    return any(str(r.id) in guild_config["staffRoles"] for r in member.roles)

class TicketButtonView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Reclamar", emoji="✋", style=discord.ButtonStyle.success, custom_id="claim_ticket")
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button):
        guild_config = get_guild_config(interaction.guild.id)
        if not is_staff(interaction.user, guild_config):
            await interaction.response.send_message("❌ Solo el staff puede reclamar tickets.", ephemeral=True)
            return

        ticket = get_ticket(interaction.guild.id, interaction.channel.id)
        if not ticket:
            await interaction.response.send_message("❌ Este no es un canal de ticket.", ephemeral=True)
            return
        if ticket.get("claimedBy") == str(interaction.user.id):
            await interaction.response.send_message("❌ Ya reclamaste este ticket.", ephemeral=True)
            return

        claim_ticket(interaction.guild.id, interaction.channel.id, interaction.user.id, str(interaction.user))
        ticket = get_ticket(interaction.guild.id, interaction.channel.id)
        embed = build_ticket_embed(ticket, ticket["ticketNumber"], ticket["userId"], interaction.user.mention)
        await interaction.response.edit_message(embeds=[embed])

        notif = discord.Embed(description=f"✋ {interaction.user.mention} ha **reclamado** este ticket.", color=0xfee75c, timestamp=datetime.utcnow())
        await interaction.channel.send(embeds=[notif])

        base = interaction.channel.name.replace("reclamado-", "")
        try:
            await interaction.channel.edit(name=f"reclamado-{base}")
        except Exception:
            pass

    @discord.ui.button(label="Liberar", emoji="🔓", style=discord.ButtonStyle.secondary, custom_id="unclaim_ticket")
    async def unclaim(self, interaction: discord.Interaction, button: discord.ui.Button):
        guild_config = get_guild_config(interaction.guild.id)
        if not is_staff(interaction.user, guild_config):
            await interaction.response.send_message("❌ Solo el staff puede liberar tickets.", ephemeral=True)
            return

        ticket = get_ticket(interaction.guild.id, interaction.channel.id)
        if not ticket:
            await interaction.response.send_message("❌ Este no es un canal de ticket.", ephemeral=True)
            return
        if not ticket.get("claimedBy"):
            await interaction.response.send_message("❌ Este ticket no está reclamado.", ephemeral=True)
            return

        unclaim_ticket(interaction.guild.id, interaction.channel.id)
        ticket = get_ticket(interaction.guild.id, interaction.channel.id)
        embed = build_ticket_embed(ticket, ticket["ticketNumber"], ticket["userId"], None)
        await interaction.response.edit_message(embeds=[embed])

        notif = discord.Embed(description=f"🔓 {interaction.user.mention} ha **liberado** este ticket.", color=0x5865f2, timestamp=datetime.utcnow())
        await interaction.channel.send(embeds=[notif])

        new_name = interaction.channel.name.replace("reclamado-", "")
        try:
            await interaction.channel.edit(name=new_name)
        except Exception:
            pass

    @discord.ui.button(label="Cerrar Ticket", emoji="🔒", style=discord.ButtonStyle.danger, custom_id="close_ticket")
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        guild_config = get_guild_config(interaction.guild.id)
        ticket = get_ticket(interaction.guild.id, interaction.channel.id)
        if not ticket:
            await interaction.response.send_message("❌ Este no es un canal de ticket.", ephemeral=True)
            return

        can_close = (
            is_staff(interaction.user, guild_config)
            or ticket["userId"] == str(interaction.user.id)
        )
        if not can_close:
            await interaction.response.send_message("❌ No tienes permiso para cerrar este ticket.", ephemeral=True)
            return

        close_embed = discord.Embed(
            title="🔒 Cerrando Ticket",
            description=f"{interaction.user.mention} ha cerrado este ticket.\nEl canal se eliminará en 5 segundos.",
            color=0xed4245,
            timestamp=datetime.utcnow()
        )
        await interaction.response.send_message(embeds=[close_embed])

        # Transcripción
        try:
            messages = [m async for m in interaction.channel.history(limit=100, oldest_first=True)]
            lines = []
            for m in messages:
                t = m.created_at.strftime("%d/%m/%Y %H:%M")
                content = m.content or ("[Embed]" if m.embeds else "[Sin contenido]")
                lines.append(f"[{t}] {m.author}: {content}")

            transcript_ch_id = get_transcript_channel(interaction.guild.id)
            if transcript_ch_id:
                tr_channel = interaction.guild.get_channel(int(transcript_ch_id))
                if tr_channel:
                    num = str(ticket["ticketNumber"]).zfill(4)
                    label = CATEGORY_LABELS.get(ticket["category"], "🎫 Ticket")
                    tr_embed = discord.Embed(
                        title=f"📄 Transcripción — Ticket #{num} — {label}",
                        color=0x5865f2,
                        timestamp=datetime.utcnow()
                    )
                    tr_embed.add_field(name="👤 Abierto por", value=f"<@{ticket['userId']}>", inline=True)
                    tr_embed.add_field(name="🔒 Cerrado por", value=str(interaction.user), inline=True)
                    tr_embed.add_field(name="🛡️ Reclamado por", value=ticket.get("claimedByTag") or "Nadie", inline=True)
                    tr_embed.add_field(name="📅 Fecha de cierre", value=datetime.utcnow().strftime("%d/%m/%Y %H:%M"), inline=False)
                    await tr_channel.send(embeds=[tr_embed])
                    text = "\n".join(lines)[:1900] or "Sin mensajes."
                    await tr_channel.send(f"```\n{text}\n```")
        except Exception as e:
            print(f"Error al generar transcripción: {e}")

        delete_ticket(interaction.guild.id, interaction.channel.id)

        import asyncio
        await asyncio.sleep(5)
        try:
            await interaction.channel.delete(reason=f"Ticket cerrado por {interaction.user}")
        except Exception as e:
            print(f"Error al eliminar canal: {e}")

# ── Abrir ticket ──────────────────────────────────────────

async def open_ticket(interaction: discord.Interaction, category: str, fields: dict):
    guild = interaction.guild
    member = interaction.user
    gc = get_guild_config(guild.id)
    ticket_number = next_ticket_number(guild.id)

    prefix = CATEGORY_PREFIXES.get(category, "ticket")
    safe_name = re.sub(r"[^a-z0-9]", "", member.name.lower())[:20] or "usuario"
    channel_name = f"{prefix}-{str(ticket_number).zfill(4)}-{safe_name}"

    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        member: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)
    }
    for role_id in gc["staffRoles"]:
        role = guild.get_role(int(role_id))
        if role:
            overwrites[role] = discord.PermissionOverwrite(
                view_channel=True, send_messages=True,
                read_message_history=True, manage_messages=True
            )

    try:
        parent = interaction.channel.category if interaction.channel else None
        ticket_channel = await guild.create_text_channel(
            name=channel_name,
            overwrites=overwrites,
            category=parent
        )

        create_ticket(guild.id, ticket_channel.id, member.id, ticket_number, category, fields)

        num = str(ticket_number).zfill(4)
        label = CATEGORY_LABELS.get(category, "🎫 Ticket")
        color = CATEGORY_COLORS.get(category, 0x5865f2)

        postulation_desc = "\n".join([
            f"¡Hola {member.mention}! Para completar tu postulación debes rellenar el formulario oficial:",
            f"",
            f"**[📝 Formulario de Postulación]({FORM_LINK})**",
            f"",
            f"**📋 Normas de postulación:**",
            f"> • Rellena el formulario con información **verídica** y detallada.",
            f"> • Envía el formulario **una sola vez**, no lo repitas.",
            f"> • No insistas al staff por el estado de tu postulación.",
            f"> • Debes cumplir los requisitos del servidor para ser aceptado.",
            f"> • El staff te contactará si tu candidatura es aceptada."
        ])

        descriptions = {
            "report": f"¡Hola {member.mention}! Tu reporte ha sido recibido.\nEl staff lo revisará lo antes posible.",
            "general": f"¡Hola {member.mention}! Tu ticket ha sido creado.\nDescribe tu situación y el staff te atenderá pronto.",
            "postulation": postulation_desc
        }

        embed = discord.Embed(
            title=f"🎫 Ticket #{num} — {label}",
            description=descriptions.get(category, f"¡Hola {member.mention}! Tu ticket ha sido creado."),
            color=color,
            timestamp=datetime.utcnow()
        )
        embed.add_field(name="👤 Abierto por", value=member.mention, inline=True)
        embed.add_field(name="📋 Estado", value="🟢 Abierto", inline=True)
        embed.add_field(name="🛡️ Reclamado por", value="Nadie", inline=True)

        if category == "report":
            embed.add_field(name="\u200b", value="**— Detalles del Reporte —**", inline=False)
            embed.add_field(name="🎯 Usuario reportado", value=fields.get("reportedUser", "—"), inline=False)
            embed.add_field(name="📝 Razón del reporte", value=fields.get("reportReason", "—"), inline=False)
        if category == "general":
            embed.add_field(name="\u200b", value="**— Detalles —**", inline=False)
            embed.add_field(name="📝 Motivo del ticket", value=fields.get("generalReason", "—"), inline=False)

        view = TicketButtonView()
        await ticket_channel.send(content=member.mention, embeds=[embed], view=view)

        await interaction.edit_original_response(content=f"✅ Tu ticket ha sido creado: {ticket_channel.mention}", view=None)

    except Exception as e:
        print(f"Error al crear ticket: {e}")
        try:
            await interaction.edit_original_response(content="❌ No se pudo crear el ticket. Verifica los permisos del bot.", view=None)
        except Exception:
            pass

# ── Bot ───────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    bot.add_view(CategorySelectView())
    bot.add_view(TicketButtonView())
    await bot.tree.sync()
    print(f"✅ Conectado como {bot.user} (ID: {bot.user.id})")
    print("📡 Slash commands sincronizados")

# ═══════════════════════════════════════════════════════════
#  SLASH COMMANDS — TICKETS
# ═══════════════════════════════════════════════════════════

tickets_group = app_commands.Group(name="tickets", description="Sistema de tickets", default_permissions=discord.Permissions(administrator=True))

@tickets_group.command(name="panel", description="Publicar el panel de tickets en este canal")
async def tickets_panel(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    embed = discord.Embed(
        title="🎫 Sistema de Tickets",
        description="Selecciona la categoría correspondiente a tu consulta en el menú de abajo.\nUn miembro del staff te atenderá lo antes posible.",
        color=0x5865f2,
        timestamp=datetime.utcnow()
    )
    embed.add_field(
        name="📋 Normas del Sistema de Tickets",
        value="\n".join([
            "> • Sé respetuoso con el staff y los demás usuarios en todo momento.",
            "> • No abras tickets innecesarios, de broma o spam.",
            "> • Abre **un solo ticket** por asunto, no duplicados.",
            "> • Proporciona información clara y detallada en tu ticket.",
            "> • Si tu ticket es un reporte, incluye evidencia si es posible.",
            "> • Espera la respuesta del staff, no insistas de forma repetitiva."
        ]),
        inline=False
    )
    embed.set_footer(text="Usa el menú desplegable para abrir tu ticket")
    view = CategorySelectView()
    try:
        await interaction.channel.send(embeds=[embed], view=view)
        await interaction.edit_original_response(content="✅ ¡Panel de tickets publicado!")
    except Exception as e:
        await interaction.edit_original_response(content="❌ No se pudo publicar el panel. Verifica los permisos del bot.")

bot.tree.add_command(tickets_group)

roleadd_group = app_commands.Group(name="roleadd", description="Gestionar permisos de roles", default_permissions=discord.Permissions(administrator=True))

@roleadd_group.command(name="staff", description="Agregar un rol de staff para gestionar tickets")
@app_commands.describe(rol="El rol a agregar como staff")
async def roleadd_staff(interaction: discord.Interaction, rol: discord.Role):
    added = add_staff_role(interaction.guild.id, rol.id)
    if added:
        await interaction.response.send_message(f"✅ {rol.mention} ha sido agregado como rol de staff para los tickets.", ephemeral=True)
    else:
        await interaction.response.send_message(f"❌ {rol.mention} ya es un rol de staff.", ephemeral=True)

bot.tree.add_command(roleadd_group)

transcript_group = app_commands.Group(name="transcript", description="Configurar transcripciones de tickets", default_permissions=discord.Permissions(administrator=True))

@transcript_group.command(name="channel", description="Elegir el canal donde se enviarán las transcripciones")
@app_commands.describe(canal="El canal para las transcripciones")
async def transcript_channel(interaction: discord.Interaction, canal: discord.TextChannel):
    set_transcript_channel(interaction.guild.id, canal.id)
    await interaction.response.send_message(f"✅ Las transcripciones de tickets se enviarán a {canal.mention}.", ephemeral=True)

bot.tree.add_command(transcript_group)

# ═══════════════════════════════════════════════════════════
#  SLASH COMMANDS — GENERALES Y MODERACIÓN
# ═══════════════════════════════════════════════════════════

@bot.tree.command(name="ping", description="Comprueba la latencia del bot")
async def slash_ping(interaction: discord.Interaction):
    await interaction.response.send_message(f"🏓 Pong! Latencia: **{round(bot.latency * 1000)}ms**")

@bot.tree.command(name="hola", description="El bot te saluda")
async def slash_hola(interaction: discord.Interaction):
    await interaction.response.send_message(f"👋 ¡Hola, {interaction.user.mention}!")

@bot.tree.command(name="info", description="Muestra información del servidor")
async def slash_info(interaction: discord.Interaction):
    guild = interaction.guild
    embed = discord.Embed(title=f"📊 Info de {guild.name}", color=0x5865f2)
    embed.add_field(name="👥 Miembros", value=str(guild.member_count), inline=True)
    embed.add_field(name="💬 Canales", value=str(len(guild.channels)), inline=True)
    embed.add_field(name="🎭 Roles", value=str(len(guild.roles)), inline=True)
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    await interaction.response.send_message(embeds=[embed])

@bot.tree.command(name="say", description="Enviar un mensaje a un canal específico")
@app_commands.describe(canal="El canal donde enviar el mensaje", mensaje="El mensaje a enviar")
@app_commands.default_permissions(administrator=True)
async def slash_say(interaction: discord.Interaction, canal: discord.TextChannel, mensaje: str):
    try:
        await canal.send(mensaje)
        await interaction.response.send_message(f"✅ Mensaje enviado a {canal.mention}!", ephemeral=True)
    except Exception:
        await interaction.response.send_message(f"❌ No se pudo enviar el mensaje. Verifica los permisos.", ephemeral=True)

@bot.tree.command(name="lock", description="Bloquear el canal actual")
@app_commands.default_permissions(administrator=True)
async def slash_lock(interaction: discord.Interaction):
    await interaction.channel.set_permissions(interaction.guild.default_role, send_messages=False)
    await interaction.response.send_message("🔒 ¡Canal bloqueado! Los usuarios no pueden hablar.", ephemeral=True)

@bot.tree.command(name="unlock", description="Desbloquear el canal actual")
@app_commands.default_permissions(administrator=True)
async def slash_unlock(interaction: discord.Interaction):
    await interaction.channel.set_permissions(interaction.guild.default_role, send_messages=None)
    await interaction.response.send_message("🔓 ¡Canal desbloqueado! Los usuarios ya pueden hablar.", ephemeral=True)

@bot.tree.command(name="clear", description="Borra mensajes del canal")
@app_commands.describe(cantidad="Número de mensajes a borrar (máx 100)")
@app_commands.default_permissions(administrator=True)
async def slash_clear(interaction: discord.Interaction, cantidad: app_commands.Range[int, 1, 100] = 5):
    await interaction.response.defer(ephemeral=True)
    deleted = await interaction.channel.purge(limit=cantidad)
    await interaction.followup.send(f"🗑️ Se borraron **{len(deleted)}** mensajes.", ephemeral=True)

@bot.tree.command(name="kick", description="Expulsa a un miembro del servidor")
@app_commands.describe(miembro="Miembro a expulsar", razon="Razón de la expulsión")
@app_commands.default_permissions(administrator=True)
async def slash_kick(interaction: discord.Interaction, miembro: discord.Member, razon: str = "Sin razón especificada"):
    await miembro.kick(reason=razon)
    await interaction.response.send_message(f"👢 **{miembro}** ha sido expulsado. Razón: {razon}", ephemeral=True)

@bot.tree.command(name="ban", description="Banea a un miembro del servidor")
@app_commands.describe(miembro="Miembro a banear", razon="Razón del baneo")
@app_commands.default_permissions(administrator=True)
async def slash_ban(interaction: discord.Interaction, miembro: discord.Member, razon: str = "Sin razón especificada"):
    await miembro.ban(reason=razon)
    await interaction.response.send_message(f"🔨 **{miembro}** ha sido baneado. Razón: {razon}", ephemeral=True)

@bot.tree.command(name="unban", description="Desbanea a un usuario por su ID")
@app_commands.describe(id_usuario="ID del usuario a desbanear")
@app_commands.default_permissions(administrator=True)
async def slash_unban(interaction: discord.Interaction, id_usuario: str):
    try:
        await interaction.guild.unban(discord.Object(id=int(id_usuario)))
        await interaction.response.send_message(f"✅ Usuario con ID **{id_usuario}** desbaneado.", ephemeral=True)
    except Exception:
        await interaction.response.send_message("❌ No se encontró ese usuario en la lista de baneados.", ephemeral=True)

@bot.tree.command(name="mute", description="Silencia a un miembro del servidor")
@app_commands.describe(miembro="Miembro a silenciar", razon="Razón del silencio")
@app_commands.default_permissions(administrator=True)
async def slash_mute(interaction: discord.Interaction, miembro: discord.Member, razon: str = "Sin razón especificada"):
    role = discord.utils.get(interaction.guild.roles, name="Muted")
    if not role:
        role = await interaction.guild.create_role(name="Muted")
        for ch in interaction.guild.channels:
            await ch.set_permissions(role, send_messages=False, speak=False)
    await miembro.add_roles(role, reason=razon)
    await interaction.response.send_message(f"🔇 **{miembro.mention}** ha sido silenciado. Razón: {razon}", ephemeral=True)

@bot.tree.command(name="unmute", description="Quita el silencio a un miembro")
@app_commands.describe(miembro="Miembro al que quitar el silencio")
@app_commands.default_permissions(administrator=True)
async def slash_unmute(interaction: discord.Interaction, miembro: discord.Member):
    role = discord.utils.get(interaction.guild.roles, name="Muted")
    if role and role in miembro.roles:
        await miembro.remove_roles(role)
        await interaction.response.send_message(f"🔊 **{miembro.mention}** ya puede hablar de nuevo.", ephemeral=True)
    else:
        await interaction.response.send_message("❌ Ese miembro no está silenciado.", ephemeral=True)

@bot.tree.command(name="help", description="Mostrar todos los comandos disponibles")
async def slash_help(interaction: discord.Interaction):
    embed = discord.Embed(title="🤖 Comandos del Bot", color=0x5865f2)
    embed.add_field(
        name="🎫 Sistema de Tickets",
        value="`/tickets panel` • `/roleadd staff @rol` • `/transcript channel #canal`",
        inline=False
    )
    embed.add_field(
        name="🛡️ Moderación (admin)",
        value="`/kick` • `/ban` • `/unban` • `/mute` • `/unmute` • `/clear` • `/lock` • `/unlock` • `/say`",
        inline=False
    )
    embed.add_field(
        name="💬 Generales",
        value="`/ping` • `/hola` • `/info` • `/help`",
        inline=False
    )
    embed.add_field(
        name="Prefijo `!`",
        value="`!ping` • `!hola` • `!info` • `!kick` • `!ban` • `!unban` • `!mute` • `!unmute` • `!clear` • `!lock` • `!unlock` • `!say` • `!help`",
        inline=False
    )
    await interaction.response.send_message(embeds=[embed], ephemeral=True)

# ═══════════════════════════════════════════════════════════
#  PREFIJO (!)
# ═══════════════════════════════════════════════════════════

@bot.command()
async def ping(ctx):
    await ctx.send(f"🏓 Pong! Latencia: **{round(bot.latency * 1000)}ms**")

@bot.command()
async def hola(ctx):
    await ctx.send(f"👋 ¡Hola, {ctx.author.mention}!")

@bot.command()
async def info(ctx):
    guild = ctx.guild
    embed = discord.Embed(title=f"📊 Info de {guild.name}", color=0x5865f2)
    embed.add_field(name="👥 Miembros", value=str(guild.member_count), inline=True)
    embed.add_field(name="💬 Canales", value=str(len(guild.channels)), inline=True)
    embed.add_field(name="🎭 Roles", value=str(len(guild.roles)), inline=True)
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    await ctx.send(embeds=[embed])

@bot.command()
async def say(ctx, canal: discord.TextChannel, *, mensaje: str):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    await canal.send(mensaje)
    await ctx.send(f"✅ Mensaje enviado a {canal.mention}!")

@bot.command()
async def lock(ctx):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    await ctx.channel.set_permissions(ctx.guild.default_role, send_messages=False)
    await ctx.send("🔒 ¡Canal bloqueado!")

@bot.command()
async def unlock(ctx):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    await ctx.channel.set_permissions(ctx.guild.default_role, send_messages=None)
    await ctx.send("🔓 ¡Canal desbloqueado!")

@bot.command()
async def clear(ctx, cantidad: int = 5):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    deleted = await ctx.channel.purge(limit=cantidad + 1)
    msg = await ctx.channel.send(f"🗑️ Se borraron **{len(deleted) - 1}** mensajes.")
    import asyncio; await asyncio.sleep(4); await msg.delete()

@bot.command()
async def kick(ctx, miembro: discord.Member, *, razon: str = "Sin razón especificada"):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    await miembro.kick(reason=razon)
    await ctx.send(f"👢 **{miembro}** ha sido expulsado. Razón: {razon}")

@bot.command()
async def ban(ctx, miembro: discord.Member, *, razon: str = "Sin razón especificada"):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    await miembro.ban(reason=razon)
    await ctx.send(f"🔨 **{miembro}** ha sido baneado. Razón: {razon}")

@bot.command()
async def unban(ctx, id_usuario: str):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    try:
        await ctx.guild.unban(discord.Object(id=int(id_usuario)))
        await ctx.send(f"✅ Usuario con ID **{id_usuario}** desbaneado.")
    except Exception:
        await ctx.send("❌ No se encontró ese usuario en la lista de baneados.")

@bot.command()
async def mute(ctx, miembro: discord.Member, *, razon: str = "Sin razón especificada"):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    role = discord.utils.get(ctx.guild.roles, name="Muted")
    if not role:
        role = await ctx.guild.create_role(name="Muted")
        for ch in ctx.guild.channels:
            await ch.set_permissions(role, send_messages=False, speak=False)
    await miembro.add_roles(role, reason=razon)
    await ctx.send(f"🔇 **{miembro.mention}** ha sido silenciado. Razón: {razon}")

@bot.command()
async def unmute(ctx, miembro: discord.Member):
    if not ctx.author.guild_permissions.administrator:
        await ctx.send("❌ Necesitas ser administrador.", delete_after=5); return
    role = discord.utils.get(ctx.guild.roles, name="Muted")
    if role and role in miembro.roles:
        await miembro.remove_roles(role)
        await ctx.send(f"🔊 **{miembro.mention}** ya puede hablar de nuevo.")
    else:
        await ctx.send("❌ Ese miembro no está silenciado.")

@bot.command(name="help")
async def prefix_help(ctx):
    embed = discord.Embed(title="🤖 Comandos del Bot", color=0x5865f2)
    embed.add_field(name="🎫 Tickets (slash)", value="`/tickets panel` • `/roleadd staff` • `/transcript channel`", inline=False)
    embed.add_field(name="🛡️ Moderación (admin)", value="`!kick` • `!ban` • `!unban <ID>` • `!mute` • `!unmute` • `!clear [n]` • `!lock` • `!unlock` • `!say #canal msg`", inline=False)
    embed.add_field(name="💬 Generales", value="`!ping` • `!hola` • `!info` • `!help`", inline=False)
    await ctx.send(embeds=[embed])

bot.run(TOKEN)
