// tests/contract/authorization.test.js
// Milik Integration Owner.
//
// A.9 "attack your own application" — syarat LULUS Session 5.
// Failure condition eksplisit dari assignment:
//   "an API response of 200 means that control was only hidden, never refused."
//
// Test ini mengunci ekspektasi itu sebagai spesifikasi yang bisa dieksekusi,
// mengikuti tabel scope di docs/decisions/0003-autentikasi.md §3:
//   operasi -> tepat satu scope. Token TANPA scope itu harus 403.
//
// CATATAN STATUS (per 2026-09-29): file ini RED. `service/src/` belum punya
// scope enforcement sama sekali — `grep -rE "requireScope|403|forbidden"`
// service/src/ menghasilkan NOL hasil. Yang ada baru `authenticate` (Layer 1),
// yang hanya memvalidasi signature token, BUKAN memeriksa berapa scope-nya.
//
// Artinya sekarang: token valid apa pun mendapat 200 di semua operasi.
// Demo A.9 dengan akun EO (tanpa `confirmations:write`) akan mengembalikan 200
// dan assignment GAGAL, bukan PARTIAL.
//
// TUJUAN FILE INI: memberi Service Owner spesifikasi eksekusi yang tidak ambigu
// tentang apa yang harus mengembalikan 403. Tidak mengubah service/.

const axios = require('axios');
const { validateProblemDetails } = require('./helpers/validator');
const {
  tokenFor,
  startJwksServer,
  stopJwksServer,
  tokenFromJwksServer,
} = require('../helpers/tokens.js');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ISSUER = process.env.OIDC_ISSUER || 'https://test.local/';
const AUDIENCE = process.env.OIDC_AUDIENCE || 'eventwise-api';

// Tabel scope ADR 0003 §3. Satu baris = satu operasi yang harus ditolak
// bila token tidak membawa scope yang diwajibkan.
const SCOPED_OPERATIONS = [
  { method: 'GET',    path: '/events',                                     scope: 'events:read' },
  { method: 'GET',    path: '/events/evt_authz_probe',                      scope: 'events:read' },
  { method: 'GET',    path: '/events/evt_authz_probe/progress',             scope: 'events:read' },
  { method: 'GET',    path: '/events/evt_authz_probe/sites',                scope: 'events:read' },
  { method: 'GET',    path: '/sites/site_authz_probe',                      scope: 'events:read' },
  { method: 'POST',   path: '/events',                                     scope: 'events:write' },
  { method: 'POST',   path: '/events/evt_authz_probe/sites',                scope: 'events:write' },
  { method: 'POST',   path: '/events/evt_authz_probe/site-approval',        scope: 'sites:approve' },
  { method: 'GET',    path: '/rosters',                                    scope: 'rosters:read' },
  { method: 'POST',   path: '/rosters',                                    scope: 'rosters:write' },
  { method: 'POST',   path: '/daily-collections',                          scope: 'collections:write' },
  { method: 'POST',   path: '/events/evt_authz_probe/daily-confirmation',  scope: 'confirmations:write' },
];

const ALL_SCOPES = [...new Set(SCOPED_OPERATIONS.map((op) => op.scope))];

let baseUrl;
let ownsJwksServer = false;
let externalJwks = null;

const client = axios.create({
  baseURL: BASE_URL,
  validateStatus: () => true,
});

function withToken(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Minta token dari sumber kunci yang BENAR-BENAR dilihat service.
 *
 * - Bila JWKS melayani dari proses lain (tests/helpers/jwks-server.js), token
 *   HARUS ditandatangani lewat /sign di sana. Fixture membangkitkan keypair
 *   acak per proses, jadi menandatangani sendiri di proses test akan
 *   menghasilkan kunci yang tidak cocok dengan JWK milik service.
 * - Bila JWKS tidak melayani (mis. mode lama), test menyalakan server sendiri
 *   dan menandatangani secara lokal.
 */
async function signToken(subject, scopes, options) {
  if (externalJwks) {
    return tokenFromJwksServer(externalJwks, subject, scopes, options);
  }
  return tokenFor(subject, scopes, options);
}

beforeAll(async () => {
  process.env.OIDC_ISSUER = ISSUER;
  process.env.OIDC_AUDIENCE = AUDIENCE;

  // Token HARUS ditandatangani dengan kunci yang sama dengan kunci yang
  // disajikan di OIDC_JWKS_URI milik service. Dua skenario yang didukung:
  //
  // 1. OIDC_JWKS_URI menunjuk ke server JWKS yang SUDAH hidup (dicek di sini
  //    dulu). Ini skenario CI: JWKS dinyalakan terpisah sebelum service start.
  //    Test TIDAK menjalankan server-nya sendiri.
  // 2. Belum ada yang melayani -> test menyalakan JWKS-nya sendiri di port itu,
  //    sehingga kunci yang menandatangani token = kunci yang dilihat service.
  //
  // Kenapa penting: fixture membangkitkan keypair acak per proses. Kalau test
  // menandatangani dengan kunci sendiri sementara service memakai kunci dari
  // proses lain, jwtVerify gagal dan SELURUH test 403 gagal karena alasan yang
  // salah (signature, bukan scope).
  if (!process.env.OIDC_JWKS_URI) {
    throw new Error(
      'OIDC_JWKS_URI belum di-set. Jalankan test dengan OIDC_JWKS_URI yang ' +
      'menunjuk ke port fixture (contoh: http://127.0.0.1:9999/jwks.json).'
    );
  }

  baseUrl = process.env.OIDC_JWKS_URI;

  // Kalau JWKS sudah melayani dari proses lain, PAKAI endpoint /sign-nya.
  // Mematikan server JWKS sendiri di sini akan menghasilkan kunci berbeda
  // dari yang dilihat service -> ERR_JWKS_NO_MATCHING_KEY.
  let alreadyServing = false;
  try {
    const res = await fetch(`${baseUrl}/jwks.json`);
    alreadyServing = res.ok;
  } catch {
    alreadyServing = false;
  }

  if (alreadyServing) {
    externalJwks = baseUrl;
    return;
  }

  const { port } = new URL(baseUrl);
  await startJwksServer(Number(port));
  ownsJwksServer = true;
});

afterAll(async () => {
  // Hanya matikan server yang benar-benar kita nyalakan sendiri.
  if (ownsJwksServer) {
    await stopJwksServer();
  }
});

describe('A.9 — scope enforcement (403 untuk scope yang tidak dimiliki)', () => {
  test('service hidup', async () => {
    const response = await client.get('/health');
    expect(response.status).toBe(200);
  });

  test('tabel scope operasi memuat 7 scope ADR 0003', () => {
    expect(ALL_SCOPES.sort()).toEqual(
      [
        'collections:write',
        'confirmations:write',
        'events:read',
        'events:write',
        'rosters:read',
        'rosters:write',
        'sites:approve',
      ].sort()
    );
  });

  describe.each(SCOPED_OPERATIONS)(
    '$method $path butuh $scope',
    ({ method, path, scope }) => {
      test('403 saat token tidak membawa scope itu', async () => {
        // Token valid secara kriptografi, tapi TANPA scope yang diwajibkan.
        // Inilah maneuver A.9: bypass UI, kirim langsung dari console.
        const token = await signToken('attacker-no-scope', []);

        const response = await client.request({
          method,
          url: path,
          ...withToken(token),
          data: method === 'GET' ? undefined : {},
        });

        expect(response.status).toBe(403);
        validateProblemDetails(response, 403);
      });
    }
  );
});

describe('A.9 — kasus demoEO attempting confirmation (harus 403, bukan 200)', () => {
  test('EO tanpa confirmations:write DITOLAK confirmasi akhir event', async () => {
    // Susunan persis seperti realm Keycloak: organizer-* punya 5 scope
    // (events:read/write, sites:approve, rosters:read/write) dan TIDAK punya
    // confirmations:write. Ini akun yang dipakai demo presentasi.
    const eoScopes = [
      'events:read',
      'events:write',
      'sites:approve',
      'rosters:read',
      'rosters:write',
    ];
    expect(eoScopes).not.toContain('confirmations:write');

    const token = await signToken('organizer-a', eoScopes);

    const response = await client.request({
      method: 'POST',
      url: '/events/evt_authz_probe/daily-confirmation',
      ...withToken(token),
      data: {},
    });

    // 200 di sini = FAIL kondisi A.9. Bukan 401 (token-nya valid),
    // bukan 404 (objeknya tidak jadi soal — yang ditolak adalah haknya).
    expect(response.status).toBe(403);
  });

  test('EO TETAP bisa membaca event (scope events:read tidak ikut menolak)', async () => {
    // Guard terhadap over-blocking: 403 yang salah sasaran juga bug.
    const token = await signToken('organizer-a', ['events:read', 'sites:approve']);

    const response = await client.request({
      method: 'GET',
      url: '/events',
      ...withToken(token),
    });

    expect(response.status).toBe(200);
  });
});

describe('401 vs 403 vs 404 harus berbeda (A.3)', () => {
  test('tanpa header Authorization -> 401 pada operasi terproteksi', async () => {
    const response = await client.get('/events');
    expect(response.status).toBe(401);
  });

  test('token dengan signature rusak -> 401 (bukan 403)', async () => {
    const token = await signToken('organizer-a', ALL_SCOPES);
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${p[0] === 'A' ? 'B' : 'A'}${p.slice(1)}.${s}`;

    const response = await client.request({
      method: 'GET',
      url: '/events',
      ...withToken(tampered),
    });

    // Lapis 1 (authn) gagal lebih dulu. 403 berarti service sempat
    // mempercayai signature lalu menolak scope-nya.
    expect(response.status).toBe(401);
  });

  test('token kedaluwarsa -> 401 (dasar session expiry di sisi client)', async () => {
    const token = await signToken('organizer-a', ALL_SCOPES, { expiresIn: '-1m' });

    const response = await client.request({
      method: 'GET',
      url: '/events',
      ...withToken(token),
    });

    expect(response.status).toBe(401);
  });
});
