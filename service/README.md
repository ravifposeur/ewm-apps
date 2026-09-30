# EventWise Core Service Documentation

Dokumentasi implementasi backend service untuk Event Waste Management (EWM) sesuai spesifikasi `openapi.yaml` dan panduan Session 3 (P3).

---

## A.3 Tabel Status Operasi (Operation Status Table)

| Operation | Method | Path | Served by | Remaining Work |
| :--- | :--- | :--- | :--- | :--- |
| `getEvents` | `GET` | `/v1/events` | **service** | — |
| `getEventById` | `GET` | `/v1/events/{eventId}` | **service** | — |
| `createEvent` | `POST` | `/v1/events` | **service** | — |
| `submitDailyCollection` | `POST` | `/v1/daily-collections` | **service** | — |
| `confirmEventDaily` | `POST` | `/v1/events/{eventId}/daily-confirmation` | **service** | — |
| `getHealth` | `GET` | `/health` | **service** | — |
| `approveSites` | `POST` | `/v1/events/{eventId}/site-approval` | mock | Validasi role approval & update status site |
| `getEventProgress` | `GET` | `/v1/events/{eventId}/progress` | mock | Kalkulasi agregasi unverified vs targetWeight |
| `listSites` | `GET` | `/v1/events/{eventId}/sites` | mock | Query relasi event-sites + filter `rosterId` |
| `createSite` | `POST` | `/v1/events/{eventId}/sites` | mock | Validasi coordinates & status `proposed` |
| `getSiteById` | `GET` | `/v1/sites/{siteId}` | mock | Single entity lookup & representation |
| `listRosters` | `GET` | `/v1/rosters?eventId=...` | mock | Filter berdasarkan `eventId` |
| `createRoster` | `POST` | `/v1/rosters` | mock | Validasi shift start/end & crew assignment |

**Legend:**
- `service` = sudah diimplementasikan di service
- `mock` = masih pakai Prism mock server
- `—` = sudah selesai

---

## A.6 Tabel Pemetaan Error (Error Catalog Mapping - RFC 9457)

Seluruh respons kegagalan disajikan dengan header `Content-Type: application/problem+json` dan format standar RFC 9457 Problem Details.

| Penyebab (Cause inside handler) | Status Code | Type URI | Extension Members | Tindakan Klien |
| :--- | :--- | :--- | :--- | :--- |
| ID malformed (format tidak sesuai pattern) | `400` | `/problems/invalid-id` | `invalidFields` (array) | Perbaiki format ID. Jangan retry. |
| Query parameter tidak sesuai schema | `400` | `/problems/invalid-query` | `invalidFields` (array) | Perbaiki query params. Jangan retry. |
| Body request tidak lengkap / salah tipe | `400` | `/problems/invalid-request` | `invalidFields` (array) | Perbaiki body request. Jangan retry. |
| Header `Idempotency-Key` hilang | `400` | `/problems/missing-idempotency-key` | — | Sertakan header `Idempotency-Key`. |
| `Idempotency-Key` bukan UUID v4 | `400` | `/problems/missing-idempotency-key` | — | Gunakan format UUID v4. |
| Entitas tidak ditemukan (Event/Site/Roster) | `404` | `/problems/not-found` | — | Pastikan ID benar. Jangan retry. |
| Berat sampah tidak valid (negatif / > 1.000.000g) | `422` | `/problems/invalid-weight` | `maxAllowed: 1000000` | Koreksi nilai berat. |
| Selisih berat petugas vs depot > 10% | `422` | `/problems/deviation-too-high` | `deviationPercentage: 14.7` | Admin audit fisik. Jangan retry otomatis. |
| Reuse `Idempotency-Key` dengan body berbeda | `409` | `/problems/idempotency-key-reuse` | `expectedHash: "..."` | Generate key baru untuk intent baru. |
| Error internal tak tertangani | `500` | `/problems/internal-server-error` | `instance` | Hubungi admin dengan `instance` ID. |

## Layer 3 — Object Ownership Inventory

| Handler | Object | Ownership Rule | Failure Response |
| :--- | :--- | :--- | :--- |
| `GET /v1/events` | events (collection) | SQL: `organizer_id = principal.subject` (non-service) | empty array |
| `POST /v1/events` | event (create) | `organizer_id` = `principal.subject` (server-assigned) | N/A |
| `GET /v1/events/{id}` | event | `principal.subject === event.organizer_id` OR service | **404** |
| `POST /v1/events/{id}/site-approval` | event | same as above | **404** |
| `GET /v1/events/{id}/sites` | sites of event | same as above | **404** |
| `POST /v1/events/{id}/sites` | event | same as above | **404** |
| `GET /v1/sites/{id}` | site → event | event's owner | **404** |
| `GET /v1/rosters?eventId=...` | rosters of event | event's owner | **404** |
| `POST /v1/rosters` | event | event's owner | **404** |
| `POST /v1/daily-collections` | roster | `principal.subject === roster.crew_id` OR service | **404** |
| `POST /v1/events/{id}/daily-confirmation` | event | scope `confirmations:write` + event exists | **404** |

**Keras:** "not found" dan "not owned" → **404 identik** (bukan 403). Ini mencegah attacker probe ID existence lewat perbedaan status code.

**Aturan:**
- Semua error di tabel ini **WAJIB ada di `openapi.yaml`** dengan contoh konkret.
- Error yang **belum diimplementasi** (misal `duplicate-confirmation`, `in-progress`) **tidak dimasukkan** ke tabel ini sampai diimplementasikan.
- Format `type` menggunakan **relative path** (`/problems/...`) untuk konsistensi dengan `problem.js`. Nanti bisa di-absolute-kan dengan domain jika perlu.
