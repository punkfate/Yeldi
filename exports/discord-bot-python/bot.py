from __future__ import annotations

import asyncio
import html
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATE_FILE = DATA_DIR / "ticketConfig.json"
TRANSCRIPTS_DIR = DATA_DIR / "transcripts"
BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "").strip()
GUILD_ID = os.getenv("GUILD_ID", "").strip()
PREFIX = "!"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("jester-bot")

CATEGORIES = {
    "report": ("🚨 Reporte", 0xED4245),
    "general": ("❓ Duda General", 0x5865F2),
    "admin_support": ("🛠️ Soporte de Administración", 0x9B59B6),
    "twitch_support": ("🎥 Soporte de Twitch", 0x9146FF),
}
PANEL_CUSTOM_IDS = {
    "ticket_category",
    "jester_ticket_category_v2",
    "jester_ticket_category_v3",
    "ticket_category_select",
    "ticket_menu",
    "ticket_select",
    "panel_tickets",
}


def load_state() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


STATE: dict[str, Any] = load_state()


def save_state() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = STATE_FILE.with_suffix(".tmp")
    temp_path.write_text(
        json.dumps(STATE, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_path.replace(STATE_FILE)


def guild_config(guild_id: int) -> dict[str, Any]:
    key = str(guild_id)
    config = STATE.setdefault(
        key,
        {
            "staffRoles": [],
            "managerRoles": [],
            "twitchModRoles": [],
            "ticketPanel": None,
            "tickets": {},
            "ticketCounter": 0,
            "transcriptChannel": None,
        },
    )
    config.setdefault("staffRoles", [])
    config.setdefault("managerRoles", [])
    config.setdefault("twitchModRoles", [])
    config.setdefault("ticketPanel", None)
    config.setdefault("tickets", {})
    config.setdefault("ticketCounter", 0)
    config.setdefault("transcriptChannel", None)
    return config


def category_label(category: str) -> str:
    return CATEGORIES.get(category, ("🎫 Ticket", 0x5865F2))[0]


def configured_roles(guild: discord.Guild, role_ids: list[str]) -> list[discord.Role]:
    roles = []
    for role_id in role_ids:
        role = guild.get_role(int(role_id))
        if role:
            roles.append(role)
    return roles


def can_manage_ticket(member: discord.Member, ticket: dict[str, Any]) -> bool:
    if member.guild_permissions.administrator:
        return True
    config = guild_config(member.guild.id)
    if ticket.get("category") == "admin_support":
        allowed_ids = config["managerRoles"]
    elif ticket.get("category") == "twitch_support":
        allowed_ids = config["twitchModRoles"]
    else:
        allowed_ids = config["staffRoles"]
    member_role_ids = {str(role.id) for role in member.roles}
    return any(str(role_id) in member_role_ids for role_id in allowed_ids)


def build_panel_embed() -> discord.Embed:
    embed = discord.Embed(
        title="🎫 Sistema de Tickets — Jester's Club",
        description=(
            "Bienvenido al sistema oficial de soporte de **Jester's Club**.\n"
            "Selecciona la categoría correspondiente."
        ),
        color=discord.Color.blurple(),
    )
    embed.add_field(
        name="🚨 Reportes",
        value="Informa sobre usuarios que hayan incumplido las normas.",
        inline=False,
    )
    embed.add_field(
        name="❓ Dudas Generales",
        value="Preguntas o ayuda general relacionada con Jester's Club.",
        inline=False,
    )
    embed.add_field(
        name="🛠️ Soporte de Administración",
        value=(
            "Privado: lo verá quien abre el ticket, el propietario del servidor, "
            "los administradores y el equipo de gestión."
        ),
        inline=False,
    )
    embed.add_field(
        name="🎥 Soporte de Twitch",
        value=(
            "Privado: lo verá quien abre el ticket, los administradores y "
            "los moderadores de Twitch."
        ),
        inline=False,
    )
    embed.add_field(
        name="📋 Normas",
        value=(
            "> • Sé respetuoso con el staff.\n"
            "> • Abre un solo ticket por asunto.\n"
            "> • Proporciona información clara y detallada.\n"
            "> • En reportes, incluye evidencia si es posible."
        ),
        inline=False,
    )
    embed.set_footer(text="Usa el menú desplegable para abrir tu ticket")
    return embed


def build_ticket_embed(
    ticket: dict[str, Any],
    channel_id: int | None = None,
) -> discord.Embed:
    category = ticket.get("category", "general")
    label, color = CATEGORIES.get(category, ("🎫 Ticket", 0x5865F2))
    claimed = ticket.get("claimedBy")
    embed = discord.Embed(
        title=f"🎫 Ticket #{int(ticket.get('ticketNumber', 0)):04d} — {label}",
        description=f"Ticket abierto para {label.lower()}.",
        color=0xFEE75C if claimed else color,
        timestamp=datetime.now(timezone.utc),
    )
    embed.add_field(name="👤 Abierto por", value=f"<@{ticket['userId']}>", inline=True)
    embed.add_field(
        name="📋 Estado",
        value="🟡 Reclamado" if claimed else "🟢 Abierto",
        inline=True,
    )
    embed.add_field(
        name="🛡️ Reclamado por",
        value=f"<@{claimed}>" if claimed else "Nadie",
        inline=True,
    )
    if channel_id:
        embed.add_field(
            name="📍 Canal del ticket",
            value=f"<#{channel_id}>",
            inline=False,
        )
    fields = ticket.get("fields", {})
    if category == "report":
        embed.add_field(name="🎯 Personas reportadas", value=fields.get("reportedUser", "—"), inline=False)
        embed.add_field(name="📝 Razón del reporte", value=fields.get("reportReason", "—"), inline=False)
    elif category == "general":
        embed.add_field(name="📝 Motivo del ticket", value=fields.get("generalReason", "—"), inline=False)
    return embed


class TicketCategorySelect(discord.ui.Select):
    def __init__(self) -> None:
        options = [
            discord.SelectOption(
                label="Reportes",
                description="Reporta a un usuario que haya infringido las normas",
                emoji="🚨",
                value="report",
            ),
            discord.SelectOption(
                label="Dudas Generales",
                description="Pregunta o pide ayuda",
                emoji="❓",
                value="general",
            ),
            discord.SelectOption(
                label="Soporte de Administración",
                description="Privado: propietario, administradores y equipo de gestión",
                emoji="🛠️",
                value="admin_support",
            ),
            discord.SelectOption(
                label="Soporte de Twitch",
                description="Privado: administradores y moderadores de Twitch",
                emoji="🎥",
                value="twitch_support",
            ),
        ]
        super().__init__(
            placeholder="📂 Selecciona una categoría...",
            min_values=1,
            max_values=1,
            options=options,
            custom_id="jester_ticket_category_v3",
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        category = self.values[0]
        if not interaction.guild or not isinstance(interaction.user, discord.Member):
            await interaction.response.send_message(
                "Este menú solo funciona dentro del servidor.",
                ephemeral=True,
            )
            return

        existing = find_open_ticket(interaction.guild, interaction.user.id)
        if existing:
            await interaction.response.send_message(
                f"❌ Ya tienes un ticket abierto: {existing.mention}",
                ephemeral=True,
            )
            return

        if category == "report":
            await interaction.response.send_message(
                "**🚨 Reporte — Paso 1/2:** Selecciona hasta 25 personas que quieras reportar:",
                view=ReportUserView(),
                ephemeral=True,
            )
        elif category == "general":
            await interaction.response.send_modal(GeneralTicketModal())
        else:
            await interaction.response.defer(ephemeral=True, thinking=True)
            await open_ticket(interaction, category, {})


class TicketPanelView(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=None)
        self.add_item(TicketCategorySelect())


class ReportUserSelect(discord.ui.UserSelect):
    def __init__(self) -> None:
        super().__init__(
            placeholder="Busca y selecciona hasta 25 usuarios...",
            min_values=1,
            max_values=25,
            custom_id="report_user_select",
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_modal(ReportTicketModal(self.values))


class ReportUserView(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=180)
        self.add_item(ReportUserSelect())


class ReportTicketModal(discord.ui.Modal, title="🚨 Reporte — Paso 2/2"):
    def __init__(self, selected_users: list[discord.User | discord.Member]) -> None:
        super().__init__(timeout=300)
        self.reported_user_ids = [user.id for user in selected_users]
        self.reported_user = discord.ui.TextInput(
            label="Personas seleccionadas (no modificar)",
            style=discord.TextStyle.paragraph,
            default=", ".join(user.mention for user in selected_users)[:1000],
            max_length=1000,
            required=True,
        )
        self.reason = discord.ui.TextInput(
            label="Razón del reporte",
            style=discord.TextStyle.paragraph,
            placeholder="Explica el motivo y añade detalles o evidencia.",
            max_length=1000,
            required=True,
        )
        self.add_item(self.reported_user)
        self.add_item(self.reason)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        await open_ticket(
            interaction,
            "report",
            {
                "reportedUser": ", ".join(
                    f"<@{user_id}>" for user_id in self.reported_user_ids
                ),
                "reportReason": self.reason.value,
            },
        )


class GeneralTicketModal(discord.ui.Modal, title="❓ Duda General"):
    reason = discord.ui.TextInput(
        label="¿Cuál es el motivo de tu ticket?",
        style=discord.TextStyle.paragraph,
        placeholder="Describe tu duda o problema con el mayor detalle posible.",
        max_length=1000,
        required=True,
    )

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        await open_ticket(interaction, "general", {"generalReason": self.reason.value})


class TicketActionView(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=None)

    @discord.ui.button(
        label="Reclamar",
        emoji="✋",
        style=discord.ButtonStyle.success,
        custom_id="claim_ticket",
    )
    async def claim_button(
        self, interaction: discord.Interaction, _button: discord.ui.Button
    ) -> None:
        await handle_ticket_action(interaction, "claim")

    @discord.ui.button(
        label="Liberar",
        emoji="🔓",
        style=discord.ButtonStyle.secondary,
        custom_id="unclaim_ticket",
    )
    async def unclaim_button(
        self, interaction: discord.Interaction, _button: discord.ui.Button
    ) -> None:
        await handle_ticket_action(interaction, "unclaim")

    @discord.ui.button(
        label="Cerrar Ticket",
        emoji="🔒",
        style=discord.ButtonStyle.danger,
        custom_id="close_ticket",
    )
    async def close_button(
        self, interaction: discord.Interaction, _button: discord.ui.Button
    ) -> None:
        await close_ticket(interaction)


def find_open_ticket(guild: discord.Guild, user_id: int) -> discord.TextChannel | None:
    config = guild_config(guild.id)
    for channel_id, ticket in list(config["tickets"].items()):
        if int(ticket.get("userId", 0)) != user_id:
            continue
        channel = guild.get_channel(int(channel_id))
        if isinstance(channel, discord.TextChannel):
            return channel
        config["tickets"].pop(channel_id, None)
        save_state()
    return None


async def open_ticket(
    interaction: discord.Interaction,
    category: str,
    fields: dict[str, str],
) -> None:
    guild = interaction.guild
    member = interaction.user
    if not guild or not isinstance(member, discord.Member):
        await interaction.followup.send("No se pudo identificar el servidor o miembro.", ephemeral=True)
        return

    existing = find_open_ticket(guild, member.id)
    if existing:
        await interaction.followup.send(
            f"❌ Ya tienes un ticket abierto: {existing.mention}",
            ephemeral=True,
        )
        return

    config = guild_config(guild.id)
    ticket_number = int(config["ticketCounter"]) + 1
    config["ticketCounter"] = ticket_number
    save_state()

    prefix = {
        "report": "reporte",
        "general": "duda",
        "admin_support": "soporte-admin",
        "twitch_support": "soporte-twitch",
    }.get(category, "ticket")
    safe_name = re.sub(r"[^a-z0-9]", "", member.name.lower())[:20] or "usuario"
    channel_name = f"{prefix}-{ticket_number:04d}-{safe_name}"[:100]

    overwrites: dict[discord.Role | discord.Member, discord.PermissionOverwrite] = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        member: discord.PermissionOverwrite(
            view_channel=True,
            send_messages=True,
            read_message_history=True,
        ),
    }
    role_key = (
        "managerRoles"
        if category == "admin_support"
        else "twitchModRoles"
        if category == "twitch_support"
        else "staffRoles"
    )
    for role in configured_roles(guild, config[role_key]):
        overwrites[role] = discord.PermissionOverwrite(
            view_channel=True,
            send_messages=True,
            read_message_history=True,
            manage_messages=True,
        )

    parent = interaction.channel.category if isinstance(interaction.channel, discord.TextChannel) else None
    try:
        channel = await guild.create_text_channel(
            channel_name,
            category=parent,
            overwrites=overwrites,
            reason=f"Ticket de {member}",
        )
        ticket = {
            "userId": str(member.id),
            "claimedBy": None,
            "claimedByTag": None,
            "ticketNumber": ticket_number,
            "category": category,
            "fields": fields,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        config["tickets"][str(channel.id)] = ticket
        save_state()
        await channel.send(
            content=member.mention,
            embed=build_ticket_embed(ticket, channel.id),
            view=TicketActionView(),
        )
        await interaction.followup.send(
            f"✅ Tu ticket ha sido creado: {channel}",
            ephemeral=True,
        )
    except (discord.Forbidden, discord.HTTPException) as error:
        log.exception("No se pudo crear el canal del ticket")
        await interaction.followup.send(
            "❌ No se pudo crear el ticket. Verifica que el bot pueda gestionar canales y roles.",
            ephemeral=True,
        )


async def handle_ticket_action(
    interaction: discord.Interaction,
    action: str,
) -> None:
    if not interaction.guild or not interaction.channel:
        await interaction.response.send_message(
            embed=discord.Embed(
                title="❌ Acción no realizada",
                description="Este botón solo funciona dentro de un ticket.",
                color=discord.Color.red(),
                timestamp=datetime.now(timezone.utc),
            ),
            ephemeral=True,
        )
        return
    config = guild_config(interaction.guild.id)
    ticket = config["tickets"].get(str(interaction.channel.id))
    if not ticket:
        await interaction.response.send_message(
            embed=discord.Embed(
                title="❌ Acción no realizada",
                description="Este no es un canal de ticket.",
                color=discord.Color.red(),
                timestamp=datetime.now(timezone.utc),
            ),
            ephemeral=True,
        )
        return
    if not isinstance(interaction.user, discord.Member) or not can_manage_ticket(interaction.user, ticket):
        await interaction.response.send_message(
            embed=discord.Embed(
                title="❌ Acción no realizada",
                description="No tienes permiso para gestionar este ticket.",
                color=discord.Color.red(),
                timestamp=datetime.now(timezone.utc),
            ),
            ephemeral=True,
        )
        return

    if action == "claim":
        if ticket.get("claimedBy") == str(interaction.user.id):
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="❌ Acción no realizada",
                    description="Ya reclamaste este ticket.",
                    color=discord.Color.red(),
                    timestamp=datetime.now(timezone.utc),
                ),
                ephemeral=True,
            )
            return
        ticket["claimedBy"] = str(interaction.user.id)
        ticket["claimedByTag"] = str(interaction.user)
        notification = discord.Embed(
            title="✋ Ticket reclamado",
            description=f"{interaction.user.mention} ha reclamado este ticket.",
            color=discord.Color.gold(),
            timestamp=datetime.now(timezone.utc),
        )
        new_name = f"reclamado-{interaction.channel.name.removeprefix('reclamado-')}"[:100]
    else:
        if not ticket.get("claimedBy"):
            await interaction.response.send_message(
                embed=discord.Embed(
                    title="❌ Acción no realizada",
                    description="Este ticket no está reclamado.",
                    color=discord.Color.red(),
                    timestamp=datetime.now(timezone.utc),
                ),
                ephemeral=True,
            )
            return
        ticket["claimedBy"] = None
        ticket["claimedByTag"] = None
        notification = discord.Embed(
            title="🔓 Ticket liberado",
            description=f"{interaction.user.mention} ha liberado este ticket.",
            color=discord.Color.blurple(),
            timestamp=datetime.now(timezone.utc),
        )
        new_name = interaction.channel.name.removeprefix("reclamado-")[:100]

    save_state()
    await interaction.response.edit_message(
        embed=build_ticket_embed(ticket, interaction.channel.id),
        view=TicketActionView(),
    )
    await interaction.channel.send(embed=notification)
    try:
        await interaction.channel.edit(name=new_name)
    except discord.HTTPException:
        log.warning("No se pudo actualizar el nombre del ticket %s", interaction.channel.id)


def render_transcript_html(ticket: dict[str, Any], messages: list[discord.Message], closed_by: str) -> str:
    rows = []
    for message in messages:
        embed_text = []
        for embed in message.embeds:
            if embed.title:
                embed_text.append(embed.title)
            if embed.description:
                embed_text.append(embed.description)
            embed_text.extend(
                f"{field.name}: {field.value}" for field in embed.fields
            )
        message_text = message.content or "\n".join(embed_text) or "[Sin contenido]"
        content = html.escape(message_text).replace("\n", "<br>")
        attachments = " ".join(
            f'<a href="{html.escape(item.url, quote=True)}">Adjunto</a>'
            for item in message.attachments
        )
        rows.append(
            "<article>"
            f"<strong>{html.escape(str(message.author))}</strong>"
            f"<small>{html.escape(message.created_at.isoformat())}</small>"
            f"<p>{content}</p>{attachments}</article>"
        )
    body = "\n".join(rows) or "<p>Sin mensajes.</p>"
    claimed_by = ticket.get("claimedByTag") or "Nadie"
    return f"""<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Transcripción de ticket</title>
<style>body{{font:15px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;background:#111827;color:#f3f4f6}}
article{{padding:1rem;margin:.75rem 0;background:#1f2937;border-radius:10px;overflow-wrap:anywhere}}
small{{margin-left:1rem;color:#9ca3af}}a{{color:#93c5fd}}</style>
<h1>Ticket #{int(ticket.get("ticketNumber", 0)):04d} — {html.escape(category_label(ticket.get("category", "")))}</h1>
<p>Abierto por: {html.escape(str(ticket.get("userId", "")))} · Reclamado por: {html.escape(str(claimed_by))} · Cerrado por: {html.escape(closed_by)}</p>
{body}</html>"""


async def close_ticket(interaction: discord.Interaction) -> None:
    if not interaction.guild or not isinstance(interaction.channel, discord.TextChannel):
        await interaction.response.send_message(
            embed=discord.Embed(
                title="❌ No se pudo cerrar el ticket",
                description="Este no es un canal de ticket.",
                color=discord.Color.red(),
                timestamp=datetime.now(timezone.utc),
            ),
            ephemeral=True,
        )
        return
    config = guild_config(interaction.guild.id)
    ticket = config["tickets"].get(str(interaction.channel.id))
    if not ticket:
        await interaction.response.send_message(
            embed=discord.Embed(
                title="❌ No se pudo cerrar el ticket",
                description="Este no es un canal de ticket.",
                color=discord.Color.red(),
                timestamp=datetime.now(timezone.utc),
            ),
            ephemeral=True,
        )
        return
    if not isinstance(interaction.user, discord.Member):
        await interaction.response.send_message(
            embed=discord.Embed(
                title="❌ No se pudo cerrar el ticket",
                description="No se pudo identificar al miembro.",
                color=discord.Color.red(),
                timestamp=datetime.now(timezone.utc),
            ),
            ephemeral=True,
        )
        return
    allowed = (
        can_manage_ticket(interaction.user, ticket)
        or str(ticket.get("userId")) == str(interaction.user.id)
    )
    if not allowed:
        await interaction.response.send_message(
            embed=discord.Embed(
                title="❌ No se pudo cerrar el ticket",
                description="No tienes permiso para cerrar este ticket.",
                color=discord.Color.red(),
                timestamp=datetime.now(timezone.utc),
            ),
            ephemeral=True,
        )
        return

    channel = interaction.channel
    close_embed = discord.Embed(
        title="🔒 Ticket cerrado",
        description=(
            f"{interaction.user.mention} ha cerrado el ticket.\n"
            f"Canal: {channel.mention}\n"
            "Se guardará la transcripción y el canal se eliminará."
        ),
        color=discord.Color.red(),
        timestamp=datetime.now(timezone.utc),
    )
    await interaction.response.send_message(embed=close_embed)
    try:
        messages = [message async for message in channel.history(limit=None, oldest_first=True)]
        transcript_html = render_transcript_html(ticket, messages, str(interaction.user))
        TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"ticket-{ticket.get('ticketNumber', 0)}-{uuid.uuid4().hex[:8]}.html"
        transcript_path = TRANSCRIPTS_DIR / filename
        transcript_path.write_text(transcript_html, encoding="utf-8")

        transcript_channel_id = config.get("transcriptChannel")
        transcript_channel = (
            interaction.guild.get_channel(int(transcript_channel_id))
            if transcript_channel_id
            else None
        )
        if isinstance(transcript_channel, discord.TextChannel):
            summary = discord.Embed(
                title=f"📄 Transcripción — Ticket #{int(ticket.get('ticketNumber', 0)):04d}",
                description=(
                    f"Abierto por <@{ticket.get('userId')}>\n"
                    f"Cerrado por {interaction.user.mention}\n"
                    f"Categoría: {category_label(ticket.get('category', ''))}"
                ),
                color=discord.Color.blurple(),
                timestamp=datetime.now(timezone.utc),
            )
            await transcript_channel.send(
                embed=summary,
                file=discord.File(transcript_path, filename=filename),
            )
        config["tickets"].pop(str(channel.id), None)
        save_state()
        await channel.delete(delay=5, reason=f"Ticket cerrado por {interaction.user}")
    except (discord.Forbidden, discord.HTTPException, OSError):
        log.exception("No se pudo cerrar el ticket o guardar su transcripción")


def is_ticket_panel(message: discord.Message, bot_user_id: int) -> bool:
    if message.author.id != bot_user_id:
        return False
    if any(
        re.search(r"sistema de tickets|panel de tickets", f"{embed.title or ''} {embed.description or ''}", re.I)
        for embed in message.embeds
    ):
        return True
    for row in message.components:
        for component in getattr(row, "children", []):
            custom_id = getattr(component, "custom_id", "") or ""
            options = getattr(component, "options", [])
            values = {str(getattr(option, "value", "")).lower() for option in options}
            if custom_id in PANEL_CUSTOM_IDS:
                return True
            if values.intersection({"report", "general", "admin_support", "twitch_support", "administration", "twitch"}):
                return True
    return False


async def scan_ticket_panels(
    guild: discord.Guild,
    *,
    full_history: bool,
    candidate_channels_only: bool = False,
    include_channel_ids: set[str] | None = None,
) -> tuple[list[discord.Message], int]:
    panels: list[discord.Message] = []
    inaccessible = 0
    if not bot.user:
        return panels, inaccessible
    included_ids = include_channel_ids or set()
    for channel in guild.text_channels:
        channel_name = f"{channel.name} {channel.category.name if channel.category else ''}".lower()
        likely_panel_channel = any(
            word in channel_name
            for word in ("ticket", "soporte", "support", "panel", "ayuda", "abrir")
        )
        if candidate_channels_only and not likely_panel_channel and str(channel.id) not in included_ids:
            continue
        try:
            async for message in channel.history(
                limit=None if full_history else 100,
                oldest_first=False,
            ):
                if is_ticket_panel(message, bot.user.id):
                    panels.append(message)
        except discord.Forbidden:
            inaccessible += 1
            log.warning("Sin acceso al historial de #%s", channel.name)
        except discord.HTTPException as error:
            log.warning("No se pudo revisar #%s: %s", channel.name, error)
    panels.sort(key=lambda message: message.created_at, reverse=True)
    return panels, inaccessible


async def reconcile_panels_on_startup(guild: discord.Guild) -> None:
    config = guild_config(guild.id)
    saved = config.get("ticketPanel")
    saved_message: discord.Message | None = None
    if saved:
        channel = guild.get_channel(int(saved.get("channelId", 0)))
        if isinstance(channel, discord.TextChannel):
            try:
                saved_message = await channel.fetch_message(int(saved.get("messageId", 0)))
                await saved_message.edit(embed=build_panel_embed(), view=TicketPanelView())
            except (discord.NotFound, discord.Forbidden, discord.HTTPException):
                saved_message = None

    panels, _ = await scan_ticket_panels(
        guild,
        full_history=False,
        candidate_channels_only=True,
        include_channel_ids={str(saved.get("channelId"))} if saved else set(),
    )
    if saved_message and all(message.id != saved_message.id for message in panels):
        panels.append(saved_message)
    if not panels:
        log.info("No se detectaron paneles recientes en %s", guild.name)
        return

    panels.sort(key=lambda message: message.created_at, reverse=True)
    newest, *duplicates = panels
    try:
        await newest.edit(embed=build_panel_embed(), view=TicketPanelView())
        config["ticketPanel"] = {
            "channelId": str(newest.channel.id),
            "messageId": str(newest.id),
        }
        save_state()
    except (discord.Forbidden, discord.HTTPException):
        log.exception("No se pudo actualizar el panel en %s", guild.name)
        return

    for duplicate in duplicates:
        try:
            await duplicate.delete()
        except (discord.Forbidden, discord.HTTPException):
            log.warning("No se pudo borrar un panel duplicado en #%s", duplicate.channel.name)


async def cleanup_recent_ticket_panels(
    guild: discord.Guild,
    bot_user_id: int,
    keep_message_id: int,
    previous_panel: dict[str, Any] | None,
    current_channel_id: int,
) -> tuple[int, int, int]:
    include_ids = {str(current_channel_id)}
    if previous_panel:
        include_ids.add(str(previous_panel.get("channelId", "")))

    panels, inaccessible = await scan_ticket_panels(
        guild,
        full_history=False,
        candidate_channels_only=True,
        include_channel_ids=include_ids,
    )
    if previous_panel:
        old_channel = guild.get_channel(int(previous_panel.get("channelId", 0)))
        if isinstance(old_channel, discord.TextChannel):
            try:
                old_message = await old_channel.fetch_message(int(previous_panel.get("messageId", 0)))
                if is_ticket_panel(old_message, bot_user_id):
                    panels.append(old_message)
            except (discord.NotFound, discord.Forbidden, discord.HTTPException):
                pass

    unique_panels = {message.id: message for message in panels}
    deleted = 0
    failed = 0
    for panel in unique_panels.values():
        if panel.id == keep_message_id:
            continue
        try:
            await panel.delete()
            deleted += 1
        except (discord.Forbidden, discord.HTTPException):
            failed += 1
    return deleted, failed, inaccessible


async def publish_ticket_panel(interaction: discord.Interaction) -> None:
    if not interaction.guild or not isinstance(interaction.channel, discord.TextChannel):
        await interaction.response.send_message(
            "Publica el panel dentro de un canal de texto del servidor.",
            ephemeral=True,
        )
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    config = guild_config(interaction.guild.id)
    previous_panel = config.get("ticketPanel")

    message = await interaction.channel.send(
        embed=build_panel_embed(),
        view=TicketPanelView(),
    )
    config = guild_config(interaction.guild.id)
    config["ticketPanel"] = {
        "channelId": str(message.channel.id),
        "messageId": str(message.id),
    }
    save_state()
    await interaction.followup.send(
        "✅ Panel publicado. La limpieza de paneles recientes anteriores se hará en segundo plano.",
        ephemeral=True,
    )
    async def finish_cleanup() -> None:
        try:
            deleted, failed, inaccessible = await cleanup_recent_ticket_panels(
                interaction.guild,
                bot.user.id,
                message.id,
                previous_panel,
                interaction.channel.id,
            )
            log.info(
                "Limpieza de paneles en %s: %s eliminados, %s fallidos, %s canales sin acceso.",
                interaction.guild.name,
                deleted,
                failed,
                inaccessible,
            )
        except Exception:
            log.exception("Error al limpiar paneles antiguos en segundo plano")

    asyncio.create_task(finish_cleanup())


class JesterBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.members = True
        intents.message_content = True
        super().__init__(command_prefix=PREFIX, intents=intents)
        self._reconciled = False
        self._commands_synced = False

    async def setup_hook(self) -> None:
        self.add_view(TicketPanelView())
        self.add_view(TicketActionView())

    async def sync_guild_commands(self) -> bool:
        if GUILD_ID.isdigit():
            guilds = [discord.Object(id=int(GUILD_ID))]
        else:
            guilds = list(self.guilds)

        global_commands = self.tree.get_commands()
        sync_succeeded = True
        try:
            for guild in guilds:
                self.tree.copy_global_to(guild=guild)

            self.tree.clear_commands(guild=None)
            await self.tree.sync()
            log.info("Comandos globales antiguos eliminados")
        except discord.HTTPException:
            log.exception("No se pudieron eliminar los comandos globales antiguos")
            sync_succeeded = False
        finally:
            if not self.tree.get_commands():
                for command in global_commands:
                    self.tree.add_command(command)

        for guild in guilds:
            try:
                commands = await self.tree.sync(guild=guild)
                log.info(
                    "%s comandos sincronizados en el servidor %s",
                    len(commands),
                    getattr(guild, "name", guild.id),
                )
            except discord.HTTPException:
                log.exception(
                    "No se pudieron sincronizar los comandos en el servidor %s",
                    guild.id,
                )
                sync_succeeded = False

        return sync_succeeded

    async def on_guild_join(self, guild: discord.Guild) -> None:
        if GUILD_ID.isdigit() and guild.id != int(GUILD_ID):
            return

        try:
            self.tree.copy_global_to(guild=guild)
            commands = await self.tree.sync(guild=guild)
            log.info(
                "%s comandos sincronizados en el nuevo servidor %s",
                len(commands),
                guild.name,
            )
        except discord.HTTPException:
            log.exception(
                "No se pudieron sincronizar los comandos en el nuevo servidor %s",
                guild.id,
            )

    async def on_ready(self) -> None:
        if self.user:
            await self.change_presence(
                activity=discord.Game(name="Jester's Club"),
                status=discord.Status.online,
            )
            log.info("Bot conectado como %s en %s servidor(es)", self.user, len(self.guilds))
        if not self._commands_synced:
            self._commands_synced = await self.sync_guild_commands()
        if not self._reconciled:
            self._reconciled = True
            for guild in self.guilds:
                try:
                    await reconcile_panels_on_startup(guild)
                except Exception:
                    log.exception("Error al reconciliar paneles en %s", guild.name)

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot or not message.guild or not message.content.startswith(PREFIX):
            return
        parts = re.findall(
            r'"[^"]*"|\'[^\']*\'|\S+',
            message.content[len(PREFIX):].strip(),
        )
        parts = [
            part[1:-1] if len(part) >= 2 and part[0] == part[-1] and part[0] in {"'", '"'} else part
            for part in parts
        ]
        if not parts:
            return
        command, *args = parts
        command = command.lower()
        if command == "ping":
            await message.reply(f"🏓 ¡Pong! Latencia del bot: **{round(self.latency * 1000)}ms**")
            return
        if command == "hola":
            await message.reply(f"👋 ¡Hola, {message.author.mention}!")
            return
        if command == "info":
            await message.reply(embed=server_info_embed(message.guild))
            return
        if not isinstance(message.author, discord.Member) or not message.author.guild_permissions.administrator:
            await message.reply("Necesitas permisos de Administrador para usar este comando.")
            return
        try:
            if command == "help":
                await message.reply(embed=build_help_embed())
            elif command == "say":
                await prefix_say(message, args)
            elif command == "lock":
                await set_channel_lock(message.channel, message.guild.default_role, True)
                await message.reply("🔒 ¡Canal bloqueado!")
            elif command == "unlock":
                await set_channel_lock(message.channel, message.guild.default_role, False)
                await message.reply("🔓 ¡Canal desbloqueado!")
            elif command == "clear":
                amount = max(1, min(int(args[0]) if args and args[0].isdigit() else 5, 100))
                deleted = await message.channel.purge(limit=amount + 1)
                notice = await message.channel.send(f"🗑️ Se borraron **{max(0, len(deleted) - 1)}** mensajes.")
                await notice.delete(delay=4)
            elif command in {"kick", "ban", "mute", "unmute"}:
                await prefix_member_action(message, command, args)
            elif command == "unban":
                if not args:
                    await message.reply('Uso: `!unban <ID> ["razón"]`')
                else:
                    target_match = re.fullmatch(r"<@!?(\d+)>", args[0])
                    target_id = target_match.group(1) if target_match else args[0]
                    reason = " ".join(args[1:]).strip() or "Razón no especificada"
                    await message.guild.unban(
                        discord.Object(id=int(target_id)),
                        reason=reason,
                    )
                    await message.reply(
                        f"✅ <@{target_id}> ha sido desbaneado. Razón: {reason}"
                    )
            else:
                await message.reply(f"Comando desconocido: `{command}`. Usa `!help`.")
        except (ValueError, discord.Forbidden, discord.HTTPException) as error:
            log.warning("Falló el comando !%s: %s", command, error)
            await message.reply("❌ No se pudo completar el comando. Revisa los permisos y los argumentos.")


bot = JesterBot()


def build_help_embed() -> discord.Embed:
    embed = discord.Embed(
        title="🤖 Comandos del Bot",
        color=discord.Color.blurple(),
    )
    embed.add_field(
        name="🎫 Sistema de Tickets",
        value=(
            "`/tickets panel` — Publicar el panel\n"
            "`/roleadd staff @rol`, `/roleadd manager @rol`, `/roleadd twitch @rol`\n"
            "`/transcript channel #canal` — Elegir canal de transcripciones"
        ),
        inline=False,
    )
    embed.add_field(
        name="🛡️ Moderación",
        value=(
            "`/kick`, `/ban`, `/mute`, `/unmute` — miembro y razón opcional\n"
            "`/unban` — ID y razón opcional; en comandos `!`, pon primero el usuario/ID y luego la razón.\n"
            "Si no indicas razón, se usará “Razón no especificada”."
        ),
        inline=False,
    )
    embed.add_field(
        name="💬 Generales",
        value="`/hola`, `/info`, `/ping`, `/say`, `/lock`, `/unlock`, `/help`",
        inline=False,
    )
    embed.add_field(
        name="⌨️ Comandos con prefijo !",
        value=(
            "`!hola`, `!info`, `!ping`, `!say`, `!lock`, `!unlock`, `!clear`\n"
            "`!kick`, `!ban`, `!unban`, `!mute`, `!unmute`, `!help`\n"
            "En `!kick`, `!ban`, `!mute` y `!unmute` puedes usar mención, nombre exacto o ID; "
            "pon entre comillas los nombres con espacios y añade la razón después del usuario. "
            "`!unban` usa ID y acepta razón."
        ),
        inline=False,
    )
    embed.set_footer(text="Los comandos de moderación requieren permisos de Administrador.")
    return embed


def server_info_embed(guild: discord.Guild) -> discord.Embed:
    embed = discord.Embed(title=f"📊 Info de {guild.name}", color=discord.Color.blurple())
    embed.add_field(name="👥 Miembros", value=str(guild.member_count or "—"), inline=True)
    embed.add_field(name="💬 Canales", value=str(len(guild.channels)), inline=True)
    embed.add_field(name="🎭 Roles", value=str(len(guild.roles)), inline=True)
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    return embed


async def set_channel_lock(
    channel: discord.abc.GuildChannel,
    role: discord.Role,
    locked: bool,
) -> None:
    overwrite = channel.overwrites_for(role)
    overwrite.send_messages = False if locked else None
    await channel.set_permissions(role, overwrite=overwrite)


@bot.tree.command(name="ping", description="Comprobar la latencia del bot")
async def ping(interaction: discord.Interaction) -> None:
    await interaction.response.send_message(
        f"🏓 ¡Pong! Latencia del bot: **{round(bot.latency * 1000)}ms**"
    )


@bot.tree.command(name="hola", description="El bot te saluda")
async def hola(interaction: discord.Interaction) -> None:
    await interaction.response.send_message(f"👋 ¡Hola, {interaction.user.mention}!")


@bot.tree.command(name="help", description="Mostrar todos los comandos disponibles")
async def help_command(interaction: discord.Interaction) -> None:
    await interaction.response.send_message(embed=build_help_embed(), ephemeral=True)


@bot.tree.command(name="info", description="Muestra información del servidor")
@app_commands.guild_only()
async def info(interaction: discord.Interaction) -> None:
    if interaction.guild:
        await interaction.response.send_message(embed=server_info_embed(interaction.guild))
    else:
        await interaction.response.send_message("Este comando solo funciona en un servidor.", ephemeral=True)


@bot.tree.command(name="say", description="Enviar un mensaje a un canal específico")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def say(
    interaction: discord.Interaction,
    canal: discord.TextChannel,
    mensaje: str,
) -> None:
    await canal.send(mensaje)
    await interaction.response.send_message(f"✅ Mensaje enviado a {canal}.", ephemeral=True)


@bot.tree.command(name="lock", description="Bloquear el canal actual")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def lock(interaction: discord.Interaction) -> None:
    if interaction.guild and interaction.channel:
        await set_channel_lock(interaction.channel, interaction.guild.default_role, True)
        await interaction.response.send_message("🔒 ¡Canal bloqueado!", ephemeral=True)


@bot.tree.command(name="unlock", description="Desbloquear el canal actual")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def unlock(interaction: discord.Interaction) -> None:
    if interaction.guild and interaction.channel:
        await set_channel_lock(interaction.channel, interaction.guild.default_role, False)
        await interaction.response.send_message("🔓 ¡Canal desbloqueado!", ephemeral=True)


tickets_group = app_commands.Group(name="tickets", description="Comandos del sistema de tickets")


@tickets_group.command(name="panel", description="Publicar o reemplazar el panel de tickets")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
async def tickets_panel(interaction: discord.Interaction) -> None:
    await publish_ticket_panel(interaction)


bot.tree.add_command(tickets_group)

roleadd_group = app_commands.Group(name="roleadd", description="Gestionar permisos de roles")


def add_configured_role(guild: discord.Guild, key: str, role: discord.Role) -> bool:
    config = guild_config(guild.id)
    role_id = str(role.id)
    if role_id in config[key]:
        return False
    config[key].append(role_id)
    save_state()
    return True


@roleadd_group.command(name="staff", description="Agregar un rol de staff para gestionar tickets")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
async def roleadd_staff(interaction: discord.Interaction, rol: discord.Role) -> None:
    added = add_configured_role(interaction.guild, "staffRoles", rol) if interaction.guild else False
    text = f"✅ {rol.mention} agregado como rol de staff." if added else f"❌ {rol.mention} ya es rol de staff."
    await interaction.response.send_message(text, ephemeral=True)


@roleadd_group.command(name="manager", description="Agregar rol de acceso a Soporte de Administración")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
async def roleadd_manager(interaction: discord.Interaction, rol: discord.Role) -> None:
    added = add_configured_role(interaction.guild, "managerRoles", rol) if interaction.guild else False
    text = f"✅ {rol.mention} agregado para Soporte de Administración." if added else f"❌ {rol.mention} ya está configurado."
    await interaction.response.send_message(text, ephemeral=True)


@roleadd_group.command(name="twitch", description="Agregar rol de moderador de Twitch")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
async def roleadd_twitch(interaction: discord.Interaction, rol: discord.Role) -> None:
    added = add_configured_role(interaction.guild, "twitchModRoles", rol) if interaction.guild else False
    text = f"✅ {rol.mention} agregado para Soporte de Twitch." if added else f"❌ {rol.mention} ya está configurado."
    await interaction.response.send_message(text, ephemeral=True)


bot.tree.add_command(roleadd_group)

transcript_group = app_commands.Group(
    name="transcript",
    description="Configurar el canal de transcripciones de tickets",
)


@transcript_group.command(name="channel", description="Elegir el canal donde se guardan las transcripciones")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
async def transcript_channel(
    interaction: discord.Interaction,
    canal: discord.TextChannel,
) -> None:
    if interaction.guild:
        guild_config(interaction.guild.id)["transcriptChannel"] = str(canal.id)
        save_state()
    await interaction.response.send_message(
        f"✅ Las transcripciones se enviarán a {canal.mention}.",
        ephemeral=True,
    )


bot.tree.add_command(transcript_group)


@bot.tree.command(name="clear", description="Borrar mensajes del canal (máximo 100)")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def clear(
    interaction: discord.Interaction,
    cantidad: app_commands.Range[int, 1, 100] = 5,
) -> None:
    if not isinstance(interaction.channel, discord.TextChannel):
        await interaction.response.send_message("Canal no compatible.", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    deleted = await interaction.channel.purge(limit=cantidad)
    await interaction.followup.send(f"🗑️ Se borraron **{len(deleted)}** mensajes.", ephemeral=True)


@bot.tree.command(name="kick", description="Expulsar a un miembro")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def kick(
    interaction: discord.Interaction,
    miembro: discord.Member,
    razon: str = "Razón no especificada",
) -> None:
    razon = razon.strip() or "Razón no especificada"
    await miembro.kick(reason=razon)
    await interaction.response.send_message(
        f"👢 <@{miembro.id}> ha sido expulsado. Razón: {razon}",
        ephemeral=True,
    )


@bot.tree.command(name="ban", description="Banear a un miembro")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def ban(
    interaction: discord.Interaction,
    miembro: discord.Member,
    razon: str = "Razón no especificada",
) -> None:
    razon = razon.strip() or "Razón no especificada"
    await miembro.ban(reason=razon)
    await interaction.response.send_message(
        f"🔨 <@{miembro.id}> ha sido baneado. Razón: {razon}",
        ephemeral=True,
    )


@bot.tree.command(name="unban", description="Desbanear a un usuario por su ID")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def unban(
    interaction: discord.Interaction,
    id: str,
    razon: str = "Razón no especificada",
) -> None:
    razon = razon.strip() or "Razón no especificada"
    try:
        await interaction.guild.unban(discord.Object(id=int(id)), reason=razon)
        await interaction.response.send_message(
            f"✅ <@{id}> ha sido desbaneado. Razón: {razon}",
            ephemeral=True,
        )
    except (ValueError, discord.NotFound):
        await interaction.response.send_message("❌ No se encontró ese usuario en la lista de baneados.", ephemeral=True)


async def get_muted_role(guild: discord.Guild) -> discord.Role:
    role = discord.utils.get(guild.roles, name="Muted")
    if role:
        return role
    role = await guild.create_role(name="Muted", reason="Rol de silencio del bot")
    for channel in guild.channels:
        try:
            overwrite = channel.overwrites_for(role)
            overwrite.send_messages = False
            overwrite.speak = False
            await channel.set_permissions(role, overwrite=overwrite)
        except (discord.Forbidden, discord.HTTPException):
            continue
    return role


@bot.tree.command(name="mute", description="Silenciar a un miembro")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def mute(
    interaction: discord.Interaction,
    miembro: discord.Member,
    razon: str = "Razón no especificada",
) -> None:
    razon = razon.strip() or "Razón no especificada"
    role = await get_muted_role(interaction.guild)
    await miembro.add_roles(role, reason=razon)
    await interaction.response.send_message(
        f"🔇 <@{miembro.id}> ha sido silenciado. Razón: {razon}",
        ephemeral=True,
    )


@bot.tree.command(name="unmute", description="Quitar el silencio a un miembro")
@app_commands.checks.has_permissions(administrator=True)
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def unmute(
    interaction: discord.Interaction,
    miembro: discord.Member,
    razon: str = "Razón no especificada",
) -> None:
    razon = razon.strip() or "Razón no especificada"
    role = discord.utils.get(interaction.guild.roles, name="Muted")
    if role and role in miembro.roles:
        await miembro.remove_roles(role, reason=razon)
        text = f"🔊 <@{miembro.id}> ya puede hablar de nuevo. Razón: {razon}"
    else:
        text = f"❌ <@{miembro.id}> no está silenciado."
    await interaction.response.send_message(text, ephemeral=True)


async def prefix_say(message: discord.Message, args: list[str]) -> None:
    if not message.channel_mentions:
        await message.reply("Uso: `!say #canal Tu mensaje aquí`")
        return
    target = message.channel_mentions[0]
    rest = " ".join(args[1:]).strip()
    if not rest:
        await message.reply("Escribe el mensaje que quieres enviar.")
        return
    await target.send(rest)
    await message.reply(f"✅ Mensaje enviado a {target.mention}.")


async def prefix_member_action(
    message: discord.Message,
    action: str,
    args: list[str],
) -> None:
    target = args[0] if args else ""
    if not target:
        await message.reply(
            f"Uso: `!{action} usuario|ID|@mención [\"razón\"]`"
        )
        return
    target_id = re.fullmatch(r"<@!?(\d+)>", target)
    raw_id = target_id.group(1) if target_id else target
    if raw_id.isdigit():
        try:
            member = message.guild.get_member(int(raw_id)) or await message.guild.fetch_member(int(raw_id))
        except (discord.NotFound, discord.Forbidden, discord.HTTPException):
            member = None
        matches = []
    else:
        query = target.removeprefix("@").strip()
        normalized = query.casefold()

        def exact_match(candidate: discord.Member) -> bool:
            names = {
                candidate.name,
                candidate.display_name,
                candidate.global_name or "",
                str(candidate),
            }
            return any(name.casefold() == normalized for name in names)

        candidates = {
            candidate.id: candidate
            for candidate in message.guild.members
            if exact_match(candidate)
        }
        if len(candidates) != 1 and query:
            try:
                for candidate in await message.guild.query_members(query=query, limit=100):
                    if exact_match(candidate):
                        candidates[candidate.id] = candidate
            except (discord.Forbidden, discord.HTTPException):
                pass
        matches = list(candidates.values())
        member = matches[0] if len(matches) == 1 else None

    if not member:
        if len(matches) > 1:
            examples = ", ".join(f"{item} ({item.id})" for item in matches[:5])
            await message.reply(
                f"Encontré varios miembros con ese nombre. Usa su ID o una mención: {examples}"
            )
        else:
            await message.reply(
                f"No encontré ese miembro. Uso: `!{action} usuario|ID|@mención [\"razón\"]`"
            )
        return

    reason = " ".join(args[1:]).strip() or "Razón no especificada"
    if action == "kick":
        await member.kick(reason=reason)
        await message.reply(f"👢 <@{member.id}> ha sido expulsado. Razón: {reason}")
    elif action == "ban":
        await member.ban(reason=reason)
        await message.reply(f"🔨 <@{member.id}> ha sido baneado. Razón: {reason}")
    elif action == "mute":
        role = await get_muted_role(message.guild)
        await member.add_roles(role, reason=reason)
        await message.reply(f"🔇 <@{member.id}> ha sido silenciado. Razón: {reason}")
    elif action == "unmute":
        role = discord.utils.get(message.guild.roles, name="Muted")
        if role and role in member.roles:
            await member.remove_roles(role, reason=reason)
            await message.reply(f"🔊 <@{member.id}> ya puede hablar de nuevo. Razón: {reason}")
        else:
            await message.reply(f"❌ <@{member.id}> no está silenciado.")


@bot.tree.error
async def on_app_command_error(
    interaction: discord.Interaction,
    error: app_commands.AppCommandError,
) -> None:
    if isinstance(error, app_commands.MissingPermissions):
        message = "❌ Necesitas permisos de Administrador para usar este comando."
    else:
        log.exception("Error en un comando de aplicación", exc_info=error)
        message = "❌ Ocurrió un error al procesar el comando. Revisa los permisos del bot."
    if interaction.response.is_done():
        await interaction.followup.send(message, ephemeral=True)
    else:
        await interaction.response.send_message(message, ephemeral=True)


if __name__ == "__main__":
    if not BOT_TOKEN:
        raise SystemExit(
            "Falta DISCORD_BOT_TOKEN. Configúralo como variable de entorno en tu hosting."
        )
    bot.run(BOT_TOKEN)
