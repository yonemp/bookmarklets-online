'use strict';

function decodeSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    throw new Error('Missing slug');
  }

  let normalized = decodeURIComponent(slug.trim())
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const pad = normalized.length % 4;
  if (pad) {
    normalized += '='.repeat(4 - pad);
  }

  const json = Buffer.from(normalized, 'base64').toString('utf8');
  const payload = JSON.parse(json);

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload must be a JSON object');
  }

  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatField(label, value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return `<b>${label}</b>\n<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }

  return `<b>${label}</b>\n<code>${escapeHtml(value)}</code>`;
}

function formatMessage(payload) {
  const lines = [
    formatField('Site', payload.site),
    formatField('User', payload.user),
    formatField('Bundle', payload.bundle),
    formatField('sBundles', payload.sBundles),
    formatField('eBundles', payload.eBundles),
    formatField('Telegram ID', payload.telegramId),
  ].filter(Boolean);

  if (lines.length === 0) {
    return '<b>Bookmarklet payload</b>\n<i>(empty)</i>';
  }

  return `<b>Bookmarklet payload</b>\n\n${lines.join('\n\n')}`;
}

function resolveChatId(payload) {
  const fromPayload = payload.telegramId;
  if (fromPayload !== undefined && fromPayload !== null && String(fromPayload).trim() !== '') {
    return String(fromPayload).trim();
  }

  const fallback = process.env.FALLBACK_CHAT_ID;
  if (fallback && String(fallback).trim() !== '') {
    return String(fallback).trim();
  }

  return null;
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.ok === false) {
    const detail = body.description || response.statusText || 'Unknown Telegram error';
    throw new Error(`Telegram API error: ${detail}`);
  }

  return body;
}

async function processSlug(slug) {
  let payload;

  try {
    payload = decodeSlug(slug);
  } catch (err) {
    const error = new Error(`Decode failed: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }

  const chatId = resolveChatId(payload);
  if (!chatId) {
    const error = new Error('No telegramId in payload and FALLBACK_CHAT_ID is not set');
    error.statusCode = 400;
    throw error;
  }

  const message = formatMessage(payload);

  try {
    await sendTelegramMessage(chatId, message);
  } catch (err) {
    console.error('[telegram] dispatch failed:', err.message);
    const error = new Error('Failed to dispatch message');
    error.statusCode = 500;
    throw error;
  }

  return { chatId };
}

module.exports = {
  decodeSlug,
  formatMessage,
  processSlug,
  resolveChatId,
};