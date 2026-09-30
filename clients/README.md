# Client Authentication Foundation (P4)

Dokumentasi ini menjelaskan arsitektur dan fondasi autentikasi sisi klien (*client-side authentication foundation*) untuk platform **EventWise** sesuai keputusan arsitektur **ADR 0003** (`docs/decisions/0003-autentikasi.md`).

## 🔐 Ringkasan Keamanan Client

1. **Public Clients** (`web-admin`, `web-eo`, `device-crew`):
   - Menggunakan **OAuth2 Authorization Code Flow + PKCE** (`code_challenge_method = S256`).
   - **TIDAK BOLEH** menyimpan atau memiliki `client_secret`.
   - Access token disimpan **hanya di memori** (`InMemoryTokenStore`) untuk Web SPA, dan pada **Encrypted Storage** (`EncryptedDeviceTokenStore`) untuk Device Petugas.
   - **Dilarang keras** menyimpan access token pada `localStorage` biasa.

2. **Confidential Client** (`reconciliation-job` / `mcp`):
   - Menggunakan **Client Credentials Flow** (Server-to-Server / M2M).
   - Secret dikelola melalui environment variable server / Secret Manager (TIDAK BOLEH di-commit ke source code).

3. **Scope Resmi (ADR 0003)**:
   - `events:read` — Membaca event, progress, dan sites.
   - `events:write` — Membuat event dan site baru.
   - `sites:approve` — Menyetujui site (event -> active).
   - `rosters:read` — Membaca roster petugas.
   - `rosters:write` — Menugaskan kru ke site.
   - `collections:write` — Mengirim batch data timbangan harian.
   - `confirmations:write` — Konfirmasi harian/akhir event + terbit sertifikat.

---

## 🛠️ Modul & Abstraksi Klien

- `clients/common/scopes.js`: Konstanta 7 scope resmi P4.
- `clients/common/pkce.js`: Generator `code_verifier` & `code_challenge` S256 aman menggunakan `crypto`.
- `clients/common/errors.js`: Penanganan terpusat untuk HTTP 401 (`AuthenticationRequiredError`), 403 (`ForbiddenError`), dan 404 (`NotFoundError` - *Uniform 404 Rule*).
- `clients/common/tokenStore.js`: Objek penyimpanan token (In-Memory & Encrypted Device).
- `clients/common/apiClient.js`: Client HTTP wrapper yang secara otomatis menginjeksi header `Authorization: Bearer <access_token>` dan memproses status error API.
- `clients/web/auth.js`: Entry point untuk Web Admin dan Web EO.
- `clients/device/auth.js`: Entry point untuk Device Petugas (offline-capable).
- `clients/mcp/auth.js`: Entry point untuk MCP Agent (Confidential Client).

---

## 🛡️ Penanganan Error Standard (401 / 403 / 404)

- **HTTP 401 Unauthorized**: Token tidak ada, kadaluwarsa, atau tidak valid. Klien memicu alur login/re-authentication.
- **HTTP 403 Forbidden**: Token valid tetapi scope/hak akses tidak mencukupi. Klien menampilkan notifikasi otorisasi tanpa melakukan re-login loop.
- **HTTP 404 Not Found (Uniformity Rule)**: Klien menangani 404 secara identik baik ketika entitas tidak ada maupun saat entitas milik pengguna lain (mencegah *ID enumeration*).
