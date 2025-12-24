const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const express = require("express");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
  new SlashCommandBuilder()
    .setName("activo")
    .setDescription("Comando global para la insignia Active Developer"),
  new SlashCommandBuilder()
    .setName("active")
    .setDescription("Get the Developer Badge")
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("⏳ Registrando comandos globales...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(cmd => cmd.toJSON()) });
    console.log("✅ Comandos globales registrados");
  } catch (error) {
    console.error(error);
  }
})();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`🤖 Bot listo como ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  if (interaction.commandName === "activo") {
    await interaction.reply("Activo ✅");
  } else if (interaction.commandName === "active") {
    await interaction.reply("Developer Badge ✅");
  }
});

client.login(TOKEN);

const app = express();
const PORT = 3000;

app.get("/", (req, res) => res.send("Bot activo ✅"));

app.listen(PORT, () => console.log(`🌐 Servidor web escuchando en puerto ${PORT}`));
