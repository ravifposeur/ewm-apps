// tests/contract/operations_reachable.test.js
//
// Milik Integration Owner.
//
// Tujuan: menjamin SETIAP operasi yang dideklarasikan di openapi.yaml benar-benar
// ter-mount di service. Regression guard.
//
// Latar belakang: commit 5f7e44d (Layer 1 authentication) menghapus seluruh
// baris `app.use(...)` dari service/src/app.js. Akibatnya service hanya menjawab
// /health, sementara /events dan /daily-collections hilang. Tidak ada test yang
// menangkapnya karena test lama hanya menguji endpoint yang sudah memang ada.
//
// Cara kerja: untuk setiap operasi di openapi.yaml, kirim request. Route yang
// ter-mount akan menjawab dengan `application/problem+json` (bahkan untuk 404).
// Route yang TIDAK ter-mount dijawab Express dengan halaman 404 default-nya yang
// ber-Type `text/html`. Perbedaan content-type inilah yang dipakai sebagai
// penanda — bukan status code, karena 404 yang benar tetap 404.

const axios = require('axios');
const { loadOpenApiSpec } = require('./helpers/validator');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: BASE_URL,
  validateStatus: () => true,
  maxRedirects: 0,
  // Tanpa token: sengaja. Test ini menguji routing, bukan otorisasi.
  // Scope check (403) diuji terpisah di authorization.test.js.
});

/**
 * Bangun path konkret dari template OpenAPI, memakai nilai contoh supaya
 * request mendarat pada handler dan bukan ditolak oleh validasi format path.
 */
function concretePath(pathTemplate) {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_match, name) => {
    if (name === 'eventId') return 'evt_reachability_probe';
    if (name === 'siteId') return 'site_reachability_probe';
    return 'probe';
  });
}

function operationsFromSpec(spec) {
  const operations = [];

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (pathItem[method] && pathItem[method].operationId) {
        operations.push({
          operationId: pathItem[method].operationId,
          method: method.toUpperCase(),
          pathTemplate,
          path: concretePath(pathTemplate),
        });
      }
    }
  }

  return operations;
}

describe('OpenAPI reachability guard', () => {
  const spec = loadOpenApiSpec();
  const operations = operationsFromSpec(spec);

  test('openapi.yaml harus mendeklarasikan operasi', () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  test('service harus menjawab /health (service hidup)', async () => {
    const response = await client.get('/health');
    expect(response.status).toBe(200);
  });

  describe.each(operations)(
    '$method $pathTemplate ($operationId)',
    ({ method, path }) => {
      test('ter-mount di service — bukan 404 default Express', async () => {
        const response = await client.request({
          method,
          url: path,
          data: method === 'GET' || method === 'DELETE' ? undefined : {},
        });

        const contentType = String(
          response.headers['content-type'] || ''
        ).toLowerCase();

        // Route ter-mount -> Problem Details. Tidak ter-mount -> HTML.
        expect(contentType).not.toMatch(/text\/html/);

        if (contentType.includes('text/html')) {
          throw new Error(
            `Route ${method} ${path} tidak ter-mount. ` +
              'Service menjawab dengan halaman 404 default Express (text/html) ' +
              'alih-alih application/problem+json. Periksa app.use(...) di ' +
              'service/src/app.js.'
          );
        }
      });
    }
  );
});
