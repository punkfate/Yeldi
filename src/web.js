import express from "express";
const app = express();

// Use port 5000 as required for Replit webview
const PORT = 5000;

app.get("/", (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.send("🤖 Discord Bot is running and ready for traffic!");
});

// Explicitly bind to 0.0.0.0 to accept external connections
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`📡 Listening on 0.0.0.0:${PORT}`);
});

export default app;
