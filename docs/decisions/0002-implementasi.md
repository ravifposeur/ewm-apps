# Keputusan Arsitektur 0002: Implementasi Service

## Context
Setelah spesifikasi kontrak (openapi.yaml) selesai pada tahap sebelumnya, kami memulai implementasi service backend yang sesuai dengan kontrak tersebut. Keputusan teknis diperlukan untuk memastikan service dapat di-deploy, diuji, dan dioperasikan dengan baik.

## Decision

### Hosting Provider
- **Keputusan:** Menggunakan **Render.com** (free tier) untuk deployment.
- **Alasan:** Render menyediakan PostgreSQL bawaan (free), mudah integrasi dengan GitHub, dan memberikan public URL gratis. Selain itu, Render mendukung environment variables dan proses restart otomatis.

### Bahasa Pemrograman & Framework
- **Keputusan:** Menggunakan **Node.js** dengan framework **Express**.
- **Alasan:** Sesuai kesepakatan tim di Sesi 1, semua anggota familiar dengan JavaScript/Node.js. Express minimalis dan fleksibel untuk mengikuti struktur folder yang diminta (routes, schemas, store, representations).

### Database
- **Keputusan:** Menggunakan **PostgreSQL** (versi 14+).
- **Alasan:** Sesuai dengan layanan database yang disediakan Render. PostgreSQL mendukung constraint, transaksi, dan tipe data JSON yang berguna untuk field `extensions`.

### Penyimpanan Idempotency Key
- **Keputusan:** Idempotency key disimpan dalam tabel `idempotency_keys` di database yang sama.
- **Struktur tabel:**
  ```sql
  CREATE TABLE idempotency_keys (
    key VARCHAR(36) PRIMARY KEY,
    request_hash TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
  );
