import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS_DIR = path.join(__dirname, '../data/transcripts');

function ensureDirectory() {
  fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeUrl(value = '') {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function getPublicBaseUrl() {
  const configuredUrl = process.env.PUBLIC_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  const replitDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (replitDomain) return `https://${replitDomain}`;

  const replitDomains = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim();
  if (replitDomains) return `https://${replitDomains}`;

  return null;
}

export function getTranscriptUrl(transcriptId) {
  const baseUrl = getPublicBaseUrl();
  return baseUrl
    ? `${baseUrl}/transcripts/${encodeURIComponent(transcriptId)}`
    : null;
}

export function saveTranscript(transcript) {
  ensureDirectory();
  const transcriptId = randomUUID();
  const filePath = path.join(TRANSCRIPTS_DIR, `${transcriptId}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ ...transcript, transcriptId }, null, 2), 'utf8');
  return transcriptId;
}

function loadTranscript(transcriptId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(transcriptId)) return null;

  try {
    const filePath = path.join(TRANSCRIPTS_DIR, `${transcriptId}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function renderTranscriptHtml(transcriptId) {
  const transcript = loadTranscript(transcriptId);
  if (!transcript) return null;

  const messagesHtml = transcript.messages.map(message => {
    const avatarUrl = safeUrl(message.avatarUrl);
    const attachments = message.attachments?.length
      ? `
        <div class="attachments">
          ${message.attachments.map(url => {
            const safeAttachmentUrl = safeUrl(url);
            return safeAttachmentUrl
              ? `<a href="${escapeHtml(safeAttachmentUrl)}" target="_blank" rel="noopener noreferrer">📎 Ver adjunto</a>`
              : '';
          }).join('')}
        </div>
      `
      : '';

    return `
      <article class="message">
        <div class="avatar">
          ${avatarUrl
            ? `<img src="${escapeHtml(avatarUrl)}" alt="">`
            : '<span>👤</span>'}
        </div>
        <div class="message-body">
          <div class="message-meta">
            <strong>${escapeHtml(message.authorTag)}</strong>
            <span>${escapeHtml(message.timestamp)}</span>
          </div>
          <div class="message-content">${escapeHtml(message.content || '[Sin contenido]').replaceAll('\n', '<br>')}</div>
          ${attachments}
        </div>
      </article>
    `;
  }).join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transcript #${escapeHtml(transcript.ticketNumber)} — Jester's Club</title>
  <style>
    :root {
      color-scheme: dark;
      --background: #0f1117;
      --surface: #181b24;
      --surface-raised: #202431;
      --border: #303747;
      --text: #f3f5f7;
      --muted: #a9b1c2;
      --accent: #9b59b6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--background);
      color: var(--text);
      font: 15px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .page { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
    .header {
      background: linear-gradient(135deg, #252036, #1b1f2b);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 20px;
    }
    h1 { margin: 0 0 8px; font-size: clamp(22px, 4vw, 32px); }
    .subtitle { color: var(--muted); margin: 0 0 20px; }
    .details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .detail {
      background: rgba(0, 0, 0, .18);
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .detail-label { color: var(--muted); display: block; font-size: 12px; }
    .messages {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 8px;
    }
    .message {
      display: flex;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    .message:last-child { border-bottom: 0; }
    .avatar {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 50%;
      background: var(--surface-raised);
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .message-body { min-width: 0; flex: 1; }
    .message-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
    .message-meta strong { color: #d9a9ec; }
    .message-meta span { color: var(--muted); font-size: 12px; }
    .message-content { margin-top: 4px; overflow-wrap: anywhere; }
    .attachments { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .attachments a { color: #8ab4f8; text-decoration: none; }
    .attachments a:hover { text-decoration: underline; }
    .empty { color: var(--muted); padding: 24px 16px; text-align: center; }
    @media (max-width: 520px) {
      .page { width: min(100% - 16px, 960px); padding-top: 16px; }
      .header, .messages { border-radius: 12px; }
      .message { padding: 12px 8px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <h1>📄 Transcript #${escapeHtml(transcript.ticketNumber)} — Jester's Club</h1>
      <p class="subtitle">${escapeHtml(transcript.categoryLabel)} · Transcript completo del ticket</p>
      <div class="details">
        <div class="detail"><span class="detail-label">Abierto por</span>${escapeHtml(transcript.openerTag)}</div>
        <div class="detail"><span class="detail-label">Cerrado por</span>${escapeHtml(transcript.closedByTag)}</div>
        <div class="detail"><span class="detail-label">Reclamado por</span>${escapeHtml(transcript.claimedByTag || 'Nadie')}</div>
        <div class="detail"><span class="detail-label">Fecha de cierre</span>${escapeHtml(transcript.closedAt)}</div>
      </div>
    </section>
    <section class="messages">
      ${messagesHtml || '<div class="empty">Este ticket no contiene mensajes.</div>'}
    </section>
  </main>
</body>
</html>`;
}