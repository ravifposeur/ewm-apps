// service/src/auth/authenticate.js
const { verifyAccessToken } = require('./verify');
const { principalFrom } = require('./principal');
const { unauthorized } = require('../problem');

/**
 * Layer 1 middleware: parse & verify the Bearer token.
 *
 * SAFE BY DEFAULT: If no valid token is present, this middleware REJECTS with 401.
 * Public routes (e.g. /health) MUST NOT mount this middleware.
 *
 * On success: sets `req.principal` (canonical shape) and calls next().
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return unauthorized(res, 'missing_token', req.originalUrl);
  }

  const rawToken = header.slice(7).trim();
  if (!rawToken) {
    return unauthorized(res, 'missing_token', req.originalUrl);
  }

  try {
    const claims = await verifyAccessToken(rawToken);
    req.principal = principalFrom(claims);
    return next();
  } catch (err) {
    const reason = err.code || err.name || 'invalid_token';
    if (req.log && typeof req.log.warn === 'function') {
      req.log.warn({ reason }, 'Token rejected');
    }
    return unauthorized(res, 'invalid_token', req.originalUrl);
  }
}

module.exports = { authenticate };
