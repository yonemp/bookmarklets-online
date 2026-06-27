'use strict';

const { processSlug } = require('../../lib/handler');

function renderHtml(message, redirectUrl, isError = false) {
  const emoji = isError ? '⚠️' : '✅';
  const color = isError ? '#ff4ed2' : '#a46bff';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redirecting...</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(180deg, #000000, #0b0210, #150025);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      text-align: center;
      flex-direction: column;
      padding: 20px;
    }
    h1 {
      font-size: 2.5rem;
      background: linear-gradient(to right, #a46bff, ${color});
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0.5rem 0;
    }
    p {
      opacity: 0.8;
      font-size: 1.1rem;
      margin: 0.5rem 0;
    }
    a {
      color: #a46bff;
      text-decoration: underline;
    }
    .spinner {
      border: 4px solid rgba(255,255,255,0.1);
      border-top: 4px solid ${color};
      border-radius: 50%;
      width: 44px;
      height: 44px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
  <script>
    setTimeout(function() {
      window.location.href = "${redirectUrl}";
    }, 1000);
  </script>
</head>
<body>
  <div class="spinner"></div>
  <h1>${emoji} ${message}</h1>
  <p>Redirecting back to <strong>axiom.trade</strong> in 1 second…</p>
  <p><a href="${redirectUrl}">Click here if you are not redirected</a></p>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const slug = req.query.slug;
  const debug = req.query.debug === 'true';

  try {
    const result = await processSlug(slug, debug);

    if (debug) {
      return res.status(200).send(`✅ Success\nChat ID: ${result.chatId}\nRedirect: ${result.redirectUrl}`);
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(renderHtml('Processing complete', result.redirectUrl, false));
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[handler] error:', err.message);

    const fallbackRedirect = 'https://axiom.trade';

    if (debug) {
      return res.status(status).send(`❌ Error (${status}):\n${err.message}\n\nCheck server logs.`);
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(status).send(renderHtml(`Error: ${err.message}`, fallbackRedirect, true));
  }
};