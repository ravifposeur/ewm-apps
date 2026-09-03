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
| **Bank Sampah Umum** | 1. **Terlalu Linier dan Datar**: Hanya mengelola alur "Nasabah → Petugas → Admin" tanpa dimensi *multi-event* atau *batch processing* yang kuat. Tidak ada elemen *event-based* yang membutuhkan agregasi data per waktu tertentu, sehingga kurang menantang untuk arsitektur 1 semester.<br>2. **Kurang Elemen "Offline" yang Kredibel**: Petugas di pemukiman biasanya masih memiliki sinyal yang relatif stabil dibandingkan dengan petugas di stadion/konser yang sinyalnya terganggu oleh ribuan pengunjung.<br>3. **Potensi Plugin Rendah**: Variasi kebutuhan antar nasabah relatif homogen (hanya setor sampah), sehingga sulit mendemonstrasikan ekosistem *add-on/plugin* seperti yang diharapkan dosen. |
| **Food Delivery** | 1. **Terlalu Mainstream dan Monoton**: Sudah menjadi contoh "buku teks" di banyak mata kuliah (seperti GoFood/GrabFood). Dosen akan lebih menghargai domain yang lebih spesifik dan jarang diangkat mahasiswa.<br>2. **Aktor Offline Kurang Kuat**: Kurir food delivery dianggap sebagai aktor offline standar. Pada EWM, petugas tidak hanya offline, tetapi juga harus melakukan *batch sync* di akhir hari (karena pencatatan berat sampah hanya dilakukan satu kali di malam hari), yang memberikan tantangan teknis lebih menarik (durable mutation queue).<br>3. **Operasi Unsafe Kurang Kompleks**: Operasi unsafe pada food delivery (konfirmasi pesanan sampai) hanya berupa *boolean* sederhana. Pada EWM, operasi unsafe melibatkan **perhitungan toleransi selisih berat (deviation 10%)**, **penentuan grade sertifikat (Gold/Silver/Bronze)**, dan **pemotongan poin untuk sampah HAZMAT**, yang jauh lebih kaya secara bisnis. |
| **Manajemen Parkir Event** | 1. **Cakupan Terlalu Sempit (End-to-End sangat pendek)**: Alurnya hanya "Masuk → Parkir → Keluar → Bayar". Proses ini tidak cukup untuk mengisi 1 semester penuh karena tidak memiliki variasi status (hanya *checked-in* dan *checked-out*).<br>2. **Tidak Cukup 3 Aktor yang Berbeda Secara Signifikan**: Pengunjung dan petugas parkir hanya memiliki interaksi minimal; tidak ada aktor pihak ketiga yang relevan seperti *Event Organizer* yang membutuhkan laporan pertanggungjawaban (LPJ) ke stakeholder.<br>3. **Kurang Mendukung Konsep Plugin**: Tidak ada ruang untuk add-on seperti *plugin karbon* atau *plugin pelacakan sponsor*, karena data parkir (plat nomor) bersifat statis dan tidak bisa diperkaya oleh pihak ketiga. |

## Consequences
- **Positif**: Domain ini unik, aplikatif, dan memungkinkan demonstrasi mekanisme *durable queue* dan *idempotency* secara nyata di Pertemuan 6.
- **Negatif**: Kami harus mendesain skema sinkronisasi batch yang robust di client `device/`.
- **Netral**: Field `extensions` pada resource menjadi wadah plugin, core system wajib konsisten mengabaikannya.
