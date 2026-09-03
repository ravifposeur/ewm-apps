# Error Catalog

| Type URI | Status | Kondisi Pemicu | Extension Members | Tindakan Klien |
| :--- | :--- | :--- | :--- | :--- |
| /problems/deviation-too-high | 422 | Selisih berat petugas vs depot > 10% | `"deviationPercentage": 14.7` | Admin cek fisik, jangan retry. |
| /problems/idempotency-key-reuse | 409 | Key dipakai ulang dengan body berbeda | `"expectedHash": "abc123"` | Generate key baru. |
| /problems/duplicate-confirmation | 409 | Event sudah dikonfirmasi sebelumnya | `"confirmedAt": "2026-..."` | Tampilkan "Sudah selesai". |
| /problems/invalid-weight | 422 | Berat negatif atau > 1.000.000g | `"maxAllowed": 1000000` | Perbaiki input. |
| /problems/not-found | 404 | ID tidak ditemukan | - | Perbaiki request. |
