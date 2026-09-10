# Idempotency Policy

1. **Header dan Format**: `Idempotency-Key` dengan nilai UUID v4 (contoh: `550e8400-e29b-41d4-a716-446655440000`).

2. **Operasi yang Mewajibkan**:
   - WAJIB: `POST /v1/daily-collections` (sinkron batch).
   - WAJIB: `POST /v1/events/{id}/daily-confirmation` (konfirmasi unsafe).
   - DIABAIKAN: Semua metode GET.

3. **Jendela Retensi**: Key disimpan selama 24 jam.

4. **Perilaku Penggunaan Ulang**:
   - Key sama, body identik → Kembalikan response tersimpan (tidak proses ulang).
   - Key sama, body berbeda → Tolak dengan `409 Conflict`, `type: /problems/idempotency-key-reuse`.
   - Request asal masih diproses → `409 Conflict` dengan header `Retry-After: 5`.
