import express from "express";
const app = express();

// Use port 5000 as required for Replit webview
const PORT = 5000;

app.get("/", (req, res) => {
  const domain = process.env.REPLIT_DEV_DOMAIN || "your-app.replit.app";
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`
    <html>
      <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #2c2f33; color: white;">
        <h1>🤖 Discord Bot is running!</h1>
        <p>Your bot is online and ready.</p>
        <div style="background: #23272a; padding: 20px; border-radius: 8px; border: 1px solid #7289da; margin-top: 20px;">
          <p style="margin: 0; color: #7289da; font-weight: bold;">Bot URL:</p>
          <code style="font-size: 1.2rem; word-break: break-all;">https://${domain}</code>
        </div>
        <p style="margin-top: 20px; font-size: 0.9rem; color: #99aab5;">Use this URL for UptimeRobot monitoring</p>
      </body>
    </html>
  `);
});

// Explicitly bind to 0.0.0.0 to accept external connections
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`📡 Listening on 0.0.0.0:${PORT}`);
});

export default app;
