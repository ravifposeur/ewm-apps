# 🏛️ Keputusan Arsitektur 0002: Implementasi Service (P3)

> **Status:** ✅ Accepted · **Versi:** 1.0 · **Tanggal:** 2026-09-10  
> **Terkait:** [ADR-0001 Domain](./0001-domain.md) · `openapi.yaml` · `service/db/schema.sql`

---

## 📋 Context

Setelah spesifikasi kontrak (`openapi.yaml`, **Tag 12**) diselesaikan di **Pertemuan 2**, tim **EWM-Apps** memasuki fase implementasi backend service (**P3, Tag 13**). Fase ini membutuhkan keputusan teknis yang tidak dinyatakan dalam `openapi.yaml`, antara lain:

| # | Pertanyaan | Syarat Terkait |
| :-: | :--- | :--- |
| 1 | **Penyedia hosting** mana yang dipakai? | A.10 |
| 2 | **Mekanisme penyimpanan idempotency key** | A.8 |
| 3 | **Strategi konfigurasi runtime** | A.10 |
| 4 | **Penyimpangan struktur folder**, jika ada | A.1 |

### 🧭 Konteks Pembatas

- 🐢 **Operasi batch** — submit *daily collections* bisa makan waktu > 5 detik per request.
- 📡 **Klien petugas lapangan** beroperasi dengan jaringan **intermiten** — idempotency adalah fondasi keamanan data.
- ⏰ **Deadline** P3: akhir sesi Pertemuan 3 — keputusan harus bisa dieksekusi cepat.
- 👥 Tim beranggotakan **4 orang** dengan latar belakang **Node.js**.

---

## ✅ Decision

### 1️⃣ Hosting Provider — **Render.com (Free Tier)**

**Alasan:**

- 🐘 **PostgreSQL managed** dalam satu platform — mengurangi konfigurasi eksternal.
- 🔄 **Auto-deploy dari GitHub** — setiap push ke `main` otomatis build & deploy.
- ⏱️ **Tidak ada timeout 10 detik** untuk request (berbeda dari Vercel).
- ❤️ **Health check** & **environment variable** mudah dikonfigurasi via dashboard.
- 🔒 Mendukung **internal networking** antara web service dan database — koneksi lebih cepat & aman.

---

### 2️⃣ Idempotency Storage — **Tabel `idempotency_keys` di PostgreSQL**

    CREATE TABLE idempotency_keys (
      key        VARCHAR(255) PRIMARY KEY,
      body_hash  VARCHAR(255) NOT NULL,
      response   JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

**Alasan:**

- 📜 Sesuai **A.8**: key **wajib** disimpan di database, bukan in-memory.
- ♻️ Jika service restart (paling mungkin terjadi saat error), key tetap tersedia.
- 🔐 `body_hash` (SHA-256 dari body request) memungkinkan deteksi reuse dengan body berbeda tanpa menyimpan body penuh.
- 📦 `response` disimpan sebagai **JSONB** — untuk replay response identik saat retry dengan body sama.

---

### 3️⃣ Konfigurasi Runtime — **Strict Validation, Fail Fast**

- 🛑 Service **refuses to start** jika `PORT` atau `DATABASE_URL` tidak ada.
- 🚫 **Tidak menggunakan fallback** untuk kredensial (mis. `DATABASE_URL || 'localhost'`) — bisa menyebabkan koneksi ke DB yang salah tanpa disadari.
- 📖 Semua konfigurasi dibaca di `src/app.js` **sebelum server listen**.

---

### 4️⃣ Struktur Folder — **100% Mengikuti A.1**

Semua file berada di lokasi yang ditentukan:

    📦 repo/
    ├── 📁 src/
    │   ├── 📁 routes/
    │   ├── 📁 schemas/
    │   ├── 📁 store/
    │   ├── 📁 representations/
    │   └── 📄 problem.js
    ├── 📁 db/
    │   ├── 📄 schema.sql
    │   └── 📄 seed.sql
    └── 📁 tests/
        └── 📁 contract/       ← sesuai lokasi openapi.yaml

---

## 🔍 Alternatives Considered

| Alternatif | Alasan Ditolak |
| :--- | :--- |
| **Vercel** | Tidak menyediakan PostgreSQL managed. Serverless function timeout 10 detik — tidak cukup untuk batch `daily-collections`. Cold start agresif pada free tier. |
| **Railway.app** | Sering outage & restart pada free tier, kurang stabil untuk demo. *(Cadangan jika Render bermasalah.)* |
| **Fly.io** | Perlu konfigurasi Docker & volume terpisah untuk PostgreSQL. Setup lebih lama. |
| **In-memory idempotency (Map / Redis)** | Key hilang saat restart — justru saat paling dibutuhkan. Sesuai **A.8**, ini menyebabkan **double-charge**. ❌ **Melanggar aturan.** |
| **SQLite** | Tidak mendukung concurrent writes untuk multi-instance. Render tidak mendukung SQLite persistent. |
| **MongoDB** | Tidak sesuai materi kelas (SQL). JSONB di PostgreSQL sudah cukup fleksibel untuk `extensions`. |
| **Fallback `DATABASE_URL \|\| 'localhost'`** | Berbahaya di production — service bisa diam-diam konek ke DB development. Kami pilih **fail-fast**. |

---

## 🌊 Consequences

### 🟢 Positif

1. **Deployment reproducible** — clone → `npm install` → `psql -f schema.sql` → siap. ✅ A.10
2. **Idempotency tahan restart** — key di DB, sesuai **A.8**. Demo *"restart service lalu retry"* akan bekerja.
3. **Kontrak tetap stabil** — tidak ada perubahan `openapi.yaml` akibat keputusan implementasi.
4. **Struktur folder konsisten** — memenuhi **A.1**, memudahkan verifikasi demonstrator.
5. **Fail-fast config** — error env terdeteksi di detik pertama, bukan error 500 yang membingungkan.

### 🔴 Negatif

1. **Cold start** Render free tier — service "tidur" setelah 15 menit idle, butuh ~15–30 detik untuk bangun.
   - *Mitigasi:* akses `GET /health` 1–2 menit sebelum demo ke asisten.
2. **Batas jam free tier** — 750 jam/bulan. Sering deploy ulang bisa menguras kuota.
   - *Mitigasi:* kurangi frekuensi deploy saat mendekati akhir bulan.
3. **Tidak ada graceful shutdown** — request in-flight bisa terputus saat restart.
   - *Mitigasi:* idempotency key memastikan retry aman.
4. **Kredensial di environment Render** — harus dikelola hati-hati.
   - *Mitigasi:* rotasi jika pernah ter-commit.

### ⚪ Netral

1. **Fallback `DB_HOST/DB_PORT/...` dihapus** — CI harus set `DATABASE_URL` eksplisit.
2. **Struktur folder 100% A.1** — fleksibilitas menambah folder (mis. `business/`) tetap diizinkan.

---
