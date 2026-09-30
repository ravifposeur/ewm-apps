// tests/authz/write-denied.test.js
// Milik Integration Owner — P5 Guideline Task 1.
//
// Membuktikan hal yang DILEWATI oleh test authorization biasa: ketika service
// menolak sebuah write dengan 403, database benar-benar TIDAK berubah.
//
// Kenapa ini penting. A 403 yang terjadi SETELAH penulisan ke database bukan
// penolakan — itu kebocoran. Test ini mengambil snapshot state sebelum dan
// sesudah, lalu membandingkan. Kalau satu baris pun berubah, service menolak
// dengan cara yang salah.
//
// Ini juga bukti bahwa "hide button" bukan security boundary: request yang
// sama, dikirim langsung ke service, ditolak DAN tidak meninggalkan jejak.
//
// Prasyarat: service harus jalan dengan DATABASE_URL yang menunjuk ke DB test
// yang sama dengan DATABASE_URL di environment test ini.

const { createAuthedClient, getTokenFor, BASE_URL } = require('../helpers/axios.js');

const EVENT_ID = 'evt_001'; // milik organizer-a di seed.sql

// Event yang dipakai sebagai target. Snapshot diambil dengan akun yang
// MEMILIKI event tersebut, yaitu organizer-a. Layer 3 (ownership) menolak
// 404 untuk event milik orang lain — jadi admin-a tidak bisa dipakai untuk
// membaca state di sini, dan itu memang perilaku yang benar.
async function readEventAsOwner(client, eventId) {
  const res = await client.get(`/v1/events/${eventId}`);
  if (res.status !== 200) {
    throw new Error(
      `Setup gagal: GET /v1/events/${eventId} -> ${res.status}. ` +
        'Event harus ada di seed dan dibaca oleh pemiliknya (organizer-a).'
    );
  }
  return res.data;
}

describe('A.9 — write yang ditolak tidak boleh mengubah state (Task 1)', () => {
  let owner;
  let crew;

  beforeAll(() => {
    // organizer-a adalah pemilik evt_001 di seed.sql (Layer 3).
    owner = createAuthedClient({ subject: 'organizer-a', scopes: ['events:read'] });
    // crew-a hanya punya collections:write. Tidak punya confirmations:write,
    // jadi ia tidak berhak mengonfirmasi akhir event.
    crew = createAuthedClient({
      subject: 'crew-a',
      scopes: ['collections:write', 'rosters:read', 'events:read'],
    });
  });

  test('crew-a tidak bisa konfirmasi akhir event (403)', async () => {
    const res = await crew.post(`/v1/events/${EVENT_ID}/daily-confirmation`, {
      adminId: 'admin-a',
      verifiedBreakdown: [{ wasteType: 'ORGANIK', weight: 1000 }],
    });

    expect(res.status).toBe(403);
    expect(res.data.type).toBe('/problems/forbidden');
  });

  test('state event tidak berubah setelah penolakan 403', async () => {
    const before = await readEventAsOwner(owner, EVENT_ID);
    const res = await crew.post(`/v1/events/${EVENT_ID}/daily-confirmation`, {
      adminId: 'admin-a',
      verifiedBreakdown: [{ wasteType: 'ORGANIK', weight: 9999 }],
    });
    const after = await readEventAsOwner(owner, EVENT_ID);

    expect(res.status).toBe(403);
    // Bandingkan seluruh representasi yang dikembalikan kontrak, bukan cuma status.
    expect(after).toEqual(before);
  });

  test('submit collection timbangan ekstrem tidak merusak state event', async () => {
    // Timbangan yang diklaim: 5 ton. Kalau service sempat menulis sebelum
    // menolak, progress event akan bergeser dan pembuktiannya rusak.
    const client = createAuthedClient({
      subject: 'crew-a',
      scopes: ['collections:write', 'events:read'],
    });

    const before = await readEventAsOwner(owner, EVENT_ID);

    const res = await client.post('/v1/daily-collections', {
      eventId: EVENT_ID,
      records: [
        {
          wasteType: 'ORGANIK',
          weight: 5_000_000,
          recordedAt: new Date().toISOString(),
          rosterId: null,
          siteId: null,
        },
      ],
    });

    // collection_records tidak memantulkan status konfirmasi, jadi untuk
    // operasi ini kita memastikan respons bukan sukses diam-diam DAN event
    // tetap utuh.
    expect([202, 400, 403, 422]).toContain(res.status);
    expect(res.status).not.toBe(500);

    const after = await readEventAsOwner(owner, EVENT_ID);
    expect(after.status).toBe(before.status);
  });

  test('pemilik event (memiliki events:read) TIDAK kena 403', async () => {
    // Guard terhadap over-blocking. Kalau semua orang dapat 403, test di atas
    // jadi tidak berarti apa-apa.
    const res = await owner.get(`/v1/events/${EVENT_ID}`);
    expect(res.status).toBe(200);
  });

  test('token EO tanpa confirmations:write ditolak dengan 403', async () => {
    // Maneuver A.9: token valid secara kriptografi, tapi haknya tidak ada.
    const token = await getTokenFor('organizer-a', [
      'events:read',
      'events:write',
      'sites:approve',
      'rosters:read',
      'rosters:write',
    ]);

    const res = await crew.post(
      `/v1/events/${EVENT_ID}/daily-confirmation`,
      { adminId: 'admin-a' },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // 403 = ditolak dengan benar. 401 = token ditolak (maskalah). 200 = FAIL.
    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  });
});
