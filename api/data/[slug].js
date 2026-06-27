'use strict';

const { processSlug } = require('../../lib/handler');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const slug = req.query.slug;

  try {
    const result = await processSlug(slug);
    // Redirect to the original site (or fallback)
    return res.redirect(302, result.redirectUrl);
  } catch (err) {
    const status = err.statusCode || 500;

    if (status >= 500) {
      console.error('[handler] unexpected error:', err.message);
    } else {
      console.error('[handler] client error:', err.message);
    }

    // Even on error, redirect to axiom.trade so user isn't stranded
    return res.redirect(302, 'https://axiom.trade');
  }
};