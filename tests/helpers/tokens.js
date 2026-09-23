// tests/helpers/tokens.js
// Helper token lokal untuk pengujian/CI — milik Integration Owner.
// SDD: claim mengikuti Step 3 checkpoint (iss, aud, exp, sub, scope).
// TDD: file ini adalah solusi GREEN untuk tests/helpers/tokens.test.js (RED).
//
// Strategi: "Local test key (recommended)" — test membangkitkan key pair
// RS256 sendiri, menyajikan JWKS via HTTP server mini, dan OIDC_ISSUER /
// OIDC_JWKS_URI diarahkan ke sana selama test. CI tidak butuh jaringan
// ke Keycloak. Kunci ini HANYA hidup di dalam proses test dan tidak pernah
// dipakai di service production (issuer test-only, mis. https://test.local/).

import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

// Server JWKS mini — satu instance per proses test.
// Kompatibel dengan bentuk di assignment: `export const jwksServer`.
export const jwksServer = createServer((req, res) => {
  if (req.url && !req.url.startsWith('/jwks')) {
    res.statusCode = 404;
    res.end('not-found');
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});

let listeningUrl = null;

/** Nyalakan server JWKS di port tertentu (0 = ephemeral, aman untuk CI paralel). */
export function startJwksServer(port = 0) {
  return new Promise((resolve, reject) => {
    jwksServer.once('error', reject);
    jwksServer.listen(port, '127.0.0.1', () => {
      const addr = jwksServer.address();
      listeningUrl = `http://127.0.0.1:${addr.port}`;
      resolve(listeningUrl);
    });
  });
}

/** Matikan server JWKS (dipanggil di afterAll). */
export function stopJwksServer() {
  return new Promise((resolve) => {
    if (!jwksServer.listening) return resolve();
    jwksServer.close(() => resolve());
  });
}

/**
 * Buat JWT pengujian yang valid sesuai spesifikasi claim:
 * iss=OIDC_ISSUER, aud=OIDC_AUDIENCE, sub=subject,
 * scope=scopes.join(' '), exp=+5 menit, alg RS256/kid test-key.
 *
 * @param {string} subject - mis. 'organizer-a', 'crew-a', 'admin-a'
 * @param {string[]} scopes - mis. ['events:read', 'collections:write']
 */
export function tokenFor(subject, scopes) {
  return new SignJWT({ scope: scopes.join(' ') })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(process.env.OIDC_ISSUER)
    .setAudience(process.env.OIDC_AUDIENCE)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}
