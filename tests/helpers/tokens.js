// tests/helpers/tokens.js
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPair, exportJWK, importJWK, SignJWT } = require('jose');

const KEY_FILE = path.join(__dirname, '.test-keys.json');

let publicKey = null;
let privateKey = null;
let jwk = null;
let readyPromise = null;

async function loadOrCreateKeys() {
  // Kalau file key sudah ada, pakai itu (biar semua proses sama)
  if (fs.existsSync(KEY_FILE)) {
    const saved = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    publicKey = await importJWK(saved.publicJwk, 'RS256');
    privateKey = await importJWK(saved.privateJwk, 'RS256');
    jwk = saved.publicJwk;
    return;
  }

  // Kalau belum ada, generate baru + simpan
  const pair = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  };
  const privateJwk = {
    ...(await exportJWK(pair.privateKey)),
    kid: 'test-key',
    alg: 'RS256',
  };

  fs.writeFileSync(
    KEY_FILE,
    JSON.stringify({ publicJwk, privateJwk }, null, 2)
  );

  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
  jwk = publicJwk;
}

async function initKeys() {
  if (jwk) return;
  if (readyPromise) return readyPromise;
  readyPromise = loadOrCreateKeys();
  return readyPromise;
}

const jwksServer = createServer((req, res) => {
  if (req.url && !req.url.startsWith('/jwks')) {
    res.statusCode = 404;
    res.end('not-found');
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});

let listeningUrl = null;

async function startJwksServer(port = 0) {
  await initKeys();
  return new Promise((resolve, reject) => {
    jwksServer.once('error', reject);
    jwksServer.listen(port, '127.0.0.1', () => {
      const addr = jwksServer.address();
      listeningUrl = `http://127.0.0.1:${addr.port}`;
      resolve(listeningUrl);
    });
  });
}

function stopJwksServer() {
  return new Promise((resolve) => {
    if (!jwksServer.listening) return resolve();
    jwksServer.close(() => resolve());
  });
}

async function tokenFor(subject, scopes, opts = {}) {
  await initKeys();
  const issuer = opts.issuer || process.env.OIDC_ISSUER;
  const audience = opts.audience || process.env.OIDC_AUDIENCE;
  const expiresIn = opts.expiresIn || '5m';

  return new SignJWT({ scope: scopes.join(' ') })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'Bearer' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

module.exports = {
  jwksServer,
  startJwksServer,
  stopJwksServer,
  tokenFor,
};
