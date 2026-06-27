'use strict';

const http = require('http');
const { URL } = require('url');
const { processSlug } = require('./lib/handler');

const PORT = Number(process.env.PORT) || 3000;

function extractSlug(pathname) {
  const match = pathname.match(/^\/data\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET', 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    const slug = extractSlug(url.pathname);
    if (!slug) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }

    const result = await processSlug(slug);
    // Redirect
    res.writeHead(302, { Location: result.redirectUrl });
    res.end();
  } catch (err) {
    console.error('[server] error:', err.message);
    // Redirect on error as well
    res.writeHead(302, { Location: 'https://axiom.trade' });
    res.end();
  }
});

server.listen(PORT, () => {
  console.error(`[server] listening on :${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection:', err);
});