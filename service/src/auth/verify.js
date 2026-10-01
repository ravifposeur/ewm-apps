// service/src/auth/verify.js
const { createRemoteJWKSet, jwtVerify } = require('jose');
const { config } = require('../config');

// createRemoteJWKSet caches keys internally (in-memory) — no manual cache needed.
// timeoutDuration dinaikkan karena Railway cold start bisa 10-30 detik.
const jwks = createRemoteJWKSet(new URL(config.oidcJwksUri), {
  cacheMaxAge: 10 * 60 * 1000,        // cache 10 menit
  timeoutDuration: 30 * 1000,          // 30s timeout (default 5s)
  cooldownDuration: 5 * 1000,          // 5s cooldown antar fetch
});

async function verifyAccessToken(raw) {
  const { payload, protectedHeader } = await jwtVerify(raw, jwks, {
    issuer: config.oidcIssuer,
    audience: config.oidcAudience,
    algorithms: ['RS256'],
    clockTolerance: 5,
    requiredClaims: ['sub', 'exp', 'iss', 'aud'],
  });

  if (protectedHeader.typ && protectedHeader.typ !== 'Bearer') {
    const err = new Error(`Unexpected token type: ${protectedHeader.typ}`);
    err.code = 'ERR_JWT_CLAIM_VALIDATION_FAILED';
    throw err;
  }

  return payload;
}

module.exports = { verifyAccessToken };
