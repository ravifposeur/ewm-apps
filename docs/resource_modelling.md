# Resource Modeling

## Analisis Kandidat Resource
| Kandidat | Keputusan | Alasan |
| :--- | :--- | :--- |
| **Event** | DITERIMA | Memiliki identitas (`eventId`), masa hidup panjang, dan mandiri. |
| **Site** | DITERIMA | Titik fisik di venue. Punya ID, bisa diubah tanpa membuat ulang Event. |
| **Roster** | DITERIMA | Penugasan petugas. Punya ID, masa hidup terbatas pada shift, mandiri dari Site. |
| **DailyCollection** | DITERIMA | Batch catatan timbangan. Punya ID, melintasi request, bisa berubah status (recorded/verified). |
| **Certificate** | DITOLAK | Tidak memiliki identitas sendiri; ia adalah *turunan* dari konfirmasi Event. Cukup menjadi field/URL di Event. |
| **Progress** | DITOLAK | Hanya agregasi data sementara. Tidak memiliki masa hidup dan tidak mandiri. |
