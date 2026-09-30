// service/src/auth/require-scope.js
const { forbidden } = require('../problem');

/**
 * Layer 2 — Enforce scope.
 * Reads req.principal.scopes (built by authenticate middleware).
 * If none of the required scopes are present → 403 Forbidden.
 *
 * Usage:
 *   router.get('/events', requireScope('events:read'), handler);
 *   router.post('/events', requireScope('events:write'), handler);
 */
function requireScope(...requiredScopes) {
  return function (req, res, next) {
    if (!req.principal || !Array.isArray(req.principal.scopes)) {
      return forbidden(res, 'Missing principal', req.originalUrl);
    }

    const granted = new Set(req.principal.scopes);
    const hasAny = requiredScopes.some((s) => granted.has(s));

    if (!hasAny) {
      return forbidden(
        res,
        `Missing required scope. Needs one of: ${requiredScopes.join(', ')}`,
        req.originalUrl
      );
    }

    return next();
  };
}

module.exports = { requireScope };
