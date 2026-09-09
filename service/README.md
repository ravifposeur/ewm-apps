# EventWise Core Service Documentation

Dokumentasi implementasi backend service untuk Event Waste Management (EWM) sesuai spesifikasi `openapi.yaml` dan panduan Session 3 (P3).

---

## A.3 Tabel Status Operasi (Operation Status Table)

Tabel ini melacak status implementasi setiap operasi API pada service backend.

| Operation | Method | Path | Served by | Remaining Work |
| :--- | :--- | :--- | :--- | :--- |
| `getEvents` | `GET` | `/events` | `service` | Implementasi filter query (`status`, `organizerId`) & pagination |
| `createEvent` | `POST` | `/events` | `service` | Validasi input schema & persistensi DB |
| `getEventById` | `GET` | `/events/{eventId}` | `service` | Representation layer & validasi ID format (400 vs 404) |
| `approveSite` | `POST` | `/events/{eventId}/site-approval` | `service` | Validasi role approval & update status site |
| `getEventProgress` | `GET` | `/events/{eventId}/progress` | `service` | Kalkulasi berat agregasi unverified vs target |
| `confirmEventDaily` | `POST` | `/events/{eventId}/daily-confirmation` | `service` | Engine deviasi 10%, kalkulasi poin, hazard rules, idempotency key |
| `listEventSites` | `GET` | `/events/{eventId}/sites` | `service` | Query relasi event-sites |
| `createSite` | `POST` | `/events/{eventId}/sites` | `service` | Validasi coordinates & initial status `proposed` |
| `getSiteById` | `GET` | `/sites/{siteId}` | `service` | Single entity lookup & representations |
| `listRosters` | `GET` | `/rosters` | `service` | Filter berdasarkan `eventId`, `siteId` |
| `createRoster` | `POST` | `/rosters` | `service` | Validasi shift start/end & crew assignment |
| `submitDailyCollection` | `POST` | `/daily-collections` | `service` | Batch record insert, handling wasteType, header Idempotency-Key |

---

## A.6 Tabel Pemetaan Error (Error Catalog Mapping - RFC 9457)

Seluruh respons kegagalan disajikan dengan header `Content-Type: application/problem+json` dan format standar RFC 9457 Problem Details.

| Penyebab Error (Cause inside handler) | Status Code | Type URI | Extension Members | Tindakan Klien |
| :--- | :--- | :--- | :--- | :--- |
| Format ID atau syntax JSON tidak valid (*malformed*) | `400` | `https://api.eventwise.co/problems/invalid-request` | `invalidFields` (array) | Perbaiki format request sebelum mengirim ulang. |
| Header `Idempotency-Key` hilang atau bukan UUID v4 valid | `400` | `https://api.eventwise.co/problems/missing-idempotency-key` | - | Sertakan header `Idempotency-Key` berupa UUID v4. |
| Entitas yang dicari tidak ditemukan di database | `404` | `https://api.eventwise.co/problems/not-found` | - | Pastikan resource ID benar dan sudah terdaftar. |
| Nilai berat sampah tidak valid (negatif atau > 1.000.000g) | `422` | `https://api.eventwise.co/problems/invalid-weight` | `"maxAllowed": 1000000` | Koreksi nilai berat sampah sesuai batas toleransi. |
| Selisih berat petugas vs verifikasi depot > 10% | `422` | `https://api.eventwise.co/problems/deviation-too-high` | `"deviationPercentage": 14.7` | Admin melakukan audit fisik. Jangan lakukan retry otomatis. |
| Penggunaan ulang `Idempotency-Key` dengan payload body berbeda | `409` | `https://api.eventwise.co/problems/idempotency-key-reuse` | `"expectedHash": "..."` | Generate `Idempotency-Key` baru untuk payload berbeda. |
| Konfirmasi event sudah pernah dilakukan sebelumnya | `409` | `https://api.eventwise.co/problems/duplicate-confirmation` | `"confirmedAt": "..."` | Event sudah final. Tampilkan status 'Selesai'. |
| Request idempotency awal masih dalam status pemrosesan | `409` | `https://api.eventwise.co/problems/in-progress` | Header `Retry-After: 5` | Tunggu dan retry sesuai durasi `Retry-After`. |
| Kesalahan sistem server internal yang tidak tertangani | `500` | `https://api.eventwise.co/problems/internal-server-error` | `"instance": "/problems/..."` | Hubungi administrator sistem dengan menyertakan `instance` ID. |
