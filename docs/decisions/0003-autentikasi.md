# Keputusan Arsitektur 0003: Autentikasi & Access Control (Session 4)

> Pemilik: Integration Owner. Sumber kebenaran (SDD): `openapi.yaml`
> (`components.securitySchemes.oauth2.scopes`) + dokumen ini.
> Contoh `kantin` di materi (student/courier/staff-outlet, scope `orders:read`)
> dipetakan ke domain EWM di bawah — bentuk disalin, isi disesuaikan.

## Context

Service Session 3 (EventWise Core API) berjalan tanpa autentikasi. Semua operasi
`/v1/**` dan `/events/**` dapat dipanggil siapa saja. Data timbangan, roster kru,
dan konfirmasi akhir event (penerbit sertifikat + poin, tidak boleh double) wajib
dilindungi pemanggil yang terverifikasi.

Tiga lapis pengecekan dipisah dan berurutan: (1) authentication membangun
`req.principal`; (2) scope check sebelum menyentuh database; (3) object check di
dalam handler. Syarat wajib: `404` identik untuk "tidak ada" vs "bukan milikmu".

## Decision

### 1. Authorization Server: Keycloak v26+ self-hosted via Docker (dev)

- File: `infra/docker-compose.auth.yml` (terisolasi di `infra/`, milik Integration
  Owner — tidak menyentuh `service/**`, `openapi.yaml`, atau `package.json`).
- Menjalankan: `docker compose -f infra/docker-compose.auth.yml up -d`
  dengan `KC_ADMIN_PASSWORD` dari environment (tidak pernah di-commit).
- Realm: `eventwise` (padanan `kantin` di materi).
- Wajib mendukung **refresh token rotation + reuse detection** (dibuktikan Step 10).
- Service adalah *resource server*: tidak menerima password, tidak menerbitkan token.

### 2. Klasifikasi client (Step 1)

| Client kami | Berjalan di | Public/Confidential | Flow | Punya secret? |
| :--- | :--- | :--- | :--- | :--- |
| Web Admin (Session 5) | Browser user | Public | Authorization Code + PKCE | Tidak |
| Device Petugas (offline) | Perangkat kru | Public | Authorization Code + PKCE | Tidak |
| Web EO | Browser user | Public | Authorization Code + PKCE | Tidak |
| MCP/Agen AI + Scheduled job (rekonsiliasi) | Server tim | Confidential | Client Credentials | Ya, di secret manager |

Aturan public client: Client Auth OFF, Standard Flow ON, PKCE S256, Direct Access
Grants OFF, Redirect URI dicocokkan penuh tanpa wildcard, token tidak pernah di
address bar. Confidential job: Client Auth ON, Service Account ON, Standard Flow
OFF, scope minimal, secret hanya via secret manager/env hosting.

### 3. Scope vocabulary EWM (Step 2) — 7 scope, `resource:action`

| Scope | Kemampuan (satu kalimat) | EO | Kru | Admin | Job |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `events:read` | Lihat event, progress, dan sites | yes | yes | yes | — |
| `events:write` | Buat event dan site baru | yes | — | yes | — |
| `sites:approve` | Approve semua site (event → `active`) | yes | — | — | — |
| `rosters:read` | Lihat roster kru | yes | yes | yes | — |
| `rosters:write` | Assign kru ke site | yes | — | yes | — |
| `collections:write` | Submit batch timbangan harian | — | yes | — | — |
| `confirmations:write` | Konfirmasi akhir + terbit sertifikat | — | — | yes | — |

Pemetaan operasi → tepat satu scope (disalin persis ke `openapi.yaml` Step 4 dan
ke argumen `requireScope(...)` Step 7 — string harus identik, mis.
`collections:write`, bukan `collection:write` atau `collections.write`):

| Operasi | Scope |
| :--- | :--- |
| `GET /events`, `GET /events/{eventId}`, `GET /events/{eventId}/progress`, `GET /events/{eventId}/sites`, `GET /sites/{siteId}` | `events:read` |
| `POST /events`, `POST /events/{eventId}/sites` | `events:write` |
| `POST /events/{eventId}/site-approval` | `sites:approve` |
| `GET /rosters` | `rosters:read` |
| `POST /rosters` | `rosters:write` |
| `POST /daily-collections` | `collections:write` |
| `POST /events/{eventId}/daily-confirmation` | `confirmations:write` |
| `GET /health` | publik (`security: []`) |

### 4. Konfigurasi Keycloak (Step 3a–3h)

**3a. Jalankan server** — `infra/docker-compose.auth.yml` (Keycloak 26, `start-dev`).

**3b. Realm** — buat realm `eventwise`.

**3c. Client scopes** — daftarkan 7 scope tabel di atas sebagai client scope,
string persis sama (cek: `events:read` bukan `event:read`/`events.read`).

**3d. Public clients** (`web-admin`, `device-crew`, `web-eo`):

| Setting | Value |
| :--- | :--- |
| Client authentication | OFF |
| Standard flow / Authorization Code | ON |
| PKCE code challenge method | S256 |
| Valid redirect URI | penuh, mis. `https://admin.ewm.example/callback` — tanpa wildcard |
| Direct access grants | OFF |

**3e. Confidential client** (`reconciliation-job`): Client Auth ON, Service
Account ON, Standard Flow OFF, hanya scope yang dibutuhkan
(mis. `events:read` + `confirmations:write` sesuai kebutuhan job). Secret →
secret manager, tidak pernah ke repo.

**3f. Refresh rotation + reuse detection** — aktifkan di realm/client
(Keycloak: *Revoke Refresh Token* = ON; sesi idle/max lifespan diset; pisahkan
 SSO session idle vs client session). Dibuktikan dengan 3 curl Step 10
 (lihat "Bukti rotasi" di bawah).

**3g. Enam test user** (pemetaan Kantin → EWM):

| User | Peran EWM | Padanan materi | Dipakai test |
| :--- | :--- | :--- | :--- |
| `organizer-a`, `organizer-b` | Event Organizer | `student-a/b` | organizer membaca event organizer lain → 404 |
| `crew-a`, `crew-b` | Petugas lapangan | `courier-a/b` | kru mengklaim roster/delivery kru lain → 404 |
| `admin-a`, `admin-b` | Admin vendor (beda event) | `staff-outlet-a/b` | admin event A membaca event B → 404 |

Skrip pembuatan (via Admin API, tanpa klik manual berulang):

```bash
export KC=http://localhost:8080 ADMIN_T=...  # token admin bootstrap
for u in organizer-a organizer-b crew-a crew-b admin-a admin-b; do
  curl -s -X POST "$KC/admin/realms/eventwise/users" \
    -H "Authorization: Bearer $ADMIN_T" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$u\",\"enabled\":true,
         \"credentials\":[{\"type\":\"password\",\"value\":\"Pass-$u-123\",\"temporary\":false}]}"
done
```

**3h. Discovery document** — hanya dua nilai yang dibutuhkan service:

```bash
curl -s http://localhost:8080/realms/eventwise/.well-known/openid-configuration \
  | jq '{issuer, jwks_uri}'
```

`OIDC_AUDIENCE` = nama service sebagai audience, mis. `eventwise-api`
(menolak token yang diterbitkan untuk API lain di realm yang sama).
Jangan tempel token live ke situs decoding online.

Template untuk `service/.env.example` (Contract/Service Owner menambahkan
tiga baris ini — Integration Owner tidak mengedit file bersama langsung):

```env
OIDC_ISSUER=
OIDC_JWKS_URI=
OIDC_AUDIENCE=
```

Contoh nilai dev (tidak di-commit sebagai nilai nyata):

```env
OIDC_ISSUER=http://localhost:8080/realms/eventwise
OIDC_JWKS_URI=http://localhost:8080/realms/eventwise/protocol/openid-connect/certs
OIDC_AUDIENCE=eventwise-api
```

### 5. Strategi token untuk test (Step 11a): local test key (recommended)

- `tests/helpers/tokens.js` (milik Integration Owner, path terisolasi):
  key pair RS256 + server JWKS mini + `tokenFor(subject, scopes)`.
- Alur TDD: `tests/helpers/tokens.test.js` ditulis dulu (RED: import gagal /
  verifikasi gagal), lalu helper diimplementasikan hingga GREEN.
- Bukti GREEN (dieksekusi 2026-09-23, Node v22, `jose@5`, tanpa jaringan):
  `RED ok` + `GREEN-1..5 ok` + `ALL GREEN` (lihat log verifikasi pada PR).
- `OIDC_ISSUER` saat test = `https://test.local/` (test-only) sehingga token
  test tidak pernah diterima service production.

### 6. Penyimpanan token per platform (Step 10a)

| Platform | Gunakan | Hindari |
| :--- | :--- | :--- |
| Browser | Access token di memori; refresh token di cookie `HttpOnly`, `Secure`, `SameSite` | `localStorage` (terbaca skrip halaman) |
| Android | `EncryptedSharedPreferences`/Keystore | `SharedPreferences` polos / storage eksternal |
| iOS | Keychain (accessibility class sesuai) | `UserDefaults`/file polos |
| Server job | Secret manager, injeksi runtime | Source code / `.env` ter-commit |

### 7. Bukti refresh rotation & reuse detection (Step 10b)

```bash
# 1. Tukar RT1 -> dapat RT2, RT1 hangus (rotated)
RT2=$(curl -s -X POST "$ISSUER/protocol/openid-connect/token" \
  -d grant_type=refresh_token -d client_id=web-admin -d refresh_token="$RT1" \
  | jq -r .refresh_token)
[ "$RT1" != "$RT2" ] && echo "rotation is working"

# 2. Pakai ulang RT1 yang hangus -> DITOLAK
curl -s -X POST "$ISSUER/protocol/openid-connect/token" \
  -d grant_type=refresh_token -d client_id=web-admin -d refresh_token="$RT1" \
  | jq .error

# 3. RT2 juga DITOLAK -> seluruh famili dicabut (revoked)
curl -s -X POST "$ISSUER/protocol/openid-connect/token" \
  -d grant_type=refresh_token -d client_id=web-admin -d refresh_token="$RT2" \
  | jq .error
```

Hasil benar: RT2 ≠ RT1; langkah 2 ditolak; langkah 3 **juga** ditolak. Jika
langkah 3 masih sukses → reuse detection belum aktif (server hanya menolak
token lama, bukan mencabut familinya). Tempel tiga output ke sini sebagai
evidence + nama setting yang diaktifkan. Server tidak perlu menebak pihak
yang sah — cabut famili, catat event, wajibkan login ulang.

## Alternatives Considered

| Alternatif | Alasan ditolak |
| :--- | :--- |
| Hosted auth service (bukan Keycloak self-host) | Boleh per materi, tapi self-host memberi kontrol penuh atas rotation/reuse setting dan gratis untuk CI lokal. |
| Direct grant untuk test | Hanya untuk grup yang ingin menguji konfigurasi server; membuat CI bergantung jaringan → flaky. Dipilih local test key. |
| Satu scope per endpoint (mis. `events.list`, `events.get`) | Ditolak: vocabulary harus dari kapabilitas aktor; jumlah scope mendekati jumlah operasi = desain salah. |
| Token di `localStorage` / query param | Ditolak: terbaca skrip injeksi, tersalin ke history/log/referral. |

## Consequences

- Positif: kontrak (`openapi.yaml`) memimpin; tiga lapis cek terpisah dan
  teruji; CI tidak bergantung jaringan; rotasi refresh terbukti.
- Negatif: grup wajib menjalankan Keycloak dev secara lokal; test authz (+4
  negative tests) menambah waktu CI.
- Netral: token format/provider bisa diganti tanpa menyentuh handler — cukup
  `principal.js` + konfigurasi OIDC.

## Protokol anti-conflict (ringkasan — detail di pesan PR)

File milik Integration Owner (aman diedit): `infra/**`, `tests/helpers/**`,
`docs/decisions/0003-autentikasi.md` (baru). File bersama (jangan edit langsung
tanpa koordinasi): `openapi.yaml`, `package.json`, `service/.env.example`,
`service/**`, `.github/workflows/**`. Selalu `git fetch` + `rebase` sebelum
kerja dan sebelum push; beri snippet, bukan edit langsung, untuk file bersama.
