const { createRemoteJWKSet, jwtVerify } = require('jose');
const { config } = require('../config');

const jwks = createRemoteJWKSet(new URL(config.oidcJwksUri));

async function verifyAccessToken(raw) {
  const { payload } = await jwtVerify(raw, jwks, {
    issuer: config.oidcIssuer,
    audience: config.oidcAudience,
    algorithms: ['RS256'], // allowlist; sangat penting untuk menutup celah 'none' alg
    clockTolerance: 5,
  });
  
  return payload;
}

module.exports = { verifyAccessToken };
