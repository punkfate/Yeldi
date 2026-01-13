import express from "express";
const app = express();

const PORT = 5000;

app.get("/", (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.send("🤖 Discord Bot is running!");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

export default app;
