// service/src/auth/verify.js
const { createRemoteJWKSet, jwtVerify } = require('jose');
const { config } = require('../config');

// createRemoteJWKSet caches keys internally (in-memory) — no manual cache needed.
const jwks = createRemoteJWKSet(new URL(config.oidcJwksUri), {
  cacheMaxAge: 10 * 60 * 1000,   // 10 minutes
  timeoutDuration: 5 * 1000,      // 5s timeout for JWKS fetch
});

/**
 * Verify a raw access token.
 * Throws on any failure: bad signature, expired, wrong issuer/audience, missing claims.
 *
 * @param {string} raw - the JWT string (without "Bearer " prefix)
 * @returns {Promise<object>} the verified payload
 */
async function verifyAccessToken(raw) {
  const { payload, protectedHeader } = await jwtVerify(raw, jwks, {
    issuer: config.oidcIssuer,
    audience: config.oidcAudience,
    algorithms: ['RS256'],
    clockTolerance: 5,              // 5s leeway for clock skew
    requiredClaims: ['sub', 'exp', 'iss', 'aud'],
  });

  // Reject tokens whose `typ` is `ID` — we only accept access tokens.
  // Keycloak sets `typ: "Bearer"` on access tokens.
  if (protectedHeader.typ && protectedHeader.typ !== 'Bearer') {
    const err = new Error(`Unexpected token type: ${protectedHeader.typ}`);
    err.code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
    throw err;
  }

  return payload;
}

module.exports = { verifyAccessToken };
