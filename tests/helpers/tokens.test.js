// tests/helpers/tokens.test.js
// TDD test untuk tests/helpers/tokens.js.
// Jalankan: npx jest tests/helpers/tokens.test.js

const { createRemoteJWKSet, jwtVerify } = require('jose');

const ISSUER = 'https://test.local/';
const AUDIENCE = 'eventwise-api';

let tokens;
let baseUrl;

beforeAll(async () => {
  process.env.OIDC_ISSUER = ISSUER;
  process.env.OIDC_AUDIENCE = AUDIENCE;
  tokens = require('./tokens.js');
  baseUrl = await tokens.startJwksServer(0);
  process.env.OIDC_JWKS_URI = `${baseUrl}/jwks.json`;
});

afterAll(async () => {
  await tokens?.stopJwksServer?.();
});

async function verifyWithJwks(token, { audience = AUDIENCE, issuer = ISSUER } = {}) {
  const jwks = createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URI));
  const { payload } = await jwtVerify(token, jwks, {
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

test('RED-2: token dengan scope EWM terverifikasi (collections:write)', async () => {
  const token = await tokens.tokenFor('crew-a', ['collections:write']);
  const payload = await verifyWithJwks(token);
  expect(payload.scope.split(' ')).toContain('collections:write');
});

test('RED-3: payload yang diubah 1 karakter DITOLAK', async () => {
  const token = await tokens.tokenFor('organizer-a', ['events:read']);
  const [h, p, s] = token.split('.');
  const tamperedP = (p[0] === 'A' ? 'B' : 'A') + p.slice(1);
  await expect(verifyWithJwks(`${h}.${tamperedP}.${s}`)).rejects.toThrow();
});

test('RED-4: audience salah DITOLAK', async () => {
  const token = await tokens.tokenFor('crew-a', ['collections:write']);
  await expect(verifyWithJwks(token, { audience: 'api-lain' })).rejects.toThrow();
});

test('RED-5: JWKS server lokal menyajikan kunci test-key RS256', async () => {
  const res = await fetch(`${baseUrl}/jwks.json`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.keys)).toBe(true);
  expect(body.keys[0]).toMatchObject({ kid: 'test-key', alg: 'RS256', use: 'sig', kty: 'RSA' });
});
