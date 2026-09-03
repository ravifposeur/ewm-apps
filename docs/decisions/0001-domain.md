# Keputusan Arsitektur 0001: Pemilihan Domain

## Context
Kami membutuhkan domain bisnis untuk tugas besar yang memenuhi 4 syarat ketat (3 aktor, operasi unsafe, aktor offline, cakupan kecil) dan mendukung arsitektur plugin/add-on. Domain harus cukup realistis namun tidak memakan waktu lebih dari 1 semester.

## Decision
Kami memutuskan untuk membangun **Event Waste Management Platform**.
Alasan utama:
1. Secara alami memiliki 3 aktor jelas (EO, Petugas Lapangan, Admin Vendor).
2. Operasi "Konfirmasi Akhir Event" bersifat unsafe (menerbitkan sertifikat) dan tidak boleh double.
3. Petugas lapangan secara realistis sering offline di venue padat (stadion/konser).
4. Mendukung ekosistem plugin karena data timbangan dapat diperkaya oleh add-on (misal: plugin karbon, plugin sponsor).

## Alternatives Considered
| Alternatif | Alasan Ditolak |
| :--- | :--- |
| **Bank Sampah Umum** |  |
| **Food Delivery** |  |
| **Manajemen Parkir Event** |  |

## Consequences
- **Positif**: Domain ini unik, aplikatif, dan memungkinkan demonstrasi mekanisme *durable queue* dan *idempotency* secara nyata di Pertemuan 6.
- **Negatif**: Kami harus mendesain skema sinkronisasi batch yang robust di client `device/`.
- **Netral**: Field `extensions` pada resource menjadi wadah plugin, core system wajib konsisten mengabaikannya.
