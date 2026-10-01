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
const DEV_USERS = {
  'organizer-a': { password: 'organizer123', scopes: ['events:read', 'events:write', 'sites:approve'] },
  'organizer-b': { password: 'organizer123', scopes: ['events:read', 'events:write', 'sites:approve'] },
  'admin-a':     { password: 'admin123',     scopes: ['events:read', 'confirmations:write'] },
  'crew-a':      { password: 'crew123',      scopes: ['events:read', 'collections:write'] },
  'crew-b':      { password: 'crew123',      scopes: ['events:read', 'collections:write'] },
};

const { createServer } = require('node:http');

const ISSUER_FALLBACK = 'https://test.local/';
const AUDIENCE_FALLBACK = 'eventwise-api';

const KID = `test-key-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

let keyPairPromise = null;
let jwkPromise = null;
let josePromise = null;

function loadJose() {
  if (!josePromise) josePromise = import('jose');
  return josePromise;
}

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

/**
 * Helper: set CORS headers on every response.
 * Diperlukan agar browser dev app (http://localhost:5173) dapat
 * memanggil endpoint /sign dan /jwks.json dari origin berbeda.
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

const jwksServer = createServer((req, res) => {
  // CORS headers HARUS di-set sebelum handling apapun, termasuk 404/error.
  setCorsHeaders(res);

  // Preflight OPTIONS — balas cepat tanpa proses lebih lanjut.
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.url && req.url.startsWith('/sign')) {
    handleSign(req, res);
    return;
  }

  if (req.url && req.url.startsWith('/login')) {
    handleLogin(req, res);
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
/** POST /login {username, password} -> {token, sub, scopes}. */
function handleLogin(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let payload = {};
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end('{"error":"bad-json"}');
      return;
    }

    const { username, password } = payload;
    const user = DEV_USERS[username];

    if (!user || user.password !== password) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        type: '/problems/invalid-credentials',
        title: 'Invalid username or password',
      }));
      return;
    }

    tokenFor(username, user.scopes, {})
      .then((token) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ token, sub: username, scopes: user.scopes }));
      })
      .catch(() => {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end('{"error":"sign-failed"}');
      });
  });
}

async function tokenFromJwksServer(baseUrl, subject, scopes, options = {}) {
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

function startJwksServer(port = 0) {
  return new Promise((resolve, reject) => {
    jwksServer.once('error', reject);
    jwksServer.listen(port, '127.0.0.1', () => {
      const addr = jwksServer.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

function stopJwksServer() {
  return new Promise((resolve) => {
    if (!jwksServer.listening) return resolve();
    jwksServer.close(() => resolve());
  });
}

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
