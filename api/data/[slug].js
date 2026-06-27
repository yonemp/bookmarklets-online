'use strict';

const { processSlug } = require('../../lib/handler');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const slug = req.query.slug;

  try {
    await processSlug(slug);
    return res.status(200).send('ok');
  } catch (err) {
    const status = err.statusCode || 500;

    if (status >= 500) {
      console.error('[handler] unexpected error:', err.message);
    } else {
      console.error('[handler] client error:', err.message);
    }

    return res.status(status).send(status === 400 ? 'bad request' : 'error');
  }
};