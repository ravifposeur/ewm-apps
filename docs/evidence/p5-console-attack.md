# P5 Console Attack Evidence (A.9)

> Milik Integration Owner · 30 September 2026
> Failure condition Session 7: *"an API response of 200 means that control was
> only hidden, never refused."*

## Ringkasan

Scope enforcement (Layer 2) **berfungsi**. Ownership check pada reads
(Layer 3) **berfungsi**. Tetapi ada satu kebocoran lintas-tenant pada operasi
paling sensitif — lihat [Temuan Kritis](#temuan-kritis-layer-3-tidak-ada-pada-daily-confirmation).

| Uji | Hasil |
| :--- | :--- |
| `crew-a` → `POST /daily-confirmation` (butuh `confirmations:write`) | ✅ 403 |
| `crew-a` → `POST /site-approval` (butuh `sites:approve`) | ✅ 403 |
| `crew-a` → `POST /sites` (butuh `events:write`) | ✅ 403 |
| `crew-a` → `POST /rosters` (butuh `rosters:write`) | ✅ 403 |
| Tanpa token | ✅ 401 |
| Token rusak | ✅ 401 |
| `organizer-a` baca `evt_002` milik orang lain | ✅ 404 (tidak membocorkan keberadaan) |
| DB tidak berubah setelah 403 | ✅ |
| Idempotency key dari request DITOLAK tidak tersimpan | ✅ 0 dari 3 request |
| **`organizer-b` konfirmasi `evt_001` milik `organizer-a`** | ❌ **200 — sertifikat terbit** |

---

## Temuan Kritis: Layer 3 tidak ada pada daily-confirmation

`service/src/auth/ownership.js`:

```js
function mayConfirmEvent(principal, event) {
  if (!principal || !event) return false;
  return true;              // ← tidak ada pemeriksaan isOwner
}
```

Semua fungsi lain di file itu memanggil `isOwner(principal, event.organizer_id)`.
`mayConfirmEvent` tidak. Akibatnya pemeriksaan kepemilikan dilewati sepenuhnya
pada `POST /v1/events/{eventId}/daily-confirmation`.

### Bukti eksploitasi

`organizer-b` adalah EO untuk `evt_002`. Ia mengirim konfirmasi untuk
`evt_001` (milik `organizer-a`) dengan token yang **sah** dan scope
`confirmations:write` yang memang ada di haknya:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_ORGANIZER_B" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"adminId":"organizer-b",
       "verifiedBreakdown":[{"wasteType":"ORGANIK","weight":23000}]}' \
  http://localhost:3000/v1/events/evt_001/daily-confirmation
```

Respons:

```json
{
  "eventId": "evt_001",
  "recordedTotal": 23000,
  "verifiedTotal": 23000,
  "totalPoints": 11500,
  "grade": "SILVER",
  "certificateUrl": "/reports/cert_evt_001.pdf",
  "reportUrl": "/reports/report_evt_002.pdf"
}
```

**HTTP 200.** `weight: 23000` dipilih agar cocok dengan `recordedTotal`
sehingga business rule selisih-10% tidak menolak — dengan begitu yang terbukti
adalah kegagalan ownership, bukan aturan bisnis.

Konsekuensi domain:

- Sertifikat dan poin terbit untuk event milik EO lain.
- `points_multiplier` event orang lain terpakai untuk menghitung poin.
- Idempotency key tersimpan; percobaan ulang dengan key sama mengembalikan
  **200 dari cache**, bukan 404.
- Operasi ini secara domain "tidak boleh terjadi dua kali" dan membawa nilai
  komersial —memperoleh sertifikat untuk orang yang tidak berhak adalah bypass yang berhasil.

### Perbaikan yang diharapkan

```js
function mayConfirmEvent(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  return isOwner(principal, event.organizer_id);
}
```

Setelah itu, ekspektasi `organizer-b` → `evt_001` menjadi **404** (bukan 403),
supaya keberadaan event milik orang lain tidak bocor — konsisten dengan
`GET /events/{id}`.

Test yang mengunci ini ada di
`tests/e2e/console-attack.test.js` → *"Layer 3: organizer-b TIDAK bisa konfirmasi
event milik organizer-a"*, dan **saat ini gagal** dengan `Expected: not 200`.

---

## Bukti pendukung (yang lulus)

### Scope ditolak dengan 403

```
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json; charset=utf-8

{"type":"/problems/forbidden","title":"Forbidden","status":403,
 "detail":"Missing required scope. Needs one of: confirmations:write",
 "instance":"/v1/events/evt_001/daily-confirmation"}
```

### Database tidak berubah setelah penolakan

```
### BEFORE          ### AFTER
evt_001|active      evt_001|active
evt_002|active      evt_002|active
```

### Idempotency key dari request DITOLAK tidak pernah tersimpan

```bash
psql -c "delete from idempotency_keys;"
# kirim 3x request yang DITOLAK, Idempotency-Key sama
```

```
attempt 1 -> 403
attempt 2 -> 403
attempt 3 -> 403

idempotency_keys setelah 3 request DITOLAK: 0
```

Tiga request ditolak, nol efek samping. Ini yang membuat percobaan ulang tidak
bisa membaca respons dari operasi yang tak pernah berwenang.

---

## Catatan

Test A.9 yang otomatis ada di `tests/e2e/console-attack.test.js` (9 test).
Bukti di atas diambil dari stack lokal: PostgreSQL + service + JWKS test
server, dengan token ditandatangani lewat `/sign` milik JWKS server yang sama
supaya kunci token sama dengan kunci yang diunduh service.

Screenshot antarmuka browser **belum tersedia** — `clients/web/` masih kosong,
jadi bagian "tombol tidak tampil di UI" belum bisa didokumentasikan. Yang
terbukti di sini adalah hal yang lebih penting: request yang sama ditolak
service meskipun tidak melewati UI sama sekali.
