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

    await processSlug(slug);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  } catch (err) {
    const status = err.statusCode || 500;

    if (status >= 500) {
      console.error('[server] unexpected error:', err.message);
    } else {
      console.error('[server] client error:', err.message);
    }

    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(status === 400 ? 'bad request' : 'error');
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