// tests/e2e/console-attack.test.js
// Milik Integration Owner — P5 Guideline Task 2.
//
// Bukti otomatis untuk A.9. Ini persis maneuver yang dilakukan grader dari
// browser console: request yang sama, bypass UI sepenuhnya, dikirim langsung
// ke service.
//
// Failure condition dari assignment, dengan kalimatnya sendiri:
//   "an API response of 200 means that control was only hidden, never refused."
//
// Jadi 403 ATAU 412 semuanya benar. Yang TIDAK boleh: 200.

const { createAuthedClient, getTokenFor } = require('../helpers/axios.js');

const EVENT_ID = 'evt_001';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function idempotencyKey() {
  return require('crypto').randomUUID();
}

describe('A.9 — console attack: UI tidak bisa dibypass (Task 2)', () => {
  test('crew-a tidak bisa memanggil endpoint confirmations:write', async () => {
    // Token crew-a: punya collections:write, tidak punya confirmations:write.
    // Inilah maneuver A.9 — bypass UI, kirim request apa adanya.
    const token = await getTokenFor('crew-a', [
      'collections:write',
      'rosters:read',
      'events:read',
    ]);

    const res = await fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/v1/events/${EVENT_ID}/daily-confirmation`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey(),
        },
        body: JSON.stringify({
          adminId: 'admin-a',
          verifiedBreakdown: [{ wasteType: 'ORGANIK', weight: 1000 }],
        }),
      }
    );

    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('crew-a tidak bisa meng-approve sites (sites:approve)', async () => {
    const client = createAuthedClient({
      subject: 'crew-a',
      scopes: ['collections:write', 'rosters:read', 'events:read'],
    });

    const res = await client.post(`/v1/events/${EVENT_ID}/site-approval`, {});

    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('crew-a tidak bisa membuat site (events:write)', async () => {
    const client = createAuthedClient({
      subject: 'crew-a',
      scopes: ['collections:write', 'rosters:read', 'events:read'],
    });

    const res = await client.post(`/v1/events/${EVENT_ID}/sites`, {
      areaName: 'Area injections',
    });

    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('crew-a tidak bisa menulis roster (rosters:write)', async () => {
    const client = createAuthedClient({
      subject: 'crew-a',
      scopes: ['collections:write', 'rosters:read', 'events:read'],
    });

    const res = await client.post('/v1/rosters', {
      eventId: EVENT_ID,
      crewName: 'crew-a',
    });

    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('tanpa token sama sekali -> 401, bukan 403', async () => {
    // Lapis 1 (authn) harus gagal sebelum lapis 2 (authz) sempat jalan.
    // 403 di sini berarti service menebak-nebak soal identitas pemanggil.
    const res = await fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/v1/events`,
      { method: 'GET' }
    );

    expect(res.status).toBe(401);
    expect(res.status).not.toBe(403);
  });

  test('token rusak -> 401, bukan 403', async () => {
    const good = await getTokenFor('crew-a', ['events:read']);
    const [h, p, s] = good.split('.');
    const tampered = `${h}.${p[0] === 'A' ? 'B' : 'A'}${p.slice(1)}.${s}`;

    const res = await fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/v1/events`,
      { headers: { Authorization: `Bearer ${tampered}` } }
    );

    expect(res.status).toBe(401);
  });

  test('Layer 3: organizer-a tidak bisa membaca event milik organizer-b (404)', async () => {
    // Lapis ownership. 404, BUKAN 403 — dengan sengaja tidak membocorkan
    // bahwa evt_002 ada milik orang lain.
    const token = await getTokenFor('organizer-a', ['events:read']);

    const res = await fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/v1/events/evt_002`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(200);
  });

  test('Layer 3: organizer-b TIDAK bisa konfirmasi event milik organizer-a', async () => {
    // TEMUAN SERIUS — lihat docs/evidence/p5-console-attack.md.
    //
    // mayConfirmEvent() di service/src/auth/ownership.js mengembalikan `true`
    // tanpa memeriksa kepemilikan:
    //
    //   function mayConfirmEvent(principal, event) {
    //     if (!principal || !event) return false;
    //     return true;               // <- tidak ada cek isOwner
    //   }
    //
    // Akibatnya organizer-b (EO lain) bisa mengonfirmasi evt_001 milik
    // organizer-a dan memperoleh sertifikat + poin. Diverifikasi: request
    // mengembalikan 200 beserta certificateUrl.
    //
    // Ini kondisi FAIL A.9 yang paling berbahaya — bukan 403 yang hilang pada
    // scope, tapi Layer 3 yang tidak ada pada operasi paling sensitif
    // (konfirmasi akhir tidak boleh terjadi dua kali, dan sertifikat adalah
    // nilai komersial untuk EO).
    //
    // Ekspektasi yang benar: 404 (event milik orang lain TIDAK boleh konfirmasi,
    // dan service sengaja menjawab 404 agar keberadaan tidak bocor).
    const token = await getTokenFor('organizer-b', [
      'events:read',
      'events:write',
      'confirmations:write',
    ]);

    const res = await fetch(
      `${process.env.BASE_URL || 'http://localhost:3000'}/v1/events/evt_001/daily-confirmation`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey(),
        },
        // Weight dibuat cocok dengan recordedTotal (23000g) supaya business
        // rule selisih-10% TIDAK yang menolak — supaya test ini benar-benar
        // menguji ownership, bukan aturan bisnis.
        body: JSON.stringify({
          adminId: 'organizer-b',
          verifiedBreakdown: [{ wasteType: 'ORGANIK', weight: 23000 }],
        }),
      }
    );

    // 200 = sertifikat terbit untuk event orang lain. Ini yang ditemukan.
    expect(res.status).not.toBe(200);
    expect([403, 404]).toContain(res.status);
  });

  test('Idempotency-Key yang dipakai crew-a tidak pernah tersimpan', async () => {
    // Kalau service menolak SETELAH menyimpan idempotency key, maka retry
    // dengan key sama akan membaca respons tersimpan — termasuk untuk request
    // yang tidak pernah diizinkan. Key harus ditolak tanpa efek samping.
    const key = idempotencyKey();
    expect(UUID_V4.test(key)).toBe(true);

    const token = await getTokenFor('crew-a', ['events:read']);
    const url = `${process.env.BASE_URL || 'http://localhost:3000'}/v1/events/${EVENT_ID}/daily-confirmation`;

    const send = () =>
      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ adminId: 'admin-a' }),
      });

    const first = await send();
    const second = await send();

    // Dua request dengan key sama. Keduanya harus ditolak dengan status yang
    // sama — kalau yang kedua 409 idempotency-key-reuse, berarti service
    // sempat menyimpan key dari request yang tidak berwenang.
    expect([403, 404]).toContain(first.status);
    expect([403, 404]).toContain(second.status);
    expect(second.status).not.toBe(200);
  });
});
