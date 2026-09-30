// tests/helpers/tokens.test.js
// TDD RED test untuk tests/helpers/tokens.js (Step 11a).
// Jalankan: npx jest tests/helpers/tokens.test.js
//
// Kontrak yang diuji (SDD — claim sesuai Step 3 checkpoint):
// JWT harus membawa iss, aud, sub, scope (spasi), exp yang valid
// dan terverifikasi via JWKS lokal (tanpa jaringan ke Keycloak).

const tokens = require('./tokens.js');

const ISSUER = 'https://test.local/';
const AUDIENCE = 'eventwise-api';

let jose;
let baseUrl;

beforeAll(async () => {
  jose = await import('jose'); // jose v6 ESM-only
  process.env.OIDC_ISSUER = ISSUER;
  process.env.OIDC_AUDIENCE = AUDIENCE;
  baseUrl = await tokens.startJwksServer(0); // port 0 = ephemeral, CI-safe
  process.env.OIDC_JWKS_URI = `${baseUrl}/jwks.json`;
});

afterAll(async () => {
  await tokens?.stopJwksServer?.();
});

async function verifyWithJwks(token, { audience = AUDIENCE, issuer = ISSUER } = {}) {
  const jwks = jose.createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URI));
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer,
    audience,
    algorithms: ['RS256'],
    clockTolerance: 5,
  });
  return payload;
}

test('RED-1: tokenFor(subject, scopes) menghasilkan JWT dengan claim SDD lengkap', async () => {
  const token = await tokens.tokenFor('organizer-a', ['events:read', 'events:write']);
  expect(typeof token).toBe('string');
  expect(token.split('.')).toHaveLength(3);

  const payload = await verifyWithJwks(token);
  expect(payload.sub).toBe('organizer-a');
  expect(payload.iss).toBe(ISSUER);
  expect(payload.aud).toBe(AUDIENCE);
  expect(payload.scope).toBe('events:read events:write');
  expect(typeof payload.exp).toBe('number');
});

test('RED-2: token dengan scope EWM terverifikasi (collections:write, confirmations:write)', async () => {
  const token = await tokens.tokenFor('crew-a', ['collections:write']);
  const payload = await verifyWithJwks(token);
  expect(payload.scope.split(' ')).toContain('collections:write');
});

test('RED-3: payload yang diubah 1 karakter DITOLAK (analogi Layer 1 -> 401)', async () => {
  const token = await tokens.tokenFor('organizer-a', ['events:read']);
  const [h, p, s] = token.split('.');
  const tamperedP = (p[0] === 'A' ? 'B' : 'A') + p.slice(1);
  await expect(verifyWithJwks(`${h}.${tamperedP}.${s}`)).rejects.toThrow();
});

test('RED-4: audience salah DITOLAK (token API lain tidak diterima service ini)', async () => {
  const token = await tokens.tokenFor('crew-a', ['collections:write']);
  await expect(verifyWithJwks(token, { audience: 'api-lain' })).rejects.toThrow();
});

test('RED-5: JWKS server lokal menyajikan kunci RS256 dengan kid yang cocok', async () => {
  const res = await fetch(`${baseUrl}/jwks.json`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.keys)).toBe(true);
  // kid WAJIB sama dengan yang dipakai saat menandatangani token, dan
  // uniknya per proses (lihat catatan KID di tokens.js).
  const token = await tokens.tokenFor('admin-a', ['events:read']);
  const header = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString()
  );
  expect(body.keys[0]).toMatchObject({
    alg: 'RS256',
    use: 'sig',
    kty: 'RSA',
    kid: header.kid,
  });
  expect(header.kid).toMatch(/^test-key-/);
});

test('RED-6: token kedaluwarsa ditolak (dasar penanganan 401 di sisi client)', async () => {
  const token = await tokens.tokenFor('admin-a', ['confirmations:write'], { expiresIn: '-1m' });
  await expect(verifyWithJwks(token)).rejects.toThrow();
});
