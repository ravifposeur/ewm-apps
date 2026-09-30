// tests/helpers/jwks-server.js
// Milik Integration Owner.
//
// Menjalankan server JWKS test sebagai PROSES TERPISAH:
//
//   JWKS_PORT=9999 node tests/helpers/jwks-server.js
//
// Kenapa proses terpisah (bukan startJwksServer di dalam test):
//
// Service melakukan CACHE JWKS lewat createRemoteJWKSet. Kalau JWKS belum hidup
// saat service menerima token pertama, ia mengunduh sesuatu yang tidak berguna
// dan mengunci kunci itu selamanya — hasilnya ERR_JWKS_NO_MATCHING_KEY
// untuk setiap token berikutnya.
//
// Fixture ini membangkitkan keypair ACak per proses. Kalau test berjalan di
// proses berbeda dari JWKS, keduanya punya keypair berbeda dan token dari test
// tidak akan pernah cocok dengan JWK yang diunduh service.
//
// Solusinya: HANYA SATU proses yang memegang keypair, yaitu proses ini. Ia
// menyajikan JWK ke service (/jwks.json) DAN menandatangani token atas permintaan
// test (/sign). Service dan test boleh di proses terpisah; kuncinya satu.
//
// Urutan yang benar di CI:
//   1. node tests/helpers/jwks-server.js      (JWKS hidup, kunci terbentuk)
//   2. node service/src/app.js                (OIDC_JWKS_URI menunjuk ke JWKS)
//   3. npm run test:contract

const { startJwksServer } = require('./tokens.js');

const port = Number(process.env.JWKS_PORT || 9999);

startJwksServer(port)
  .then((url) => {
    console.log(`JWKS test server listening at ${url}/jwks.json`);
    console.log(`Sign endpoint: ${url}/sign (POST {sub, scopes})`);
  })
  .catch((err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} sudah dipakai. Hentikan proses JWKS lama, atau ` +
          'jalankan dengan JWKS_PORT=<port lain>.'
      );
    } else {
      console.error('Gagal menjalankan JWKS test server:', err);
    }
    process.exit(1);
  });
