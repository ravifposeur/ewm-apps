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
//
// CommonJS: repo ini CJS (tanpa "type": "module" di package.json), dan
// seluruh test lain memakai require/module.exports. File ini sebelumnya
// ditulis ESM sehingga gagal dimuat Jest dengan
// "SyntaxError: Cannot use import statement outside a module".
//
// jose v6 adalah ESM-only, jadi di-load lewat dynamic import() — bukan
// require(). Dynamic import butuh flag Jest --experimental-vm-modules, yang
// sudah dipasang di script `test:contract` (package.json).

const { createServer } = require('node:http');

const ISSUER_FALLBACK = 'https://test.local/';
const AUDIENCE_FALLBACK = 'eventwise-api';

// kid unik per proses test.
//
// ioe caching: `createRemoteJWKSet` di service melakukan CACHE JWKS. Kalau kid-nya
// selalu 'test-key', lalu JWKS di-refetch dengan kunci baru yang memakai kid
// yang sama, jose akan mencocokkan token ke kunci LAMA yang sudah di-cache dan
// TIDAK pernah mengunduh ulang — hasilnya ERR_JWS_SIGNATURE_VERIFICATION_FAILED
// untuk token yang sebenarnya valid.
//
// kid acak per proses memaksa jose melihat kid yang belum dikenal, sehingga
// ia mengunduh ulang JWKS. Ini yang membuat test bisa dijalankan berulang
// terhadap service yang sama tanpa restart.
const KID = `test-key-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

let keyPairPromise = null;
let jwkPromise = null;
let josePromise = null;

/** jose v6 ESM-only; dynamic import sekali lalu dipakai ulang. */
function loadJose() {
  if (!josePromise) josePromise = import('jose');
  return josePromise;
}

/** Key pair + JWK dibuat sekali per proses, lalu dipakai ulang. */
async function keyMaterial() {
  const jose = await loadJose();

  if (!keyPairPromise) {
    keyPairPromise = jose.generateKeyPair('RS256');
  }
  if (!jwkPromise) {
    jwkPromise = keyPairPromise.then(async ({ publicKey }) => ({
      ...(await jose.exportJWK(publicKey)),
      kid: KID,
      alg: 'RS256',
      use: 'sig',
    }));
  }
  return keyPairPromise;
}

// Server JWKS mini — satu instance per proses test.
//
// Menyajikan JWK di /jwks.json untuk diverifikasi service, DAN menandatangani
// token on-demand di /sign. Endpoint /sign ada karena fixture ini mungkin
// dijalankan sebagai proses terpisah dari test (lihat tests/helpers/jwks-server.js):
// bila service dan test memakai DUA proses berbeda, masing-masing akan
// membangkitkan keypair sendiri dan jwtVerify selalu gagal
// (ERR_JWKS_NO_MATCHING_KEY). Dengan satu proses JWKS yang melayani keduanya,
// hanya ada SATU keypair sehingga token selalu cocok dengan JWK yang diunduh
// service.
const jwksServer = createServer((req, res) => {
  if (req.url && req.url.startsWith('/sign')) {
    handleSign(req, res);
    return;
  }
  if (req.url && !req.url.startsWith('/jwks')) {
    res.statusCode = 404;
    res.end('not-found');
    return;
  }
  keyMaterial()
    .then(() => jwkPromise)
    .then((jwk) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    })
    .catch(() => {
      res.statusCode = 500;
      res.end('{"error":"jwk-unavailable"}');
    });
});

/** POST /sign {sub, scopes, expiresIn?} -> {token} (JSON). */
function handleSign(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let payload = {};
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      res.statusCode = 400;
      res.end('{"error":"bad-json"}');
      return;
    }
    tokenFor(payload.sub || 'test-subject', payload.scopes || [], {
      expiresIn: payload.expiresIn,
      issuer: payload.issuer,
      audience: payload.audience,
    })
      .then((token) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ token, kid: KID }));
      })
      .catch(() => {
        res.statusCode = 500;
        res.end('{"error":"sign-failed"}');
      });
  });
}

/**
 * Minta token ke server JWKS eksternal (proses terpisah).
 * Dipakai test saat JWKS sudah melayani di luar proses ini — supaya kunci
 * yang menandatangani token sama dengan yang disajikan ke service.
 */
async function tokenFromJwksServer(baseUrl, subject, scopes, options = {}) {
  // baseUrl datang sebagai OIDC_JWKS_URI, yaitu .../jwks.json — bukan root.
  // Endpoint /sign hidup di root server, jadi buang nama file JWKS dulu.
  const root = baseUrl.replace(/\/[^/]*$/, '');
  const res = await fetch(`${root}/sign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sub: subject, scopes, ...options }),
  });
  if (!res.ok) {
    throw new Error(`JWKS /sign gagal: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body || typeof body.token !== 'string') {
    throw new Error(
      'JWKS /sign tidak mengembalikan {token}. Pastikan OIDC_JWKS_URI ' +
        'menunjuk ke server tests/helpers/jwks-server.js yang sudah hidup.'
    );
  }
  return body.token;
}

/** Nyalakan server JWKS di port tertentu (0 = ephemeral, aman untuk CI paralel). */
function startJwksServer(port = 0) {
  return new Promise((resolve, reject) => {
    jwksServer.once('error', reject);
    jwksServer.listen(port, '127.0.0.1', () => {
      const addr = jwksServer.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

/** Matikan server JWKS (dipanggil di afterAll). */
function stopJwksServer() {
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
 * @param {object} [options]
 * @param {string} [options.issuer]
 * @param {string} [options.audience]
 * @param {string} [options.expiresIn] - mis. '-1m' untuk token kedaluwarsa
 */
async function tokenFor(subject, scopes, options = {}) {
  const jose = await loadJose();
  const { privateKey } = await keyMaterial();
  const issuer = options.issuer || process.env.OIDC_ISSUER || ISSUER_FALLBACK;
  const audience = options.audience || process.env.OIDC_AUDIENCE || AUDIENCE_FALLBACK;

  return new jose.SignJWT({ scope: (scopes || []).join(' ') })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn || '5m')
    .sign(privateKey);
}

module.exports = {
  jwksServer,
  startJwksServer,
  stopJwksServer,
  tokenFor,
  tokenFromJwksServer,
  KID,
};
